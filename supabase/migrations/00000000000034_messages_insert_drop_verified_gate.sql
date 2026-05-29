-- Migration 34 — drop the is_verified gate from the messages.INSERT RLS
-- policy. In the v1.2 model males never verify (no KYC path exists for
-- them), so the previous predicate silently rejected every male's send
-- at the database layer even though the client's lock UI was gone.
--
-- Prior policy (migration 1):
--   auth.uid() = sender_id
--   AND EXISTS (SELECT 1 FROM profiles
--                WHERE id = auth.uid()
--                  AND is_verified = true                ← blocks all males
--                  AND (gender = 'female' OR is_premium = true))
--   AND NOT is_current_user_banned()
--
-- New policy:
--   auth.uid() = sender_id
--   AND EXISTS (SELECT 1 FROM profiles
--                WHERE id = auth.uid()
--                  AND (gender = 'female' OR is_premium = true))
--   AND NOT is_current_user_banned()
--
-- Why the gender/premium predicate stays:
--   The entry paywall guarantees every male in the app is premium, so
--   `is_premium=true` is true for any legitimate male sender. Females
--   are free to message (no paywall). This keeps RLS as a defense-in-
--   depth mirror of the paywall — if a male somehow ended up without
--   premium (lapsed sub, edge case), the server still refuses sends.
--
-- Why is_verified can be safely dropped:
--   Verification is purely a per-action client gate via
--   useRequireVerification — males pass through unconditionally,
--   unverified females see an Alert routing them to KycVerification
--   before a send is ever attempted. The server no longer needs to
--   enforce it on messages.INSERT.

DROP POLICY IF EXISTS "Users can send messages in their chats" ON public.messages;

CREATE POLICY "Users can send messages in their chats"
  ON public.messages
  FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.gender = 'female' OR profiles.is_premium = true)
    )
    AND NOT public.is_current_user_banned()
  );
