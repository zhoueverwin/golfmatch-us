-- Tighten messages.INSERT policy to enforce male-pay-for-messaging gate.
--
-- Mirrors src/utils/premiumGates.ts shouldLockMessaging():
--   isVerified AND (gender = 'female' OR is_premium = true)
--
-- The baseline policy (in 00000000000000_baseline_schema.sql) only required
-- is_verified. This migration adds the gender/premium check so RLS can never
-- be bypassed even if the client gate is removed or stale.

DROP POLICY IF EXISTS "Users can send messages in their chats" ON public.messages;

CREATE POLICY "Users can send messages in their chats"
  ON public.messages
  FOR INSERT
  WITH CHECK (
    (auth.uid() = sender_id)
    AND EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_verified = true
        AND (profiles.gender = 'female' OR profiles.is_premium = true)
    )
    AND NOT public.is_current_user_banned()
  );
