import React, { useState } from "react";
import { View, Text, StyleSheet, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import OnboardingShell from "./OnboardingShell";
import { Colors } from "../../constants/colors";
import { Typography } from "../../constants/typography";
import { Spacing, BorderRadius } from "../../constants/spacing";
import { useAuth } from "../../contexts/AuthContext";
import { RootStackParamList } from "../../types";
import { logOnboardingStepCompleted } from "../../services/firebaseAnalytics";
import {
  requestPermissionAndGetLocation,
  updateHomeLocation,
  recordPermissionDenied,
} from "../../services/locationService";

type Nav = StackNavigationProp<RootStackParamList, "OnboardingLocation">;

/**
 * Location step inserted between State (step 2) and Photo (step 4).
 *
 * Single forward action: "Continue" triggers the iOS permission dialog.
 * The OS dialog is the only opt-out — no app-level Skip button (Apple
 * App Review 5.1.1: a pre-permission rationale must not include its own
 * exit/skip control). If the user denies in the system dialog we still
 * proceed; the state-centroid backfill from OnboardingState keeps
 * recommendations working.
 */
const OnboardingLocationScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { profileId } = useAuth();
  const [busy, setBusy] = useState(false);

  const proceedToPhoto = () => {
    void logOnboardingStepCompleted("location");
    navigation.navigate("OnboardingPhoto");
  };

  const handleUseLocation = async () => {
    if (!profileId || busy) return;
    setBusy(true);
    try {
      const result = await requestPermissionAndGetLocation("onboarding");

      if (result.status === "granted") {
        const upd = await updateHomeLocation(profileId, result.coords, "gps");
        if (!upd.success) {
          // Failed to save coords but the user did consent — surface a soft
          // error and let them continue (state centroid still applies).
          console.warn("[OnboardingLocation] failed to persist GPS:", upd.error);
        }
        proceedToPhoto();
        return;
      }

      if (result.status === "denied") {
        await recordPermissionDenied(profileId);
        // We still proceed — denial isn't a failure for onboarding.
        proceedToPhoto();
        return;
      }

      // status === "error"
      Alert.alert(
        "Couldn't get your location",
        "We'll use your state instead. You can update this later in Settings.",
      );
      proceedToPhoto();
    } finally {
      setBusy(false);
    }
  };

  return (
    <OnboardingShell
      step={5}
      title="Find golfers near you"
      subtitle="Share your location and we'll match you with golfers within driving distance. You can decline on the next prompt and we'll use your state instead."
      continueLabel="Continue"
      continueDisabled={busy}
      onContinue={handleUseLocation}
    >
      <View style={styles.illustration}>
        <View style={styles.iconBubble}>
          <Ionicons name="navigate" size={42} color={Colors.primary} />
        </View>
        <View style={styles.bulletGroup}>
          <Bullet
            icon="golf"
            title="Closer matches play more often"
            body="Find regular partners at familiar courses near home."
          />
          <Bullet
            icon="map"
            title="Explore new courses together"
            body="Match with golfers a drive away to play somewhere new."
          />
          <Bullet
            icon="shield-checkmark"
            title="Your address stays private"
            body="We only ever show distance, never your home location."
          />
        </View>
      </View>
    </OnboardingShell>
  );
};

interface BulletProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}

const Bullet: React.FC<BulletProps> = ({ icon, title, body }) => (
  <View style={styles.bulletRow}>
    <View style={styles.bulletIcon}>
      <Ionicons name={icon} size={18} color={Colors.primary} />
    </View>
    <View style={styles.bulletText}>
      <Text style={styles.bulletTitle}>{title}</Text>
      <Text style={styles.bulletBody}>{body}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  illustration: {
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  iconBubble: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.primary + "15",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xl,
  },
  bulletGroup: {
    width: "100%",
    gap: Spacing.md,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  bulletIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary + "12",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  bulletText: {
    flex: 1,
    gap: 4,
  },
  bulletTitle: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text.primary,
  },
  bulletBody: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    lineHeight: 18,
  },
});

export default OnboardingLocationScreen;
