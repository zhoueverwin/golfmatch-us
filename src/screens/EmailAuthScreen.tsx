import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Pressable,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../constants/colors";
import { Typography } from "../constants/typography";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabase";
import { RootStackParamList } from "../types";
import Loading from "../components/Loading";

type Nav = StackNavigationProp<RootStackParamList, "EmailAuth">;

type Mode = "signin" | "signup";

const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EmailAuthScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { signInWithEmail, signUpWithEmail, loading, user } = useAuth();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // If the auth state flips to "signed in" while this screen is mounted,
  // pop back. AppNavigator will route the now-authenticated user to
  // onboarding or main as appropriate.
  useEffect(() => {
    if (user && navigation.canGoBack()) navigation.goBack();
  }, [user, navigation]);

  const isSignUp = mode === "signup";
  const trimmedEmail = email.trim();
  const emailValid = EMAIL_RE.test(trimmedEmail);
  const passwordValid = password.length >= MIN_PASSWORD;
  const passwordsMatch = !isSignUp || password === confirmPassword;
  const canSubmit =
    emailValid && passwordValid && passwordsMatch && !submitting;

  const switchMode = (next: Mode) => {
    if (submitting) return;
    setMode(next);
    setError(null);
    setInfo(null);
    setConfirmPassword("");
    setShowConfirm(false);
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      const result = isSignUp
        ? await signUpWithEmail(trimmedEmail, password)
        : await signInWithEmail(trimmedEmail, password);

      // authService returns three shapes:
      //   { success: true, session: ... }                  → real sign-in/sign-up; AppNavigator routes
      //   { success: true, error: "Please check email..." }→ confirmation required (info, not error)
      //   { success: false, error: "..." }                 → hard error
      // We previously only handled the third case, which is why repeat-signups
      // with an unverified/OAuth-linked email looked like "no reaction".
      if (!result.success) {
        setError(result.error || "Something went wrong. Please try again.");
      } else if (result.error) {
        // Truthy error on a successful response = informational notice
        // (email confirmation pending, etc.). Show it so the user knows
        // the next action.
        setInfo(result.error);
      }
      // On a clean success the useEffect above pops back when AuthContext
      // updates the `user` field.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <Loading fullScreen />;
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[
          "rgba(255, 255, 255, 1)",
          "rgba(156, 255, 252, 0.75)",
          "rgba(0, 184, 177, 0.5)",
        ]}
        locations={[0, 0.5, 1]}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.backgroundGradient}
      />
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          style={styles.kav}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          {/* Header — back chevron only */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={8}
              disabled={submitting}
            >
              <Ionicons name="chevron-back" size={24} color={Colors.text.primary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Mode toggle pill — Sign in | Sign up */}
            <View style={styles.toggleWrap}>
              <Pressable
                onPress={() => switchMode("signin")}
                style={[
                  styles.toggleOption,
                  !isSignUp && styles.toggleOptionActive,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Sign in mode"
                accessibilityState={{ selected: !isSignUp }}
              >
                <Text
                  style={[
                    styles.toggleText,
                    !isSignUp && styles.toggleTextActive,
                  ]}
                >
                  Sign in
                </Text>
              </Pressable>
              <Pressable
                onPress={() => switchMode("signup")}
                style={[
                  styles.toggleOption,
                  isSignUp && styles.toggleOptionActive,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Sign up mode"
                accessibilityState={{ selected: isSignUp }}
              >
                <Text
                  style={[
                    styles.toggleText,
                    isSignUp && styles.toggleTextActive,
                  ]}
                >
                  Sign up
                </Text>
              </Pressable>
            </View>

            <Text style={styles.title}>
              {isSignUp ? "Let's get you in." : "Welcome back."}
            </Text>
            <Text style={styles.subtitle}>
              {isSignUp
                ? "Just an email and a password to get started."
                : "Pick up where you left off."}
            </Text>

            {/* Email */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  if (error) setError(null);
                  if (info) setInfo(null);
                }}
                placeholder="you@example.com"
                placeholderTextColor={Colors.text.tertiary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                // textContentType differs by mode so iOS associates a
                // generated strong password with the right "user" record:
                //  - signup → "username" (new account being created)
                //  - signin → "emailAddress" (existing saved account)
                autoComplete={isSignUp ? "username-new" : "email"}
                textContentType={isSignUp ? "username" : "emailAddress"}
                editable={!submitting}
                returnKeyType="next"
              />
            </View>

            {/* Password */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputWithIcon}>
                <TextInput
                  style={[styles.input, styles.inputWithRightIcon]}
                  value={password}
                  onChangeText={(v) => {
                    setPassword(v);
                    if (error) setError(null);
                  }}
                  placeholder={
                    isSignUp ? `At least ${MIN_PASSWORD} characters` : "Your password"
                  }
                  placeholderTextColor={Colors.text.tertiary}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  textContentType={isSignUp ? "newPassword" : "password"}
                  passwordRules={
                    isSignUp
                      ? `minlength: ${MIN_PASSWORD}; required: lower; required: upper; required: digit;`
                      : undefined
                  }
                  editable={!submitting}
                  returnKeyType={isSignUp ? "next" : "go"}
                  onSubmitEditing={isSignUp ? undefined : handleSubmit}
                />
                {/* Clear button — appears when the field has content. iOS
                    hides its native clear button on secureTextEntry fields,
                    which makes it hard to wipe an autofilled strong password
                    when the user wants to type their own. */}
                {password.length > 0 && !submitting ? (
                  <TouchableOpacity
                    onPress={() => setPassword("")}
                    style={styles.clearButton}
                    accessibilityRole="button"
                    accessibilityLabel="Clear password"
                    hitSlop={8}
                  >
                    <Ionicons
                      name="close-circle"
                      size={18}
                      color={Colors.text.tertiary}
                    />
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  onPress={() => setShowPassword((s) => !s)}
                  style={styles.eyeButton}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                  hitSlop={8}
                >
                  <Ionicons
                    name={showPassword ? "eye-off" : "eye"}
                    size={20}
                    color={Colors.text.tertiary}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Confirm password — sign-up only */}
            {isSignUp && (
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Confirm password</Text>
                <View style={styles.inputWithIcon}>
                  <TextInput
                    style={[styles.input, styles.inputWithRightIcon]}
                    value={confirmPassword}
                    onChangeText={(v) => {
                      setConfirmPassword(v);
                      if (error) setError(null);
                    }}
                    placeholder="Type your password again"
                    placeholderTextColor={Colors.text.tertiary}
                    secureTextEntry={!showConfirm}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="new-password"
                    textContentType="newPassword"
                    passwordRules={`minlength: ${MIN_PASSWORD}; required: lower; required: upper; required: digit;`}
                    editable={!submitting}
                    returnKeyType="go"
                    onSubmitEditing={handleSubmit}
                  />
                  {confirmPassword.length > 0 && !submitting ? (
                    <TouchableOpacity
                      onPress={() => setConfirmPassword("")}
                      style={styles.clearButton}
                      accessibilityRole="button"
                      accessibilityLabel="Clear password"
                      hitSlop={8}
                    >
                      <Ionicons
                        name="close-circle"
                        size={18}
                        color={Colors.text.tertiary}
                      />
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    onPress={() => setShowConfirm((s) => !s)}
                    style={styles.eyeButton}
                    accessibilityRole="button"
                    accessibilityLabel={showConfirm ? "Hide password" : "Show password"}
                    hitSlop={8}
                  >
                    <Ionicons
                      name={showConfirm ? "eye-off" : "eye"}
                      size={20}
                      color={Colors.text.tertiary}
                    />
                  </TouchableOpacity>
                </View>
                {confirmPassword.length > 0 && password !== confirmPassword ? (
                  <Text style={styles.fieldError}>Passwords don't match.</Text>
                ) : null}
              </View>
            )}

            {/* Error / info banner */}
            {error ? (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={18} color={Colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
            {info ? (
              <View style={styles.infoBanner}>
                <Ionicons
                  name="checkmark-circle"
                  size={18}
                  color={Colors.success}
                />
                <Text style={styles.infoText}>{info}</Text>
              </View>
            ) : null}

            {/* Primary CTA */}
            <TouchableOpacity
              style={[
                styles.primaryButton,
                !canSubmit && styles.primaryButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!canSubmit}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <Text
                style={[
                  styles.primaryButtonText,
                  !canSubmit && styles.primaryButtonTextDisabled,
                ]}
              >
                {submitting
                  ? isSignUp
                    ? "Creating account…"
                    : "Signing in…"
                  : isSignUp
                    ? "Sign up"
                    : "Sign in"}
              </Text>
            </TouchableOpacity>

            <Text style={styles.ageNotice}>
              You must be 18 or older to sign up.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  backgroundGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  safeArea: { flex: 1 },
  kav: { flex: 1 },

  header: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.9)",
  },

  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 12,
    paddingBottom: 32,
  },

  // Mode toggle pill — ink active state with gold text, matches the
  // paywall + onboarding shell editorial register. Inactive options use
  // muted ink-soft on cream so the active mode reads as confidently chosen.
  toggleWrap: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.85)",
    borderRadius: 999,
    padding: 4,
    alignSelf: "center",
    marginBottom: 32,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E8E0CB", // inkLine
  },
  toggleOption: {
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 999,
  },
  toggleOptionActive: {
    backgroundColor: "#14342B", // ink
  },
  toggleText: {
    fontSize: 13,
    fontFamily: "Manrope_600SemiBold",
    color: "#3F5A50", // inkSoft
    letterSpacing: 0.2,
  },
  toggleTextActive: {
    color: "#F4D35E", // gold
  },

  title: {
    fontSize: 32,
    fontFamily: "Fraunces_600SemiBold",
    color: "#14342B", // ink
    marginBottom: 8,
    letterSpacing: -0.6,
    lineHeight: 36,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Manrope_400Regular",
    color: "#3F5A50", // inkSoft
    marginBottom: 26,
    lineHeight: 21,
  },

  fieldGroup: { marginBottom: 16 },
  label: {
    fontSize: 11,
    fontFamily: "Manrope_700Bold",
    color: "#3F5A50", // inkSoft
    marginBottom: 8,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  input: {
    height: 52,
    paddingHorizontal: 16,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E8E0CB", // inkLine
    fontSize: 16,
    fontFamily: "Manrope_400Regular",
    color: "#14342B", // ink
  },
  inputWithIcon: {
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
  },
  inputWithRightIcon: {
    flex: 1,
    // Room for both clear (×) + eye (👁) on the right side.
    paddingRight: 76,
  },
  eyeButton: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 0,
    width: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  // Clear (×) button sits to the LEFT of the eye, only when the field has
  // content. Gives the user an explicit way to wipe an autofilled strong
  // password since iOS hides its native clearButton on secureTextEntry.
  clearButton: {
    position: "absolute",
    right: 44,
    top: 0,
    bottom: 0,
    width: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldError: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.error,
    marginTop: 6,
    marginLeft: 4,
  },

  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.2)",
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.error,
    lineHeight: 19,
  },
  infoBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(34, 197, 94, 0.08)",
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.2)",
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.success,
    lineHeight: 19,
  },

  // Primary CTA — ink fill with gold text, matches the AuthScreen email
  // button + paywall "Unlock Premium" button. Same shape across the whole
  // signup-to-purchase flow so users build muscle memory.
  primaryButton: {
    height: 56,
    borderRadius: 999,
    backgroundColor: "#14342B", // ink
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    shadowColor: "#14342B",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 6,
  },
  primaryButtonDisabled: {
    backgroundColor: "#F2EBD9", // cream2 — soft disabled state
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryButtonText: {
    fontSize: 16,
    fontFamily: "Manrope_600SemiBold",
    color: "#F4D35E", // gold
    letterSpacing: 0.3,
  },
  primaryButtonTextDisabled: {
    color: "#88806A", // muted
  },

  ageNotice: {
    fontSize: 12,
    fontFamily: "Manrope_500Medium",
    color: "#88806A", // muted
    textAlign: "center",
    marginTop: 18,
    letterSpacing: 0.2,
  },
});

export default EmailAuthScreen;
