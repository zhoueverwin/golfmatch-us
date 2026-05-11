-- Auth triggers on auth.users that didn't ship in the public-schema dump.
--
-- on_auth_user_created fires after each insert into auth.users (the row
-- Supabase Auth creates on first successful OAuth sign-in or signup). The
-- handle_new_user() function (in public schema, already in the baseline)
-- inserts the matching profiles row, so the rest of the app can find the
-- user via userMappingService.getProfileIdFromAuth().
--
-- The JP project also had enforce_carrier_email_signup which validated
-- against Japanese mobile carrier email domains. Intentionally omitted from
-- the US setup since (a) we don't have email signup, and (b) it would have
-- been JP-specific rules anyway.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
