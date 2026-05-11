/**
 * Premium feature access rules.
 *
 * Messaging access: KYC-verified females message free; KYC-verified males
 * require an active premium subscription. Enforced server-side via RLS on
 * messages.INSERT and mirrored client-side for UX (locked input bar +
 * promo banner in ChatScreen, locked previews in MessagesScreen).
 */

/** Returns true if messaging should be locked for this user. */
export function shouldLockMessaging(
  isVerified: boolean,
  gender: string | null,
  isPremium: boolean,
): boolean {
  if (!isVerified) return true;
  return gender !== "female" && !isPremium;
}

/** Search filter keys that require premium. */
export const PREMIUM_FILTER_KEYS = [
  "gender",
  "age_decades",
  "age_min",
  "age_max",
  "prefecture",
  "golf_skill_level",
  "average_score_max",
  "last_login_days",
] as const;

/** Sort options that require premium. */
export const PREMIUM_SORT_OPTIONS: ReadonlySet<string> = new Set([
  "likes",
  "registration",
  "login",
]);

/** Default sort for free users when a premium sort is requested. */
export const FREE_SORT_FALLBACK = "recommended" as const;
