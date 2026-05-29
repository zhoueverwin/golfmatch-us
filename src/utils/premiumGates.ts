/**
 * Premium feature access rules.
 *
 * v1.2 model: messaging is no longer locked at the receiver/list-preview
 * level. Reasoning:
 *   - Males already cleared the hard paywall at onboarding/return-entry,
 *     so every male in the app is premium. The legacy "Unlock to read"
 *     overlay never fires for the intended audience and only surfaces
 *     for edge cases (lapsed subs), which the entry paywall now handles.
 *   - Females are no longer gated on receive — verification is purely a
 *     per-action gate via useRequireVerification at the moment of
 *     sending (ChatScreen.sendMessage). Receiving and reading is free.
 *
 * shouldLockMessaging is kept as a no-op shim so existing call sites in
 * ChatScreen / MessagesScreen compile unchanged; the lock UI they gate
 * is now unreachable and can be deleted in a follow-up cleanup.
 *
 * Filters/sorts are NOT premium-gated either — the entry paywall already
 * filters who reaches Search.
 */

/**
 * Always returns false in the v1.2 model. Kept as a stable surface for
 * existing callers; safe to inline `false` and delete this helper once
 * the dead lock UI in ChatScreen + MessagesScreen is stripped.
 */
export function shouldLockMessaging(
  _isVerified: boolean,
  _gender: string | null,
  _isPremium: boolean,
): boolean {
  return false;
}
