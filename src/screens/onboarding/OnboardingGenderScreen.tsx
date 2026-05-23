import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { Ionicons } from "@expo/vector-icons";
import OnboardingShell from "./OnboardingShell";
import { Colors } from "../../constants/colors";
import { Typography } from "../../constants/typography";
import { Spacing, BorderRadius } from "../../constants/spacing";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../services/supabase";
import { logOnboardingStepCompleted } from "../../services/firebaseAnalytics";
import { RootStackParamList } from "../../types";

type Nav = StackNavigationProp<RootStackParamList, "OnboardingGender">;

type Gender = "male" | "female";

const OnboardingGenderScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { profileId, refreshProfile } = useAuth();
  const [selected, setSelected] = useState<Gender | null>(null);
  const [saving, setSaving] = useState(false);

  const handleContinue = async () => {
    if (!selected || !profileId || saving) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ gender: selected, updated_at: new Date().toISOString() })
        .eq("id", profileId);
      if (error) throw error;
      // Refresh AuthContext's cached userProfile so OnboardingPhotoScreen
      // sees the new gender when it routes (female → straight to Liveness,
      // anything else → Paywall). Without this, the cache stays at its
      // sign-in value (usually null) and female users incorrectly hit the
      // paywall.
      await refreshProfile();
      void logOnboardingStepCompleted("gender");
      navigation.navigate("OnboardingState");
    } catch (err: any) {
      Alert.alert("Couldn't save", err?.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const renderOption = (value: Gender, label: string, icon: keyof typeof Ionicons.glyphMap) => {
    const isSelected = selected === value;
    return (
      <TouchableOpacity
        key={value}
        style={[styles.option, isSelected && styles.optionSelected]}
        onPress={() => setSelected(value)}
        activeOpacity={0.8}
        accessibilityRole="radio"
        accessibilityState={{ selected: isSelected }}
        accessibilityLabel={label}
      >
        <Ionicons
          name={icon}
          size={28}
          color={isSelected ? Colors.primary : Colors.text.secondary}
        />
        <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <OnboardingShell
      step={3}
      title="What's your gender?"
      subtitle="GolfMatch matches you with golfers of the opposite gender."
      continueDisabled={!selected || saving}
      onContinue={handleContinue}
    >
      <View style={styles.options}>
        {renderOption("male", "Male", "male")}
        {renderOption("female", "Female", "female")}
      </View>
    </OnboardingShell>
  );
};

const styles = StyleSheet.create({
  options: {
    gap: Spacing.md,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    height: 64,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  optionSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + "10",
  },
  optionLabel: {
    fontSize: Typography.fontSize.lg,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.primary,
  },
  optionLabelSelected: {
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
  },
});

export default OnboardingGenderScreen;
