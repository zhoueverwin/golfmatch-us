import React, { useState } from "react";
import { TextInput, StyleSheet, Alert } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import OnboardingShell from "./OnboardingShell";
import { Colors } from "../../constants/colors";
import { Typography } from "../../constants/typography";
import { Spacing, BorderRadius } from "../../constants/spacing";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../services/supabase";
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
      navigation.navigate("OnboardingGender");
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
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="First name"
        placeholderTextColor={Colors.text.tertiary}
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={MAX_LENGTH}
        returnKeyType="next"
        onSubmitEditing={handleContinue}
        autoFocus
      />
    </OnboardingShell>
  );
};

const styles = StyleSheet.create({
  input: {
    height: 56,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    fontSize: Typography.fontSize.lg,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.primary,
    backgroundColor: Colors.white,
  },
});

export default OnboardingNameScreen;
