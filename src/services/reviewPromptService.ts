/**
 * Review-prompt service.
 *
 * Decides whether and when to ask the user to rate the app via the native
 * StoreKit / Play in-app review API. The trigger is "first reply received":
 * after the user has sent at least one message, the first inbound message
 * they receive opens the native review prompt exactly once.
 *
 * State is stored in AsyncStorage. No profiles-table column is needed for v1
 * — see the approved plan at ~/.claude/plans/i-want-to-add-valiant-karp.md
 * for why.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

// Lazy-loaded `expo-store-review` to survive a dev-client binary that
// pre-dates the package being added. If the native module is missing,
// every helper here degrades to a no-op (the review prompt simply
// doesn't fire until the next `npx expo run:ios` rebuilds the binary
// with the native module linked in).
//
// The top-level `import * as StoreReview from 'expo-store-review'`
// triggers a native-module lookup during JS bootstrap on some Expo
// versions, which throws "Cannot find native module 'ExpoStoreReview'"
// before the app can mount. Switching to a deferred require keeps the
// failure path runtime-only, where the existing try/catch already
// handles it gracefully.
type StoreReviewModule = {
  isAvailableAsync: () => Promise<boolean>;
  hasAction: () => Promise<boolean>;
  requestReview: () => Promise<void>;
};

function loadStoreReview(): StoreReviewModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-store-review') as StoreReviewModule;
  } catch (error) {
    console.warn(
      '[reviewPromptService] expo-store-review native module unavailable, skipping prompt:',
      error,
    );
    return null;
  }
}

const KEY_HAS_SENT_FIRST_MESSAGE = 'review_prompt:has_sent_first_message';
const KEY_HAS_BEEN_SHOWN = 'review_prompt:has_been_shown';
const KEY_LAST_SHOWN_AT = 'review_prompt:last_shown_at';

async function readBool(key: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(key)) === 'true';
  } catch (error) {
    console.warn('[reviewPromptService] AsyncStorage read failed:', key, error);
    return false;
  }
}

async function writeBool(key: string, value: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value ? 'true' : 'false');
  } catch (error) {
    console.warn('[reviewPromptService] AsyncStorage write failed:', key, error);
  }
}

export async function markFirstMessageSentIfNeeded(): Promise<void> {
  if (await readBool(KEY_HAS_SENT_FIRST_MESSAGE)) return;
  await writeBool(KEY_HAS_SENT_FIRST_MESSAGE, true);
  console.log('[reviewPromptService] Marked first message sent');
}

export async function shouldShowOnIncomingMessage(): Promise<boolean> {
  const [hasSent, hasShown] = await Promise.all([
    readBool(KEY_HAS_SENT_FIRST_MESSAGE),
    readBool(KEY_HAS_BEEN_SHOWN),
  ]);
  if (!hasSent || hasShown) return false;

  const StoreReview = loadStoreReview();
  if (!StoreReview) return false;
  try {
    const available = await StoreReview.isAvailableAsync();
    if (!available) return false;
    const hasAction = await StoreReview.hasAction();
    return hasAction;
  } catch (error) {
    console.warn('[reviewPromptService] StoreReview availability check failed:', error);
    return false;
  }
}

export async function requestReview(): Promise<void> {
  const StoreReview = loadStoreReview();
  if (!StoreReview) return;
  try {
    console.log('[reviewPromptService] Requesting native review prompt');
    await StoreReview.requestReview();
  } catch (error) {
    console.warn('[reviewPromptService] requestReview failed:', error);
  }
}

export async function markPromptShown(): Promise<void> {
  await writeBool(KEY_HAS_BEEN_SHOWN, true);
  try {
    await AsyncStorage.setItem(KEY_LAST_SHOWN_AT, new Date().toISOString());
  } catch (error) {
    console.warn('[reviewPromptService] Failed to write last_shown_at:', error);
  }
}

export const reviewPromptService = {
  markFirstMessageSentIfNeeded,
  shouldShowOnIncomingMessage,
  requestReview,
  markPromptShown,
};
