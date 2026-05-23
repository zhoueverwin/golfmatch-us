-- Restore on_auth_user_created trigger on auth.users.
--
-- WHY THIS MIGRATION EXISTS:
-- The Tokyo→us-east-2 Supabase region move on 2026-05-22 copied the
-- `public` schema cleanly (tables, functions, RLS) but dropped triggers
-- attached to objects in the `auth` schema. The handle_new_user() function
-- itself survived (it's in public), but the trigger on auth.users that
-- calls it did NOT. Result: new Google/Apple/email signups created an
-- auth.users row with no matching profiles row. The app then loops on
-- "Profile not found for authenticated user" and signs the user out.
--
-- This was originally fixed for the JP→US fork by migration 2
-- (00000000000002_auth_user_triggers.sql). That fix needs to be re-run
-- after EVERY region move or project copy, because Supabase's standard
-- export path doesn't include auth-schema trigger bindings.
--
-- Detected and patched 2026-05-23 after observing two orphan signups:
--   - 236295b1-cf8d-4a92-9598-eae95a195fa4 (wenbin.zhou@maymobility.com)
--   - 4d681624-6ff0-495b-8d1a-6371f94a7f0f (xiaoxiz744@gmail.com)
-- Both were backfilled at fix time; no further orphans exist.
--
-- FOR FUTURE REGION MOVES: after creating the destination project, run
-- this migration (or the equivalent of migration 2) and then re-check
-- pg_trigger for tgname='on_auth_user_created'. If absent, your trigger
-- didn't make the copy.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Idempotent backfill — catches any auth.users row that slipped through
-- the gap. On a clean DB this is a no-op.
INSERT INTO public.profiles (id, user_id, name, created_at, updated_at)
SELECT
  u.id,
  u.id::text,
  COALESCE(
    u.raw_user_meta_data->>'name',
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'display_name',
    split_part(u.email, '@', 1),
    'User'
  ),
  u.created_at,
  NOW()
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;
