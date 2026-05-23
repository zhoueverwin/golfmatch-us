/**
 * Firebase Analytics Service
 *
 * Handles Firebase Analytics event tracking for product analytics and BigQuery export.
 * This service mirrors the facebookAnalytics.ts API surface so both can be called
 * side-by-side at every integration point (dual-tracking).
 *
 * Firebase Analytics is free at any scale and exports raw event data to BigQuery
 * for custom SQL analysis.
 *
 * Key difference from Facebook Analytics:
 * - Does NOT require ATT permission (no IDFA usage)
 * - Data exports to BigQuery for free SQL access
 * - Automatic screen tracking when wired via navigation state changes
 */

import analytics from '@react-native-firebase/analytics';

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize Firebase Analytics and enable data collection.
 * Call once at app startup (App.tsx prepare()).
 */
export async function initializeFirebaseAnalytics(): Promise<void> {
  try {
    await analytics().setAnalyticsCollectionEnabled(true);
    // Auto screen reporting was previously disabled here via
    // setIsAutoScreenReportingEnabled(false). That API was removed in
    // @react-native-firebase/analytics v22+. The current way to disable it is
    // a build-time config (`google_analytics_automatic_screen_reporting_enabled`
    // in firebase.json). Until that's wired, fall through and rely on manual
    // logScreenView() calls in AppNavigator's onStateChange.
    const a = analytics() as unknown as {
      setIsAutoScreenReportingEnabled?: (enabled: boolean) => Promise<void>;
    };
    if (typeof a.setIsAutoScreenReportingEnabled === 'function') {
      await a.setIsAutoScreenReportingEnabled(false);
    }
    console.log('[Firebase] Analytics initialized');
  } catch (error) {
    console.error('[Firebase] Initialization error:', error);
  }
}

// ============================================================================
// Screen Tracking
// ============================================================================

/**
 * Log a screen view event. Call from navigation state changes.
 * @param screenName - The name of the screen being viewed
 * @param screenClass - Optional class name (defaults to screenName)
 */
export async function logScreenView(
  screenName: string,
  screenClass?: string,
): Promise<void> {
  try {
    await analytics().logScreenView({
      screen_name: screenName,
      screen_class: screenClass || screenName,
    });
  } catch (error) {
    console.error('[Firebase] Error logging screen view:', error);
  }
}

// ============================================================================
// Auth Events
// ============================================================================

/**
 * Log when a user completes registration.
 * @param method - The registration method (e.g., 'phone', 'email', 'apple', 'google')
 */
export async function logCompleteRegistration(method: string): Promise<void> {
  try {
    await analytics().logSignUp({ method });
    console.log(`[Firebase] Logged sign_up: ${method}`);
  } catch (error) {
    console.error('[Firebase] Error logging sign_up:', error);
  }
}

/**
 * Log when a user logs in.
 * @param method - The login method (e.g., 'phone', 'email', 'apple', 'google')
 */
export async function logLogin(method: string): Promise<void> {
  try {
    await analytics().logLogin({ method });
    console.log(`[Firebase] Logged login: ${method}`);
  } catch (error) {
    console.error('[Firebase] Error logging login:', error);
  }
}

// ============================================================================
// Purchase Events
// ============================================================================

/**
 * Log when a user subscribes.
 * @param params - Subscription parameters
 */
export async function logSubscribe(params: {
  currency: string;
  value: number;
  productId?: string;
  subscriptionPeriod?: string;
}): Promise<void> {
  try {
    await analytics().logPurchase({
      currency: params.currency,
      value: params.value,
      items: [
        {
          item_id: params.productId || '',
          item_name: params.subscriptionPeriod || 'subscription',
        },
      ],
    });
    console.log(`[Firebase] Logged purchase: ${params.value} ${params.currency}`);
  } catch (error) {
    console.error('[Firebase] Error logging purchase:', error);
  }
}

/**
 * Log when a user starts a trial.
 * @param params - Trial parameters
 */
export async function logStartTrial(params: {
  currency: string;
  value: number;
  productId?: string;
}): Promise<void> {
  try {
    await analytics().logEvent('start_trial', {
      currency: params.currency,
      value: params.value,
      item_id: params.productId || '',
    });
    console.log(`[Firebase] Logged start_trial: ${params.productId}`);
  } catch (error) {
    console.error('[Firebase] Error logging start_trial:', error);
  }
}

// ============================================================================
// Custom App Events
// ============================================================================

/**
 * Log when a match is created between two users.
 */
export async function logMatchCreated(params?: {
  matchId?: string;
}): Promise<void> {
  try {
    await analytics().logEvent('match_created', {
      match_id: params?.matchId || '',
    });
    console.log(`[Firebase] Logged match_created: ${params?.matchId || 'unknown'}`);
  } catch (error) {
    console.error('[Firebase] Error logging match_created:', error);
  }
}

/**
 * Log when a user sends a like.
 */
export async function logLikeSent(params?: {
  likeType?: 'like' | 'super_like';
}): Promise<void> {
  try {
    await analytics().logEvent('like_sent', {
      like_type: params?.likeType || 'like',
    });
    console.log(`[Firebase] Logged like_sent: ${params?.likeType || 'like'}`);
  } catch (error) {
    console.error('[Firebase] Error logging like_sent:', error);
  }
}

/**
 * Log when a user sends a message.
 */
export async function logMessageSent(): Promise<void> {
  try {
    await analytics().logEvent('message_sent');
    console.log('[Firebase] Logged message_sent');
  } catch (error) {
    console.error('[Firebase] Error logging message_sent:', error);
  }
}

/**
 * Generic event logger. Use the typed helpers above when one exists for the
 * event; reserve this for low-volume bespoke events (e.g. review-prompt
 * impressions) where a dedicated helper would be overkill.
 */
export async function logEvent(
  name: string,
  params?: Record<string, string | number | boolean>,
): Promise<void> {
  try {
    await analytics().logEvent(name, params);
    console.log(`[Firebase] Logged ${name}`, params ?? '');
  } catch (error) {
    console.error(`[Firebase] Error logging ${name}:`, error);
  }
}

/**
 * Log when a user creates a post.
 */
export async function logPostCreated(params?: {
  hasMedia?: boolean;
}): Promise<void> {
  try {
    await analytics().logEvent('post_created', {
      has_media: params?.hasMedia ? 'true' : 'false',
    });
    console.log('[Firebase] Logged post_created');
  } catch (error) {
    console.error('[Firebase] Error logging post_created:', error);
  }
}

// ============================================================================
// User Identity
// ============================================================================

/**
 * Set the user ID for Firebase Analytics (links events to a specific user).
 * @param id - The user's profile ID
 */
export async function setUserId(id: string): Promise<void> {
  try {
    await analytics().setUserId(id);
    console.log(`[Firebase] Set user ID: ${id}`);
  } catch (error) {
    console.error('[Firebase] Error setting user ID:', error);
  }
}

/**
 * Clear the user ID (call on logout).
 */
export async function clearUserId(): Promise<void> {
  try {
    await analytics().setUserId(null);
    console.log('[Firebase] Cleared user ID');
  } catch (error) {
    console.error('[Firebase] Error clearing user ID:', error);
  }
}

/**
 * Set a user property for segmentation in Firebase Analytics.
 * @param name - Property name (max 24 chars)
 * @param value - Property value (max 36 chars), or null to clear
 */
export async function setUserProperty(
  name: string,
  value: string | null,
): Promise<void> {
  try {
    await analytics().setUserProperty(name, value);
    console.log(`[Firebase] Set user property: ${name} = ${value}`);
  } catch (error) {
    console.error('[Firebase] Error setting user property:', error);
  }
}

// ============================================================================
// Distance / Location Events (added with distance-based matching)
// ============================================================================
// These power the success metrics for the distance feature:
//   - GPS adoption rate           ← granted / requested
//   - Cohort distance segmentation ← distance_bucket on cards / matches
//   - Filter engagement            ← distance_filter_changed
//
// Source values are constrained to a small enum so analytics queries stay
// trivial (no string normalization needed in BigQuery).

type LocationPromptSource = "onboarding" | "settings" | "discover";

export async function logLocationPermissionRequested(
  source: LocationPromptSource,
): Promise<void> {
  try {
    await analytics().logEvent("location_permission_requested", { source });
  } catch (error) {
    console.error("[Firebase] Error logging location_permission_requested:", error);
  }
}

export async function logLocationPermissionGranted(
  source: LocationPromptSource,
): Promise<void> {
  try {
    await analytics().logEvent("location_permission_granted", { source });
  } catch (error) {
    console.error("[Firebase] Error logging location_permission_granted:", error);
  }
}

export async function logLocationPermissionDenied(
  source: LocationPromptSource,
): Promise<void> {
  try {
    await analytics().logEvent("location_permission_denied", { source });
  } catch (error) {
    console.error("[Firebase] Error logging location_permission_denied:", error);
  }
}

/**
 * Fired when the user changes the distance radius in the search filter.
 * `to_miles = null` means "Anywhere" was selected.
 */
export async function logDistanceFilterChanged(params: {
  fromMiles: number | null;
  toMiles: number | null;
}): Promise<void> {
  try {
    await analytics().logEvent("distance_filter_changed", {
      from_miles: params.fromMiles ?? -1, // -1 sentinel for null in BigQuery
      to_miles: params.toMiles ?? -1,
    });
  } catch (error) {
    console.error("[Firebase] Error logging distance_filter_changed:", error);
  }
}

// ============================================================================
// v1.1 Onboarding Funnel Events
// ============================================================================
// These power the success metrics for the v1.1 liveness-only KYC rollout:
//   - per-step drop-off (which screen leaks users)
//   - paywall conversion (post-photo male users who purchase)
//   - liveness completion rate (purchased users who finish the selfie)
//   - escalation rate (lite workflow → document required)
// All events are fire-and-forget; failures are logged, not surfaced.

export type OnboardingStep =
  | "name"
  | "birthdate"
  | "gender"
  | "state"
  | "location"
  | "photo";

export async function logOnboardingStepCompleted(
  step: OnboardingStep,
): Promise<void> {
  try {
    await analytics().logEvent("onboarding_step_completed", { step });
  } catch (error) {
    console.error("[Firebase] Error logging onboarding_step_completed:", error);
  }
}

export async function logOnboardingPaywallShown(): Promise<void> {
  try {
    await analytics().logEvent("onboarding_paywall_shown");
  } catch (error) {
    console.error("[Firebase] Error logging onboarding_paywall_shown:", error);
  }
}

export async function logOnboardingPaywallCompleted(): Promise<void> {
  try {
    await analytics().logEvent("onboarding_paywall_completed");
  } catch (error) {
    console.error("[Firebase] Error logging onboarding_paywall_completed:", error);
  }
}

export async function logOnboardingLivenessShown(): Promise<void> {
  try {
    await analytics().logEvent("onboarding_liveness_shown");
  } catch (error) {
    console.error("[Firebase] Error logging onboarding_liveness_shown:", error);
  }
}

export async function logOnboardingLivenessCompleted(): Promise<void> {
  try {
    await analytics().logEvent("onboarding_liveness_completed");
  } catch (error) {
    console.error("[Firebase] Error logging onboarding_liveness_completed:", error);
  }
}

export async function logOnboardingLivenessEscalatedToDocument(): Promise<void> {
  try {
    await analytics().logEvent("onboarding_liveness_escalated_to_document");
  } catch (error) {
    console.error(
      "[Firebase] Error logging onboarding_liveness_escalated_to_document:",
      error,
    );
  }
}

export async function logOnboardingHomeReached(): Promise<void> {
  try {
    await analytics().logEvent("onboarding_home_reached");
  } catch (error) {
    console.error("[Firebase] Error logging onboarding_home_reached:", error);
  }
}

/**
 * Bucket helper for distance-segmented events. Keep buckets in sync with
 * the privacy buckets in get_user_distance_miles. The "unknown" bucket
 * means at least one side has no location (state name shown instead).
 */
export function distanceBucket(miles: number | null | undefined): string {
  if (miles == null) return "unknown";
  if (miles < 5) return "under_5";
  if (miles <= 10) return "5_10";
  if (miles <= 25) return "10_25";
  if (miles <= 50) return "25_50";
  if (miles <= 100) return "50_100";
  if (miles <= 200) return "100_200";
  return "over_200";
}
