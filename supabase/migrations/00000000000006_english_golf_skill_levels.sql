-- Migration: switch profiles.golf_skill_level CHECK constraint from
-- Japanese values to English values to match the translated UI.
--
-- Background:
--   The codebase was forked from the Japanese app. The DB constraint kept
--   the original JP enum values:
--     'ビギナー', '中級者', '上級者', 'プロ'
--   The English-translated EditProfileScreen now writes:
--     'Beginner', 'Intermediate', 'Advanced', 'Pro'
--   So every profile save where the user picks a Skill Level fails with
--   Postgres error 23514 (check_violation) on profiles_golf_skill_level_check.
--   The dev who did the EN translation left a TODO comment in
--   src/screens/EditProfileScreen.tsx noting the DB needed a follow-up; this
--   is that follow-up.
--
-- Order of operations (matters):
--   1. UPDATE existing JP-valued rows to their EN equivalents. Must happen
--      BEFORE swapping the constraint — otherwise the new constraint would
--      see legacy rows that violate it and the ALTER would fail.
--   2. DROP the old JP-only constraint.
--   3. ADD the new EN-only constraint.
--
--   All three steps run in a single transaction so a failure at any step
--   leaves the DB in its original state.
--
-- About NULLs:
--   The column allows NULL, and a CHECK constraint that evaluates to NULL
--   is treated as passing in Postgres (only explicit FALSE fails). So users
--   who haven't picked a skill level keep working under both the old and
--   the new constraint — no special case needed for NULL.
--
-- Out of scope (intentionally):
--   - recruitments_max_skill_level_check / recruitments_min_skill_level_check
--     still use JP values. The recruitments feature has no frontend in this
--     app (grep -ri recruitment src/ returns zero), so no current save path
--     trips those constraints. They can be migrated in lockstep with any
--     future recruitments UI work.

BEGIN;

-- Step 1: Backfill existing rows from JP → EN.
UPDATE public.profiles
SET golf_skill_level = CASE golf_skill_level
  WHEN 'ビギナー' THEN 'Beginner'
  WHEN '中級者'   THEN 'Intermediate'
  WHEN '上級者'   THEN 'Advanced'
  WHEN 'プロ'     THEN 'Pro'
  ELSE golf_skill_level
END
WHERE golf_skill_level IN ('ビギナー', '中級者', '上級者', 'プロ');

-- Step 2: Drop the old JP-only constraint.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_golf_skill_level_check;

-- Step 3: Add the new EN-only constraint with the same name so anything
-- referencing the constraint by name (RLS introspection, error parsing,
-- migration tracking, etc.) keeps working.
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_golf_skill_level_check
  CHECK (
    golf_skill_level = ANY (
      ARRAY['Beginner'::text, 'Intermediate'::text, 'Advanced'::text, 'Pro'::text]
    )
  );

COMMIT;
