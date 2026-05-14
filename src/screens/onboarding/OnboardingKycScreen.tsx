import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
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
import { RootStackParamList } from "../../types";

type Nav = StackNavigationProp<RootStackParamList, "OnboardingKyc">;

/**
 * KYC step in onboarding. Opens Didit's hosted verification flow in an
 * in-app browser; subscribes to `profiles.kyc_status` via Realtime; routes
 * forward when the verdict lands.
 *
 * The webhook writes the ID-extracted `gender` to `profiles`, which we then
 * read to decide the next step:
 *   - male   → OnboardingPaywall (which navigates to Main on purchase)
 *   - female → Main directly (no celebration screen)
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

  // When we enter "waiting", arm a 90s timer that surfaces a retry/escape
  // affordance if Didit hasn't returned a verdict by then (pending_review
  // can take minutes to hours when escalated to human review).
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

  // Subscribe to profiles changes for this user so we can advance as soon
  // as the webhook flips kyc_status to approved/rejected.
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
          const next = payload.new as {
            kyc_status?: string;
            gender?: string | null;
          };
          if (next.kyc_status) setLiveKycStatus(next.kyc_status);
          handleVerdict(next.kyc_status, next.gender);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const handleVerdict = async (
    status: string | undefined,
    gender: string | null | undefined,
  ) => {
    if (advancedRef.current) return;
    if (status === "approved") {
      advancedRef.current = true;
      if (gender === "female") {
        // Only explicit "female" skips the paywall. This is fail-secure:
        // unknown/null/other genders (e.g. Didit returns "U" for IDs without
        // a sex field, like Japanese driver's licenses) are routed through
        // the paywall rather than letting them slip through as free users.
        await refreshAllCaches();
        navigation.dispatch(
          CommonActions.reset({
            index: 0,
            routes: [{ name: "Main" }],
          }),
        );
      } else {
        // Male, null, "U", "other", anything-not-female → paywall.
        navigation.navigate("OnboardingPaywall");
      }
    } else if (status === "rejected") {
      advancedRef.current = true;
      Alert.alert(
        "Verification failed",
        "We couldn't verify your identity. You can retry, or sign out to switch accounts.",
        [
          {
            text: "Retry",
            onPress: () => {
              advancedRef.current = false;
              setPhase("intro");
            },
          },
        ],
      );
    } else if (status === "retry") {
      // Didit timed out / abandoned — let them restart.
      setPhase("intro");
    }
    // pending_review → keep waiting
  };

  const startVerification = async () => {
    if (!profileId || !session?.access_token) {
      setErrorMessage("Missing session — please sign in again.");
      return;
    }

    setPhase("creating");
    setErrorMessage(null);

    try {
      // Call our edge function to create a Didit session.
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
      const { url } = (await res.json()) as { url: string; session_id: string };

      setPhase("waiting");

      // Open Didit's hosted flow in an in-app browser. We don't strictly need
      // the redirect here because the webhook is the source of truth; this
      // is purely for UX (closes the browser when the user finishes).
      const result = await WebBrowser.openAuthSessionAsync(
        url,
        "Golfmatch://onboarding/kyc-callback",
      );

      // If the user dismissed the browser before completing Didit, no webhook
      // will fire — return to intro instead of leaving them on the spinner.
      // The realtime subscription only advances on `approved` / `rejected`.
      if (result.type === "cancel" || result.type === "dismiss") {
        setPhase("intro");
        return;
      }

      // After the browser closes successfully, fall back to the realtime
      // subscription. If the webhook has already landed, that handler
      // navigates onward; otherwise we sit on the "verifying" state until
      // the 90s slowReview escape hatch kicks in.
    } catch (err: any) {
      setPhase("intro");
      setErrorMessage(err?.message ?? "Couldn't start verification.");
    }
  };

  const renderBody = () => {
    if (phase === "waiting") {
      // showLongWait flips when Didit confirms human review (realtime →
      // liveKycStatus) OR when our 90s timer fires (network was slow / event
      // was missed). Either signal is enough.
      const showLongWait =
        slowReview || liveKycStatus === "pending_review";
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
            {showLongWait ? "Under review" : "Verifying your account…"}
          </Text>
          <Text style={styles.waitingBody}>
            {showLongWait
              ? "Your ID is being reviewed by a real person. This usually completes within a few hours, sometimes up to 24 hours. You can close the app — we'll unlock it automatically when you're approved."
              : "This usually takes a few seconds. You'll be moved forward automatically once your ID is verified."}
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
                Retry with new photos
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
        <View style={styles.iconCircle}>
          <Ionicons name="shield-checkmark" size={48} color={Colors.primary} />
        </View>
        <Text style={styles.bullet}>
          <Text style={styles.bulletStrong}>1. </Text>Take a photo of a
          government ID (driver's license or passport)
        </Text>
        <Text style={styles.bullet}>
          <Text style={styles.bulletStrong}>2. </Text>Take a selfie so we can
          match it to your ID
        </Text>
        <Text style={styles.bullet}>
          <Text style={styles.bulletStrong}>3. </Text>That's it. Verification
          is automatic and takes about 30 seconds.
        </Text>

        <Text style={styles.privacy}>
          GolfMatch uses Didit to verify identity. Your ID is only used to
          confirm you're a real adult — it isn't shown on your profile and
          isn't stored after verification.
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
      </View>
    );
  };

  return (
    <OnboardingShell
      step={4}
      title="Verify your identity"
      subtitle="Required for safety. Takes about a minute, fully automatic."
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
