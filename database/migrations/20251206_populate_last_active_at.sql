-- ============================================================================
-- POPULATE LAST_ACTIVE_AT FOR EXISTING USERS
-- Created: 2025-12-06
-- Purpose: Initialize last_active_at field for users who have NULL values
--          This enables the "last access time" (最後にアクセせ時間) display
-- ============================================================================

-- Update profiles where last_active_at is NULL
-- Set it to last_login if available, otherwise use current timestamp
UPDATE profiles
SET last_active_at = COALESCE(last_login, NOW())
WHERE last_active_at IS NULL;

-- Create an index on last_active_at for better query performance
CREATE INDEX IF NOT EXISTS idx_profiles_last_active_at
  ON profiles(last_active_at DESC)
  WHERE last_active_at IS NOT NULL;

-- ============================================================================
-- NOTES
-- ============================================================================
--
-- This migration:
-- 1. Populates last_active_at for all users who have NULL
-- 2. Uses last_login as the initial value (since that's when they were last active)
-- 3. If last_login is also NULL, uses current timestamp
-- 4. Creates an index for efficient queries
--
-- After this migration:
-- - All existing users will have a last_active_at timestamp
-- - The presence service will continue updating it for active users
-- - Users can see when others were last active
--
-- ============================================================================
