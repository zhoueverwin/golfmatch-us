# v1.1 Architecture Change: Document KYC → Liveness-Only

**Status:** implemented 2026-05-23 (pending Didit dashboard config + deploy)
**Drafted:** 2026-05-23
**Target:** post-App-Store-v1.0 launch sprint (~3 days of work)
**Rollback:** feature-flag controlled; can revert to today's flow without redeploy
**Lite workflow IDs:**
- **Active (PASSIVE liveness, free tier):** `8b18c14b-a401-419d-bfbc-a4e68baaf783` — "Golfmatch Liveness Only", KYC type, features `LIVENESS (PASSIVE) + IP_ANALYSIS`. PASSIVE liveness has a 500/mo free tier so we default to this until activation data shows we need stronger anti-spoofing.
- **Upgrade target (ACTIVE_3D liveness, paid):** `bfcab8c0-4411-43d4-a781-dbd911947f6e` — "Golfmatch Liveness 3D", same features but `face_liveness_method=ACTIVE_3D` (small head-motion challenge, much harder to spoof). $0.15/session, NO free tier — requires topping up Didit credits first via `POST /v3/billing/top-up/`. To swap, change `DIDIT_WORKFLOW_ID_LIGHT_DEFAULT` in `supabase/functions/create-didit-session/index.ts` and redeploy.
- **Deprecated:** `ee655d59-e0b0-43dc-bbb3-4ec2f144ff34` ("Biometric Authentication") — was the original Didit-dashboard "duplicate" attempt, turned out to be `workflow_type: biometric_authentication` (a re-auth template) which 400s on first-time KYC because it requires `portrait_image` at session creation. Left in the dashboard as a curiosity; not used by the app.

This document captures the v1.1 onboarding refactor that follows the App Store launch. The goal is to cut KYC drop-off by replacing Didit's document-upload flow with selfie-liveness, while preserving every current safety property and the reviewer-friendly demo-account bypass.

## Architecture diff

### Today (v1.0)
```
sign up
   ↓
name → state → location → photo
   ↓
KYC (Didit full: doc + selfie + AML + DB validation)   ← Didit writes gender, birth_date, age
   ↓
[if male] paywall
   ↓
home
```

### v1.1 target
```
sign up
   ↓
name → birthdate → gender → state → location → photo   ← user self-attests gender + birth_date
   ↓
[if male] paywall                                      ← paywall before liveness; sunk-cost drives liveness completion
   ↓
liveness (Didit lite: selfie only, no document)        ← AI age cross-checked against self-attested
   ↓ if AI/self-attest mismatch > 5y OR AI age < 21
   └─→ escalate to document upload (existing Didit heavy workflow)
   ↓
home
```

**Key change:** gender + birth_date are now user-input (not extracted from Didit). Liveness only verifies "real person + estimated age." Paywall comes before liveness so only paying males consume Didit credits.

## Tasks

### 1. New onboarding screens (~4 hours)

| File to create | Purpose |
|---|---|
| `src/screens/onboarding/OnboardingBirthdateScreen.tsx` | Date picker; validates >= 18 years old; sets `profiles.birth_date` |
| `src/screens/onboarding/OnboardingGenderScreen.tsx` | Radio/segmented control: male / female (consider nonbinary later); sets `profiles.gender` |

Both follow the existing `OnboardingShell.tsx` pattern. Add to `RootStackParamList` and to the stack in `AppNavigator.tsx`.

### 2. Update navigation gate order (~2 hours)

In `src/navigation/AppNavigator.tsx`:

- Add `needsBirthdateGate` and `needsGenderGate` checks
- Reorder gates: `name → birthdate → gender → state → location → photo → paywall (if male, not premium) → liveness (if not verified) → home`
- The liveness gate must come AFTER the paywall gate
- `setup_review_account()` sets `is_verified=true` AND `is_premium=false` (for reviewer to test paywall) AND populates birth_date / gender — all existing helpers still work

### 3. Database migration (~1 hour)

Create `supabase/migrations/<timestamp>_kyc_liveness_refactor.sql`:

```sql
-- Feature flag for rollback. Client reads on session start.
INSERT INTO public.app_config (key, value) VALUES
  ('kyc_workflow', '"liveness_only"'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Existing profiles: birth_date and gender already populated by Didit historically.
-- Verify and backfill any nulls (should be ~0 rows on a clean post-migration DB).
UPDATE public.profiles
SET gender = 'unknown'  -- fallback for any orphan rows
WHERE gender IS NULL AND birth_date IS NOT NULL;

-- Optional: add column for face embedding hash (for face deduplication in v1.2).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS face_embedding_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_face_embedding_hash
  ON public.profiles(face_embedding_hash)
  WHERE face_embedding_hash IS NOT NULL;
```

**Note:** do NOT change the `sync_is_verified_with_kyc_status` trigger or the discovery RPCs in migration 19. They continue to work — `is_verified` still becomes true upon successful liveness, gender/birth_date still get populated (just from a different source).

### 4. Update `didit-webhook` edge function (~3 hours)

In `supabase/functions/didit-webhook/index.ts`:

- **Stop writing gender, birth_date, age from verdict** (around line 260-271). These now come from user self-attestation in onboarding.
- **Add age cross-check logic**: compare `decision.liveness_checks[0].age_estimation` against the existing `profiles.birth_date`.
- Decision tree:
  ```typescript
  const aiAge = event.decision?.liveness_checks?.[0]?.age_estimation ?? null;
  const selfAge = profile.birth_date
    ? yearsBetween(new Date(profile.birth_date), new Date())
    : null;

  if (!aiAge || !selfAge) {
    // ambiguous — escalate
    return escalateToDocument(profileId);
  }
  if (aiAge < 18) {
    return reject(profileId, 'age_minor');
  }
  if (Math.abs(aiAge - selfAge) > 5 || aiAge < 21) {
    return escalateToDocument(profileId);
  }
  return markVerified(profileId);
  ```
- **Add `face_embedding_hash` storage** if Didit returns it in the payload (check current webhook payload; if not provided, defer face dedup to v1.2 via a separate provider).
- **Handle both workflow types**: detect via `event.workflow_id` whether this is lite or heavy and route accordingly.

### 5. Update `create-didit-session` edge function (~1 hour)

In `supabase/functions/create-didit-session/index.ts`:

- Read `app_config.kyc_workflow` flag at request time
- If `liveness_only`, use `DIDIT_WORKFLOW_ID_LIGHT` env var
- If `document_required` (rollback case), use existing `DIDIT_WORKFLOW_ID` (now treated as the heavy workflow)
- Accept a `mode: 'lite' | 'heavy'` parameter for forcing the heavy workflow during escalation

### 6. Didit dashboard configuration (manual, ~15 minutes — user does this)

1. Log into Didit dashboard
2. Duplicate the existing workflow (the one currently in `DIDIT_WORKFLOW_ID=57214887-...`)
3. Edit the duplicate: **disable** ID Verification, NFC, POA, AML, IP Analysis, Database Validation
4. **Keep enabled:** Liveness, Face Match (against itself), Age Estimation
5. Save and copy the new workflow ID
6. Add to `.env`:
   ```
   DIDIT_WORKFLOW_ID_LIGHT=<new-workflow-id>
   DIDIT_WORKFLOW_ID=57214887-1de7-457d-b5ec-da4d202aca2a  # keep existing as heavy/escalation
   ```
7. Add to Supabase secrets via CLI:
   ```bash
   supabase secrets set DIDIT_WORKFLOW_ID_LIGHT=<value> --project-ref situfkpgyziruiusiykd
   ```

### 7. Frontend: update `OnboardingKycScreen.tsx` (~2 hours)

- Rename screen file/route to `OnboardingLivenessScreen.tsx` for clarity (optional but cleaner)
- Update header/copy from "Identity Verification" to "Quick Selfie Check"
- Update progress indicator if onboarding has one
- Handle the escalation path: if webhook reports `requires_document`, route to a new `OnboardingDocumentEscalationScreen` that triggers the heavy Didit workflow

### 8. Reviewer-flow validation (~30 min)

Verify `setup_review_account()` still bypasses both gates correctly:

```sql
SELECT * FROM public.setup_review_account('test-reviewer@golfmatch.info');
```

Then walk through the app as the reviewer account:
1. Sign in → should land at paywall (is_verified=true, is_premium=false, gender=male)
2. Complete sandbox purchase → should land at home (liveness skipped because is_verified=true)
3. Confirm no orphan KYC screens, no errors

**If anything in the new gate order requires re-running `setup_review_account()`**, update the helper to set the additional flags needed.

### 9. Feature-flag rollback path (~30 min)

Document the rollback procedure:

```sql
-- Rollback to document-required (v1.0 behavior)
UPDATE public.app_config
SET value = '"document_required"'::jsonb
WHERE key = 'kyc_workflow';
```

Client must read this flag on session start; pick Didit workflow accordingly. Stale clients (already-running sessions) continue with their current workflow until next session start.

### 10. Analytics instrumentation (~1 hour)

Add events to measure post-launch:

| Event | Fires when |
|---|---|
| `onboarding_step_completed` | each onboarding screen → next, with `step` property |
| `onboarding_paywall_shown` | paywall mounted |
| `onboarding_paywall_completed` | sandbox/real purchase succeeds |
| `onboarding_liveness_shown` | liveness session created |
| `onboarding_liveness_completed` | webhook verdict received |
| `onboarding_liveness_escalated_to_document` | age mismatch or low AI age → heavy workflow |
| `onboarding_home_reached` | user lands at home for the first time |

Use existing analytics framework (PostHog / Sentry breadcrumbs / Mixpanel — whichever the app already has).

## Effort estimate

| Phase | Time |
|---|---|
| Frontend (2 new screens + nav + Liveness rename) | ~8h |
| Backend (webhook + create-session + migration) | ~5h |
| Didit dashboard config | ~15min (user) |
| Reviewer flow validation | ~30min |
| Analytics + rollback path | ~1.5h |
| End-to-end testing on TestFlight | ~3h |
| **Total** | **~3 working days** |

## Deployment runbook

1. **Set the lite-workflow secret** in the Supabase dev + prod projects:
   ```bash
   supabase secrets set DIDIT_WORKFLOW_ID_LIGHT=ee655d59-e0b0-43dc-bbb3-4ec2f144ff34 \
     --project-ref situfkpgyziruiusiykd
   ```
   The existing `DIDIT_WORKFLOW_ID` env var stays unchanged — it is now the
   "heavy" workflow used for escalation and rollback.

2. **Apply migration 27**:
   ```bash
   ./scripts/db-push-develop.sh
   ```
   Adds `profiles.kyc_requires_document`, `profiles.face_embedding_hash`,
   and the `app_config.kyc_workflow='liveness_only'` flag.

3. **Deploy edge functions**:
   ```bash
   supabase functions deploy didit-webhook --project-ref situfkpgyziruiusiykd
   supabase functions deploy create-didit-session --project-ref situfkpgyziruiusiykd
   ```

4. **Build the client** with the updated onboarding flow (new Birthdate
   + Gender screens in the linear path; renamed copy on the liveness
   screen). No env changes needed on the client side — the workflow
   switch is server-side via the edge functions.

5. **Reviewer validation**: run
   `SELECT * FROM public.setup_review_account('applereview@golfmatch.info');`
   and confirm the resulting row shows `is_verified=true`,
   `kyc_status=approved`, `gender=male`, `birth_date=1990-01-01`,
   `is_premium=false`, `ready_for_review=true`. Sign in as the reviewer
   account in the app, confirm:
   - lands on Paywall (skips Birthdate/Gender/State/Photo/Liveness because
     the profile is already populated and verified)
   - completes sandbox purchase → lands at Main
   - no orphan KYC screens, no errors

## Feature-flag rollback procedure

If liveness drop-off, escalation rate, or any other metric goes wrong
post-launch, revert without a client deploy:

```sql
-- Rollback: force all sessions through the heavy (document) workflow.
UPDATE public.app_config
   SET value = '"document_required"'::jsonb,
       updated_at = now()
 WHERE key = 'kyc_workflow';
```

The `create-didit-session` edge function reads this flag at request time.
Sessions already in flight at the moment of the flip continue with their
current workflow until next session start; new sessions immediately use
heavy.

To roll forward again:

```sql
UPDATE public.app_config
   SET value = '"liveness_only"'::jsonb,
       updated_at = now()
 WHERE key = 'kyc_workflow';
```

The webhook handles both workflow types in the same handler, so no
redeploy is needed on flag changes.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| AI age estimation false-positive on real young-looking 18+ users | Escalate to document for AI age < 21; existing manual review function (`request-kyc-review`) catches edge cases |
| Liveness drop-off higher than expected | Feature flag back to document-required; instrument to detect |
| Reviewer flow breaks | Update `setup_review_account()` to set new fields; test before submission |
| Paywall conversion crashes (because no prior trust signal) | Instrument paywall conversion; A/B flip to liveness-first if rate drops below 25% |
| Existing user data missing gender/birth_date | Backfill from Didit historical data already in DB; should be 0 rows post-migration |

## What's NOT in v1.1

These are deliberately deferred to later releases:

- **v1.2 — Face deduplication.** Store and compare face embeddings to catch duplicate-account attempts. Requires choice of provider for embedding (Didit might provide; otherwise AWS Rekognition or self-hosted).
- **v1.2 — Paywall conversion optimization.** Measure post-launch; if needed, shift to soft paywall + free swipe budget pattern.
- **v2.0 — Browse-first architecture.** Move liveness out of onboarding entirely; trigger at first-message. Big refactor; only do this if v1.1 activation data shows the gate position (not weight) is still the bottleneck.

## Cross-references

- Today's architecture map: see Explore-agent output in conversation that produced this plan.
- US regulatory landscape: no federal/state law requires KYC before user-to-user interaction in 2026; Tinder/Hinge moved to selfie-liveness; documented in v1.1 research memo (this conversation).
- Reviewer-flow guarantee: `setup_review_account(email)` helper added in migration `20260522123114`; works regardless of gate order.
- Memory entries to read first:
  - `feedback_kyc_never_force_approve.md` — anti-bypass invariant; nothing in this plan violates it
  - `project_jp_fork_db_residue.md` — JP-fork artifacts; the gender/birth_date Didit-extraction is one
