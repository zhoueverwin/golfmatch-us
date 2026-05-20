-- Migration: flatten daily swipe limit + make it runtime-configurable.
--
-- Background:
--   The previous tiered limit (female=10, premium male=5, free male=3) was a
--   monetization lever from when the app had a free tier — free males ran into
--   the cap fast and the upgrade prompt did the conversion work. The hard
--   paywall added at onboarding removed the free tier entirely, so the
--   premium-vs-free branch is dead code.
--
--   We also want to tune the limit post-release without shipping a new app
--   build — usage volume is unknown at launch, and tightening or loosening
--   the cap is a likely lever. Store the limit in app_config (existing table,
--   key/jsonb), default to 10.
--
-- Change the limit at runtime with:
--   UPDATE app_config
--   SET value = '15'::jsonb, updated_at = now()
--   WHERE key = 'daily_swipe_limit';
--
-- Rollback note:
--   To restore tiered limits, revert the function body to the gender/premium
--   branch from migration 00000000000005_global_app_utc_timezones.sql.

-- =============================================================================
-- 1. Seed the runtime config row (idempotent).
-- =============================================================================
INSERT INTO public.app_config (key, value)
VALUES ('daily_swipe_limit', '10'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- =============================================================================
-- 2. Helper: read an integer config value with a fallback default.
--    STABLE so the planner can fold repeated calls within one statement.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_config_int(p_key text, p_default integer)
RETURNS integer
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT (value)::text::integer FROM public.app_config WHERE key = p_key),
    p_default
  );
$$;

-- =============================================================================
-- 3. get_daily_recommendations — uniform limit, read from app_config.
--    The live function on the dev project had drifted return-column shape
--    relative to migration 5, so CREATE OR REPLACE refused (Postgres won't
--    change OUT-parameter rowtype). DROP IF EXISTS first to keep this
--    migration replayable on any environment, drifted or pristine.
-- =============================================================================
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
  -- UTC "today" for the global app (set in migration 5).
  v_today := (now() AT TIME ZONE 'UTC')::date;

  -- Runtime-tunable cap. Fallback 10 keeps Discover working even if the
  -- app_config row is missing.
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
  ORDER BY dr.created_at ASC;
END;
$$;
