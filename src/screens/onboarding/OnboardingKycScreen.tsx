import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { useNavigation, CommonActions } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { useQueryClient } from "@tanstack/react-query";
import OnboardingShell from "./OnboardingShell";
import { Colors } from "../../constants/colors";
import { Typography } from "../../constants/typography";
import { Spacing, BorderRadius } from "../../constants/spacing";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../services/supabase";
import CacheService from "../../services/cacheService";
import {
  logOnboardingLivenessShown,
  logOnboardingLivenessCompleted,
  logOnboardingHomeReached,
} from "../../services/firebaseAnalytics";
import { RootStackParamList } from "../../types";

type Nav = StackNavigationProp<RootStackParamList, "OnboardingKyc">;

/**
 * Liveness step in onboarding (v1.1). Opens Didit's hosted lite-workflow
 * flow (selfie + face match + age estimation, no document) in an in-app
 * browser; subscribes to `profiles.kyc_status` via Realtime; routes
 * forward when the verdict lands.
 *
 * Paywall is upstream of this screen in v1.1, so on `approved` the user
 * always goes straight to Main. If the webhook flags `kyc_requires_document`
 * (AI age < 21 or > 5y mismatch from self-attested birthdate), the user is
 * routed to OnboardingKyc again with the heavy Didit workflow forced via
 * the `mode=heavy` request param.
 *
 * Filename is OnboardingKycScreen for backwards-compat with the existing
 * RootStackParamList route key; the user-facing copy and behavior are
 * now liveness-only.
 */
const OnboardingKycScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { profileId, session, refreshProfile, userProfile } = useAuth() as ReturnType<typeof useAuth> & {
    session?: { access_token?: string } | null;
  };
  const queryClient = useQueryClient();

  // If the user reopens the app while Didit is still reviewing, drop them
  // straight into the "waiting" state with the longer-wait message instead
  // of the intro CTA. Otherwise they'd see "Start verification" again, which
  // would create a brand-new Didit session and waste their review queue spot.
  const initialPhase: "intro" | "waiting" =
    userProfile?.kyc_status === "pending_review" ? "waiting" : "intro";

  // Sticky flag: was the user already rejected when this screen mounted?
  // Drives the "Verification not accepted — please try again" banner so
  // returning rejected/revoked users see *why* they're back on this screen.
  // We freeze it at mount so a successful retry doesn't keep showing the
  // banner while the new realtime status streams in.
  const wasPreviouslyRejected = useRef(
    userProfile?.kyc_status === "rejected",
  ).current;

  const [phase, setPhase] = useState<"intro" | "creating" | "waiting" | "done">(
    initialPhase,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [slowReview, setSlowReview] = useState(false);
  // Tracks the latest kyc_status seen via realtime so the UI flips to
  // "Under review" the moment Didit's webhook lands, without waiting for the
  // 90s slowReview timer or for AuthContext to re-fetch the profile.
  const [liveKycStatus, setLiveKycStatus] = useState<string | null>(
    userProfile?.kyc_status ?? null,
  );
  const advancedRef = useRef(false);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read attempt count from the profile (auto-incremented by a DB trigger
  // whenever kyc_status flips to 'rejected'/'retry'). Used to gate the
  // "Submit for manual review" escape hatch — only available after 2
  // prior Didit failures, so the admin queue isn't spammed by drive-by
  // attempts.
  const [manualReviewSubmitting, setManualReviewSubmitting] = useState(false);
  const attemptCount =
    (userProfile as { kyc_attempt_count?: number } | null | undefined)
      ?.kyc_attempt_count ?? 0;

  // When we enter "waiting", arm a 20s timer that surfaces a retry
  // affordance if Didit hasn't returned a verdict by then. v1.1 lite
  // workflow is AI-decided and usually returns in 3-10s; if it's been
  // 20s, something's off (network blip, webhook delay) and the user
  // should have the option to bail rather than stare at a spinner.
  useEffect(() => {
    if (phase === "waiting") {
      slowTimerRef.current = setTimeout(() => setSlowReview(true), 20 * 1000);
    } else {
      setSlowReview(false);
      if (slowTimerRef.current) {
        clearTimeout(slowTimerRef.current);
        slowTimerRef.current = null;
      }
    }
    return () => {
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    };
  }, [phase]);

  // Early-exit: if the profile lands on this screen already approved (e.g.
  // beta-tester allowlist pre-grants verification on profile creation), skip
  // straight to the next step without ever showing the Didit intro. Mirrors
  // the same routing handleVerdict applies on a live realtime verdict.
  useEffect(() => {
    if (advancedRef.current) return;
    if (
      userProfile?.is_verified === true &&
      userProfile?.kyc_status === "approved"
    ) {
      handleVerdict("approved");
    }
    // Intentionally only runs once on mount per profile load — the realtime
    // sub below handles subsequent updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile?.is_verified, userProfile?.kyc_status]);

  // Auto-launch the Didit selfie flow on fresh visits. The intro screen
  // ("Start verification" button + privacy explainer) added an unnecessary
  // extra tap between paywall and the selfie capture; collapsed here so
  // the user sees one brief "Preparing verification…" spinner and then
  // Didit's hosted webview opens directly. The intro screen still appears
  // when the user was previously rejected (so they understand why they're
  // back) or when startVerification errors out (so they can retry).
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStartedRef.current) return;
    if (advancedRef.current) return;
    if (wasPreviouslyRejected) return;
    if (phase !== "intro") return;
    if (errorMessage) return;
    if (!profileId || !session?.access_token) return;
    // CRITICAL: wait for the profile cache to load before auto-launching.
    // Without this guard, the screen mounts before AuthContext has
    // re-fetched the profile on sign-in, userProfile is null, the
    // is_verified check is falsy, and we kick off a Didit session
    // unnecessarily. Worse: create-didit-session writes
    // kyc_status='pending_review' which the sync_is_verified_with_kyc_status
    // trigger uses to flip is_verified back to false — silently demoting
    // a user who was already approved. The 2026-05-23 Xi-account
    // regression was caused by exactly this race.
    if (!userProfile) return;
    if (
      userProfile.is_verified === true &&
      userProfile.kyc_status === "approved"
    ) {
      return;
    }
    autoStartedRef.current = true;
    void startVerification();
    // startVerification is stable within a single mount; intentionally
    // excluded from deps so we don't re-fire on its identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, session?.access_token, phase, errorMessage, wasPreviouslyRejected, userProfile]);

  // Subscribe to profiles changes for this user so we can advance as soon
  // as the webhook flips kyc_status to approved/rejected, or sets the
  // kyc_requires_document escalation flag.
  useEffect(() => {
    if (!profileId) return;
    const channel = supabase
      .channel(`profile-kyc-${profileId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${profileId}`,
        },
        (payload) => {
          const next = payload.new as { kyc_status?: string };
          if (next.kyc_status) setLiveKycStatus(next.kyc_status);
          handleVerdict(next.kyc_status);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [profileId]);

  // Refresh every cache layer that holds the current user's profile so
  // Main/MyPage/EditProfile all see the freshly-verified data on first render:
  //   1. CacheService key `user_${profileId}` (User shape, DataProvider.getUser)
  //   2. CacheService key `user_profile_${profileId}` (UserProfile shape, MyPage)
  //   3. AuthContext's cached `userProfile` (refreshProfile re-fetches)
  //   4. React Query keys ['profile'] and ['currentUserProfile']
  const refreshAllCaches = async () => {
    if (profileId) {
      await Promise.all([
        CacheService.remove(`user_${profileId}`),
        CacheService.remove(`user_profile_${profileId}`),
      ]);
    }
    await refreshProfile();
    queryClient.invalidateQueries({ queryKey: ["profile"] });
    queryClient.invalidateQueries({ queryKey: ["currentUserProfile"] });
  };

  const handleVerdict = async (status: string | undefined) => {
    if (advancedRef.current) return;
    if (status === "approved") {
      advancedRef.current = true;
      void logOnboardingLivenessCompleted();
      void logOnboardingHomeReached();
      // v1.1: paywall is upstream of liveness, so approved always means
      // Main. No more gender-based paywall routing here.
      await refreshAllCaches();
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: "Main" }],
        }),
      );
    } else if (status === "rejected") {
      // Didit already shows its own "verification failed" notification on the
      // user's device; don't duplicate it with an in-app Alert. Just bounce
      // back to the intro phase so the user can retry via the "Start
      // Verification" CTA. We deliberately do NOT set advancedRef.current here
      // because setPhase("intro") is idempotent — if realtime redelivers the
      // same "rejected" event, the second call has no visible effect.
      setPhase("intro");
    } else if (status === "retry") {
      // Didit timed out / abandoned — let them restart.
      setPhase("intro");
    }
    // pending_review → keep waiting
  };

  // Escape hatch for users who've failed Didit's automated check at least
  // twice. Parks their latest submission in the admin review queue
  // (kyc_submissions.status = 'pending_review') so a human can review the ID
  // images and approve manually. The user lands on the same "Under review"
  // waiting screen they'd see if Didit itself had escalated.
  const submitForManualReview = async () => {
    if (manualReviewSubmitting || !session?.access_token) return;
    setManualReviewSubmitting(true);
    setErrorMessage(null);
    try {
      const fnUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/request-kyc-review`;
      const res = await fetch(fnUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      // Re-use the existing "Under review" UI by flipping into the waiting
      // phase with pending_review state. Realtime will navigate the user
      // onward once an admin makes a decision.
      setLiveKycStatus("pending_review");
      setPhase("waiting");
    } catch (e: unknown) {
      setErrorMessage(
        (e as Error)?.message ?? "Couldn't submit for manual review.",
      );
    } finally {
      setManualReviewSubmitting(false);
    }
  };

  const startVerification = async () => {
    if (!profileId || !session?.access_token) {
      setErrorMessage("Missing session — please sign in again.");
      return;
    }

    setPhase("creating");
    setErrorMessage(null);

    try {
      // Call our edge function to create a Didit session. mode='lite'
      // requests the v1.1 liveness-only workflow; the escalation screen
      // passes mode='heavy' to force document-required.
      const fnUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/create-didit-session`;
      const res = await fetch(fnUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ mode: "lite" }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Failed to create session (${res.status}): ${txt}`);
      }
      const { url } = (await res.json()) as { url: string; session_id: string };

      void logOnboardingLivenessShown();
      setPhase("waiting");

      // iOS only permits one ASWebAuthenticationSession at a time. When the
      // user just signed in via Google/Apple/Email (which also uses
      // openAuthSessionAsync), iOS holds the prior session reference for a
      // brief window. Calling maybeCompleteAuthSession + a short yield
      // releases it so the Didit session below doesn't throw "Calling
      // openAuthSessionAsync has failed". Retry once if it still fails.
      try { WebBrowser.maybeCompleteAuthSession(); } catch {}
      if (Platform.OS === "ios") {
        await new Promise((r) => setTimeout(r, 400));
      }

      let result: WebBrowser.WebBrowserAuthSessionResult;
      try {
        result = await WebBrowser.openAuthSessionAsync(
          url,
          "Golfmatch://onboarding/kyc-callback",
        );
      } catch {
        try { WebBrowser.maybeCompleteAuthSession(); } catch {}
        await new Promise((r) => setTimeout(r, 600));
        result = await WebBrowser.openAuthSessionAsync(
          url,
          "Golfmatch://onboarding/kyc-callback",
        );
      }

      // If the user dismissed the browser before completing Didit, no webhook
      // will fire — return to intro instead of leaving them on the spinner.
      if (result.type === "cancel" || result.type === "dismiss") {
        setPhase("intro");
        return;
      }

      // While the Didit webview had foreground, iOS likely suspended the
      // Supabase Realtime WebSocket. The kyc_status UPDATE emitted by
      // didit-webhook may have been broadcast during that gap — realtime
      // does not replay missed events. Proactively refresh + poll the
      // profile for up to ~20s as a fallback. The realtime sub remains
      // active in parallel; whichever signal lands first wins via the
      // advancedRef guard inside handleVerdict.
      await refreshAllCaches();
      for (let i = 0; i < 10 && !advancedRef.current; i++) {
        const { data } = await supabase
          .from("profiles")
          .select("kyc_status")
          .eq("id", profileId)
          .single();
        const status = data?.kyc_status;
        if (status === "approved" || status === "rejected" || status === "retry") {
          setLiveKycStatus(status);
          void handleVerdict(status);
          break;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    } catch (err: any) {
      setPhase("intro");
      setErrorMessage(err?.message ?? "Couldn't start verification.");
    }
  };

  const renderBody = () => {
    if (phase === "waiting") {
      // slowReview flips on after 20s — the only signal that's actually
      // meaningful for the lite (AI) workflow. We deliberately DO NOT
      // treat liveKycStatus === 'pending_review' as a slow signal here,
      // because create-didit-session sets that status before the user
      // even opens Didit's flow — it's a "we're waiting on the webhook"
      // state, not a "human is reviewing" state.
      const showLongWait = slowReview;
      return (
        <View style={styles.center}>
          {showLongWait ? (
            <View style={styles.iconCircle}>
              <Ionicons name="time-outline" size={48} color={Colors.primary} />
            </View>
          ) : (
            <ActivityIndicator size="large" color={Colors.primary} />
          )}
          <Text style={styles.waitingTitle}>
            {showLongWait ? "Taking longer than usual…" : "Checking your selfie…"}
          </Text>
          <Text style={styles.waitingBody}>
            {showLongWait
              ? "Sometimes the result takes a bit to arrive. You can wait a few more seconds, or try again."
              : "This usually finishes in a few seconds."}
          </Text>
          {showLongWait ? (
            <TouchableOpacity
              style={[styles.primaryButton, styles.primaryButtonWide]}
              activeOpacity={0.85}
              onPress={() => {
                advancedRef.current = false;
                setLiveKycStatus(null);
                setPhase("intro");
              }}
            >
              <Text
                style={styles.primaryButtonText}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                Try again
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      );
    }

    if (phase === "creating") {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.waitingTitle}>Preparing verification…</Text>
        </View>
      );
    }

    return (
      <View style={styles.body}>
        {wasPreviouslyRejected ? (
          <View style={styles.rejectionNotice}>
            <View style={styles.rejectionIconCircle}>
              <Ionicons name="alert-circle" size={32} color={Colors.error} />
            </View>
            <Text style={styles.rejectionTitle}>
              That didn't pass
            </Text>
            <Text style={styles.rejectionBody}>
              Try again with a clear, well-lit selfie facing the camera.
            </Text>
          </View>
        ) : (
          <View style={styles.iconCircle}>
            <Ionicons name="shield-checkmark" size={48} color={Colors.primary} />
          </View>
        )}

        <Text style={styles.privacy}>
          Your selfie confirms you're a real adult. It isn't shown on your
          profile and isn't stored after verification.
        </Text>

        {errorMessage ? (
          <View style={styles.errorBox}>
            <Ionicons
              name="alert-circle"
              size={18}
              color={Colors.error}
            />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={styles.primaryButton}
          activeOpacity={0.85}
          onPress={startVerification}
        >
          <Text style={styles.primaryButtonText}>Start verification</Text>
        </TouchableOpacity>

        {wasPreviouslyRejected && attemptCount >= 2 ? (
          <>
            <TouchableOpacity
              style={styles.secondaryButton}
              activeOpacity={0.85}
              onPress={submitForManualReview}
              disabled={manualReviewSubmitting}
            >
              {manualReviewSubmitting ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <Text style={styles.secondaryButtonText}>
                  Submit for manual review
                </Text>
              )}
            </TouchableOpacity>
            <Text style={styles.secondaryHelper}>
              A team member will review your submission within 48 hours. You'll
              get a notification when it's done.
            </Text>
          </>
        ) : null}
      </View>
    );
  };

  return (
    <OnboardingShell
      title={wasPreviouslyRejected ? "Let's try that again" : "One quick selfie"}
      subtitle={
        wasPreviouslyRejected
          ? "Face the camera in good light."
          : "Confirms you're real. About 15 seconds."
      }
      continueDisabled
      onContinue={() => {}}
      // Hide the default Continue button — our body has its own CTA.
      // The shell hides the back arrow automatically when this screen is the
      // first in the stack (returning unverified users via needsKycGate).
      // Always show sign out so users can switch accounts from here.
      continueLabel=""
      showSignOut
    >
      {renderBody()}
    </OnboardingShell>
  );
};

const styles = StyleSheet.create({
  body: {
    paddingTop: Spacing.lg,
    alignItems: "stretch",
  },
  center: {
    alignItems: "center",
    paddingTop: Spacing.xl,
    gap: Spacing.md,
  },
  iconCircle: {
    alignSelf: "center",
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.primary + "15",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  rejectionNotice: {
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.error + "08",
    borderWidth: 1,
    borderColor: Colors.error + "30",
    alignItems: "center",
  },
  rejectionIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.error + "15",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  rejectionTitle: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text.primary,
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  rejectionBody: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.primary,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: Spacing.sm,
  },
  rejectionContact: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    textAlign: "center",
    lineHeight: 18,
  },
  bullet: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.primary,
    lineHeight: 24,
    marginBottom: Spacing.md,
  },
  bulletStrong: {
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
  },
  privacy: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    lineHeight: 20,
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.error + "10",
    borderWidth: 1,
    borderColor: Colors.error + "30",
    marginBottom: Spacing.md,
  },
  errorText: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.error,
  },
  primaryButton: {
    height: 56,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.xl,
  },
  // Used when the button needs to span the screen width (e.g. the "Retry"
  // CTA on the Under review state, where the parent uses alignItems:center
  // and would otherwise collapse the button to its text width).
  primaryButtonWide: {
    alignSelf: "stretch",
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.xl,
  },
  primaryButtonText: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    fontWeight: Typography.fontWeight.bold,
    color: Colors.white,
  },
  // Ghost variant of primaryButton — same shape, transparent fill, teal
  // border. Visually subordinate so the user gravitates toward the primary
  // "Start verification" CTA first and only reaches for manual review as a
  // fallback.
  secondaryButton: {
    height: 56,
    borderRadius: BorderRadius.full,
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.xl,
  },
  secondaryButtonText: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.primary,
  },
  secondaryHelper: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    textAlign: "center",
    lineHeight: 18,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  waitingTitle: {
    fontSize: Typography.fontSize.lg,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text.primary,
    marginTop: Spacing.md,
  },
  waitingBody: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    textAlign: "center",
    paddingHorizontal: Spacing.lg,
    lineHeight: 20,
  },
});

export default OnboardingKycScreen;
