-- Recycle previously-passed candidates in Discover after a configurable
-- window. Prevents the swipe deck from going empty in cold-start mode
-- where the pool is small and users exhaust everyone in a single session.
--
-- Rule:
--   - Always exclude 'like' / 'super_like' rows. The user has expressed
--     interest and is waiting for reciprocity; re-surfacing would create
--     duplicate-like attempts (PK conflict) and confuse the pending state.
--   - Always exclude active matches.
--   - Exclude 'pass' rows only if created within the recycling window
--     (default 7 days, runtime-tunable via app_config.swipe_pass_recycle_days).
--
-- After the window elapses, a passed user becomes eligible to appear in
-- the candidate pool again. This is the same pattern Bumble / Hinge use
-- to keep early users' decks non-empty.
--
-- Operating:
--   Tighten window (cards return sooner — better cold-start, more repetition):
--     UPDATE app_config SET value = '3'::jsonb, updated_at = now()
--      WHERE key = 'swipe_pass_recycle_days';
--   Widen window (less repetition — appropriate at scale):
--     UPDATE app_config SET value = '30'::jsonb, updated_at = now()
--      WHERE key = 'swipe_pass_recycle_days';
--   Disable recycling entirely (revert to old behavior):
--     UPDATE app_config SET value = '36500'::jsonb WHERE key = 'swipe_pass_recycle_days';

-- Seed the config row (idempotent). 7 days is a sensible cold-start default.
INSERT INTO public.app_config (key, value)
VALUES ('swipe_pass_recycle_days', '7'::jsonb)
ON CONFLICT (key) DO NOTHING;

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

  -- Pass-recycle window (days). Default 7 — long enough that the user
  -- forgets the pass, short enough to keep cold-start decks non-empty.
  v_pass_recycle_days := public.get_config_int('swipe_pass_recycle_days', 7);

  RETURN QUERY
  WITH
  excluded_users AS (
    -- Likes + super-likes: always excluded. User is waiting for reciprocity.
    SELECT liked_user_id AS excluded_id FROM user_likes
     WHERE liker_user_id = p_current_user_id
       AND is_active = true
       AND type IN ('like', 'super_like')
    UNION
    -- Passes: only excluded if within the recycling window. After the
    -- window, the user becomes re-eligible to appear in the deck.
    -- Qualify user_likes.created_at — the RETURNS TABLE OUT parameter
    -- `created_at` would otherwise shadow the column.
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
      AND p.is_verified = true
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
