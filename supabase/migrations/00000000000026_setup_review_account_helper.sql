-- Helper for prepping an App Store reviewer demo account.
--
-- Apple's reviewer can't pass Didit KYC (no real government ID matching their
-- test persona), so we pre-approve KYC for the demo account they'll use
-- during review. We deliberately DO NOT grant premium — the reviewer must
-- see the full paywall and complete a StoreKit Sandbox purchase to verify
-- the IAP flow. Otherwise the lack of a visible paywall would itself be a
-- 3.2(f) "hidden IAP bypass" concern.
--
-- Usage (run from Supabase MCP with service-role privileges):
--   SELECT public.setup_review_account('applereview@golfmatch.info');
--
-- Returns a single row showing the resulting profile state so you can
-- visually confirm the setup before submitting to App Review.
--
-- Idempotent — safe to re-run before each App Store submission.

CREATE OR REPLACE FUNCTION public.setup_review_account(p_email text)
RETURNS TABLE(
  profile_id uuid,
  name text,
  gender text,
  is_verified boolean,
  kyc_status public.profile_kyc_status,
  is_premium boolean,
  premium_source text,
  birth_date date,
  ready_for_review boolean,
  notes text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  v_email text := lower(trim(p_email));
  v_profile_id uuid;
BEGIN
  -- Resolve the profile from the auth.users email.
  SELECT p.id INTO v_profile_id
    FROM profiles p
    JOIN auth.users u ON u.id::text = p.user_id
   WHERE lower(u.email) = v_email
   LIMIT 1;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION
      'No profile found for email %. The reviewer must sign up via the app first, then run this helper.',
      v_email;
  END IF;

  -- Pre-approve KYC. Force gender=male so the paywall gate engages
  -- (gender=female would auto-skip the paywall and we'd hide the IAP from
  -- Apple). Placeholder DOB satisfies the discovery RPC filters.
  -- We deliberately leave is_premium / premium_source untouched so the
  -- reviewer hits the paywall and can verify the IAP flow.
  UPDATE profiles
     SET is_verified = true,
         kyc_status  = 'approved'::public.profile_kyc_status,
         gender      = 'male',
         birth_date  = COALESCE(birth_date, '1990-01-01'::date)
   WHERE id = v_profile_id;

  RETURN QUERY
  SELECT p.id, p.name, p.gender, p.is_verified, p.kyc_status,
         p.is_premium, p.premium_source, p.birth_date,
         (p.is_verified = true
            AND p.kyc_status = 'approved'::public.profile_kyc_status
            AND p.gender = 'male'
            AND p.is_premium = false) AS ready_for_review,
         CASE
           WHEN p.is_premium THEN
             'WARNING: this account is already premium — reviewer will not see the paywall. '
             || 'Run: UPDATE profiles SET is_premium=false, premium_source=NULL WHERE id='''
             || p.id || ''';'
           ELSE
             'Ready. Submit with App Review Notes: KYC pre-approved for review; '
             || 'paywall + IAP visible; use sandbox Apple ID for StoreKit.'
         END AS notes
    FROM profiles p
   WHERE p.id = v_profile_id;
END;
$$;

-- Lock down execution: ONLY service_role (admin SQL via MCP/edge functions).
-- Not callable by authenticated or anon — this is an admin escape hatch,
-- not an app-level RPC.
REVOKE EXECUTE ON FUNCTION public.setup_review_account(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.setup_review_account(text) FROM authenticated, anon;
GRANT  EXECUTE ON FUNCTION public.setup_review_account(text) TO service_role;

COMMENT ON FUNCTION public.setup_review_account(text) IS
  'Pre-approve KYC for an App Store reviewer demo account WITHOUT granting premium. Service-role only. See migration 26.';
