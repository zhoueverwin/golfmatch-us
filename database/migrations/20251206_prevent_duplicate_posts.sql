-- ============================================================================
-- PREVENT DUPLICATE POSTS
-- Created: 2025-12-06
-- Purpose: Add content hash column and unique constraint to prevent duplicate posts
-- ============================================================================

-- ============================================================================
-- STEP 1: ADD CONTENT HASH COLUMN
-- ============================================================================

-- Add content_hash column to store MD5 hash of content for duplicate detection
ALTER TABLE posts
ADD COLUMN IF NOT EXISTS content_hash TEXT;

-- ============================================================================
-- STEP 2: POPULATE EXISTING POSTS WITH CONTENT HASH
-- ============================================================================

-- Update existing posts with their content hash
-- Using MD5 hash of: user_id + content + images array + videos array
UPDATE posts
SET content_hash = MD5(
  COALESCE(user_id::text, '') ||
  COALESCE(content, '') ||
  COALESCE(array_to_string(images, ','), '') ||
  COALESCE(array_to_string(videos, ','), '')
)
WHERE content_hash IS NULL;

-- ============================================================================
-- STEP 3: CREATE UNIQUE INDEX FOR DUPLICATE PREVENTION
-- ============================================================================

-- Create unique index on (user_id, content_hash) to prevent exact duplicates
-- This allows the same user to post different content but not the same content twice
CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_user_content_hash
ON posts(user_id, content_hash);

-- ============================================================================
-- STEP 4: CREATE TRIGGER TO AUTO-GENERATE CONTENT HASH
-- ============================================================================

-- Function to generate content hash before insert
CREATE OR REPLACE FUNCTION generate_post_content_hash()
RETURNS TRIGGER AS $$
BEGIN
  NEW.content_hash := MD5(
    COALESCE(NEW.user_id::text, '') ||
    COALESCE(NEW.content, '') ||
    COALESCE(array_to_string(NEW.images, ','), '') ||
    COALESCE(array_to_string(NEW.videos, ','), '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-generate hash on insert
DROP TRIGGER IF EXISTS trg_posts_content_hash ON posts;
CREATE TRIGGER trg_posts_content_hash
  BEFORE INSERT ON posts
  FOR EACH ROW
  EXECUTE FUNCTION generate_post_content_hash();

-- ============================================================================
-- NOTE: Duplicate insert attempts will now fail with unique constraint violation
-- Error code: 23505 (unique_violation)
-- The application should catch this and show a user-friendly message
-- ============================================================================
