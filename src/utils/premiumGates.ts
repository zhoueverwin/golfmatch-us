/**
 * Premium feature access rules.
 * Centralizes business logic for premium gates across the app.
 *
 * Rule: Free male users are restricted. Premium users and female users
 * have full access. This is enforced both client-side (UX) and
 * server-side (RLS on messages table, filter stripping in data provider).
 */

/** Returns true if messaging should be locked for this user. */
export function shouldLockMessaging(
  isVerified: boolean,
): boolean {
  return !isVerified;
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
