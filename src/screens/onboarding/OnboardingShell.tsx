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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { Colors } from "../../constants/colors";
import { Typography } from "../../constants/typography";
import { Spacing, BorderRadius } from "../../constants/spacing";
import { useAuth } from "../../contexts/AuthContext";
import { RootStackParamList } from "../../types";

const TOTAL_STEPS = 5;

type Nav = StackNavigationProp<RootStackParamList>;

interface Props {
  step: number; // 1..5 (Done screen sets step={TOTAL_STEPS + 1})
  title: string;
  subtitle?: string;
  /** Disables the Continue button while a save is in flight or input is invalid. */
  continueDisabled?: boolean;
  /** Label override (e.g. "Get started" on the Done screen). */
  continueLabel?: string;
  /** Called when the user taps Continue. */
  onContinue: () => void;
  /** Optional secondary button shown below Continue (e.g. "Skip for now"). */
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Hides the back arrow (used on step 1, where Sign out replaces it). */
  hideBack?: boolean;
  /** Shows the Sign out escape hatch in the top-right (step 1 only). */
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

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header: back / progress dots / sign out.
            Back arrow hides automatically when there's no previous screen
            (e.g. KYC is the first screen in the returning-user gate stack). */}
        <View style={styles.header}>
          <View style={styles.headerSide}>
            {!hideBack && navigation.canGoBack() && (
              <TouchableOpacity
                onPress={() => navigation.goBack()}
                style={styles.iconButton}
                accessibilityRole="button"
                accessibilityLabel="Back"
              >
                <Ionicons name="chevron-back" size={24} color={Colors.text.primary} />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.dotsRow}>
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i < step ? styles.dotFilled : styles.dotEmpty,
                ]}
              />
            ))}
          </View>

          <View style={styles.headerSide}>
            {showSignOut && (
              <TouchableOpacity
                onPress={handleSignOut}
                style={styles.signOutButton}
                accessibilityRole="button"
                accessibilityLabel="Sign out"
              >
                <Text style={styles.signOutText}>Sign out</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Body */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <View style={styles.bodyContent}>{children}</View>
        </ScrollView>

        {/* Footer buttons.
            An explicit empty `continueLabel=""` hides the primary button so
            screens with their own CTA (e.g. KYC) don't render a dead gray bar. */}
        {continueLabel !== "" ? (
          <View style={styles.footer}>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                continueDisabled && styles.primaryButtonDisabled,
              ]}
              onPress={onContinue}
              disabled={continueDisabled}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={continueLabel ?? "Continue"}
            >
              <Text style={styles.primaryButtonText}>
                {continueLabel ?? "Continue"}
              </Text>
            </TouchableOpacity>

            {secondaryLabel && onSecondary ? (
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={onSecondary}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={secondaryLabel}
              >
                <Text style={styles.secondaryButtonText}>{secondaryLabel}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  kav: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  headerSide: {
    width: 80,
    justifyContent: "center",
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  signOutButton: {
    alignItems: "flex-end",
    paddingVertical: Spacing.xs,
  },
  signOutText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
  },
  dotsRow: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    width: 28,
    height: 4,
    borderRadius: 2,
  },
  dotFilled: {
    backgroundColor: Colors.primary,
  },
  dotEmpty: {
    backgroundColor: Colors.gray[200],
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  title: {
    fontSize: Typography.fontSize["2xl"],
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text.primary,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    marginBottom: Spacing.xl,
    lineHeight: 22,
  },
  bodyContent: {
    flex: 1,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  primaryButton: {
    height: 56,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonDisabled: {
    backgroundColor: Colors.gray[300],
  },
  primaryButtonText: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    fontWeight: Typography.fontWeight.bold,
    color: Colors.white,
  },
  secondaryButton: {
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  secondaryButtonText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    textDecorationLine: "underline",
  },
});

export default OnboardingShell;
