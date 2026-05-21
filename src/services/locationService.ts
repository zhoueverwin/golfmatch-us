// Wraps expo-location for the distance-matching feature.
//
// Responsibilities:
//   - Request foreground location permission with clear failure semantics
//     ("granted" vs "denied" vs "never asked"). iOS returns a tri-state and
//     we map it to a stable union the rest of the app can switch on.
//   - Get the device's current position with a sensible timeout. expo-location
//     defaults to highest accuracy which can hang for 10+ seconds indoors;
//     we ask for `Balanced` so it falls back to Wi-Fi positioning fast.
//   - Round coordinates to 3 decimal places (~100m grid) BEFORE writing to
//     the database. The DB also has a trigger that rounds; this is bandwidth
//     optimization and an extra defense-in-depth layer.
//   - Persist the location to `profiles.home_location` along with metadata
//     (`location_source`, `location_updated_at`).
//   - Respect a 90-day cooldown after explicit denial — `location_source =
//     'denied'` means "the user said no, don't re-prompt for 90 days."
//
// Privacy notes:
//   - We never read or store raw lat/lng on disk client-side. Coords go
//     straight from expo-location → rounded → Supabase, and we throw away
//     the in-memory copy after the upsert.
//   - The DB column is REVOKE'd from anon+authenticated roles. Even a
//     compromised client can't read other users' raw coords.

import * as Location from "expo-location";
import { supabase } from "./supabase";
import {
  logLocationPermissionRequested,
  logLocationPermissionGranted,
  logLocationPermissionDenied,
} from "./firebaseAnalytics";

export type LocationSource = "gps" | "state_centroid" | "manual" | "denied";

export type LocationPermissionResult =
  | { status: "granted"; coords: { latitude: number; longitude: number } }
  | { status: "denied"; canAskAgain: boolean }
  | { status: "error"; error: string };

const ROUND_DECIMALS = 3;
const DENIAL_COOLDOWN_DAYS = 90;

/**
 * Round a coordinate to ~100m precision. Three decimals is the standard
 * "obfuscated home address" grid used by Bumble and others — fine enough
 * for accurate distance scoring, coarse enough that a leak doesn't reveal
 * a literal street address.
 */
function roundCoord(value: number): number {
  const factor = Math.pow(10, ROUND_DECIMALS);
  return Math.round(value * factor) / factor;
}

/**
 * Ask for foreground location once and resolve to a coord pair.
 *
 * On iOS this triggers the system permission dialog the first time.
 * Subsequent calls return the cached decision without re-prompting (iOS
 * will not show the dialog twice). On Android the behavior is similar
 * via the "ask only once" semantics in Android 11+.
 *
 * IMPORTANT: This does not persist the result. Callers must follow up
 * with `updateHomeLocation` (or `recordPermissionDenied` on denial)
 * to write the outcome to the profile.
 */
export async function requestPermissionAndGetLocation(
  source: "onboarding" | "settings" | "discover" = "onboarding",
): Promise<LocationPermissionResult> {
  try {
    logLocationPermissionRequested(source);

    const { status, canAskAgain } =
      await Location.requestForegroundPermissionsAsync();

    if (status !== "granted") {
      logLocationPermissionDenied(source);
      return { status: "denied", canAskAgain };
    }

    // Balanced accuracy: combines GPS + Wi-Fi + cell. Sub-100m which is
    // already better than our storage grid, and it returns fast indoors
    // where pure GPS would hang. We don't need lane-level precision.
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    logLocationPermissionGranted(source);

    return {
      status: "granted",
      coords: {
        latitude: roundCoord(position.coords.latitude),
        longitude: roundCoord(position.coords.longitude),
      },
    };
  } catch (error: any) {
    return {
      status: "error",
      error: error?.message ?? "Failed to get location",
    };
  }
}

/**
 * Persist a GPS-sourced location to the user's profile. Uses PostGIS WKT
 * because Supabase's PostgREST client doesn't speak geography natively —
 * `POINT(lng lat)` is the standard well-known-text form Postgres accepts.
 *
 * Note coordinate order: WKT is (lng, lat), NOT (lat, lng). Easy to flip
 * by accident. Tested via the round-trip in the migration smoke test.
 */
export async function updateHomeLocation(
  profileId: string,
  coords: { latitude: number; longitude: number },
  source: LocationSource = "gps",
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const lng = roundCoord(coords.longitude);
    const lat = roundCoord(coords.latitude);

    const { error } = await supabase
      .from("profiles")
      .update({
        // PostgREST accepts geography as WKT string; the BEFORE INSERT/UPDATE
        // trigger on profiles will round these to 3 decimals again as a
        // server-side guard.
        home_location: `POINT(${lng} ${lat})`,
        location_source: source,
        location_updated_at: new Date().toISOString(),
      })
      .eq("id", profileId);

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message ?? "Failed to save location",
    };
  }
}

/**
 * Record a permission denial without storing coords. Future prompts check
 * `location_source = 'denied'` + `location_updated_at` to enforce the
 * 90-day cooldown rule.
 */
export async function recordPermissionDenied(
  profileId: string,
): Promise<void> {
  try {
    await supabase
      .from("profiles")
      .update({
        location_source: "denied",
        location_updated_at: new Date().toISOString(),
      })
      .eq("id", profileId);
  } catch {
    // Denial-recording failures are non-fatal — worst case the user gets
    // re-prompted sooner than 90 days. Don't surface an error UI.
  }
}

/**
 * Decide whether we may prompt for permission. Honors:
 *   - 90-day cooldown after explicit denial
 *   - immediate re-prompt if user has never been asked
 *   - never re-prompt if GPS is already granted (no value in asking again)
 *
 * Read this in onboarding gates and the Discover-tab opportunistic prompt.
 */
export function shouldPromptForLocation(profile: {
  location_source?: LocationSource | null;
  location_updated_at?: string | null;
}): boolean {
  if (profile.location_source === "gps") return false;
  if (profile.location_source === "denied" && profile.location_updated_at) {
    const deniedAt = new Date(profile.location_updated_at).getTime();
    const cooldownMs = DENIAL_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
    return Date.now() - deniedAt > cooldownMs;
  }
  return true;
}

/**
 * Returns true if a foreground location refresh would be meaningful.
 * Used by the silent background-refresh-on-foreground rule (14 days).
 */
export function isLocationStale(profile: {
  location_source?: LocationSource | null;
  location_updated_at?: string | null;
}): boolean {
  if (profile.location_source !== "gps") return false; // never silently refresh non-GPS
  if (!profile.location_updated_at) return true;
  const updatedAt = new Date(profile.location_updated_at).getTime();
  const staleMs = 14 * 24 * 60 * 60 * 1000;
  return Date.now() - updatedAt > staleMs;
}

/**
 * Wrapper used by SwipeCard / UserProfile to render the distance chip.
 * Returns the privacy-preserving response from the RPC: a whole-mile
 * integer + a bucket. Never receives or computes raw coordinates.
 */
export async function getDistanceMiles(
  myProfileId: string,
  otherProfileId: string,
): Promise<{ miles: number | null; bucket: "under_5" | "exact" | "unknown" }> {
  try {
    const { data, error } = await supabase.rpc("get_user_distance_miles", {
      p_user_a: myProfileId,
      p_user_b: otherProfileId,
    });
    if (error || !data || data.length === 0) {
      return { miles: null, bucket: "unknown" };
    }
    const row = data[0];
    return {
      miles: row.miles ?? null,
      bucket: (row.bucket ?? "unknown") as "under_5" | "exact" | "unknown",
    };
  } catch {
    return { miles: null, bucket: "unknown" };
  }
}

/**
 * Format the distance bucket into the chip label shown on swipe cards.
 * Centralizing this here keeps every surface that displays distance using
 * the same wording — bucketing is part of our privacy guarantee, not a
 * UI choice.
 */
export function formatDistanceLabel(
  miles: number | null,
  bucket: "under_5" | "exact" | "unknown",
  fallbackState?: string,
): string | null {
  if (bucket === "under_5") return "<5 mi";
  if (bucket === "exact" && miles != null) return `${miles} mi`;
  if (fallbackState) return fallbackState;
  return null;
}
