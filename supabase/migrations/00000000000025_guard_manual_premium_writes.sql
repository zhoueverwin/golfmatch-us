-- Guard: only service-role / SECURITY DEFINER triggers can grant
-- premium_source IN ('manual', 'permanent').
--
-- Background:
--   Authenticated and anon roles have column-level UPDATE on profiles.premium_source,
--   so without this guard a logged-in user could PATCH their own profile via
--   PostgREST to flip premium_source='manual' and become a permanent comp
--   account. That would be a 3.2(f) Developer Agreement violation (hidden
--   IAP bypass).
--
--   Solution: a BEFORE INSERT/UPDATE trigger that rejects writes of
--   'manual' or 'permanent' from app-facing roles (authenticated/anon).
--   Service role and SECURITY DEFINER triggers pass through unchanged.
--
-- Allowed grant paths after this trigger:
--   1. Beta-tester allowlist trigger (apply_beta_tester_grants — SECURITY
--      DEFINER, current_user=postgres) → 'manual' OK
--   2. Admin SQL via Supabase MCP / service-role JWT → 'manual' OK
--   3. Edge functions running with service-role key → 'manual' OK
--
-- Blocked grant paths:
--   - Client app (authenticated JWT) trying to set premium_source='manual'
--   - Public/anon trying to set premium_source='manual'
--
-- Legitimate client-side writes that REMAIN ALLOWED:
--   - premium_source='revenuecat' (the RevenueCatContext sync-after-purchase
--     fallback when the RC webhook hasn't landed yet)
--   - premium_source = NULL (downgrade path)

CREATE OR REPLACE FUNCTION public.guard_manual_premium_writes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only check when the value is being set to a protected source.
  IF NEW.premium_source IS NULL OR NEW.premium_source NOT IN ('manual', 'permanent') THEN
    RETURN NEW;
  END IF;

  -- Allow no-op writes (e.g. UPDATE that doesn't change premium_source).
  IF TG_OP = 'UPDATE'
     AND OLD.premium_source IS NOT DISTINCT FROM NEW.premium_source THEN
    RETURN NEW;
  END IF;

  -- App-facing roles are blocked. service_role and SECURITY DEFINER
  -- triggers (current_user=postgres) pass through.
  IF current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION
      'premium_source=% cannot be set by app users. Use the beta_testers allowlist or admin SQL.',
      NEW.premium_source
      USING ERRCODE = '42501';  -- insufficient_privilege
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_manual_premium_writes ON public.profiles;
CREATE TRIGGER trg_guard_manual_premium_writes
BEFORE INSERT OR UPDATE OF premium_source ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.guard_manual_premium_writes();
