import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { useQueryClient } from "@tanstack/react-query";

import { Colors } from "../constants/colors";
import { Typography } from "../constants/typography";
import { Spacing, BorderRadius } from "../constants/spacing";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabase";
import CacheService from "../services/cacheService";
import StandardHeader from "../components/StandardHeader";
import { RootStackParamList } from "../types";

type Nav = StackNavigationProp<RootStackParamList, "KycVerification">;

/**
 * Post-onboarding KYC entry point. Same Didit hosted flow as
 * OnboardingKycScreen, but designed for re-verification scenarios:
 *
 *   - Accessed from Settings → Manage Subscription → Identity Verification tile
 *   - Accessed from ChatScreen / PostCreationModal "verify to use this" prompts
 *   - Accessed via push notification deep links
 *
 * Unlike OnboardingKycScreen, on approval this screen calls navigation.goBack()
 * (the user came from somewhere — return them there). There's no gender-based
 * routing because the navigator's KYC gate has already routed any unverified
 * user through OnboardingKycScreen instead.
 *
 * If the user is already approved, the screen shows status only — no retry
 * affordance since there's nothing to do.
 */
const KycVerificationScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { profileId, session, refreshProfile, userProfile } = useAuth() as ReturnType<typeof useAuth> & {
    session?: { access_token?: string } | null;
  };
  const queryClient = useQueryClient();

  // Start from whatever the cached profile says; realtime overrides as
  // verdicts land.
  const [liveKycStatus, setLiveKycStatus] = useState<string | null>(
    userProfile?.kyc_status ?? null,
  );
  const [phase, setPhase] = useState<"idle" | "creating" | "waiting">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [slowReview, setSlowReview] = useState(false);
  const [manualReviewSubmitting, setManualReviewSubmitting] = useState(false);

  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advancedRef = useRef(false);

  const attemptCount =
    (userProfile as { kyc_attempt_count?: number } | null | undefined)
      ?.kyc_attempt_count ?? 0;

  const status = liveKycStatus ?? "not_started";
  const isApproved = status === "approved";
  const isPending = status === "pending_review";
  const isRejected = status === "rejected" || status === "retry";

  // If the user lands on this screen with kyc_status already in
  // pending_review (e.g. they bailed mid-flow on a previous attempt, or the
  // create-didit-session call wrote pending_review before they returned),
  // skip the idle "Start verification" screen and put them straight into
  // the waiting state. Without this, they'd see a "Start verification"
  // CTA even though there's an in-flight submission, which is misleading.
  useEffect(() => {
    if (isPending && phase === "idle" && !advancedRef.current) {
      setPhase("waiting");
    }
  }, [isPending, phase]);

  // 90-second slow-review escape hatch — same pattern as onboarding.
  useEffect(() => {
    if (phase === "waiting") {
      slowTimerRef.current = setTimeout(() => setSlowReview(true), 90 * 1000);
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

  // Subscribe to profile kyc_status changes so the UI updates as soon as
  // Didit's webhook lands.
  useEffect(() => {
    if (!profileId) return;
    const channel = supabase
      .channel(`kyc-reverify-${profileId}`)
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
          if (next.kyc_status) {
            setLiveKycStatus(next.kyc_status);
            handleVerdict(next.kyc_status);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [profileId]);

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

  const handleVerdict = async (next: string) => {
    if (advancedRef.current) return;
    if (next === "approved") {
      advancedRef.current = true;
      await refreshAllCaches();
      // Re-verification success — return the user to where they came from.
      if (navigation.canGoBack()) {
        navigation.goBack();
      }
    } else if (next === "rejected" || next === "retry") {
      setPhase("idle");
    }
    // pending_review → stay on the waiting screen
  };

  const startVerification = async () => {
    if (!profileId || !session?.access_token) {
      setErrorMessage("Missing session — please sign in again.");
      return;
    }

    setPhase("creating");
    setErrorMessage(null);

    try {
      const fnUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/create-didit-session`;
      const res = await fetch(fnUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Failed to create session (${res.status}): ${txt}`);
      }
      const { url } = (await res.json()) as { url: string };

      setPhase("waiting");

      // iOS only permits one ASWebAuthenticationSession at a time. Release
      // any prior reference (e.g. from a recent sign-in) before opening
      // Didit's, and retry once if iOS still rejects the call.
      try { WebBrowser.maybeCompleteAuthSession(); } catch {}
      if (Platform.OS === "ios") {
        await new Promise((r) => setTimeout(r, 400));
      }

      let result: WebBrowser.WebBrowserAuthSessionResult;
      try {
        result = await WebBrowser.openAuthSessionAsync(
          url,
          "Golfmatch://kyc-callback",
        );
      } catch {
        try { WebBrowser.maybeCompleteAuthSession(); } catch {}
        await new Promise((r) => setTimeout(r, 600));
        result = await WebBrowser.openAuthSessionAsync(
          url,
          "Golfmatch://kyc-callback",
        );
      }

      // User dismissed the browser before completing — return to idle.
      if (result.type === "cancel" || result.type === "dismiss") {
        setPhase("idle");
        return;
      }

      // The Supabase Realtime WebSocket may have been suspended while the
      // Didit webview held foreground, so the kyc_status UPDATE could have
      // been broadcast during that gap and missed. Proactively refresh and
      // poll for up to ~20s; whichever of realtime / poll signals first
      // wins via the advancedRef guard in handleVerdict.
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
      setPhase("idle");
      setErrorMessage(err?.message ?? "Couldn't start verification.");
    }
  };

  // Manual-review escape hatch — only after 2 failed attempts so the admin
  // queue doesn't get spammed.
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

  const renderApproved = () => (
    <View style={styles.center}>
      <View style={[styles.iconCircle, { backgroundColor: Colors.success + "15" }]}>
        <Ionicons name="checkmark-circle" size={56} color={Colors.success} />
      </View>
      <Text style={styles.headlineApproved}>You're verified</Text>
      <Text style={styles.body}>
        Your identity has been confirmed. There's nothing else you need to do.
      </Text>
    </View>
  );

  const renderWaiting = () => {
    // "Under review" copy is shown whenever we're waiting — whether the
    // user just started (isPending due to fresh submission) or they came
    // back to a previously-submitted verification. The retry CTA, however,
    // is gated separately: it should only appear after the slow-review
    // timer (90s) actually elapses on THIS screen visit. Showing retry
    // immediately on a fresh visit to a pending_review status looks like
    // we're telling the user their attempt failed when it didn't.
    const underReview = slowReview || isPending;
    const showRetry = slowReview;
    return (
      <View style={styles.center}>
        {underReview ? (
          <View style={styles.iconCircle}>
            <Ionicons name="time-outline" size={48} color={Colors.primary} />
          </View>
        ) : (
          <ActivityIndicator size="large" color={Colors.primary} />
        )}
        <Text style={styles.headline}>
          {underReview ? "Under review" : "Verifying…"}
        </Text>
        <Text style={styles.body}>
          {underReview
            ? "Your verification is being reviewed. This usually completes within a few minutes, sometimes up to 24 hours. You can close this screen — we'll notify you when it's done."
            : "Follow the prompts in the verification page. You'll return here automatically."}
        </Text>
        {showRetry ? (
          <TouchableOpacity
            style={styles.secondaryButton}
            activeOpacity={0.85}
            onPress={() => {
              advancedRef.current = false;
              setPhase("idle");
            }}
          >
            <Text style={styles.secondaryButtonText}>Retry with a new selfie</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  const renderIdle = () => (
    <View style={styles.idleBody}>
      {isRejected ? (
        <View style={styles.rejectionNotice}>
          <View style={styles.rejectionIconCircle}>
            <Ionicons name="alert-circle" size={32} color={Colors.error} />
          </View>
          <Text style={styles.rejectionTitle}>
            Previous verification was not accepted
          </Text>
          <Text style={styles.rejectionBody}>
            Your last selfie didn't pass. This usually happens when the
            photo is blurry, lighting is poor, or your face isn't fully
            visible. Try again in a well-lit space with your face centered
            in the frame.
          </Text>
        </View>
      ) : (
        <View style={styles.iconCircle}>
          <Ionicons name="shield-checkmark" size={48} color={Colors.primary} />
        </View>
      )}

      <Text style={styles.bullet}>
        <Text style={styles.bulletStrong}>1. </Text>Take a quick selfie so
        we can confirm you're a real person
      </Text>
      <Text style={styles.bullet}>
        <Text style={styles.bulletStrong}>2. </Text>Follow the on-screen
        prompts (turn your head, smile, etc.) — this proves the photo is
        live, not a still image
      </Text>
      <Text style={styles.bullet}>
        <Text style={styles.bulletStrong}>3. </Text>That's it. Verification
        is automatic and takes about 30 seconds.
      </Text>

      <Text style={styles.privacy}>
        GolfMatch uses Didit to confirm a real person is behind each
        profile. Your selfie is only used for this liveness check — it
        isn't shown on your profile and isn't stored after verification.
        We do not collect government IDs.
      </Text>

      {errorMessage ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={18} color={Colors.error} />
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={styles.primaryButton}
        activeOpacity={0.85}
        onPress={startVerification}
      >
        <Text style={styles.primaryButtonText}>
          {isRejected ? "Try again" : "Start verification"}
        </Text>
      </TouchableOpacity>

      {isRejected && attemptCount >= 2 ? (
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

  return (
    <SafeAreaView style={styles.container}>
      <StandardHeader
        title=""
        showBackButton
        onBackPress={() => navigation.goBack()}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {isApproved
          ? renderApproved()
          : phase === "creating"
            ? (
              <View style={styles.center}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.headline}>Preparing verification…</Text>
              </View>
            )
            : phase === "waiting"
              ? renderWaiting()
              : renderIdle()}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  center: {
    alignItems: "center",
    paddingTop: Spacing.xl,
    gap: Spacing.md,
  },
  idleBody: {
    paddingTop: Spacing.lg,
    alignItems: "stretch",
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
  headline: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
    textAlign: "center",
  },
  headlineApproved: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.success,
    textAlign: "center",
  },
  body: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: Spacing.md,
  },
  bullet: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.primary,
    marginBottom: Spacing.sm,
    lineHeight: 22,
  },
  bulletStrong: {
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
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
  primaryButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  primaryButtonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.white,
  },
  secondaryButton: {
    borderWidth: 1.5,
    borderColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    marginTop: Spacing.md,
  },
  secondaryButtonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.primary,
  },
  secondaryHelper: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    textAlign: "center",
    marginTop: Spacing.xs,
    lineHeight: 18,
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
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
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
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.error + "10",
    marginTop: Spacing.md,
  },
  errorText: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.error,
  },
});

export default KycVerificationScreen;
