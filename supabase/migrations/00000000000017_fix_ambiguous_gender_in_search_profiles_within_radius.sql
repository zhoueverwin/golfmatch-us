-- Fix ambiguous "gender" reference in search_profiles_within_radius.
--
-- The RETURNS TABLE declaration introduces OUT parameters named id, gender,
-- prefecture, location, etc. Inside the function body, a bare reference to
-- `gender` was ambiguous between the OUT parameter and the profiles.gender
-- column — Postgres detects this only at execution time, so the migration
-- shipped clean and broke the Discover-page distance filter at runtime.
--
-- Fix: qualify every column in the bootstrap SELECT with the table name.
-- The companion get_recommended_users function already does this correctly.
CREATE OR REPLACE FUNCTION public.search_profiles_within_radius(
  p_current_user_id uuid,
  p_radius_miles integer,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, user_id text, legacy_id text, name text,
  age integer, gender text, prefecture text, location text,
  golf_skill_level text, average_score integer,
  profile_pictures text[], bio text,
  is_verified boolean, is_premium boolean,
  last_login text, created_at text, updated_at text,
  distance_miles integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_user_home extensions.geography;
  v_user_gender text;
  v_radius_meters double precision;
BEGIN
  SELECT profiles.home_location, profiles.gender
    INTO v_user_home, v_user_gender
    FROM profiles
   WHERE profiles.id = p_current_user_id;

  IF v_user_home IS NULL THEN
    RETURN;
  END IF;

  v_radius_meters := p_radius_miles * 1609.34;

  RETURN QUERY
  SELECT
    p.id, p.user_id, p.legacy_id, p.name, p.age, p.gender,
    p.prefecture, p.location, p.golf_skill_level, p.average_score,
    p.profile_pictures, p.bio, p.is_verified, p.is_premium,
    p.last_login::text, p.created_at::text, p.updated_at::text,
    GREATEST(
      round((extensions.ST_Distance(v_user_home, p.home_location) / 1609.34)::numeric)::integer,
      0
    ) AS distance_miles
  FROM profiles p
  WHERE p.id != p_current_user_id
    AND p.is_banned = false
    AND p.home_location IS NOT NULL
    AND p.gender IS NOT NULL
    AND array_length(p.profile_pictures, 1) > 0
    AND (v_user_gender != 'female' OR p.gender = 'male')
    AND extensions.ST_DWithin(v_user_home, p.home_location, v_radius_meters)
  ORDER BY extensions.ST_Distance(v_user_home, p.home_location) ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;
