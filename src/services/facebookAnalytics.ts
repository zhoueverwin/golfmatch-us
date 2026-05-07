/**
 * Facebook Analytics Service
 *
 * Handles Meta/Facebook SDK event tracking for app analytics and ad attribution.
 * This service manages:
 * - App Tracking Transparency (ATT) permission requests on iOS 14+
 * - Standard Facebook events (CompleteRegistration, Subscribe, etc.)
 * - Custom events for app-specific tracking (MatchCreated, etc.)
 *
 * @see https://developers.facebook.com/docs/app-events/reference
 */

import { Platform } from 'react-native';
import { Settings, AppEventsLogger } from 'react-native-fbsdk-next';
import { requestTrackingPermissionsAsync, getTrackingPermissionsAsync } from 'expo-tracking-transparency';

/**
 * Check if tracking is enabled (user granted ATT permission)
 */
let isTrackingEnabled = false;

/**
 * Initialize the Facebook SDK and request ATT permission
 * Should be called once when the app starts, ideally after user authentication
 *
 * @returns Promise<boolean> - Whether tracking permission was granted
 */
export async function initializeFacebookSDK(): Promise<boolean> {
  try {
    // Initialize Facebook SDK
    await Settings.initializeSDK();

    // On iOS 14+, request App Tracking Transparency permission
    if (Platform.OS === 'ios') {
      // First check if we already have permission
      const { status: existingStatus } = await getTrackingPermissionsAsync();

      if (existingStatus === 'granted') {
        isTrackingEnabled = true;
        // Enable advertiser ID collection and tracking
        await Settings.setAdvertiserIDCollectionEnabled(true);
        await Settings.setAdvertiserTrackingEnabled(true);
        console.log('[FacebookSDK] Tracking already enabled');
        return true;
      }

      // Request permission if not yet determined
      if (existingStatus === 'undetermined') {
        const { status } = await requestTrackingPermissionsAsync();
        isTrackingEnabled = status === 'granted';

        // Configure SDK based on permission
        await Settings.setAdvertiserIDCollectionEnabled(isTrackingEnabled);
        await Settings.setAdvertiserTrackingEnabled(isTrackingEnabled);

        console.log(`[FacebookSDK] Tracking permission: ${status}`);
        return isTrackingEnabled;
      }

      // Permission was denied
      console.log('[FacebookSDK] Tracking permission denied');
      await Settings.setAdvertiserIDCollectionEnabled(false);
      await Settings.setAdvertiserTrackingEnabled(false);
      return false;
    }

    // On Android, tracking is enabled by default (no ATT)
    isTrackingEnabled = true;
    console.log('[FacebookSDK] Initialized on Android');
    return true;

  } catch (error) {
    console.error('[FacebookSDK] Initialization error:', error);
    return false;
  }
}

/**
 * Request ATT permission (can be called separately if needed)
 * Useful for showing the ATT dialog at a strategic moment in the user flow
 */
export async function requestTrackingPermission(): Promise<boolean> {
  if (Platform.OS !== 'ios') {
    return true; // Android doesn't need ATT
  }

  try {
    const { status } = await requestTrackingPermissionsAsync();
    isTrackingEnabled = status === 'granted';

    await Settings.setAdvertiserIDCollectionEnabled(isTrackingEnabled);
    await Settings.setAdvertiserTrackingEnabled(isTrackingEnabled);

    return isTrackingEnabled;
  } catch (error) {
    console.error('[FacebookSDK] Request tracking permission error:', error);
    return false;
  }
}

/**
 * Check current tracking permission status
 */
export async function getTrackingStatus(): Promise<'granted' | 'denied' | 'undetermined'> {
  if (Platform.OS !== 'ios') {
    return 'granted'; // Android doesn't need ATT
  }

  const { status } = await getTrackingPermissionsAsync();
  return status as 'granted' | 'denied' | 'undetermined';
}

// ============================================================================
// Standard Facebook Events
// ============================================================================

/**
 * Log when a user completes registration
 * @param method - The registration method used (e.g., 'email', 'phone', 'apple', 'google')
 */
export function logCompleteRegistration(method: string): void {
  try {
    AppEventsLogger.logEvent('fb_mobile_complete_registration', {
      fb_registration_method: method,
    });
    console.log(`[FacebookSDK] Logged CompleteRegistration: ${method}`);
  } catch (error) {
    console.error('[FacebookSDK] Error logging CompleteRegistration:', error);
  }
}

/**
 * Log when a user starts a subscription
 * @param params - Subscription parameters
 */
export function logSubscribe(params: {
  currency: string;
  value: number;
  productId?: string;
  subscriptionPeriod?: string;
}): void {
  try {
    AppEventsLogger.logEvent('Subscribe', params.value, {
      fb_currency: params.currency,
      fb_content_id: params.productId || '',
      subscription_period: params.subscriptionPeriod || '',
    });
    console.log(`[FacebookSDK] Logged Subscribe: ${params.value} ${params.currency}`);
  } catch (error) {
    console.error('[FacebookSDK] Error logging Subscribe:', error);
  }
}

/**
 * Log when a user completes a purchase
 * @param params - Purchase parameters
 */
export function logPurchase(params: {
  currency: string;
  value: number;
  productId?: string;
}): void {
  try {
    AppEventsLogger.logPurchase(params.value, params.currency, {
      fb_content_id: params.productId || '',
    });
    console.log(`[FacebookSDK] Logged Purchase: ${params.value} ${params.currency}`);
  } catch (error) {
    console.error('[FacebookSDK] Error logging Purchase:', error);
  }
}

/**
 * Log when a user starts a trial
 * @param params - Trial parameters
 */
export function logStartTrial(params: {
  currency: string;
  value: number;
  productId?: string;
}): void {
  try {
    AppEventsLogger.logEvent('StartTrial', params.value, {
      fb_currency: params.currency,
      fb_content_id: params.productId || '',
    });
    console.log(`[FacebookSDK] Logged StartTrial: ${params.productId}`);
  } catch (error) {
    console.error('[FacebookSDK] Error logging StartTrial:', error);
  }
}

/**
 * Log when app is activated (automatically logged by SDK, but can be called manually)
 */
export function logAppActivated(): void {
  try {
    AppEventsLogger.logEvent('fb_mobile_activate_app');
    console.log('[FacebookSDK] Logged AppActivated');
  } catch (error) {
    console.error('[FacebookSDK] Error logging AppActivated:', error);
  }
}

// ============================================================================
// Custom Events for GolfMatch
// ============================================================================

/**
 * Log when a match is created between two users
 * @param params - Match parameters
 */
export function logMatchCreated(params?: {
  matchId?: string;
}): void {
  try {
    AppEventsLogger.logEvent('MatchCreated', {
      match_id: params?.matchId || '',
    });
    console.log(`[FacebookSDK] Logged MatchCreated: ${params?.matchId || 'unknown'}`);
  } catch (error) {
    console.error('[FacebookSDK] Error logging MatchCreated:', error);
  }
}

/**
 * Log when a user sends a like
 * @param params - Like parameters
 */
export function logLikeSent(params?: {
  likeType?: 'like' | 'super_like';
}): void {
  try {
    AppEventsLogger.logEvent('LikeSent', {
      like_type: params?.likeType || 'like',
    });
    console.log(`[FacebookSDK] Logged LikeSent: ${params?.likeType || 'like'}`);
  } catch (error) {
    console.error('[FacebookSDK] Error logging LikeSent:', error);
  }
}

/**
 * Log when a user sends a message
 */
export function logMessageSent(): void {
  try {
    AppEventsLogger.logEvent('MessageSent');
    console.log('[FacebookSDK] Logged MessageSent');
  } catch (error) {
    console.error('[FacebookSDK] Error logging MessageSent:', error);
  }
}

/**
 * Log when a user creates a post
 * @param params - Post parameters
 */
export function logPostCreated(params?: {
  hasMedia?: boolean;
}): void {
  try {
    AppEventsLogger.logEvent('PostCreated', {
      has_media: params?.hasMedia ? 'true' : 'false',
    });
    console.log(`[FacebookSDK] Logged PostCreated`);
  } catch (error) {
    console.error('[FacebookSDK] Error logging PostCreated:', error);
  }
}

/**
 * Log when a user completes their profile
 * @param completionPercentage - Profile completion percentage (0-100)
 */
export function logProfileCompleted(completionPercentage: number): void {
  try {
    AppEventsLogger.logEvent('ProfileCompleted', {
      completion_percentage: completionPercentage.toString(),
    });
    console.log(`[FacebookSDK] Logged ProfileCompleted: ${completionPercentage}%`);
  } catch (error) {
    console.error('[FacebookSDK] Error logging ProfileCompleted:', error);
  }
}

/**
 * Log a generic custom event
 * @param eventName - Name of the event
 * @param valueToSum - Optional numeric value to sum
 * @param parameters - Optional event parameters
 */
export function logCustomEvent(
  eventName: string,
  valueToSum?: number,
  parameters?: Record<string, string>
): void {
  try {
    if (valueToSum !== undefined) {
      AppEventsLogger.logEvent(eventName, valueToSum, parameters || {});
    } else {
      AppEventsLogger.logEvent(eventName, parameters || {});
    }
    console.log(`[FacebookSDK] Logged custom event: ${eventName}`);
  } catch (error) {
    console.error(`[FacebookSDK] Error logging ${eventName}:`, error);
  }
}

/**
 * Set user ID for Facebook Analytics (for cross-device tracking)
 * @param userId - The user's profile ID
 */
export function setUserId(userId: string): void {
  try {
    AppEventsLogger.setUserID(userId);
    console.log(`[FacebookSDK] Set user ID: ${userId}`);
  } catch (error) {
    console.error('[FacebookSDK] Error setting user ID:', error);
  }
}

/**
 * Clear user ID (call on logout)
 */
export function clearUserId(): void {
  try {
    AppEventsLogger.setUserID(null);
    console.log('[FacebookSDK] Cleared user ID');
  } catch (error) {
    console.error('[FacebookSDK] Error clearing user ID:', error);
  }
}

/**
 * Flush events immediately (useful before app goes to background)
 */
export function flushEvents(): void {
  try {
    AppEventsLogger.flush();
    console.log('[FacebookSDK] Flushed events');
  } catch (error) {
    console.error('[FacebookSDK] Error flushing events:', error);
  }
}

// Export as default object for convenience
export default {
  initializeFacebookSDK,
  requestTrackingPermission,
  getTrackingStatus,
  logCompleteRegistration,
  logSubscribe,
  logPurchase,
  logStartTrial,
  logAppActivated,
  logMatchCreated,
  logLikeSent,
  logMessageSent,
  logPostCreated,
  logProfileCompleted,
  logCustomEvent,
  setUserId,
  clearUserId,
  flushEvents,
};
