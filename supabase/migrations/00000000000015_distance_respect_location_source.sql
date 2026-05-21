-- Distance RPC: never reveal a derived numeric distance when either user
-- opted into state-only precision (or denied location).
--
-- Background:
--   profiles.location_source ∈ {gps, manual, state_centroid, denied}. The
--   first two represent real points the user disclosed. The latter two are
--   policy signals — the user explicitly chose NOT to share a precise point.
--
--   The original RPC computed ST_Distance against home_location regardless
--   of source. For a user with location_source = 'state_centroid' this
--   meant their visible "distance to viewer" was derived from a synthetic
--   centroid ~100mi-accurate within a state. That's both meaningless
--   (the actual person could be anywhere in the state) and a privacy
--   regression (the user agreed to a state name, not a numeric distance).
--
-- New rule:
--   Distance renders only when BOTH users are 'gps' or 'manual'. Anything
--   else returns bucket = 'unknown'; the client's formatDistanceLabel
--   then returns null and the chip simply doesn't appear. The prefecture
--   text in the UI remains as the right level of disclosure.
--
--   NULL location_source is treated as untrusted (same as state_centroid)
--   so any future data anomaly fails closed, not open.
CREATE OR REPLACE FUNCTION public.get_user_distance_miles(p_user_a uuid, p_user_b uuid)
RETURNS TABLE(miles integer, bucket text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_loc_a extensions.geography;
  v_loc_b extensions.geography;
  v_src_a text;
  v_src_b text;
  v_meters double precision;
BEGIN
  SELECT home_location, location_source INTO v_loc_a, v_src_a
    FROM profiles WHERE id = p_user_a AND is_banned = false;
  SELECT home_location, location_source INTO v_loc_b, v_src_b
    FROM profiles WHERE id = p_user_b AND is_banned = false;

  IF v_loc_a IS NULL OR v_loc_b IS NULL THEN
    miles := NULL;
    bucket := 'unknown';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Privacy gate: state-only or denied → never reveal a derived number.
  IF v_src_a IS DISTINCT FROM 'gps' AND v_src_a IS DISTINCT FROM 'manual'
     OR v_src_b IS DISTINCT FROM 'gps' AND v_src_b IS DISTINCT FROM 'manual'
  THEN
    miles := NULL;
    bucket := 'unknown';
    RETURN NEXT;
    RETURN;
  END IF;

  v_meters := extensions.ST_Distance(v_loc_a, v_loc_b);

  IF v_meters < 8047 THEN
    miles := NULL;
    bucket := 'under_5';
  ELSE
    miles := round((v_meters / 1609.34)::numeric)::integer;
    bucket := 'exact';
  END IF;

  RETURN NEXT;
END;
$function$;
