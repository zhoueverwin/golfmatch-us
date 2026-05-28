-- Fix bump_streak() to honor the user's local timezone instead of UTC.
--
-- The previous version computed "today" as (now() AT TIME ZONE 'UTC')::date,
-- which causes the streak to reset for any user whose local calendar day
-- crosses a UTC date boundary between two consecutive opens. Example:
--   Day N  open at 08:00 JST  =  23:00 UTC of (N-1)  → last_streak_date = N-1 UTC
--   Day N+1 open at 22:00 JST =  13:00 UTC of N      → v_today = N UTC, diff = 1 ✓
--   Day N+2 open at 08:00 JST =  23:00 UTC of N+1    → v_today = N+1 UTC, diff = 1 ✓ from Day N+1
-- BUT in the wrong rhythm:
--   Day N  open at 22:00 JST = 13:00 UTC of N-1      → last_streak_date = N-1 UTC
--   Day N+1 open at 08:00 JST = 23:00 UTC of N       → v_today = N UTC, diff = 1 ✓
--   Day N+2 open at 22:00 JST = 13:00 UTC of N+1     → v_today = N+1 UTC, diff = 1 ✓
-- The pathological case (streak loss) happens when UTC skips a date — e.g.
-- a user in JST who only opens at certain hours can have last_streak_date
-- two UTC days behind v_today, triggering the reset branch.
--
-- Fix: accept an optional IANA timezone from the client and compute the
-- calendar day in that zone. The function defaults to 'UTC' so existing
-- callers continue to work; updated clients pass the device's resolved
-- timezone (Intl.DateTimeFormat().resolvedOptions().timeZone).

DROP FUNCTION IF EXISTS public.bump_streak(uuid);

CREATE OR REPLACE FUNCTION public.bump_streak(
  p_user_id uuid,
  p_timezone text DEFAULT 'UTC'
)
RETURNS TABLE(
  current_streak_days integer,
  longest_streak_days integer,
  last_streak_date date
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_tz    text := COALESCE(NULLIF(p_timezone, ''), 'UTC');
  v_today date;
  v_last  date;
  v_cur   integer;
  v_long  integer;
BEGIN
  -- Defensive: if the client sends a bogus IANA name, AT TIME ZONE raises
  -- "time zone not recognized". Catch it and fall back to UTC so the RPC
  -- can't be DoS'd by a malformed payload.
  BEGIN
    v_today := (now() AT TIME ZONE v_tz)::date;
  EXCEPTION WHEN OTHERS THEN
    v_tz    := 'UTC';
    v_today := (now() AT TIME ZONE 'UTC')::date;
  END;

  SELECT p.last_streak_date, p.current_streak_days, p.longest_streak_days
    INTO v_last, v_cur, v_long
  FROM public.profiles p
  WHERE p.id = p_user_id;

  IF v_last IS NULL OR v_last < v_today - 1 THEN
    -- First-ever bump or gap of 2+ days: start a fresh streak.
    v_cur := 1;
  ELSIF v_last = v_today - 1 THEN
    -- Consecutive day: increment.
    v_cur := COALESCE(v_cur, 0) + 1;
  END IF;
  -- v_last >= v_today: same-day (or unexpected future date) — no change.

  v_long := GREATEST(COALESCE(v_long, 0), v_cur);

  UPDATE public.profiles SET
    current_streak_days = v_cur,
    longest_streak_days = v_long,
    last_streak_date    = v_today,
    updated_at          = now()
  WHERE id = p_user_id;

  RETURN QUERY SELECT v_cur, v_long, v_today;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.bump_streak(uuid, text) TO authenticated;
