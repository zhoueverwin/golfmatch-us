import React, { useState } from "react";
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
  const { profileId } = useAuth();
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
