-- Migration: add home_location + supporting metadata to profiles.
--
-- Background:
--   Distance-based matching needs a geospatial column. We use PostGIS
--   `geography(POINT, 4326)` because:
--     - geography stores meters/miles natively without projection math
--     - ST_DWithin uses the GIST index; ST_Distance with bare lat/lng cannot
--     - 4326 (WGS-84) is the global GPS standard, what expo-location returns
--
--   We add three columns:
--     - home_location:        the actual point (nullable until backfill / GPS)
--     - location_source:      provenance — gps | state_centroid | manual | denied
--     - location_updated_at:  freshness timestamp for the 14-day silent-refresh rule
--
--   `location_source = 'denied'` records explicit permission denials so the
--   client can implement a 90-day cooldown rule and we never re-prompt users
--   who already said no. Distinct from NULL (never asked).
--
-- Privacy (defense in depth):
--   1. REVOKE column-level SELECT on home_location for anon + authenticated
--      roles. PostgREST will silently omit the column from `select=*`.
--      SECURITY DEFINER RPCs (recommendations, distance) bypass this.
--   2. BEFORE INSERT/UPDATE trigger rounds lat/lng to 3 decimal places
--      (~100m grid) regardless of what the client sends. Even a malicious
--      client can't store full-precision coords.
--   3. Distance under 5mi is bucketed by the RPC layer (added later) to
--      prevent triangulation attacks where 3 swipes reveal a home address.

-- =============================================================================
-- 1. Columns.
-- =============================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS home_location extensions.geography(POINT, 4326),
  ADD COLUMN IF NOT EXISTS location_source text
    CHECK (location_source IN ('gps','state_centroid','manual','denied')),
  ADD COLUMN IF NOT EXISTS location_updated_at timestamptz;

-- =============================================================================
-- 2. GIST index for ST_DWithin lookups.
--    Without this index ST_DWithin still works but degrades to a seq scan,
--    which at 100k+ profiles per recommendation generation = 30-second
--    queries. With the index it's sub-millisecond per candidate.
-- =============================================================================
CREATE INDEX IF NOT EXISTS profiles_home_location_gix
  ON public.profiles USING GIST (home_location);

-- =============================================================================
-- 3. REVOKE column-level read on the raw coords.
--    The app reads profile data via either:
--      (a) authenticated SELECTs on profiles    → home_location omitted
--      (b) SECURITY DEFINER RPCs (recs, distance) → returns only miles
--    Never via raw lat/lng. This makes leaking coords structurally
--    impossible from the client side.
-- =============================================================================
REVOKE SELECT (home_location) ON public.profiles FROM anon, authenticated;

-- =============================================================================
-- 4. Rounding trigger — pins all writes to a 3-decimal (~100m) grid.
--
--    Why server-side even though the client also rounds:
--    A modified client, a scraper, or a race could write full-precision
--    coords. Server is the trust boundary. Rounding here is the actual
--    privacy guarantee; client rounding is just bandwidth optimization.
--
--    PostGIS quirk: ST_X/ST_Y work on geometry, not geography. Cast through
--    geometry, round, rebuild geography. The round-trip is cheap because
--    geography(POINT) and geometry(POINT) share storage representation.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.round_home_location_to_grid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_geom extensions.geometry;
  v_lat numeric;
  v_lng numeric;
BEGIN
  IF NEW.home_location IS NULL THEN
    RETURN NEW;
  END IF;

  v_geom := NEW.home_location::extensions.geometry;
  v_lat := round(extensions.ST_Y(v_geom)::numeric, 3);
  v_lng := round(extensions.ST_X(v_geom)::numeric, 3);

  NEW.home_location := extensions.ST_SetSRID(
    extensions.ST_MakePoint(v_lng::double precision, v_lat::double precision),
    4326
  )::extensions.geography;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS round_home_location_trigger ON public.profiles;
CREATE TRIGGER round_home_location_trigger
  BEFORE INSERT OR UPDATE OF home_location
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.round_home_location_to_grid();

-- =============================================================================
-- 5. Helper: read a JSONB config value with a fallback default.
--    Companion to get_config_int from migration 8. We need a JSONB reader
--    for the upcoming distance_score_bands array.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_config_jsonb(p_key text, p_default jsonb)
RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT value FROM public.app_config WHERE key = p_key),
    p_default
  );
$$;
