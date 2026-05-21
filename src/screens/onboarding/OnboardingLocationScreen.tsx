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
import {
  requestPermissionAndGetLocation,
  updateHomeLocation,
  recordPermissionDenied,
} from "../../services/locationService";

type Nav = StackNavigationProp<RootStackParamList, "OnboardingLocation">;

/**
 * Optional location step inserted between State (step 2) and Photo (step 4).
 *
 * Two paths forward:
 *   - "Use my location"  → request iOS permission, capture GPS, store as
 *                          location_source='gps'. Falls back to state
 *                          centroid silently if the user denies the system
 *                          dialog (we already have a centroid from State).
 *   - "Skip — use my state instead" → keep the state-centroid backfill that
 *                                    happened when State was saved, mark
 *                                    location_source='manual' for clarity.
 *
 * Either way, the user can move on. The screen never blocks onboarding —
 * the worst outcome is they show up to Discover with state-only location,
 * which still produces meaningful recommendations.
 */
const OnboardingLocationScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { profileId } = useAuth();
  const [busy, setBusy] = useState(false);

  const proceedToPhoto = () => navigation.navigate("OnboardingPhoto");

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

  const handleSkip = async () => {
    if (!profileId || busy) return;
    setBusy(true);
    try {
      // No-op for storage — the state-centroid backfill from OnboardingState
      // already populated home_location. Just move on.
      proceedToPhoto();
    } finally {
      setBusy(false);
    }
  };

  return (
    <OnboardingShell
      step={3}
      title="Find golfers near you"
      subtitle="Share your location and we'll match you with golfers within driving distance — or skip and we'll just use your state."
      continueLabel="Use my location"
      continueDisabled={busy}
      onContinue={handleUseLocation}
      secondaryLabel="Skip — use my state instead"
      onSecondary={handleSkip}
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
