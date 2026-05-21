-- Migration: backfill home_location from prefecture for existing users.
--
-- Background:
--   Distance scoring would have a brutal cold-start problem if it only worked
--   for users who granted GPS. Backfilling state centroids means every existing
--   user has a meaningful location on day one — recommendations work, distance
--   scoring works, the feature lights up without waiting for the install base
--   to grant permission.
--
--   State centroids are ~100mi accurate within a state. That's plenty for
--   "same state vs. different state" matching — which is what we had before
--   anyway, just expressed as a continuous distance instead of a boolean.
--
--   Coords are geographic centroids (not population-weighted) from public
--   US Census Bureau data. Population-weighted would be slightly better for
--   matching (more bias toward where people actually live) but geographic is
--   public-domain, stable, and the difference is in the noise at 100mi.
--
-- Idempotency:
--   WHERE home_location IS NULL means re-running this migration won't
--   overwrite users who've since granted GPS. Safe to replay.
--
-- Note on the rounding trigger:
--   The BEFORE UPDATE trigger (migration 10) will round these centroids to
--   3 decimals too. That's fine — a state centroid stays a state centroid
--   at 100m precision.

DO $$
DECLARE
  centroids jsonb := '{
    "Alabama":              [-86.8287, 32.7794],
    "Alaska":               [-152.2782, 64.0685],
    "Arizona":              [-111.6602, 34.2744],
    "Arkansas":             [-92.4426, 34.8938],
    "California":           [-119.4696, 37.1841],
    "Colorado":             [-105.5478, 38.9972],
    "Connecticut":          [-72.7273, 41.6219],
    "Delaware":             [-75.5050, 38.9896],
    "District of Columbia": [-77.0147, 38.9101],
    "Florida":              [-82.4497, 28.6305],
    "Georgia":              [-83.4426, 32.6415],
    "Hawaii":               [-156.3737, 20.2927],
    "Idaho":                [-114.6130, 44.3509],
    "Illinois":             [-89.1965, 40.0417],
    "Indiana":              [-86.2816, 39.8942],
    "Iowa":                 [-93.4960, 42.0751],
    "Kansas":               [-98.3804, 38.4937],
    "Kentucky":             [-85.3021, 37.5347],
    "Louisiana":            [-91.9968, 31.0689],
    "Maine":                [-69.2428, 45.3695],
    "Maryland":             [-76.7909, 39.0550],
    "Massachusetts":        [-71.8083, 42.2596],
    "Michigan":             [-85.4102, 44.3467],
    "Minnesota":            [-94.3053, 46.2807],
    "Mississippi":          [-89.6678, 32.7364],
    "Missouri":             [-92.4580, 38.3566],
    "Montana":              [-109.6333, 47.0527],
    "Nebraska":             [-99.7951, 41.5378],
    "Nevada":               [-116.6312, 39.3289],
    "New Hampshire":        [-71.5811, 43.6805],
    "New Jersey":           [-74.6728, 40.1907],
    "New Mexico":           [-106.1126, 34.4071],
    "New York":             [-75.5268, 42.9538],
    "North Carolina":       [-79.3877, 35.5557],
    "North Dakota":         [-100.4659, 47.4501],
    "Ohio":                 [-82.7937, 40.2862],
    "Oklahoma":             [-97.4943, 35.5889],
    "Oregon":               [-120.5583, 43.9336],
    "Pennsylvania":         [-77.7996, 40.8781],
    "Rhode Island":         [-71.5562, 41.6762],
    "South Carolina":       [-80.8964, 33.9169],
    "South Dakota":         [-100.2263, 44.4443],
    "Tennessee":            [-86.3505, 35.8580],
    "Texas":                [-99.3312, 31.4757],
    "Utah":                 [-111.6703, 39.3055],
    "Vermont":              [-72.6658, 44.0687],
    "Virginia":             [-78.8537, 37.5215],
    "Washington":           [-120.4472, 47.3826],
    "West Virginia":        [-80.6227, 38.6409],
    "Wisconsin":            [-89.9941, 44.6243],
    "Wyoming":              [-107.5512, 42.9957]
  }'::jsonb;
  state_name text;
  coords jsonb;
  v_updated integer;
  v_total integer := 0;
BEGIN
  FOR state_name, coords IN SELECT * FROM jsonb_each(centroids) LOOP
    UPDATE public.profiles
       SET home_location = extensions.ST_SetSRID(
             extensions.ST_MakePoint(
               (coords->>0)::double precision,
               (coords->>1)::double precision
             ),
             4326
           )::extensions.geography,
           location_source = 'state_centroid',
           location_updated_at = now()
     WHERE prefecture = state_name
       AND home_location IS NULL;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    v_total := v_total + v_updated;
    IF v_updated > 0 THEN
      RAISE NOTICE 'Backfilled % rows for state %', v_updated, state_name;
    END IF;
  END LOOP;

  RAISE NOTICE 'State-centroid backfill complete: % rows total', v_total;
END;
$$;

-- Sanity check: report any profiles still without a location after backfill.
-- These are users whose prefecture is NULL or doesn't match the centroid map
-- (legacy JP residue, typo, etc.) — they'll need GPS or manual fix later.
DO $$
DECLARE
  v_missing integer;
BEGIN
  SELECT COUNT(*) INTO v_missing
  FROM public.profiles
  WHERE home_location IS NULL;

  IF v_missing > 0 THEN
    RAISE NOTICE 'POST-BACKFILL: % profiles still have NULL home_location (likely NULL or non-US prefecture). They will fall to the bottom of distance-scored recommendations until they grant GPS or update state.', v_missing;
  ELSE
    RAISE NOTICE 'POST-BACKFILL: all profiles have home_location set.';
  END IF;
END;
$$;
