import React, { ReactNode, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from "react-native-reanimated";
import Svg, { Defs, RadialGradient, Stop, Rect } from "react-native-svg";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { RootStackParamList } from "../../types";
import { useAuth } from "../../contexts/AuthContext";

// Effective onboarding length — the numbered funnel ends at Photo. Flow:
//   Name (1) → Birthdate (2) → Gender (3) → State (4) →
//   Location (5) → Photo (6) → [paywall: unnumbered] → [liveness: unnumbered]
const TOTAL_STEPS = 6;

// Editorial palette — mirrors OnboardingPaywallScreen so the funnel + paywall
// read as one continuous product instead of two stitched-together visual
// languages. Treat these as the source of truth for any new onboarding UI.
const C = {
  ink: "#14342B",
  inkSoft: "#3F5A50",
  inkLine: "#E8E0CB",
  teal: "#0E7C73",
  tealMint: "#D4EDE9",
  gold: "#F4D35E",
  goldDeep: "#E0B743",
  cream: "#FAF6EE",
  cream2: "#F2EBD9",
  paper: "#FFFFFF",
  muted: "#88806A",
};

const F = {
  display: "Fraunces_600SemiBold",
  displayReg: "Fraunces_400Regular",
  displayItalic: "Fraunces_400Regular_Italic",
  sans: "Manrope_400Regular",
  sansMed: "Manrope_500Medium",
  sansSemi: "Manrope_600SemiBold",
  sansBold: "Manrope_700Bold",
};

type Nav = StackNavigationProp<RootStackParamList>;

interface Props {
  // Funnel step (1..TOTAL_STEPS). Pass `undefined` for post-funnel screens
  // (paywall, liveness) — the progress rail and step label are hidden.
  step?: number;
  // Optional override for the kicker line above the title. Defaults to
  // "STEP NN · OF SIX" when `step` is provided, or null when it isn't.
  // Screens can pass thematic labels like "PORTRAIT" / "INTRODUCTION".
  kicker?: string;
  title: string;
  subtitle?: string;
  continueDisabled?: boolean;
  continueLabel?: string;
  onContinue: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  hideBack?: boolean;
  showSignOut?: boolean;
  children: ReactNode;
}

// Zero-pad a step number so the kicker reads "STEP 01 · OF SIX" rather than
// "STEP 1 · OF 6". The pad mirrors the paywall's editorial section markers.
const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const SPELL_OUT = ["ZERO", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN"];

const OnboardingShell: React.FC<Props> = ({
  step,
  kicker,
  title,
  subtitle,
  continueDisabled,
  continueLabel,
  onContinue,
  secondaryLabel,
  onSecondary,
  hideBack,
  showSignOut,
  children,
}) => {
  const navigation = useNavigation<Nav>();
  const { signOut } = useAuth();
  const buttonScale = useSharedValue(1);

  // Slow breath on the progress rail — gold gradient subtly brightens
  // 0.78 → 1.0 over 2.6s, then back. Restrained, not flashing. Only runs
  // when there's a progress rail to breathe.
  const railPulse = useSharedValue(0.85);

  const showProgress = typeof step === "number";

  useEffect(() => {
    if (!showProgress) return;
    railPulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.78, { duration: 2600, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [showProgress, railPulse]);

  const handleSignOut = () => {
    Alert.alert(
      "Sign out?",
      "You'll go back to the sign-in screen. Your progress won't be saved.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: async () => {
            await signOut();
          },
        },
      ],
    );
  };

  const progressStep = showProgress ? Math.min(step!, TOTAL_STEPS) : 0;
  const progressPercent = (progressStep / TOTAL_STEPS) * 100;

  // Default kicker derived from the step number when a custom one isn't
  // provided. Format: "STEP 03 · OF SIX" — gives the funnel a chapter-
  // marker feel without requiring every screen to compose its own.
  const defaultKicker = showProgress
    ? `STEP ${pad2(progressStep)} \u00B7 OF SIX`
    : null;
  const kickerText = kicker ?? defaultKicker;

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const railOpacityStyle = useAnimatedStyle(() => ({
    opacity: railPulse.value,
  }));

  return (
    <View style={styles.root}>
      {/* Cream paper base */}
      <View style={styles.creamBase} />

      {/* Atmospheric gold halo — wide soft radial bleed at the top of the
          screen, echoing the paywall's halo behind the diamond. Sets a warm
          editorial tone without competing with content. */}
      <Svg style={styles.halo} width={520} height={520} pointerEvents="none">
        <Defs>
          <RadialGradient
            id="onboardHalo"
            cx="50%"
            cy="50%"
            rx="50%"
            ry="50%"
            fx="50%"
            fy="50%"
          >
            <Stop offset="0%" stopColor={C.gold} stopOpacity={0.42} />
            <Stop offset="55%" stopColor={C.gold} stopOpacity={0.06} />
            <Stop offset="100%" stopColor={C.gold} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#onboardHalo)" />
      </Svg>

      {/* Lower-right teal whisper — barely there, gives depth and stops the
          screen from feeling flat at the bottom near the CTA. */}
      <Svg
        style={styles.tealBleed}
        width={480}
        height={480}
        pointerEvents="none"
      >
        <Defs>
          <RadialGradient
            id="onboardTealBleed"
            cx="50%"
            cy="50%"
            rx="50%"
            ry="50%"
            fx="50%"
            fy="50%"
          >
            <Stop offset="0%" stopColor={C.teal} stopOpacity={0.1} />
            <Stop offset="60%" stopColor={C.teal} stopOpacity={0.02} />
            <Stop offset="100%" stopColor={C.teal} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#onboardTealBleed)" />
      </Svg>

      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          style={styles.kav}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          {/* Header — minimalist trio: back chevron, centered kicker + rail,
              text-only sign-out. No pill bordering; the cream surface
              already gives separation. */}
          <View style={styles.header}>
            <View style={styles.headerSide}>
              {!hideBack && navigation.canGoBack() && (
                <Pressable
                  onPress={() => navigation.goBack()}
                  style={({ pressed }) => [
                    styles.iconButton,
                    pressed && { opacity: 0.55 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Back"
                  hitSlop={8}
                >
                  <Ionicons name="chevron-back" size={20} color={C.ink} />
                </Pressable>
              )}
            </View>

            <View style={styles.headerCenter}>
              {showProgress ? (
                <Animated.View
                  entering={FadeIn.duration(360)}
                  style={styles.railWrap}
                >
                  {/* Track — ink-tinted cream so it doesn't disappear on
                      gold fill. The fill animates breath via opacity. */}
                  <View style={styles.progressTrack}>
                    <Animated.View
                      style={[
                        styles.progressFillContainer,
                        { width: `${progressPercent}%` },
                        railOpacityStyle,
                      ]}
                    >
                      <LinearGradient
                        colors={[C.gold, C.goldDeep]}
                        start={{ x: 0, y: 0.5 }}
                        end={{ x: 1, y: 0.5 }}
                        style={StyleSheet.absoluteFillObject}
                      />
                    </Animated.View>
                  </View>
                </Animated.View>
              ) : null}
            </View>

            <View style={[styles.headerSide, styles.headerSideRight]}>
              {showSignOut && (
                <Pressable
                  onPress={handleSignOut}
                  style={({ pressed }) => [
                    styles.signOutLink,
                    pressed && { opacity: 0.55 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Sign out"
                  hitSlop={8}
                >
                  <Text style={styles.signOutText} numberOfLines={1}>
                    Sign out
                  </Text>
                </Pressable>
              )}
            </View>
          </View>

          {/* Body — choreographed entrance:
                kicker (40)  →  title (120)  →  subtitle (220)  →
                content (320)  →  CTA (420)
              Each spring-damped, none distracting. */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {kickerText ? (
              <Animated.Text
                entering={FadeInDown.duration(420).delay(40).springify().damping(20)}
                style={styles.kicker}
              >
                {kickerText}
              </Animated.Text>
            ) : null}

            <Animated.Text
              entering={FadeInDown.duration(480).delay(120).springify().damping(18)}
              style={styles.title}
            >
              {title}
            </Animated.Text>

            {subtitle ? (
              <Animated.Text
                entering={FadeInDown.duration(480).delay(220).springify().damping(18)}
                style={styles.subtitle}
              >
                {subtitle}
              </Animated.Text>
            ) : null}

            <Animated.View
              entering={FadeInDown.duration(520).delay(320).springify().damping(18)}
              style={styles.bodyContent}
            >
              {children}
            </Animated.View>
          </ScrollView>

          {/* Footer — ink CTA with gold label + arrow. Same visual contract
              as the paywall's "Unlock Premium →" so users see a single
              recognizable button shape across the whole flow.
              An explicit empty `continueLabel=""` hides the whole footer. */}
          {continueLabel !== "" ? (
            <Animated.View
              entering={FadeIn.duration(420).delay(420)}
              style={styles.footer}
            >
              <Pressable
                onPressIn={() => {
                  if (!continueDisabled) {
                    buttonScale.value = withTiming(0.97, {
                      duration: 110,
                      easing: Easing.out(Easing.quad),
                    });
                  }
                }}
                onPressOut={() => {
                  // Two-stage release — quick rebound past 1.0, then settle.
                  // Reads as a tiny haptic flick without actual haptics.
                  buttonScale.value = withSequence(
                    withTiming(1.015, { duration: 110, easing: Easing.out(Easing.cubic) }),
                    withSpring(1, { damping: 14, stiffness: 240, mass: 0.6 }),
                  );
                }}
                onPress={onContinue}
                disabled={continueDisabled}
                accessibilityRole="button"
                accessibilityLabel={continueLabel ?? "Continue"}
              >
                <Animated.View
                  style={[
                    styles.primaryButton,
                    continueDisabled && styles.primaryButtonDisabled,
                    buttonAnimatedStyle,
                  ]}
                >
                  <Text
                    style={[
                      styles.primaryButtonText,
                      continueDisabled && styles.primaryButtonTextDisabled,
                    ]}
                  >
                    {continueLabel ?? "Continue"}
                    {!continueDisabled ? (
                      <Text style={styles.primaryButtonArrow}>{"  →"}</Text>
                    ) : null}
                  </Text>
                </Animated.View>
              </Pressable>

              {secondaryLabel && onSecondary ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed && { opacity: 0.55 },
                  ]}
                  onPress={onSecondary}
                  accessibilityRole="button"
                  accessibilityLabel={secondaryLabel}
                >
                  <Text style={styles.secondaryButtonText}>
                    {secondaryLabel}
                  </Text>
                </Pressable>
              ) : null}
            </Animated.View>
          ) : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.cream,
  },
  creamBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.cream,
  },
  // Atmospheric layers — both bleed beyond the viewport so the eye reads
  // them as ambient light rather than UI shapes.
  halo: {
    position: "absolute",
    top: -200,
    alignSelf: "center",
  },
  tealBleed: {
    position: "absolute",
    bottom: -200,
    right: -160,
  },
  safeArea: { flex: 1 },
  kav: { flex: 1 },

  // Header rail
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 14,
    gap: 12,
  },
  headerSide: {
    width: 96,
    justifyContent: "center",
  },
  headerSideRight: {
    alignItems: "flex-end",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    gap: 8,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.inkLine,
  },
  signOutLink: {
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  signOutText: {
    fontFamily: F.sansMed,
    fontSize: 12.5,
    color: C.inkSoft,
    letterSpacing: 0.3,
  },

  // Progress rail — gold gradient over a cream2 track. The rail is the
  // only "primary" colored element on screen so it actually reads as
  // progress instead of decoration.
  railWrap: {
    width: "100%",
    alignItems: "center",
    gap: 8,
  },
  progressTrack: {
    width: "100%",
    height: 3,
    borderRadius: 2,
    backgroundColor: C.cream2,
    overflow: "hidden",
  },
  progressFillContainer: {
    height: "100%",
    borderRadius: 2,
    overflow: "hidden",
  },

  // Scroll body
  scroll: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 26,
    paddingTop: 18,
    paddingBottom: 24,
  },

  // Editorial kicker — small, gold-deep, generously letter-spaced. The
  // smallest piece of type on the screen but it sets the tone.
  kicker: {
    fontFamily: F.sansBold,
    fontSize: 10.5,
    letterSpacing: 2.6,
    color: C.goldDeep,
    textTransform: "uppercase",
    marginBottom: 14,
  },

  // Fraunces serif headline. Tight letter-spacing + display weight to
  // match the paywall hero. lineHeight kept compact so two-line titles
  // (most onboarding questions) hold together as one visual block.
  title: {
    fontFamily: F.display,
    fontSize: 40,
    lineHeight: 44,
    color: C.ink,
    letterSpacing: -1.1,
    marginBottom: 12,
  },
  subtitle: {
    fontFamily: F.sans,
    fontSize: 15,
    lineHeight: 24,
    color: C.inkSoft,
    marginBottom: 28,
    maxWidth: "94%",
  },
  bodyContent: { flex: 1 },

  // Footer + buttons
  footer: {
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 6,
  },
  primaryButton: {
    height: 58,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.ink,
    // Subtle ink shadow + gold-rim glow approximation. RN doesn't support
    // multi-layer shadows; pick the more important one (depth) here.
    shadowColor: C.ink,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.28,
    shadowRadius: 22,
    elevation: 8,
  },
  primaryButtonDisabled: {
    backgroundColor: C.cream2,
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryButtonText: {
    fontFamily: F.sansSemi,
    fontSize: 16,
    color: C.gold,
    letterSpacing: 0.3,
  },
  primaryButtonArrow: {
    fontFamily: F.sansSemi,
    fontSize: 16,
    color: C.gold,
  },
  primaryButtonTextDisabled: {
    color: C.muted,
  },
  secondaryButton: {
    alignItems: "center",
    paddingVertical: 14,
  },
  secondaryButtonText: {
    fontFamily: F.sansMed,
    fontSize: 13.5,
    color: C.teal,
    textDecorationLine: "underline",
  },
});

export default OnboardingShell;
