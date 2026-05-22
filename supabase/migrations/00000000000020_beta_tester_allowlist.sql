-- Beta-tester allowlist: invited users skip KYC + paywall.
--
-- Use case:
--   For the cold-start phase we want to seed the user base with hand-picked
--   friends/influencers/early female recruits. They shouldn't be forced
--   through Didit KYC (we already trust them) or the male paywall (we want
--   them to use the app for free). At the same time we don't want a
--   permanent "free tier" backdoor — this is a temporary, email-keyed
--   allowlist that the team controls via SQL.
--
-- How it works:
--   1. beta_testers table holds the allowlisted email addresses.
--   2. A BEFORE INSERT trigger on profiles joins back to auth.users to read
--      the new user's email. If that email is in beta_testers, the trigger
--      pre-fills the profile with:
--        is_verified=true, kyc_status='approved'       — bypasses KYC gate
--        is_premium=true, premium_source='manual'      — bypasses paywall gate
--        gender='male' (default), birth_date='1990-01-01' (placeholder)
--   3. RevenueCatContext.syncPremiumStatusToDatabase respects manual-source
--      premium and refuses to downgrade it, so the grant is durable.
--   4. The discovery gate from migration 19 admits these users because
--      is_premium=true.
--
-- Operating:
--   Add a tester:    INSERT INTO beta_testers (email, note) VALUES ('foo@x.com', 'Bob');
--   Revoke a tester: DELETE FROM beta_testers WHERE email = 'foo@x.com';
--                    -- AND manually clear their profile:
--                    UPDATE profiles SET is_premium=false, premium_source=null
--                      WHERE id IN (SELECT p.id FROM profiles p
--                                     JOIN auth.users u ON u.id::text = p.user_id
--                                    WHERE lower(u.email) = 'foo@x.com');
--   List testers:    SELECT * FROM beta_testers ORDER BY created_at DESC;
--
-- Gender / birth_date for non-male testers:
--   The trigger defaults to gender='male' because the initial beta cohort is
--   invited male friends. For a female tester, override after they sign up:
--     UPDATE profiles SET gender='female' WHERE id = '<their id>';
--   The discovery gate doesn't care — verified females pass without premium.

-- =============================================================================
-- 1. Allowlist table.
--    Lower-cased email is the primary key so we can't accidentally seed
--    'Foo@x.com' and 'foo@x.com' as separate rows.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.beta_testers (
  email text PRIMARY KEY CHECK (email = lower(email)),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Lock down: only service-role / SECURITY DEFINER functions can read this.
-- No app-level RLS policies — leaking this list to authenticated users
-- defeats the "secret filter" goal.
ALTER TABLE public.beta_testers ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.beta_testers IS
  'Allowlist of invited beta-tester emails. Triggers auto-grant verified + manual-premium status to matching new profiles. See migration 20.';

-- =============================================================================
-- 2. Trigger function: pre-fill profile fields for beta testers on INSERT.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.apply_beta_tester_grants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions'
AS $$
DECLARE
  v_email text;
BEGIN
  -- Look up the auth.users email for this new profile. profiles.user_id is
  -- text (legacy schema decision) but holds the auth.users.id UUID stringified.
  SELECT lower(u.email) INTO v_email
    FROM auth.users u
   WHERE u.id::text = NEW.user_id;

  IF v_email IS NULL THEN
    RETURN NEW;
  END IF;

  -- Not on the allowlist? Leave NEW unchanged — defaults apply.
  IF NOT EXISTS (SELECT 1 FROM public.beta_testers WHERE email = v_email) THEN
    RETURN NEW;
  END IF;

  -- Pre-fill grant fields. We only set what's not already provided so the
  -- trigger is idempotent w.r.t. anything handle_new_user already wrote.
  NEW.is_verified := true;
  NEW.kyc_status := 'approved'::public.profile_kyc_status;
  NEW.is_premium := true;
  NEW.premium_source := 'manual';
  NEW.premium_granted_at := COALESCE(NEW.premium_granted_at, now());

  IF NEW.gender IS NULL THEN
    NEW.gender := 'male';
  END IF;

  IF NEW.birth_date IS NULL THEN
    NEW.birth_date := '1990-01-01'::date;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_beta_tester_grants ON public.profiles;
CREATE TRIGGER trg_apply_beta_tester_grants
BEFORE INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.apply_beta_tester_grants();
