import React, { useRef } from "react";
import {
  TouchableOpacity,
  Text,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
  Animated,
} from "react-native";
import { Colors } from "../constants/colors";
import { Spacing, BorderRadius, Dimensions } from "../constants/spacing";
import { Typography } from "../constants/typography";
import { Shadows } from "../constants/spacing";

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "small" | "medium" | "large";
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = "primary",
  size = "medium",
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
  textStyle,
  accessibilityLabel,
  accessibilityHint,
  testID,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    if (disabled || loading) return;
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 0.96,
        useNativeDriver: true,
        friction: 8,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0.85,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handlePressOut = () => {
    if (disabled || loading) return;
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        friction: 8,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handlePress = () => {
    // Reset animation before calling onPress
    handlePressOut();
    try {
      onPress();
    } catch (error) {
      // Catch any synchronous errors in onPress handler
      console.error('[Button] Error in onPress handler:', error);
      // Don't throw - let ErrorBoundary catch if it's a render error
      // For event handler errors, we just log them
    }
  };

  const getButtonStyle = (): ViewStyle => {
    const baseStyle: ViewStyle = {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 24, // Very high border radius for softer, modern aesthetic
      // Enhanced shadow for more depth and tappable feel
      shadowColor: "#000",
      shadowOffset: {
        width: 0,
        height: 3,
      },
      shadowOpacity: 0.2,
      shadowRadius: 6,
      elevation: 6, // Higher elevation for Android
    };

    // Size styles - slightly more compact with consistent sizing
    switch (size) {
      case "small":
        baseStyle.height = 40; // Compact height, but still meeting touch target (44px with padding)
        baseStyle.paddingVertical = Spacing.xs; // Minimal padding for compact appearance
        baseStyle.paddingHorizontal = Spacing.md;
        break;
      case "large":
        baseStyle.height = Dimensions.buttonHeightLarge;
        baseStyle.paddingHorizontal = Spacing.xl;
        break;
      default:
        baseStyle.height = 44; // Reduced from 48px for more compact appearance
        baseStyle.paddingHorizontal = Spacing.lg;
    }

    // Variant styles
    switch (variant) {
      case "primary":
        baseStyle.backgroundColor = disabled
          ? Colors.gray[300]
          : Colors.primary;
        break;
      case "secondary":
        baseStyle.backgroundColor = disabled
          ? Colors.gray[200]
          : Colors.gray[100];
        break;
      case "outline":
        baseStyle.backgroundColor = "transparent";
        baseStyle.borderWidth = 1;
        baseStyle.borderColor = disabled ? Colors.gray[300] : Colors.primary;
        break;
      case "ghost":
        baseStyle.backgroundColor = "transparent";
        baseStyle.shadowOpacity = 0;
        baseStyle.shadowRadius = 0;
        baseStyle.elevation = 0;
        break;
    }

    // Full width
    if (fullWidth) {
      baseStyle.width = "100%";
    }

    return baseStyle;
  };

  const getTextStyle = (): TextStyle => {
    const baseStyle: TextStyle = {
      fontWeight: Typography.fontWeight.semibold,
      fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
      textAlign: "center",
    };

    // Size styles
    switch (size) {
      case "small":
        baseStyle.fontSize = Typography.fontSize.sm;
        break;
      case "large":
        baseStyle.fontSize = Typography.fontSize.lg;
        break;
      default:
        baseStyle.fontSize = Typography.fontSize.base;
    }

    // Variant styles
    switch (variant) {
      case "primary":
        baseStyle.color = disabled ? Colors.gray[500] : Colors.white;
        break;
      case "secondary":
        baseStyle.color = disabled ? Colors.gray[500] : Colors.text.primary;
        break;
      case "outline":
        baseStyle.color = disabled ? Colors.gray[400] : Colors.primary;
        break;
      case "ghost":
        baseStyle.color = disabled ? Colors.gray[400] : Colors.primary;
        break;
    }

    return baseStyle;
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
      activeOpacity={1} // Disable default opacity animation since we're using custom animations
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || loading }}
      testID={testID}
    >
      <Animated.View
        style={[
          getButtonStyle(),
          style,
          {
            transform: [{ scale: scaleAnim }],
            opacity: opacityAnim,
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator
            size="small"
            color={variant === "primary" ? Colors.white : Colors.primary}
          />
        ) : (
          <Text style={[getTextStyle(), textStyle]}>{title}</Text>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
};

export default Button;
