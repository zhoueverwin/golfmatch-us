-- ============================================================================
-- INTELLIGENT RECOMMENDATION ALGORITHM
-- Created: 2025-12-03
-- Purpose: Replace simple おすすめ recommendation with intelligent scoring
-- ============================================================================

-- ============================================================================
-- STEP 1: CREATE PERFORMANCE INDEXES
-- ============================================================================

-- Availability table indexes for calendar matching
CREATE INDEX IF NOT EXISTS idx_availability_user_date
  ON availability(user_id, date) WHERE is_available = true;

CREATE INDEX IF NOT EXISTS idx_availability_date_range
  ON availability(date) WHERE is_available = true;

-- User likes indexes for exclusion
CREATE INDEX IF NOT EXISTS idx_user_likes_liker_active
  ON user_likes(liker_user_id, liked_user_id) WHERE is_active = true;

-- Profiles indexes for filtering and sorting
CREATE INDEX IF NOT EXISTS idx_profiles_last_login
  ON profiles(last_login DESC);

CREATE INDEX IF NOT EXISTS idx_profiles_prefecture
  ON profiles(prefecture);

CREATE INDEX IF NOT EXISTS idx_profiles_skill_level
  ON profiles(golf_skill_level);

CREATE INDEX IF NOT EXISTS idx_profiles_gender_login
  ON profiles(gender, last_login DESC);

-- ============================================================================
-- STEP 2: CREATE INTELLIGENT RECOMMENDATIONS RPC FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION get_intelligent_recommendations(
  p_current_user_id UUID,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  user_id TEXT,
  legacy_id TEXT,
  name TEXT,
  age INTEGER,
  gender TEXT,
  prefecture TEXT,
  location TEXT,
  golf_skill_level TEXT,
  average_score INTEGER,
  profile_pictures TEXT[],
  bio TEXT,
  is_verified BOOLEAN,
  is_premium BOOLEAN,
  last_login TEXT,
  created_at TEXT,
  updated_at TEXT,
  recommendation_score NUMERIC,
  score_breakdown JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_user_record RECORD;
  v_date_range_start DATE;
  v_date_range_end DATE;
BEGIN
  -- Get current user's profile data
  SELECT
    prefecture,
    golf_skill_level,
    average_score,
    gender
  INTO v_current_user_record
  FROM profiles
  WHERE profiles.id = p_current_user_id;

  -- Calculate 30-day date range for calendar matching
  v_date_range_start := CURRENT_DATE;
  v_date_range_end := CURRENT_DATE + INTERVAL '30 days';

  -- Main recommendation query with scoring algorithm
  RETURN QUERY
  WITH
  -- Step 1: Get excluded user IDs (already interacted)
  excluded_users AS (
    SELECT liked_user_id AS user_id
    FROM user_likes
    WHERE liker_user_id = p_current_user_id
      AND is_active = true
  ),

  -- Step 2: Get calendar overlaps (shared available dates)
  calendar_matches AS (
    SELECT
      a1.user_id,
      COUNT(DISTINCT a1.date) AS shared_days_count
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

  -- Step 3: Calculate candidate pool with all scoring factors
  candidates AS (
    SELECT
      p.id,
      p.user_id,
      p.legacy_id,
      p.name,
      p.age,
      p.gender,
      p.prefecture,
      p.location,
      p.golf_skill_level,
      p.average_score,
      p.profile_pictures,
      p.bio,
      p.is_verified,
      p.is_premium,
      p.last_login,
      p.created_at,
      p.updated_at,

      -- SCORING FACTORS (weighted components)

      -- 1. Calendar Overlap Score (0-30 points)
      -- Weight: 30% - Most important factor
      COALESCE(
        CASE
          WHEN cm.shared_days_count >= 10 THEN 30.0
          WHEN cm.shared_days_count >= 5 THEN 20.0 + (cm.shared_days_count - 5) * 2.0
          WHEN cm.shared_days_count >= 1 THEN 10.0 + (cm.shared_days_count - 1) * 2.5
          ELSE 0.0
        END,
        0.0
      ) AS calendar_score,

      -- 2. Golf Skill Similarity Score (0-25 points)
      -- Weight: 25% - Important for compatible matches
      CASE
        -- Exact match
        WHEN p.golf_skill_level = v_current_user_record.golf_skill_level THEN 25.0
        -- Adjacent levels (ビギナー ↔ 中級者)
        WHEN (p.golf_skill_level = 'ビギナー' AND v_current_user_record.golf_skill_level = '中級者')
          OR (p.golf_skill_level = '中級者' AND v_current_user_record.golf_skill_level = 'ビギナー') THEN 18.0
        -- Adjacent levels (中級者 ↔ 上級者)
        WHEN (p.golf_skill_level = '中級者' AND v_current_user_record.golf_skill_level = '上級者')
          OR (p.golf_skill_level = '上級者' AND v_current_user_record.golf_skill_level = '中級者') THEN 18.0
        -- Adjacent levels (上級者 ↔ プロ)
        WHEN (p.golf_skill_level = '上級者' AND v_current_user_record.golf_skill_level = 'プロ')
          OR (p.golf_skill_level = 'プロ' AND v_current_user_record.golf_skill_level = '上級者') THEN 18.0
        -- Two levels apart
        WHEN (p.golf_skill_level = 'ビギナー' AND v_current_user_record.golf_skill_level = '上級者')
          OR (p.golf_skill_level = '上級者' AND v_current_user_record.golf_skill_level = 'ビギナー') THEN 10.0
        WHEN (p.golf_skill_level = '中級者' AND v_current_user_record.golf_skill_level = 'プロ')
          OR (p.golf_skill_level = 'プロ' AND v_current_user_record.golf_skill_level = '中級者') THEN 10.0
        -- Far apart
        ELSE 5.0
      END AS skill_score,

      -- 3. Average Score Similarity (0-20 points)
      -- Weight: 20% - Complements skill level
      CASE
        WHEN p.average_score IS NULL OR v_current_user_record.average_score IS NULL THEN 10.0
        WHEN ABS(p.average_score - v_current_user_record.average_score) <= 5 THEN 20.0
        WHEN ABS(p.average_score - v_current_user_record.average_score) <= 10 THEN 15.0
        WHEN ABS(p.average_score - v_current_user_record.average_score) <= 20 THEN 10.0
        WHEN ABS(p.average_score - v_current_user_record.average_score) <= 30 THEN 5.0
        ELSE 2.0
      END AS score_similarity,

      -- 4. Location Proximity Score (0-15 points)
      -- Weight: 15% - Same or adjacent prefecture
      CASE
        WHEN p.prefecture = v_current_user_record.prefecture THEN 15.0
        -- Kanto region (関東)
        WHEN (p.prefecture IN ('東京都', '神奈川県', '埼玉県', '千葉県', '茨城県', '栃木県', '群馬県')
          AND v_current_user_record.prefecture IN ('東京都', '神奈川県', '埼玉県', '千葉県', '茨城県', '栃木県', '群馬県')) THEN 10.0
        -- Kansai region (関西)
        WHEN (p.prefecture IN ('大阪府', '京都府', '兵庫県', '奈良県', '和歌山県', '滋賀県')
          AND v_current_user_record.prefecture IN ('大阪府', '京都府', '兵庫県', '奈良県', '和歌山県', '滋賀県')) THEN 10.0
        -- Chubu region (中部)
        WHEN (p.prefecture IN ('愛知県', '岐阜県', '三重県', '静岡県', '長野県', '山梨県', '新潟県', '富山県', '石川県', '福井県')
          AND v_current_user_record.prefecture IN ('愛知県', '岐阜県', '三重県', '静岡県', '長野県', '山梨県', '新潟県', '富山県', '石川県', '福井県')) THEN 10.0
        -- Kyushu region (九州)
        WHEN (p.prefecture IN ('福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県')
          AND v_current_user_record.prefecture IN ('福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県')) THEN 10.0
        -- Tohoku region (東北)
        WHEN (p.prefecture IN ('青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県')
          AND v_current_user_record.prefecture IN ('青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県')) THEN 10.0
        -- Chugoku region (中国)
        WHEN (p.prefecture IN ('鳥取県', '島根県', '岡山県', '広島県', '山口県')
          AND v_current_user_record.prefecture IN ('鳥取県', '島根県', '岡山県', '広島県', '山口県')) THEN 10.0
        -- Shikoku region (四国)
        WHEN (p.prefecture IN ('徳島県', '香川県', '愛媛県', '高知県')
          AND v_current_user_record.prefecture IN ('徳島県', '香川県', '愛媛県', '高知県')) THEN 10.0
        -- Hokkaido region
        WHEN (p.prefecture = '北海道' AND v_current_user_record.prefecture = '北海道') THEN 15.0
        ELSE 5.0
      END AS location_score,

      -- 5. Activity Recency Score (0-10 points)
      -- Weight: 10% - Recent users are more likely to respond
      CASE
        WHEN p.last_login >= NOW() - INTERVAL '24 hours' THEN 10.0
        WHEN p.last_login >= NOW() - INTERVAL '3 days' THEN 8.0
        WHEN p.last_login >= NOW() - INTERVAL '7 days' THEN 6.0
        WHEN p.last_login >= NOW() - INTERVAL '14 days' THEN 4.0
        WHEN p.last_login >= NOW() - INTERVAL '30 days' THEN 2.0
        ELSE 0.0
      END AS activity_score,

      -- 6. Profile Quality Score (0-10 points)
      -- Weight: 10% - Complete profiles indicate serious users
      (
        CASE WHEN p.is_verified THEN 4.0 ELSE 0.0 END +
        CASE WHEN array_length(p.profile_pictures, 1) >= 3 THEN 3.0
             WHEN array_length(p.profile_pictures, 1) >= 1 THEN 2.0
             ELSE 0.0 END +
        CASE WHEN p.bio IS NOT NULL AND length(p.bio) >= 50 THEN 3.0
             WHEN p.bio IS NOT NULL AND length(p.bio) >= 20 THEN 2.0
             ELSE 0.0 END
      ) AS profile_quality_score,

      -- Store calendar match data for transparency
      COALESCE(cm.shared_days_count, 0) AS shared_days_count

    FROM profiles p
    LEFT JOIN calendar_matches cm ON cm.user_id = p.id
    WHERE
      -- Exclude self
      p.id != p_current_user_id
      -- Exclude already interacted users
      AND p.id NOT IN (SELECT user_id FROM excluded_users)
      -- Only active users (logged in within 90 days)
      AND p.last_login >= NOW() - INTERVAL '90 days'
  )

  -- Step 4: Calculate final scores and return ranked results
  SELECT
    c.id,
    c.user_id,
    c.legacy_id,
    c.name,
    c.age,
    c.gender,
    c.prefecture,
    c.location,
    c.golf_skill_level,
    c.average_score,
    c.profile_pictures,
    c.bio,
    c.is_verified,
    c.is_premium,
    c.last_login::TEXT,
    c.created_at::TEXT,
    c.updated_at::TEXT,
    -- Total score (sum of all components = 0-110 points)
    (
      c.calendar_score +
      c.skill_score +
      c.score_similarity +
      c.location_score +
      c.activity_score +
      c.profile_quality_score
    ) AS recommendation_score,
    -- Score breakdown for transparency/debugging
    jsonb_build_object(
      'calendar_score', c.calendar_score,
      'skill_score', c.skill_score,
      'score_similarity', c.score_similarity,
      'location_score', c.location_score,
      'activity_score', c.activity_score,
      'profile_quality_score', c.profile_quality_score,
      'shared_days_count', c.shared_days_count
    ) AS score_breakdown
  FROM candidates c
  ORDER BY recommendation_score DESC, c.last_login DESC
  LIMIT p_limit
  OFFSET p_offset;

END;
$$;

-- ============================================================================
-- STEP 3: GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION get_intelligent_recommendations TO authenticated;

-- ============================================================================
-- STEP 4: TEST THE FUNCTION (uncomment to test)
-- ============================================================================

-- Replace 'your-user-uuid-here' with an actual user ID for testing
-- SELECT * FROM get_intelligent_recommendations('your-user-uuid-here'::UUID, 10, 0);

-- ============================================================================
-- NOTES
-- ============================================================================
--
-- To run this migration:
-- 1. Copy this file content
-- 2. Go to Supabase Dashboard → SQL Editor
-- 3. Paste and execute
--
-- Performance:
-- - Expected query time: 50-200ms for 10k users
-- - Cache recommendations for 10 minutes in the app layer
--
-- Scoring Breakdown:
-- - Calendar overlap: 30 points (most important)
-- - Golf skill similarity: 25 points
-- - Score similarity: 20 points
-- - Location proximity: 15 points
-- - Activity recency: 10 points
-- - Profile quality: 10 points
-- Total: 110 points possible
--
-- ============================================================================
