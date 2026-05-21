-- Sanctioned atomic downgrade from precise location → state-only.
--
-- Why an RPC and not a direct UPDATE on the client:
--   The prior LocationSettingsScreen wrote `location_source = 'manual'` and
--   left `home_location` untouched. Both were wrong: 'manual' is precise,
--   and the old GPS point persisted on disk. The user's intent ("don't
--   share my precise location anymore") was honored neither by the policy
--   field nor by the data.
--
--   Bundling the three required writes (overwrite home_location with the
--   state centroid, set source = 'state_centroid', stamp updated_at) into
--   one transactional RPC eliminates the chance of any future client
--   getting the dance partially wrong. The precise point physically goes
--   away in the same statement that flips the policy bit.
--
-- Ownership check:
--   SECURITY DEFINER bypasses RLS, so we verify the caller owns the target
--   profile via auth.uid() vs profiles.user_id. Without this check, any
--   authenticated user could downgrade any other user's location.
--
-- Edge case (no prefecture):
--   If the user has no prefecture, there's no centroid to fall back to.
--   We clear home_location to NULL and mark source = 'denied'. The chip
--   surfaces will gracefully hide via formatDistanceLabel returning null.
CREATE OR REPLACE FUNCTION public.downgrade_location_to_state_only(p_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_user_id uuid;
  v_prefecture text;
  v_centroid extensions.geography;
BEGIN
  SELECT user_id, prefecture INTO v_user_id, v_prefecture
  FROM profiles WHERE id = p_profile_id;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF v_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to update this profile';
  END IF;

  IF v_prefecture IS NULL THEN
    UPDATE profiles
       SET home_location = NULL,
           location_source = 'denied',
           location_updated_at = NOW()
     WHERE id = p_profile_id;
    RETURN;
  END IF;

  v_centroid := public.state_centroid(v_prefecture);

  UPDATE profiles
     SET home_location = v_centroid,
         location_source = 'state_centroid',
         location_updated_at = NOW()
   WHERE id = p_profile_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.downgrade_location_to_state_only(uuid) TO authenticated;
