import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { Colors } from "../constants/colors";
import { Spacing, BorderRadius } from "../constants/spacing";
import { Typography } from "../constants/typography";
import { RootStackParamList } from "../types";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabase";
import StandardHeader from "../components/StandardHeader";

type AccountLinkingScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  "AccountLinking"
>;

interface ProviderInfo {
  provider: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  isLinked: boolean;
}

// Sign-in providers the app supports. Email was removed in fa67629 then
// added back here — users now want to link an email/password identity to
// their existing Google/Apple account so they can sign in either way.
const PROVIDER_CONFIG: Record<
  string,
  { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }
> = {
  email: { label: "Email", icon: "mail", color: "#0E7C73" },
  google: { label: "Google", icon: "logo-google", color: "#4285F4" },
  apple: { label: "Apple ID", icon: "logo-apple", color: "#000000" },
};

const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const AccountLinkingScreen: React.FC = () => {
  const navigation = useNavigation<AccountLinkingScreenNavigationProp>();
  const { linkEmail, getUserIdentities } = useAuth();

  const [identities, setIdentities] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);

  // Link-email form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLinking, setIsLinking] = useState(false);

  const isEmailLinked = identities.some(
    (i) => i.provider === "email" && i.isLinked,
  );

  const trimmedEmail = email.trim();
  const isFormValid =
    EMAIL_RE.test(trimmedEmail) &&
    password.length >= MIN_PASSWORD &&
    password === passwordConfirm &&
    !isLinking;

  const fetchIdentities = useCallback(async () => {
    setLoading(true);
    const result = await getUserIdentities();

    // Also pull user_metadata to detect email/password sign-in. Supabase's
    // updateUser({password}) flow sets encrypted_password but does NOT
    // create an 'email' identity row in auth.identities — so we can't
    // tell from identities alone whether the user has password sign-in.
    // We stamp user_metadata.email_signin_enabled=true at link time
    // (see authService.linkEmail).
    const { data: userData } = await supabase.auth.getUser();
    const emailSigninEnabled =
      (userData?.user?.user_metadata as { email_signin_enabled?: boolean })
        ?.email_signin_enabled === true;

    if (result.success && result.identities) {
      const linkedProviders = new Set(
        result.identities.map((id: { provider: string }) => id.provider),
      );
      const providers: ProviderInfo[] = Object.entries(PROVIDER_CONFIG).map(
        ([key, config]) => ({
          provider: key,
          label: config.label,
          icon: config.icon,
          color: config.color,
          isLinked:
            linkedProviders.has(key) ||
            (key === "email" && emailSigninEnabled),
        }),
      );
      setIdentities(providers);
    }
    setLoading(false);
  }, [getUserIdentities]);

  useEffect(() => {
    fetchIdentities();
  }, [fetchIdentities]);

  const handleLinkEmail = async () => {
    if (!EMAIL_RE.test(trimmedEmail)) {
      Alert.alert("Couldn't link", "Please enter a valid email address.");
      return;
    }
    if (password.length < MIN_PASSWORD) {
      Alert.alert(
        "Couldn't link",
        `Password must be at least ${MIN_PASSWORD} characters.`,
      );
      return;
    }
    if (password !== passwordConfirm) {
      Alert.alert("Couldn't link", "Passwords don't match.");
      return;
    }

    setIsLinking(true);
    const result = await linkEmail(trimmedEmail, password);
    setIsLinking(false);

    if (result.success) {
      Alert.alert(
        "Email linked",
        result.message ||
          "Your email has been linked. You can now sign in with your email and password.",
        [
          {
            text: "OK",
            onPress: () => {
              fetchIdentities();
              setEmail("");
              setPassword("");
              setPasswordConfirm("");
              setShowPassword(false);
              setShowConfirm(false);
            },
          },
        ],
      );
    } else {
      Alert.alert("Couldn't link", result.error || "Failed to link email address.");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StandardHeader
        title=""
        showBackButton={true}
        onBackPress={() => navigation.goBack()}
      />
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Linked-status list */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Current Linked Accounts</Text>
            {loading ? (
              <ActivityIndicator
                color={Colors.primary}
                style={styles.loadingIndicator}
              />
            ) : (
              identities.map((provider) => (
                <View key={provider.provider} style={styles.providerRow}>
                  <View
                    style={[
                      styles.providerIcon,
                      { backgroundColor: provider.color + "15" },
                    ]}
                  >
                    <Ionicons
                      name={provider.icon}
                      size={20}
                      color={provider.color}
                    />
                  </View>
                  <Text style={styles.providerLabel}>{provider.label}</Text>
                  {provider.isLinked ? (
                    <View style={styles.linkedBadge}>
                      <Ionicons
                        name="checkmark-circle"
                        size={18}
                        color={Colors.primary}
                      />
                      <Text style={styles.linkedText}>Linked</Text>
                    </View>
                  ) : (
                    <Text style={styles.unlinkedText}>Not linked</Text>
                  )}
                </View>
              ))
            )}
          </View>

          {/* Email link form — only shown when email isn't already linked */}
          {!isEmailLinked && !loading && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Link an Email Address</Text>
              <Text style={styles.description}>
                Add an email and password so you can also sign in with your
                email — alongside Google or Apple.
              </Text>

              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={Colors.gray[400]}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                editable={!isLinking}
              />

              <Text style={styles.inputLabel}>
                Password (at least {MIN_PASSWORD} characters)
              </Text>
              <View style={styles.inputWithIcon}>
                <TextInput
                  style={[styles.input, styles.inputWithRightIcon]}
                  placeholder="Enter a password"
                  placeholderTextColor={Colors.gray[400]}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  passwordRules={`minlength: ${MIN_PASSWORD}; required: lower; required: upper; required: digit;`}
                  editable={!isLinking}
                />
                {password.length > 0 && !isLinking ? (
                  <TouchableOpacity
                    onPress={() => setPassword("")}
                    style={styles.clearButton}
                    accessibilityRole="button"
                    accessibilityLabel="Clear password"
                    hitSlop={8}
                  >
                    <Ionicons name="close-circle" size={18} color={Colors.gray[400]} />
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

              <Text style={styles.inputLabel}>Confirm password</Text>
              <View style={styles.inputWithIcon}>
                <TextInput
                  style={[styles.input, styles.inputWithRightIcon]}
                  placeholder="Type your password again"
                  placeholderTextColor={Colors.gray[400]}
                  value={passwordConfirm}
                  onChangeText={setPasswordConfirm}
                  secureTextEntry={!showConfirm}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  passwordRules={`minlength: ${MIN_PASSWORD}; required: lower; required: upper; required: digit;`}
                  editable={!isLinking}
                />
                {passwordConfirm.length > 0 && !isLinking ? (
                  <TouchableOpacity
                    onPress={() => setPasswordConfirm("")}
                    style={styles.clearButton}
                    accessibilityRole="button"
                    accessibilityLabel="Clear password"
                    hitSlop={8}
                  >
                    <Ionicons name="close-circle" size={18} color={Colors.gray[400]} />
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
              {passwordConfirm.length > 0 && password !== passwordConfirm ? (
                <Text style={styles.fieldError}>Passwords don't match.</Text>
              ) : null}

              <TouchableOpacity
                style={[
                  styles.linkButton,
                  !isFormValid && styles.linkButtonDisabled,
                ]}
                onPress={handleLinkEmail}
                disabled={!isFormValid}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                {isLinking ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text
                    style={[
                      styles.linkButtonText,
                      !isFormValid && styles.linkButtonTextDisabled,
                    ]}
                  >
                    Link Email
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: 40,
    gap: Spacing.md,
  },
  section: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    fontFamily: Typography.getFontFamily("600"),
    color: Colors.text.primary,
    marginBottom: 16,
  },
  description: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    lineHeight: 19,
    marginBottom: 16,
  },
  loadingIndicator: {
    paddingVertical: Spacing.lg,
  },
  providerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  providerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  providerLabel: {
    fontSize: 15,
    fontWeight: "500",
    fontFamily: Typography.getFontFamily("500"),
    color: Colors.text.primary,
    flex: 1,
  },
  linkedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  linkedText: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: "500",
    fontFamily: Typography.getFontFamily("500"),
  },
  unlinkedText: {
    fontSize: 14,
    color: Colors.text.secondary,
  },

  // Email link form
  inputLabel: {
    fontSize: 12,
    fontFamily: Typography.getFontFamily("600"),
    color: Colors.text.secondary,
    marginTop: 12,
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  input: {
    height: 48,
    paddingHorizontal: 14,
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    fontSize: 15,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.primary,
  },
  inputWithIcon: {
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
  },
  inputWithRightIcon: {
    flex: 1,
    paddingRight: 76,
  },
  clearButton: {
    position: "absolute",
    right: 44,
    top: 0,
    bottom: 0,
    width: 28,
    alignItems: "center",
    justifyContent: "center",
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
  fieldError: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.error,
    marginTop: 6,
    marginLeft: 4,
  },
  linkButton: {
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  linkButtonDisabled: {
    backgroundColor: Colors.gray[200],
  },
  linkButtonText: {
    fontSize: 15,
    fontFamily: Typography.getFontFamily("600"),
    fontWeight: "600",
    color: Colors.white,
    letterSpacing: 0.2,
  },
  linkButtonTextDisabled: {
    color: Colors.gray[400],
  },
});

export default AccountLinkingScreen;
