import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, CommonActions } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { useQueryClient } from "@tanstack/react-query";
import OnboardingShell from "./OnboardingShell";
import { Colors } from "../../constants/colors";
import { Typography } from "../../constants/typography";
import { Spacing } from "../../constants/spacing";
import { useAuth } from "../../contexts/AuthContext";
import CacheService from "../../services/cacheService";
import { RootStackParamList } from "../../types";

type Nav = StackNavigationProp<RootStackParamList, "OnboardingDone">;

const OnboardingDoneScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { refreshProfile, profileId } = useAuth();
  const queryClient = useQueryClient();

  // Refresh every cache layer that holds the current user's profile so
  // MyPage / EditProfile / Discover all see the data the user just entered:
  //   1. CacheService key `user_${profileId}` (DataProvider.getUserProfile)
  //   2. AuthContext's cached `userProfile` (refreshProfile re-fetches)
  //   3. React Query keys ['profile'] and ['currentUserProfile']
  const refreshAll = async () => {
    if (profileId) {
      await CacheService.remove(`user_${profileId}`);
    }
    await refreshProfile();
    queryClient.invalidateQueries({ queryKey: ["profile"] });
    queryClient.invalidateQueries({ queryKey: ["currentUserProfile"] });
  };

  const resetTo = (route: keyof RootStackParamList) => {
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: route }],
      }),
    );
  };

  const handleAddMore = async () => {
    await refreshAll();
    // Drop onboarding from history and land on EditProfile so users can keep going.
    navigation.dispatch(
      CommonActions.reset({
        index: 1,
        routes: [{ name: "Main" }, { name: "EditProfile" }],
      }),
    );
  };

  const handleStart = async () => {
    await refreshAll();
    resetTo("Main");
  };

  return (
    <OnboardingShell
      step={6}
      title="You're in."
      subtitle="Add more details now to get matched faster, or jump straight in and fill the rest later from My Page."
      continueLabel="Start exploring"
      onContinue={handleStart}
      secondaryLabel="Add more details"
      onSecondary={handleAddMore}
    >
      <View style={styles.iconWrap}>
        <View style={styles.iconCircle}>
          <Ionicons name="checkmark" size={56} color={Colors.white} />
        </View>
        <Text style={styles.welcome}>Welcome to GolfMatch!</Text>
        <Text style={styles.tip}>
          A full profile (more photos, golf skill, average score, bio) gets ~3x
          more matches than the minimum.
        </Text>
      </View>
    </OnboardingShell>
  );
};

const styles = StyleSheet.create({
  iconWrap: {
    alignItems: "center",
    gap: Spacing.md,
    paddingTop: Spacing.lg,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  welcome: {
    fontSize: Typography.fontSize.xl,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text.primary,
    marginTop: Spacing.md,
  },
  tip: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    textAlign: "center",
    paddingHorizontal: Spacing.lg,
    lineHeight: 20,
  },
});

export default OnboardingDoneScreen;
