-- Translate handle_new_user() error messages and default name to English,
-- and drop the Gmail-as-email-registration block since email auth was
-- removed in the US version (only Apple + Google OAuth remain).
--
-- Behavior preserved:
--   - Reject signup if email is in banned_emails
--   - Reject signup if email domain is in app_config.blocked_domains
--   - Insert profiles row with name from OAuth metadata, falling back to
--     the local-part of the email, then to "User"

CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $function$
DECLARE
  blocked_domain text;
  email_domain text;
BEGIN
  -- Reject if the email is on the banned list
  IF EXISTS (SELECT 1 FROM public.banned_emails WHERE email = NEW.email) THEN
    RAISE EXCEPTION 'This email address cannot be used to sign up.';
  END IF;

  -- Reject if the email domain is on the blocked-domains list
  email_domain := split_part(NEW.email, '@', 2);
  SELECT d.domain INTO blocked_domain
  FROM public.app_config ac,
       jsonb_array_elements_text(ac.value->'domains') AS d(domain)
  WHERE ac.key = 'blocked_domains'
    AND d.domain = email_domain
  LIMIT 1;

  IF blocked_domain IS NOT NULL THEN
    RAISE EXCEPTION 'This email domain cannot be used to sign up.';
  END IF;

  -- Create the matching profiles row
  INSERT INTO public.profiles (id, user_id, name, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.id::text,
    COALESCE(
      NEW.raw_user_meta_data->>'name',
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'display_name',
      split_part(NEW.email, '@', 1),
      'User'
    ),
    NOW(),
    NOW()
  );
  RETURN NEW;
END;
$function$;
