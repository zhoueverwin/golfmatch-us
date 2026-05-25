-- Fix: migration 26's RETURNS TABLE clause declared `birth_date` as an
-- output variable, making the unqualified `birth_date` reference in the
-- UPDATE statement ambiguous (PL/pgSQL variable vs. profiles column).
-- Hit on 2026-05-25 the first time `setup_review_account` was called
-- against the us-east-2 project. Qualify with the table alias `p` to
-- disambiguate. Function behavior is otherwise identical to migration 26.

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

  UPDATE profiles p
     SET is_verified = true,
         kyc_status  = 'approved'::public.profile_kyc_status,
         gender      = 'male',
         birth_date  = COALESCE(p.birth_date, '1990-01-01'::date)
   WHERE p.id = v_profile_id;

  RETURN QUERY
  SELECT p.id, p.name, p.gender, p.is_verified, p.kyc_status,
         p.is_premium, p.premium_source, p.birth_date,
         (p.is_verified = true
            AND p.kyc_status = 'approved'::public.profile_kyc_status
            AND p.gender = 'male'
            AND p.is_premium = false) AS ready_for_review,
         CASE
           WHEN p.is_premium THEN
             'WARNING: this account is already premium - reviewer will not see the paywall. '
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
