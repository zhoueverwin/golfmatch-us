-- Migration 33 — make get_daily_recommendations self-heal against likes
-- that happened in other channels (Search, profile detail, etc).
--
-- Prior state (migration 32): the read path only filtered
--     AND dr.swiped = false
-- The `swiped` flag is only flipped by markRecommendationSwiped, which is
-- only called from TodaySwipeView's swipe handlers. If a user liked the
-- same profile from the Search tab (or any non-swipe surface), only
-- user_likes was written — the daily_recommendations row kept
-- swiped = false and the profile kept reappearing on the Swipe deck.
--
-- Fix: at read time, also exclude any recommended_user_id that the user
-- has already liked/super-liked or already matched with. The snapshot
-- stays pre-baked for "today's picks" stability, but the read path is
-- now reactive to the canonical interaction tables.
--
-- Body preserved verbatim from migration 32 except the WHERE clause.

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
    AND (p.gender = 'female' OR p.is_premium = true)
    -- Self-heal against cross-channel likes: exclude anyone the user has
    -- already liked/super-liked from any surface (Search, profile, swipe).
    AND NOT EXISTS (
      SELECT 1 FROM user_likes ul
       WHERE ul.liker_user_id = p_user_id
         AND ul.liked_user_id = dr.recommended_user_id
         AND ul.is_active = true
         AND ul.type IN ('like', 'super_like')
    )
    -- Also exclude already-matched profiles (a match implies a like, but
    -- being defensive — and matches can be created via other flows).
    AND NOT EXISTS (
      SELECT 1 FROM matches m
       WHERE m.is_active = true
         AND ((m.user1_id = p_user_id AND m.user2_id = dr.recommended_user_id)
           OR (m.user2_id = p_user_id AND m.user1_id = dr.recommended_user_id))
    )
  ORDER BY dr.created_at ASC;
END;
$$;
