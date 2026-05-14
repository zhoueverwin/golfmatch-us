/**
 * Premium feature access rules.
 *
 * Messaging access: KYC-verified females message free; KYC-verified males
 * require an active premium subscription. Enforced server-side via RLS on
 * messages.INSERT and mirrored client-side for UX (locked input bar +
 * promo banner in ChatScreen, locked previews in MessagesScreen).
 *
 * Filters/sorts are NO LONGER premium-gated. The gendered hard paywall at
 * onboarding/return-entry means everyone reaching the Search screen is
 * either a paid male or a free female — both should have full filter access.
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
