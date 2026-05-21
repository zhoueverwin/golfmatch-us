// Unit tests for the pure logic in locationService.
//
// We intentionally don't mock expo-location or supabase here — only the
// pure helpers (cooldown logic, staleness check, label formatting) are
// exercised. The side-effectful functions (request permission, write to
// supabase) are best covered by an integration test running against the
// real Detox harness, which lives outside this file.
//
// The firebaseAnalytics module is ESM-only and chokes the Jest transformer
// — we stub it at the module boundary so the locationService import chain
// doesn't pull in @react-native-firebase/analytics.

jest.mock("../services/firebaseAnalytics", () => ({
  logLocationPermissionRequested: jest.fn(),
  logLocationPermissionGranted: jest.fn(),
  logLocationPermissionDenied: jest.fn(),
  logDistanceFilterChanged: jest.fn(),
  distanceBucket: jest.fn(() => "unknown"),
}));

jest.mock("../services/supabase", () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}));

import {
  shouldPromptForLocation,
  isLocationStale,
  formatDistanceLabel,
} from "../services/locationService";

describe("shouldPromptForLocation", () => {
  it("prompts when the user has never been asked", () => {
    expect(shouldPromptForLocation({})).toBe(true);
    expect(
      shouldPromptForLocation({ location_source: null, location_updated_at: null }),
    ).toBe(true);
  });

  it("does not prompt when GPS is already granted", () => {
    expect(
      shouldPromptForLocation({
        location_source: "gps",
        location_updated_at: new Date().toISOString(),
      }),
    ).toBe(false);
  });

  it("respects the 90-day cooldown after explicit denial", () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    expect(
      shouldPromptForLocation({
        location_source: "denied",
        location_updated_at: tenDaysAgo.toISOString(),
      }),
    ).toBe(false);
  });

  it("re-prompts after the 90-day cooldown elapses", () => {
    const hundredDaysAgo = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    expect(
      shouldPromptForLocation({
        location_source: "denied",
        location_updated_at: hundredDaysAgo.toISOString(),
      }),
    ).toBe(true);
  });
});

describe("isLocationStale", () => {
  it("treats non-GPS sources as never stale (no silent refresh)", () => {
    const ancient = new Date(0).toISOString();
    expect(
      isLocationStale({ location_source: "state_centroid", location_updated_at: ancient }),
    ).toBe(false);
    expect(
      isLocationStale({ location_source: "manual", location_updated_at: ancient }),
    ).toBe(false);
    expect(
      isLocationStale({ location_source: "denied", location_updated_at: ancient }),
    ).toBe(false);
  });

  it("considers a GPS source older than 14 days as stale", () => {
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
    expect(
      isLocationStale({
        location_source: "gps",
        location_updated_at: fifteenDaysAgo.toISOString(),
      }),
    ).toBe(true);
  });

  it("considers a recent GPS source as fresh", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    expect(
      isLocationStale({
        location_source: "gps",
        location_updated_at: yesterday.toISOString(),
      }),
    ).toBe(false);
  });

  it("treats GPS with no timestamp as stale", () => {
    expect(
      isLocationStale({ location_source: "gps", location_updated_at: null }),
    ).toBe(true);
  });
});

describe("formatDistanceLabel", () => {
  it("buckets under-5mi distances to '<5 mi' regardless of input miles", () => {
    expect(formatDistanceLabel(null, "under_5")).toBe("<5 mi");
    // Even if a caller passes a miles value, the bucket wins.
    expect(formatDistanceLabel(3, "under_5")).toBe("<5 mi");
  });

  it("renders exact-bucket distances with the 'mi' suffix", () => {
    expect(formatDistanceLabel(23, "exact")).toBe("23 mi");
  });

  it("falls back to the state name when the bucket is unknown", () => {
    expect(formatDistanceLabel(null, "unknown", "California")).toBe("California");
  });

  it("returns null when nothing meaningful can be shown", () => {
    expect(formatDistanceLabel(null, "unknown")).toBeNull();
  });
});
