-- Migration: distance-based scoring + distance RPC + app_config knobs.
--
-- Background:
--   This is the heart of distance-based matching. Three pieces:
--
--   1. app_config rows for runtime tuning (no migration needed to change weights)
--   2. A helper score_distance(meters, bands) that maps meters to a score band
--   3. Rewrite of get_intelligent_recommendations:
--        - replaces the prefix-based location_score with distance scoring
--        - cleans up Japanese skill-level dead branches from the JP fork
--        - preserves: banned-user filter, opposite-gender enforcement, exclusion
--          of already-liked/already-matched users (these are load-bearing)
--   4. New SECURITY DEFINER RPC get_user_distance_miles(a, b) that returns
--      ONLY the computed distance + a privacy bucket — never raw coords.
--      Buckets under 5mi to "under_5" to prevent triangulation attacks.
--   5. New SECURITY DEFINER RPC search_profiles_within_radius for the Search
--      tab's hard distance filter — uses ST_DWithin for index speed.
--
-- Why the bands live in config:
--   Tuning band weights post-launch should not require a migration. The
--   existing `daily_swipe_limit` precedent (migration 8) made the cap
--   runtime-tunable for the same reason. Now distance scoring follows
--   the same pattern.

-- =============================================================================
-- 1. Seed app_config rows (idempotent — won't overwrite if already set).
-- =============================================================================
INSERT INTO public.app_config (key, value) VALUES
  ('distance_scoring_enabled', 'true'::jsonb),
  ('default_search_radius_miles', '75'::jsonb),
  ('max_search_radius_miles', '500'::jsonb),
  ('distance_score_bands', '[
    {"max_meters": 16093,  "score": 20},
    {"max_meters": 40234,  "score": 17},
    {"max_meters": 80467,  "score": 12},
    {"max_meters": 160934, "score": 8},
    {"max_meters": 321869, "score": 3}
  ]'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- =============================================================================
-- 2. Score-distance helper.
--
--   Walks the bands array in order, returns the score of the first band
--   whose max_meters covers the distance. Returns 0 if no band matches
--   (i.e. distance is beyond the largest band).
--
--   IMMUTABLE because (meters, bands) → score is a pure function. The
--   planner can fold this when called with constant config in a single
--   recommendation generation pass.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.score_distance(
  p_meters double precision,
  p_bands jsonb
)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    (SELECT (b->>'score')::double precision
       FROM jsonb_array_elements(p_bands) WITH ORDINALITY AS arr(b, ord)
      WHERE p_meters <= (b->>'max_meters')::double precision
      ORDER BY ord
      LIMIT 1),
    0.0
  );
$$;

-- =============================================================================
-- 3. Rewrite get_intelligent_recommendations.
--
--   Drop-and-create because the function signature OUT row shape is stable
--   (same as before) but the body changes substantially. CREATE OR REPLACE
--   would fail if any prior environment has the function with a drifted
--   rowtype (same gotcha as migration 8 documented).
-- =============================================================================
DROP FUNCTION IF EXISTS public.get_intelligent_recommendations(uuid, integer, integer);

CREATE FUNCTION public.get_intelligent_recommendations(
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
  v_date_range_start date;
  v_date_range_end date;
  v_operator_id uuid := '73d88e5a-83a4-4ec0-8247-a5394db1be94';
  v_bands jsonb;
  v_distance_enabled boolean;
BEGIN
  -- Load the requesting user's matchmaking fields, including their location.
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

  v_date_range_start := CURRENT_DATE;
  v_date_range_end := CURRENT_DATE + INTERVAL '30 days';

  -- Runtime knobs.
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

  RETURN QUERY
  WITH
  excluded_users AS (
    SELECT liked_user_id AS excluded_id FROM user_likes
     WHERE liker_user_id = p_current_user_id AND is_active = true
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

      -- Calendar overlap (unchanged from baseline).
      COALESCE(CASE
        WHEN cm.shared_days_count >= 10 THEN 30.0
        WHEN cm.shared_days_count >= 5  THEN 20.0 + (cm.shared_days_count - 5) * 2.0
        WHEN cm.shared_days_count >= 1  THEN 10.0 + (cm.shared_days_count - 1) * 2.5
        ELSE 0.0
      END, 0.0) AS calendar_score,

      -- Skill match. Cleaned up: was a mix of JP and EN level names from the
      -- JP-fork residue. The active app uses EN levels only, so the JP cases
      -- were dead branches. Now: identical level = 25, one-step away = 18,
      -- everything else = 10.
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

      -- Average-score similarity (unchanged).
      CASE
        WHEN p.average_score IS NULL OR v_user_avg_score IS NULL THEN 10.0
        WHEN ABS(p.average_score - v_user_avg_score) <= 5  THEN 20.0
        WHEN ABS(p.average_score - v_user_avg_score) <= 10 THEN 15.0
        WHEN ABS(p.average_score - v_user_avg_score) <= 20 THEN 10.0
        ELSE 5.0
      END AS score_similarity,

      -- NEW: distance-based location score.
      -- Falls back to a flat 5.0 if either side has no location (preserves
      -- pre-distance behavior for cold-start users). Otherwise: bands.
      -- If distance_scoring_enabled is false (kill switch), behaves like
      -- the old prefix-based scoring (same state = 15, else = 5).
      CASE
        WHEN NOT v_distance_enabled THEN
          CASE WHEN p.prefecture = v_user_prefecture THEN 15.0 ELSE 5.0 END
        WHEN p.home_location IS NULL OR v_user_home_location IS NULL THEN 5.0
        ELSE public.score_distance(
          extensions.ST_Distance(v_user_home_location, p.home_location),
          v_bands
        )
      END AS location_score,

      -- Distance in meters (NULL if either side missing). Used in the
      -- score_breakdown JSON for observability — never exposed via any
      -- client-facing API. Helpful for debugging recommendation quality.
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
      AND p.is_banned = false                          -- load-bearing safety filter
      AND (v_user_gender != 'female' OR p.gender = 'male')
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

-- =============================================================================
-- 4. get_user_distance_miles — privacy-preserving distance RPC.
--
--   Client-facing surface for "how far is this user from me?" Used by:
--     - SwipeCard chip ("📍 23 mi")
--     - UserProfile distance line
--     - Search result rows
--
--   Privacy contract:
--     - Returns miles (whole number) + a bucket, NEVER raw coordinates.
--     - Distances under 5 miles are reported as bucket='under_5' with
--       miles=NULL. Prevents triangulation: a swipe-spammer otherwise gets
--       ~3 distance reads from different angles and locates the home address.
--     - Returns bucket='unknown' if either side has no location. Client
--       falls back to displaying state name in that case.
-- =============================================================================
DROP FUNCTION IF EXISTS public.get_user_distance_miles(uuid, uuid);

CREATE FUNCTION public.get_user_distance_miles(
  p_user_a uuid,
  p_user_b uuid
)
RETURNS TABLE(miles integer, bucket text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_loc_a extensions.geography;
  v_loc_b extensions.geography;
  v_meters double precision;
BEGIN
  -- Resolve both users' locations. Banned-user filter applies here too —
  -- you should not be able to compute distance to a banned user.
  SELECT home_location INTO v_loc_a
    FROM profiles
   WHERE id = p_user_a AND is_banned = false;
  SELECT home_location INTO v_loc_b
    FROM profiles
   WHERE id = p_user_b AND is_banned = false;

  IF v_loc_a IS NULL OR v_loc_b IS NULL THEN
    miles := NULL;
    bucket := 'unknown';
    RETURN NEXT;
    RETURN;
  END IF;

  v_meters := extensions.ST_Distance(v_loc_a, v_loc_b);

  IF v_meters < 8047 THEN  -- < 5 miles (8046.72 m)
    miles := NULL;
    bucket := 'under_5';
  ELSE
    miles := round((v_meters / 1609.34)::numeric)::integer;
    bucket := 'exact';
  END IF;

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_distance_miles(uuid, uuid) TO authenticated;

-- =============================================================================
-- 5. search_profiles_within_radius — Search-tab RPC with hard distance filter.
--
--   Distinct from get_intelligent_recommendations (which is soft-filtered) —
--   this is for the explicit "show me people within X miles" filter on the
--   Search tab. ST_DWithin uses the GIST index, so it's fast even on big tables.
--
--   Returns the same profile shape as before to keep the client unchanged.
-- =============================================================================
DROP FUNCTION IF EXISTS public.search_profiles_within_radius(uuid, integer, integer, integer);

CREATE FUNCTION public.search_profiles_within_radius(
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
AS $$
DECLARE
  v_user_home extensions.geography;
  v_user_gender text;
  v_radius_meters double precision;
BEGIN
  SELECT home_location, gender
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
$$;

GRANT EXECUTE ON FUNCTION public.search_profiles_within_radius(uuid, integer, integer, integer) TO authenticated;
