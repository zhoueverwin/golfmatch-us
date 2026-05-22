-- Apply strict opposite-gender filter to get_daily_recommendations.
--
-- Migration 21 fixed get_intelligent_recommendations + search_profiles_within_radius
-- but missed get_daily_recommendations — which serves Discover/swipe from a
-- persisted daily_recommendations table. Rows written BEFORE migration 21
-- were generated under the old one-way gender filter and still leak through
-- the post-write join-back. Adding the gender CASE here filters them at
-- fetch time.

DROP FUNCTION IF EXISTS public.get_daily_recommendations(uuid);

CREATE FUNCTION public.get_daily_recommendations(p_user_id uuid)
RETURNS TABLE(
  out_id uuid, out_user_id text, out_legacy_id text, out_name text,
  out_age integer, out_gender text, out_prefecture text, out_location text,
  out_golf_skill_level text, out_average_score integer,
  out_profile_pictures text[], out_bio text,
  out_is_verified boolean, out_is_premium boolean,
  out_last_login text, out_created_at text, out_updated_at text
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_today date;
  v_existing_count integer;
  v_actual_limit integer;
  v_user_gender text;
  v_target_gender text;
BEGIN
  v_today := (now() AT TIME ZONE 'UTC')::date;
  v_actual_limit := public.get_config_int('daily_swipe_limit', 10);

  SELECT gender INTO v_user_gender
    FROM profiles
   WHERE id = p_user_id;

  v_target_gender := CASE v_user_gender
                       WHEN 'female' THEN 'male'
                       WHEN 'male'   THEN 'female'
                     END;

  SELECT COUNT(*) INTO v_existing_count
  FROM daily_recommendations dr
  WHERE dr.user_id = p_user_id
    AND dr.recommendation_date = v_today;

  IF v_existing_count = 0 THEN
    INSERT INTO daily_recommendations (user_id, recommended_user_id, recommendation_date)
    SELECT p_user_id, r.id, v_today
    FROM get_intelligent_recommendations(p_user_id, v_actual_limit) r
    LIMIT v_actual_limit
    ON CONFLICT (user_id, recommended_user_id, recommendation_date) DO NOTHING;
  END IF;

  RETURN QUERY
  SELECT
    p.id, p.user_id, p.legacy_id, p.name, p.age, p.gender,
    p.prefecture, p.location, p.golf_skill_level, p.average_score,
    p.profile_pictures, p.bio, p.is_verified, p.is_premium,
    p.last_login::text, p.created_at::text, p.updated_at::text
  FROM daily_recommendations dr
  JOIN profiles p ON p.id = dr.recommended_user_id
  WHERE dr.user_id = p_user_id
    AND dr.recommendation_date = v_today
    AND dr.swiped = false
    AND p.is_banned = false
    AND p.is_verified = true
    AND (p.gender = 'female' OR p.is_premium = true)
    -- Strict opposite-gender (binary). NULL v_target_gender (viewer with
    -- unknown gender) → equality fails → zero results.
    AND p.gender = v_target_gender
  ORDER BY dr.created_at ASC;
END;
$$;