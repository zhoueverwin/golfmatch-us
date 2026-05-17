import React, { memo } from "react";
import { View, Text, StyleSheet } from "react-native";

interface StreakBadgeProps {
  days?: number | null;
}

const MIN_TIER = 7;

const tierStyle = (days: number) => {
  if (days >= 100) return { bg: "#FFD700", fg: "#3A2A00" };
  if (days >= 30) return { bg: "#C0C0C0", fg: "#1F1F1F" };
  return { bg: "#CD7F32", fg: "#1F1300" };
};

export const StreakBadge: React.FC<StreakBadgeProps> = memo(({ days }) => {
  if (days == null || days < MIN_TIER) return null;
  const { bg, fg } = tierStyle(days);
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: fg }]}>🔥{days}</Text>
    </View>
  );
});

StreakBadge.displayName = "StreakBadge";

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 6,
  },
  text: {
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 14,
  },
});
