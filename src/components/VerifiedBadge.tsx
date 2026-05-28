// Small inline badge shown next to a user's name when their profile has
// passed face-liveness verification. Mirrors the visual treatment of
// StreakBadge so badges line up cleanly when both are present.
//
// Renders nothing if the user isn't verified — callers can pass the raw
// profile and not worry about conditional rendering at the call site.

import React from "react";
import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../constants/colors";

interface Props {
  verified?: boolean | null;
  size?: number;
}

const VerifiedBadge: React.FC<Props> = ({ verified, size = 16 }) => {
  if (!verified) return null;
  return (
    <View
      style={[
        styles.badge,
        { width: size + 4, height: size + 4, borderRadius: (size + 4) / 2 },
      ]}
      accessibilityLabel="Verified"
      accessibilityRole="image"
    >
      <Ionicons name="checkmark" size={size - 2} color={Colors.white} />
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default VerifiedBadge;
