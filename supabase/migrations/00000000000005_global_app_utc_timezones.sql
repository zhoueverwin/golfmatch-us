-- Migration: switch user-facing "today" boundary from Asia/Tokyo to UTC.
--
-- Background:
--   The codebase was forked from the Japanese app (golfmatch). Several
--   user-facing RPCs computed "today" as `(now() AT TIME ZONE 'Asia/Tokyo')::date`,
--   which means a US user's daily recommendations rolled over at JST midnight
--   (~7am PT / 10am ET) — confusing for a global audience.
--
-- Scope:
--   Only USER-FACING functions are changed here:
--     - get_daily_recommendations      → defines the "today's picks" window
--     - mark_recommendation_swiped     → MUST stay aligned with get_daily_recommendations
--                                        (shares the recommendation_date row key)
--     - get_daily_dashboard_stats      → "today's profile views/likes" counters on MyPage
--
--   Admin / analytics functions (capture_daily_snapshot, get_dashboard_history,
--   send_daily_impression_notifications, dashboard report generation, etc.) are
--   intentionally left on Asia/Tokyo. They feed historical reporting and changing
--   them would shift previously-recorded buckets. Address those in a separate
--   migration if/when the admin team agrees.
--
-- Rollover behavior at deploy:
--   Existing `daily_recommendations` rows are keyed on JST dates. After this
--   migration, get_daily_recommendations queries by UTC date — so a user whose
--   prior picks were stored under "JST-today" may see zero matches and get a
--   FRESH set of picks for "UTC-today". The orphaned JST-dated rows aren't
--   returned and naturally age out (they're never queried again). This is a
--   one-time effect at deploy.
--
--   `mark_recommendation_swiped` is updated in lockstep with the same UTC date,
--   so swipe state stays attached to the right rows.

-- =============================================================================
-- 1. get_daily_recommendations — flip v_today to UTC.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_daily_recommendations(p_user_id uuid)
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
  v_is_premium boolean;
  v_gender text;
  v_actual_limit integer;
BEGIN
  -- UTC "today" for the global app (was Asia/Tokyo in the JP fork).
  v_today := (now() AT TIME ZONE 'UTC')::date;

  SELECT p.is_premium, p.gender INTO v_is_premium, v_gender
  FROM profiles p WHERE p.id = p_user_id;

  IF v_gender = 'female' THEN
    v_actual_limit := 10;
  ELSIF v_is_premium = true THEN
    v_actual_limit := 5;
  ELSE
    v_actual_limit := 3;
  END IF;

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

-- =============================================================================
-- 2. mark_recommendation_swiped — must use the same UTC "today" as #1
-- so swipes land on the row that get_daily_recommendations just returned.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.mark_recommendation_swiped(
  p_user_id uuid,
  p_recommended_user_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.daily_recommendations
  SET swiped = true
  WHERE user_id = p_user_id
    AND recommended_user_id = p_recommended_user_id
    AND recommendation_date = (now() AT TIME ZONE 'UTC')::date;
END;
$$;

-- =============================================================================
-- 3. get_daily_dashboard_stats — "today's profile views / likes / etc." that
-- appear on MyPage. User-facing, so should track the same UTC day boundary.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_daily_dashboard_stats(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
  today_start timestamptz := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  yesterday_start timestamptz := today_start - interval '1 day';
BEGIN
  SELECT jsonb_build_object(
    'today_profile_views', (
      SELECT count(DISTINCT viewer_id) FROM profile_views
      WHERE viewed_profile_id = target_user_id
        AND viewer_id != target_user_id
        AND viewed_at >= today_start
    ),
    'today_likes', (
      SELECT count(*) FROM user_likes
      WHERE liked_user_id = target_user_id
        AND is_active = true
        AND type IN ('like', 'super_like')
        AND created_at >= today_start
    ),
    'today_impressions', (
      SELECT count(*) FROM search_impressions
      WHERE viewed_profile_id = target_user_id
        AND created_at >= today_start
    ),
    'today_post_views', (
      SELECT count(*) FROM post_views pv
      JOIN posts p ON pv.post_id = p.id
      WHERE p.user_id = target_user_id
        AND pv.created_at >= today_start
    ),
    'yesterday_profile_views', (
      SELECT count(DISTINCT viewer_id) FROM profile_views
      WHERE viewed_profile_id = target_user_id
        AND viewer_id != target_user_id
        AND viewed_at >= yesterday_start
        AND viewed_at < today_start
    )
  ) INTO result;

  RETURN result;
END;
$$;
