-- Migration 32 — drop the is_verified visibility gate from discovery RPCs.
--
-- v1.2 model: ID verification is purely an action gate (handled client-side
-- by useRequireVerification) and a display badge on the profile card. It is
-- NO LONGER a visibility filter on Discover / Search / Daily Picks.
--
-- Prior state (migrations 19 + 24): each RPC carried the predicate
--     AND p.is_verified = true
--     AND (p.gender = 'female' OR p.is_premium = true)
-- which hid unverified profiles of both genders.
--
-- New predicate (single line in each RPC):
--     AND (p.gender = 'female' OR p.is_premium = true)
-- Females are always visible (subject to profile-completeness gates);
-- males are visible iff premium. Verification is no longer required for
-- either side to appear.
--
-- Profile-completeness gates (gender NOT NULL, birth_date NOT NULL, at
-- least one profile_pictures entry) and the banned-user filter remain.
-- The is_verified column is still selected and returned to clients so the
-- verified badge can render on the card.

-- ──────────────────────────────────────────────────────────────────────
-- 1. get_intelligent_recommendations — Discover swipe deck + Daily Picks
--    body. Last redefined in migration 24 (pass-recycle). Body preserved
--    verbatim except the visibility predicate.
-- ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_intelligent_recommendations(
  p_current_user_id uuid,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, user_id text, legacy_id text, name text,
  age integer, gender text, prefecture text, location text,
  golf_skill_level text, average_score integer,
  profile_pictures text[], bio text,
  is_verified boolean, is_premium boolean,
  last_login text, created_at text, updated_at text,
  recommendation_score double precision, score_breakdown jsonb
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_user_prefecture text;
  v_user_skill_level text;
  v_user_avg_score integer;
  v_user_gender text;
  v_user_home_location extensions.geography;
  v_target_gender text;
  v_date_range_start date;
  v_date_range_end date;
  v_operator_id uuid := '73d88e5a-83a4-4ec0-8247-a5394db1be94';
  v_bands jsonb;
  v_distance_enabled boolean;
  v_pass_recycle_days integer;
BEGIN
  SELECT
    profiles.prefecture,
    profiles.golf_skill_level,
    profiles.average_score,
    profiles.gender,
    profiles.home_location
  INTO
    v_user_prefecture,
    v_user_skill_level,
    v_user_avg_score,
    v_user_gender,
    v_user_home_location
  FROM profiles
  WHERE profiles.id = p_current_user_id;

  v_target_gender := CASE v_user_gender
                       WHEN 'female' THEN 'male'
                       WHEN 'male'   THEN 'female'
                     END;

  v_date_range_start := CURRENT_DATE;
  v_date_range_end := CURRENT_DATE + INTERVAL '30 days';

  v_distance_enabled := COALESCE(
    (SELECT (value)::text::boolean FROM app_config WHERE key = 'distance_scoring_enabled'),
    true
  );
  v_bands := public.get_config_jsonb('distance_score_bands', '[
    {"max_meters": 16093,  "score": 20},
    {"max_meters": 40234,  "score": 17},
    {"max_meters": 80467,  "score": 12},
    {"max_meters": 160934, "score": 8},
    {"max_meters": 321869, "score": 3}
  ]'::jsonb);

  v_pass_recycle_days := public.get_config_int('swipe_pass_recycle_days', 7);

  RETURN QUERY
  WITH
  excluded_users AS (
    SELECT liked_user_id AS excluded_id FROM user_likes
     WHERE liker_user_id = p_current_user_id
       AND is_active = true
       AND type IN ('like', 'super_like')
    UNION
    SELECT liked_user_id AS excluded_id FROM user_likes
     WHERE liker_user_id = p_current_user_id
       AND is_active = true
       AND type = 'pass'
       AND user_likes.created_at > NOW() - (v_pass_recycle_days || ' days')::interval
    UNION
    SELECT user2_id AS excluded_id FROM matches
     WHERE user1_id = p_current_user_id AND is_active = true
    UNION
    SELECT user1_id AS excluded_id FROM matches
     WHERE user2_id = p_current_user_id AND is_active = true
  ),
  calendar_matches AS (
    SELECT a1.user_id AS profile_id, COUNT(DISTINCT a1.date) AS shared_days_count
      FROM availability a1
      INNER JOIN availability a2
        ON a1.date = a2.date
       AND a1.is_available = true
       AND a2.is_available = true
     WHERE a2.user_id = p_current_user_id
       AND a1.date BETWEEN v_date_range_start AND v_date_range_end
       AND a1.user_id != p_current_user_id
     GROUP BY a1.user_id
  ),
  candidates AS (
    SELECT
      p.id, p.user_id, p.legacy_id, p.name, p.age, p.gender,
      p.prefecture, p.location, p.golf_skill_level, p.average_score,
      p.profile_pictures, p.bio, p.is_verified, p.is_premium,
      p.last_login, p.created_at, p.updated_at,
      COALESCE(CASE
        WHEN cm.shared_days_count >= 10 THEN 30.0
        WHEN cm.shared_days_count >= 5  THEN 20.0 + (cm.shared_days_count - 5) * 2.0
        WHEN cm.shared_days_count >= 1  THEN 10.0 + (cm.shared_days_count - 1) * 2.5
        ELSE 0.0
      END, 0.0) AS calendar_score,
      CASE
        WHEN p.golf_skill_level = v_user_skill_level THEN 25.0
        WHEN (p.golf_skill_level = 'Beginner'     AND v_user_skill_level = 'Intermediate')
          OR (p.golf_skill_level = 'Intermediate' AND v_user_skill_level = 'Beginner')
          OR (p.golf_skill_level = 'Intermediate' AND v_user_skill_level = 'Advanced')
          OR (p.golf_skill_level = 'Advanced'     AND v_user_skill_level = 'Intermediate')
          OR (p.golf_skill_level = 'Advanced'     AND v_user_skill_level = 'Pro')
          OR (p.golf_skill_level = 'Pro'          AND v_user_skill_level = 'Advanced')
        THEN 18.0
        ELSE 10.0
      END AS skill_score,
      CASE
        WHEN p.average_score IS NULL OR v_user_avg_score IS NULL THEN 10.0
        WHEN ABS(p.average_score - v_user_avg_score) <= 5  THEN 20.0
        WHEN ABS(p.average_score - v_user_avg_score) <= 10 THEN 15.0
        WHEN ABS(p.average_score - v_user_avg_score) <= 20 THEN 10.0
        ELSE 5.0
      END AS score_similarity,
      CASE
        WHEN NOT v_distance_enabled THEN
          CASE WHEN p.prefecture = v_user_prefecture THEN 15.0 ELSE 5.0 END
        WHEN p.home_location IS NULL OR v_user_home_location IS NULL THEN 5.0
        ELSE public.score_distance(
          extensions.ST_Distance(v_user_home_location, p.home_location),
          v_bands
        )
      END AS location_score,
      CASE
        WHEN p.home_location IS NULL OR v_user_home_location IS NULL THEN NULL
        ELSE extensions.ST_Distance(v_user_home_location, p.home_location)
      END AS distance_meters,
      CASE
        WHEN p.last_login IS NULL THEN 1.0
        WHEN p.last_login >= NOW() - INTERVAL '24 hours' THEN 10.0
        WHEN p.last_login >= NOW() - INTERVAL '7 days'   THEN 6.0
        WHEN p.last_login >= NOW() - INTERVAL '30 days'  THEN 2.0
        ELSE 0.0
      END AS activity_score,
      (CASE WHEN p.is_verified THEN 4.0 ELSE 0.0 END
        + CASE WHEN array_length(p.profile_pictures, 1) >= 1 THEN 3.0 ELSE 0.0 END
        + CASE WHEN p.bio IS NOT NULL AND length(p.bio) >= 20 THEN 3.0 ELSE 0.0 END
      ) AS profile_quality_score,
      CASE WHEN p.is_premium = true THEN 20.0 ELSE 0.0 END AS premium_score,
      CASE WHEN p.id = v_operator_id THEN 1000.0 ELSE 0.0 END AS operator_score,
      COALESCE(cm.shared_days_count, 0) AS shared_days_count
    FROM profiles p
    LEFT JOIN calendar_matches cm ON cm.profile_id = p.id
    WHERE p.id != p_current_user_id
      AND p.id NOT IN (SELECT excluded_id FROM excluded_users)
      AND p.gender IS NOT NULL
      AND p.birth_date IS NOT NULL
      AND array_length(p.profile_pictures, 1) > 0
      AND p.is_banned = false
      AND p.gender = v_target_gender
      -- v1.2: visibility no longer gated on is_verified. Females always
      -- visible; males require premium.
      AND (p.gender = 'female' OR p.is_premium = true)
  )
  SELECT
    c.id, c.user_id, c.legacy_id, c.name, c.age, c.gender,
    c.prefecture, c.location, c.golf_skill_level, c.average_score,
    c.profile_pictures, c.bio, c.is_verified, c.is_premium,
    c.last_login::text, c.created_at::text, c.updated_at::text,
    (c.calendar_score + c.skill_score + c.score_similarity + c.location_score
      + c.activity_score + c.profile_quality_score + c.premium_score + c.operator_score
    )::double precision AS recommendation_score,
    jsonb_build_object(
      'calendar_score',        c.calendar_score,
      'skill_score',           c.skill_score,
      'score_similarity',      c.score_similarity,
      'location_score',        c.location_score,
      'distance_meters',       c.distance_meters,
      'activity_score',        c.activity_score,
      'profile_quality_score', c.profile_quality_score,
      'premium_score',         c.premium_score,
      'operator_score',        c.operator_score,
      'shared_days_count',     c.shared_days_count
    ) AS score_breakdown
  FROM candidates c
  ORDER BY recommendation_score DESC NULLS LAST
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- 2. search_profiles_within_radius — distance-filtered Search.
--    Body preserved verbatim from migration 19 except predicate.
-- ──────────────────────────────────────────────────────────────────────
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
    -- v1.2: verification no longer required for visibility.
    AND (p.gender = 'female' OR p.is_premium = true)
    AND extensions.ST_DWithin(v_user_home, p.home_location, v_radius_meters)
  ORDER BY extensions.ST_Distance(v_user_home, p.home_location) ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

-- ──────────────────────────────────────────────────────────────────────
-- 3. get_daily_recommendations — Daily Picks join-back filter.
--    Body preserved verbatim from migration 19 except predicate.
-- ──────────────────────────────────────────────────────────────────────
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
BEGIN
  v_today := (now() AT TIME ZONE 'UTC')::date;
  v_actual_limit := public.get_config_int('daily_swipe_limit', 10);

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
    -- v1.2: verification no longer required for visibility.
    AND (p.gender = 'female' OR p.is_premium = true)
  ORDER BY dr.created_at ASC;
END;
$$;
