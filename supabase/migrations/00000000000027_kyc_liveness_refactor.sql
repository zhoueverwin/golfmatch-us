-- v1.1 KYC liveness refactor.
--
-- Splits identity verification into two workflows on the Didit side:
--   - LITE: liveness + face match + age estimation only. Default for v1.1.
--   - HEAVY: full document + selfie + AML. Used as the escalation target
--     when the lite workflow's age check is inconclusive, and as the
--     rollback target via the kyc_workflow feature flag below.
--
-- gender + birth_date are now user-attested at onboarding (see the new
-- Birthdate/Gender screens in src/screens/onboarding/). The webhook stops
-- writing those fields and instead cross-checks Didit's AI age estimate
-- against the self-attested birth_date; on mismatch the user is escalated
-- to the heavy workflow via kyc_requires_document=true.
--
-- Cross-references:
--   - V1_1_PLAN_KYC_LIVENESS.md (task 3) — plan source
--   - supabase/functions/didit-webhook/index.ts — consumer of the new flag
--     and the new column
--   - supabase/functions/create-didit-session/index.ts — reads the flag
--   - src/screens/onboarding/OnboardingDocumentEscalationScreen.tsx —
--     forces mode='heavy' when kyc_requires_document=true

-- ─── Feature flag ───────────────────────────────────────────────────────
-- 'liveness_only' = v1.1 default; the create-didit-session edge function
--                   routes to DIDIT_WORKFLOW_ID_LIGHT.
-- 'document_required' = rollback; the edge function forces every session
--                       through DIDIT_WORKFLOW_ID (the heavy workflow),
--                       restoring v1.0 behavior without a client redeploy.
-- Stored as a JSONB string so the edge function can read it via the
-- existing app_config helper pattern (same shape as 'blocked_domains').
INSERT INTO public.app_config (key, value) VALUES
  ('kyc_workflow', '"liveness_only"'::jsonb)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = now();

-- ─── Escalation flag column ─────────────────────────────────────────────
-- Set by the webhook when the lite-workflow age check is inconclusive
-- (AI age < 21, > 5y mismatch from self-attested, or AI age unavailable).
-- Read by OnboardingKycScreen via Realtime; on true, the client navigates
-- to OnboardingDocumentEscalationScreen which forces mode='heavy'.
-- Cleared back to false on a successful heavy-workflow approval.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS kyc_requires_document BOOLEAN NOT NULL DEFAULT false;

-- ─── Face embedding hash (deferred to v1.2 use) ────────────────────────
-- Column reserved for v1.2 face-dedup work. The webhook does NOT populate
-- this yet — provider selection (Didit vs AWS Rekognition vs self-hosted)
-- is deferred per V1_1_PLAN_KYC_LIVENESS.md "What's NOT in v1.1".
-- Adding the column + index now means no future migration is needed to
-- start populating it from a webhook update.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS face_embedding_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_face_embedding_hash
  ON public.profiles (face_embedding_hash)
  WHERE face_embedding_hash IS NOT NULL;

-- ─── Orphan-row backfill ───────────────────────────────────────────────
-- Defensive: any profile that somehow has birth_date but null gender
-- (shouldn't exist on a clean v1.0 DB since Didit's verdict wrote both)
-- gets gender='other' so the new returning-user gender gate doesn't
-- bounce them. We pick 'other' (not 'unknown') to stay within the
-- existing CHECK constraint 'male'|'female'|'other'. These users can
-- update their gender from the profile editor.
UPDATE public.profiles
   SET gender = 'other',
       updated_at = now()
 WHERE gender IS NULL
   AND birth_date IS NOT NULL;

COMMENT ON COLUMN public.profiles.kyc_requires_document IS
  'Set by didit-webhook (v1.1) when the lite workflow''s age check is inconclusive. ' ||
  'Read by OnboardingKycScreen via Realtime to escalate the user to the heavy ' ||
  '(document-required) Didit workflow. See migration 27.';

COMMENT ON COLUMN public.profiles.face_embedding_hash IS
  'Reserved for v1.2 face deduplication. Not populated by the v1.1 webhook. ' ||
  'See V1_1_PLAN_KYC_LIVENESS.md "What''s NOT in v1.1".';
