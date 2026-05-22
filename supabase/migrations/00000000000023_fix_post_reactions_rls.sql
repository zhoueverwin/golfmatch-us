-- Fix RLS policies on post_reactions: user_id is a FK to profiles.id, not
-- auth.users.id, so comparing against auth.uid() directly always fails.
--
-- The convention in this codebase (CLAUDE.md → User Identification) is that
-- app-level FKs point at profiles.id, and RLS policies must resolve
-- auth.uid() through the profiles.user_id → profiles.id mapping.
--
-- Without this fix, every post reaction INSERT fails RLS silently — the
-- table has only 3 rows total despite the feature being live, because the
-- client correctly passes profileId but the policy compares it against
-- auth.uid() (a different UUID).

DROP POLICY IF EXISTS "Users can create own post reactions" ON public.post_reactions;
DROP POLICY IF EXISTS "Users can delete own post reactions" ON public.post_reactions;

CREATE POLICY "Users can create own post reactions"
  ON public.post_reactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IN (
      SELECT id FROM public.profiles WHERE user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can delete own post reactions"
  ON public.post_reactions
  FOR DELETE
  TO authenticated
  USING (
    user_id IN (
      SELECT id FROM public.profiles WHERE user_id = auth.uid()::text
    )
  );
