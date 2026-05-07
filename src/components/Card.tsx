import React, { memo, useMemo } from "react";
import { View, ViewStyle, Pressable, StyleProp } from "react-native";
import { Colors } from "../constants/colors";
import { Spacing, BorderRadius } from "../constants/spacing";
import { Shadows } from "../constants/spacing";

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  shadow?: "small" | "medium" | "large" | "none";
  padding?: "none" | "small" | "medium" | "large";
  backgroundColor?: string;
  borderRadius?: number;
  testID?: string;
}

const PADDING_MAP = {
  none: 0,
  small: Spacing.sm,
  medium: Spacing.md,
  large: Spacing.lg,
} as const;

const Card: React.FC<CardProps> = ({
  children,
  style,
  onPress,
  shadow = "medium",
  padding = "medium",
  backgroundColor = Colors.white,
  borderRadius = BorderRadius.lg,
  testID,
}) => {
  const cardStyle = useMemo<ViewStyle>(() => ({
    backgroundColor,
    borderRadius,
    padding: PADDING_MAP[padding],
    ...(shadow !== "none" ? Shadows[shadow] : {}),
  }), [backgroundColor, borderRadius, padding, shadow]);

  if (onPress) {
    return (
      <Pressable
        style={({ pressed }) => [cardStyle, style, pressed && { opacity: 0.7 }]}
        onPress={onPress}
        accessibilityRole="button"
        testID={testID}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View style={[cardStyle, style]} testID={testID}>
      {children}
    </View>
  );
};

export default memo(Card);
