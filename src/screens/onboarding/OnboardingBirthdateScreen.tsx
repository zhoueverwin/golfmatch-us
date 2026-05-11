import React, { useState } from "react";
import { View, Text, StyleSheet, Alert, Platform } from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import OnboardingShell from "./OnboardingShell";
import { Colors } from "../../constants/colors";
import { Typography } from "../../constants/typography";
import { Spacing } from "../../constants/spacing";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../services/supabase";
import { RootStackParamList } from "../../types";

type Nav = StackNavigationProp<RootStackParamList, "OnboardingBirthdate">;

const MIN_AGE = 18;
const MAX_AGE = 100;

const today = new Date();
const maxDate = new Date(today.getFullYear() - MIN_AGE, today.getMonth(), today.getDate());
const minDate = new Date(today.getFullYear() - MAX_AGE, today.getMonth(), today.getDate());
const defaultDate = new Date(today.getFullYear() - 30, 0, 1);

function ageFromBirthDate(d: Date): number {
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) {
    age--;
  }
  return age;
}

function formatYMD(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const OnboardingBirthdateScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { profileId } = useAuth();
  const [date, setDate] = useState<Date>(defaultDate);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const age = ageFromBirthDate(date);
  const valid = age >= MIN_AGE && age <= MAX_AGE;

  const handleChange = (_: DateTimePickerEvent, picked?: Date) => {
    if (picked) {
      setDate(picked);
      setTouched(true);
    }
  };

  const handleContinue = async () => {
    if (!valid || !profileId || saving) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          birth_date: formatYMD(date),
          age,
          updated_at: new Date().toISOString(),
        })
        .eq("id", profileId);
      if (error) throw error;
      navigation.navigate("OnboardingState");
    } catch (err: any) {
      Alert.alert("Couldn't save", err?.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <OnboardingShell
      step={3}
      title="When were you born?"
      subtitle="You must be 18 or older to use GolfMatch. Your birthday isn't shown on your profile — just your age."
      continueDisabled={!touched || !valid || saving}
      onContinue={handleContinue}
    >
      <View style={styles.pickerWrap}>
        <DateTimePicker
          value={date}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          minimumDate={minDate}
          maximumDate={maxDate}
          onChange={handleChange}
          locale="en-US"
        />
        {touched && (
          <Text style={styles.ageHint}>You'll appear as {age} years old.</Text>
        )}
      </View>
    </OnboardingShell>
  );
};

const styles = StyleSheet.create({
  pickerWrap: {
    alignItems: "center",
    gap: Spacing.md,
  },
  ageHint: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
  },
});

export default OnboardingBirthdateScreen;
