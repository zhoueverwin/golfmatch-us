-- Migration: keep home_location in sync with prefecture for new users.
--
-- Background:
--   Migration 11 backfilled home_location from prefecture for every existing
--   user, but it was a one-shot DO block. New signups after migration 11
--   that pick a state and then skip the GPS prompt would end up with a NULL
--   home_location — falling out of distance-scored recommendations entirely.
--
--   This migration closes the gap with a BEFORE INSERT OR UPDATE OF prefecture
--   trigger. Any path that sets prefecture (onboarding, EditProfile, KYC
--   verdict, admin tool, future code we haven't written yet) now auto-
--   populates home_location with the state centroid when no real location
--   exists. The trigger is the canonical source of truth.
--
-- Coexistence with the rounding trigger from migration 10:
--   round_home_location_trigger fires `BEFORE UPDATE OF home_location`. If
--   a write only updates prefecture, that rounding trigger does not fire
--   (column-targeted UPDATE semantics). So the centroids must be pre-rounded
--   to the 3-decimal grid inside state_centroid() itself — which they are.
--
-- Behavior matrix (the WHY behind each branch):
--   - INSERT with prefecture, no home_location  → populate centroid
--   - UPDATE prefecture, home_location is NULL  → populate centroid
--   - UPDATE prefecture, source='state_centroid' → refresh to new state's centroid
--   - UPDATE prefecture, source='gps' or 'manual' → DO NOT touch (user's real data wins)
--   - UPDATE prefecture, source='denied'         → DO NOT touch (denial is a signal)

-- =============================================================================
-- 1. state_centroid(text) — lookup function.
--
--   Same data as migration 11's DO block, refactored into a callable
--   function. Centroids pre-rounded to 3 decimals so the result already
--   matches the privacy grid without needing the rounding trigger.
--   IMMUTABLE because the lookup is a pure function — the planner can
--   fold it across rows in a single statement.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.state_centroid(p_state text)
RETURNS extensions.geography
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'extensions'
AS $$
  WITH centroids(state, lng, lat) AS (
    VALUES
      ('Alabama',              -86.829, 32.779),
      ('Alaska',              -152.278, 64.069),
      ('Arizona',             -111.660, 34.274),
      ('Arkansas',             -92.443, 34.894),
      ('California',          -119.470, 37.184),
      ('Colorado',            -105.548, 38.997),
      ('Connecticut',          -72.727, 41.622),
      ('Delaware',             -75.505, 38.990),
      ('District of Columbia', -77.015, 38.910),
      ('Florida',              -82.450, 28.631),
      ('Georgia',              -83.443, 32.642),
      ('Hawaii',              -156.374, 20.293),
      ('Idaho',               -114.613, 44.351),
      ('Illinois',             -89.197, 40.042),
      ('Indiana',              -86.282, 39.894),
      ('Iowa',                 -93.496, 42.075),
      ('Kansas',               -98.380, 38.494),
      ('Kentucky',             -85.302, 37.535),
      ('Louisiana',            -91.997, 31.069),
      ('Maine',                -69.243, 45.370),
      ('Maryland',             -76.791, 39.055),
      ('Massachusetts',        -71.808, 42.260),
      ('Michigan',             -85.410, 44.347),
      ('Minnesota',            -94.305, 46.281),
      ('Mississippi',          -89.668, 32.736),
      ('Missouri',             -92.458, 38.357),
      ('Montana',             -109.633, 47.053),
      ('Nebraska',             -99.795, 41.538),
      ('Nevada',              -116.631, 39.329),
      ('New Hampshire',        -71.581, 43.681),
      ('New Jersey',           -74.673, 40.191),
      ('New Mexico',          -106.113, 34.407),
      ('New York',             -75.527, 42.954),
      ('North Carolina',       -79.388, 35.556),
      ('North Dakota',        -100.466, 47.450),
      ('Ohio',                 -82.794, 40.286),
      ('Oklahoma',             -97.494, 35.589),
      ('Oregon',              -120.558, 43.934),
      ('Pennsylvania',         -77.800, 40.878),
      ('Rhode Island',         -71.556, 41.676),
      ('South Carolina',       -80.896, 33.917),
      ('South Dakota',        -100.226, 44.444),
      ('Tennessee',            -86.351, 35.858),
      ('Texas',                -99.331, 31.476),
      ('Utah',                -111.670, 39.306),
      ('Vermont',              -72.666, 44.069),
      ('Virginia',             -78.854, 37.522),
      ('Washington',          -120.447, 47.383),
      ('West Virginia',        -80.623, 38.641),
      ('Wisconsin',            -89.994, 44.624),
      ('Wyoming',             -107.551, 42.996)
  )
  SELECT extensions.ST_SetSRID(
           extensions.ST_MakePoint(c.lng::double precision, c.lat::double precision),
           4326
         )::extensions.geography
    FROM centroids c
   WHERE c.state = p_state
   LIMIT 1;
$$;

-- =============================================================================
-- 2. Trigger function: populate_state_centroid_on_prefecture_change.
--
--   Three cases handled, all driven by the policy "real GPS wins, centroid
--   is a polite fallback":
--     a) New row with prefecture but no location  → set centroid
--     b) Existing row gets prefecture set         → set centroid
--     c) Existing 'state_centroid' user changes state → refresh centroid
--   Everything else (gps/manual/denied) is left untouched. We never silently
--   downgrade a real GPS signal to a state centroid, even if the user edits
--   their state field after granting GPS.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.populate_state_centroid_on_prefecture_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_centroid extensions.geography;
BEGIN
  IF NEW.prefecture IS NULL THEN
    RETURN NEW;
  END IF;

  -- Case (a) and (b): no location yet, and we have a state. Try to fill.
  IF NEW.home_location IS NULL THEN
    v_centroid := public.state_centroid(NEW.prefecture);
    IF v_centroid IS NOT NULL THEN
      NEW.home_location := v_centroid;
      NEW.location_source := COALESCE(NEW.location_source, 'state_centroid');
      NEW.location_updated_at := COALESCE(NEW.location_updated_at, now());
    END IF;
    RETURN NEW;
  END IF;

  -- Case (c): existing state_centroid user moved to a new state. Refresh.
  --   TG_OP guard ensures we only run on UPDATE (OLD is NULL on INSERT).
  --   IS DISTINCT FROM handles the NULL-old-prefecture edge case safely.
  IF TG_OP = 'UPDATE'
     AND NEW.location_source = 'state_centroid'
     AND OLD.prefecture IS DISTINCT FROM NEW.prefecture
  THEN
    v_centroid := public.state_centroid(NEW.prefecture);
    IF v_centroid IS NOT NULL THEN
      NEW.home_location := v_centroid;
      NEW.location_updated_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- =============================================================================
-- 3. Wire the trigger.
--
--   Fires BEFORE INSERT OR UPDATE OF prefecture so:
--     - Every INSERT goes through (even ones that omit prefecture; the
--       function short-circuits when NEW.prefecture is NULL)
--     - UPDATE only fires when prefecture is targeted in SET (efficient)
--
--   Name starts with "p" so it sorts before "round_home_location_trigger"
--   alphabetically. PostgreSQL fires BEFORE triggers in name order; we
--   want centroid population to happen first, then rounding (if rounding
--   even fires — see migration header for the column-targeted semantics).
-- =============================================================================
DROP TRIGGER IF EXISTS populate_state_centroid_trigger ON public.profiles;
CREATE TRIGGER populate_state_centroid_trigger
  BEFORE INSERT OR UPDATE OF prefecture
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.populate_state_centroid_on_prefecture_change();
