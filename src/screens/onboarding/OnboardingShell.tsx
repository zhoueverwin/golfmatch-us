import React, { ReactNode } from "react";
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
} from "react-native-reanimated";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { Colors } from "../../constants/colors";
import { Typography } from "../../constants/typography";
import { Spacing, BorderRadius, Shadows } from "../../constants/spacing";
import { useAuth } from "../../contexts/AuthContext";
import { RootStackParamList } from "../../types";

// Effective onboarding length. Flow:
//   Name (1) → State (2) → Location (3) → Photo (4) → KYC (5)
// Gender + Birthdate are derived from Didit's ID verdict, not asked again.
const TOTAL_STEPS = 5;

type Nav = StackNavigationProp<RootStackParamList>;

interface Props {
  step: number; // 1..5 (Done sets step={TOTAL_STEPS + 1})
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

const OnboardingShell: React.FC<Props> = ({
  step,
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

  // Step can exceed TOTAL_STEPS on the Done screen; cap for the bar width.
  const progressStep = Math.min(step, TOTAL_STEPS);
  const progressPercent = (progressStep / TOTAL_STEPS) * 100;

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  return (
    <View style={styles.root}>
      {/* Layered atmosphere: white → mint gradient + two soft color blobs
          that bleed off-screen. Sets a spa/coastal mood without competing
          with the form content. */}
      <LinearGradient
        colors={["#FFFFFF", "#F5FBFA", "#EBF7F5"]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={[styles.blob, styles.blobTopLeft]} />
      <View style={[styles.blob, styles.blobBottomRight]} />

      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          style={styles.kav}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          {/* Header: hairline-bordered back / progress rail with step label /
              sign-out pill. Back hides automatically when there's nowhere to
              go (e.g. KYC as the first screen in the returning-user gate). */}
          <View style={styles.header}>
            <View style={styles.headerSide}>
              {!hideBack && navigation.canGoBack() && (
                <TouchableOpacity
                  onPress={() => navigation.goBack()}
                  style={styles.iconButton}
                  accessibilityRole="button"
                  accessibilityLabel="Back"
                  activeOpacity={0.75}
                >
                  <Ionicons
                    name="chevron-back"
                    size={20}
                    color={Colors.text.primary}
                  />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.headerCenter}>
              <Text style={styles.stepLabel}>
                STEP {progressStep}
                <Text style={styles.stepLabelDim}>  ·  {TOTAL_STEPS}</Text>
              </Text>
              <View style={styles.progressTrack}>
                <LinearGradient
                  colors={[Colors.primaryLight, Colors.primary]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={[styles.progressFill, { width: `${progressPercent}%` }]}
                />
              </View>
            </View>

            <View style={[styles.headerSide, styles.headerSideRight]}>
              {showSignOut && (
                <TouchableOpacity
                  onPress={handleSignOut}
                  style={styles.signOutPill}
                  accessibilityRole="button"
                  accessibilityLabel="Sign out"
                  activeOpacity={0.75}
                >
                  {/* numberOfLines={1} is a defensive backstop — the rail
                      is now wide enough for the text on every supported
                      device, but small-screen iPhones with bumped font
                      scaling could still push it. Truncation is preferable
                      to a two-line pill. */}
                  <Text style={styles.signOutText} numberOfLines={1}>
                    Sign out
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Body — staggered entry for title, subtitle, content */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Animated.Text
              entering={FadeInDown.duration(450).delay(50).springify().damping(18)}
              style={styles.title}
            >
              {title}
            </Animated.Text>
            {subtitle ? (
              <Animated.Text
                entering={FadeInDown.duration(450).delay(150).springify().damping(18)}
                style={styles.subtitle}
              >
                {subtitle}
              </Animated.Text>
            ) : null}
            <Animated.View
              entering={FadeInDown.duration(500).delay(250).springify().damping(18)}
              style={styles.bodyContent}
            >
              {children}
            </Animated.View>
          </ScrollView>

          {/* Footer — gradient pill button with press-scale feedback.
              An explicit empty `continueLabel=""` hides the whole footer so
              screens with their own CTA (e.g. KYC) don't render a dead bar. */}
          {continueLabel !== "" ? (
            <Animated.View
              entering={FadeIn.duration(400).delay(350)}
              style={styles.footer}
            >
              <Pressable
                onPressIn={() => {
                  if (!continueDisabled) {
                    buttonScale.value = withTiming(0.97, { duration: 120 });
                  }
                }}
                onPressOut={() => {
                  buttonScale.value = withSpring(1, { damping: 12, stiffness: 220 });
                }}
                onPress={onContinue}
                disabled={continueDisabled}
                accessibilityRole="button"
                accessibilityLabel={continueLabel ?? "Continue"}
              >
                <Animated.View
                  style={[
                    styles.primaryButton,
                    continueDisabled
                      ? styles.primaryButtonDisabled
                      : Shadows.medium,
                    buttonAnimatedStyle,
                  ]}
                >
                  {!continueDisabled ? (
                    <LinearGradient
                      colors={[Colors.primary, Colors.primaryDark]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFillObject}
                    />
                  ) : null}
                  <Text
                    style={[
                      styles.primaryButtonText,
                      continueDisabled && styles.primaryButtonTextDisabled,
                    ]}
                  >
                    {continueLabel ?? "Continue"}
                  </Text>
                </Animated.View>
              </Pressable>

              {secondaryLabel && onSecondary ? (
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={onSecondary}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                  accessibilityLabel={secondaryLabel}
                >
                  <Text style={styles.secondaryButtonText}>{secondaryLabel}</Text>
                </TouchableOpacity>
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
    backgroundColor: Colors.white,
  },
  safeArea: {
    flex: 1,
  },
  kav: {
    flex: 1,
  },
  // Soft decorative blobs — sit BEHIND content via absolute positioning.
  // Negative offsets make them bleed off-screen so the eye reads them as
  // atmosphere rather than UI elements.
  blob: {
    position: "absolute",
    borderRadius: 9999,
  },
  blobTopLeft: {
    width: 280,
    height: 280,
    top: -120,
    left: -100,
    backgroundColor: Colors.lightGreen,
    opacity: 0.32,
  },
  blobBottomRight: {
    width: 380,
    height: 380,
    bottom: -180,
    right: -160,
    backgroundColor: Colors.primary,
    opacity: 0.07,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  headerSide: {
    // Symmetric left/right side rails. Sized to fit the right-side
    // "Sign out" pill without wrapping: text(~55px) + pill padding(2×16)
    // ≈ 87px, so 96 leaves ~9px of breathing room. Left rail uses the
    // same width to keep the centered progress bar truly centered.
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
  stepLabel: {
    fontSize: 11,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.primary,
    letterSpacing: 2.5,
  },
  stepLabelDim: {
    color: Colors.text.tertiary,
    fontWeight: Typography.fontWeight.normal,
  },
  progressTrack: {
    width: "100%",
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.gray[100],
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  signOutPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  signOutText: {
    fontSize: 13,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text.secondary,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  title: {
    fontSize: 32,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text.primary,
    marginBottom: Spacing.sm,
    letterSpacing: -0.5,
    lineHeight: 38,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    marginBottom: Spacing["2xl"],
    lineHeight: 24,
    maxWidth: "92%",
  },
  bodyContent: {
    flex: 1,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  primaryButton: {
    height: 56,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: Colors.primary,
  },
  primaryButtonDisabled: {
    backgroundColor: Colors.gray[200],
  },
  primaryButtonText: {
    fontSize: 16,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    fontWeight: Typography.fontWeight.bold,
    color: Colors.white,
    letterSpacing: 0.3,
  },
  primaryButtonTextDisabled: {
    color: Colors.gray[400],
  },
  secondaryButton: {
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
    fontWeight: Typography.fontWeight.medium,
    color: Colors.primary,
  },
});

export default OnboardingShell;
