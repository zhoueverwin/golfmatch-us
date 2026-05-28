import React, { useEffect, useRef, useState } from "react";
import {
  TextInput,
  StyleSheet,
  Alert,
  View,
  Text,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import OnboardingShell from "./OnboardingShell";
import { Colors } from "../../constants/colors";
import { Typography } from "../../constants/typography";
import { Spacing, BorderRadius, Shadows } from "../../constants/spacing";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../services/supabase";
import { logOnboardingStepCompleted } from "../../services/firebaseAnalytics";
import { RootStackParamList } from "../../types";

type Nav = StackNavigationProp<RootStackParamList, "OnboardingName">;

const MIN_LENGTH = 1;
const MAX_LENGTH = 40;

const OnboardingNameScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { profileId, user } = useAuth();

  // App Store guideline 5.x (Sign in with Apple): once the user has
  // authenticated via Apple, the app must use the name Apple provided and
  // must not re-prompt for it. For Apple users we skip this screen entirely
  // — authService.signInWithApple persists credential.fullName to the
  // profile on first sign-in, so a real name is already on file.
  //
  // We check three signals because Supabase populates them on slightly
  // different timelines after signInWithIdToken: app_metadata.provider is
  // sometimes undefined for one render right after auth, but identities
  // and providers[] are hydrated synchronously with the session. Any one
  // matching is enough.
  const skippedRef = useRef(false);
  const appMetaProvider = user?.app_metadata?.provider;
  const appMetaProviders = user?.app_metadata?.providers;
  const identities = user?.identities;
  const isAppleUser =
    appMetaProvider === "apple" ||
    (Array.isArray(appMetaProviders) && appMetaProviders.includes("apple")) ||
    (Array.isArray(identities) && identities.some((i) => i?.provider === "apple"));
  useEffect(() => {
    if (isAppleUser && !skippedRef.current) {
      skippedRef.current = true;
      navigation.replace("OnboardingBirthdate");
    }
  }, [isAppleUser, navigation]);
  // Always start empty — the OAuth-provided name (in userProfile) is kept
  // as a DB fallback via the handle_new_user trigger, but the user types
  // their own here during onboarding.
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [focused, setFocused] = useState(false);

  const trimmed = name.trim();
  const valid = trimmed.length >= MIN_LENGTH && trimmed.length <= MAX_LENGTH;

  const handleContinue = async () => {
    if (!valid || !profileId || saving) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ name: trimmed, updated_at: new Date().toISOString() })
        .eq("id", profileId);
      if (error) throw error;
      void logOnboardingStepCompleted("name");
      navigation.navigate("OnboardingBirthdate");
    } catch (err: any) {
      Alert.alert("Couldn't save", err?.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Don't flash the name input while we're waiting on `user` to hydrate —
  // if we later detect it's an Apple user, we'd briefly show a screen we
  // shouldn't, which is the exact bug Apple flagged.
  if (!user || isAppleUser) {
    return null;
  }

  return (
    <OnboardingShell
      step={1}
      title="What's your name?"
      subtitle="This is how you'll appear to other golfers."
      hideBack
      showSignOut
      continueDisabled={!valid || saving}
      onContinue={handleContinue}
    >
      <View style={styles.inputWrap}>
        <TextInput
          style={[
            styles.input,
            focused && styles.inputFocused,
          ]}
          value={name}
          onChangeText={setName}
          placeholder="First name"
          placeholderTextColor={Colors.text.tertiary}
          autoCapitalize="words"
          autoCorrect={false}
          maxLength={MAX_LENGTH}
          returnKeyType="next"
          onSubmitEditing={handleContinue}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoFocus
        />
        <View style={styles.metaRow}>
          <Text style={styles.hint}>Just your first name is fine.</Text>
          <Text
            style={[
              styles.counter,
              trimmed.length > MAX_LENGTH * 0.85 && styles.counterWarn,
            ]}
          >
            {trimmed.length} / {MAX_LENGTH}
          </Text>
        </View>
      </View>
    </OnboardingShell>
  );
};

const styles = StyleSheet.create({
  inputWrap: {
    gap: Spacing.sm,
  },
  input: {
    height: 60,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    paddingHorizontal: Spacing.lg,
    fontSize: 17,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.primary,
    backgroundColor: Colors.white,
  },
  inputFocused: {
    borderColor: Colors.primary,
    borderWidth: 1.5,
    ...Shadows.small,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.xs,
  },
  hint: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.tertiary,
    letterSpacing: 0.1,
  },
  counter: {
    fontSize: 12,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text.tertiary,
    fontVariant: ["tabular-nums"],
  },
  counterWarn: {
    color: Colors.warning,
  },
});

export default OnboardingNameScreen;
