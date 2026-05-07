export const Colors = {
  // Primary colors based on the UI design
  primary: "#20B2AA", // Teal - main accent color
  primaryDark: "#1A9B94",
  primaryLight: "#4FC3BC",
  lightGreen: "#B2E8E5", // Light teal/mint green for profile section

  // Secondary colors
  secondary: "#32CD32", // Green for golf theme
  secondaryDark: "#228B22",
  secondaryLight: "#90EE90",

  // Neutral colors
  white: "#FFFFFF",
  black: "#000000",
  gray: {
    50: "#F9FAFB",
    100: "#F3F4F6",
    200: "#E5E7EB",
    300: "#D1D5DB",
    400: "#9CA3AF",
    500: "#6B7280",
    600: "#4B5563",
    700: "#374151",
    800: "#1F2937",
    900: "#111827",
  },

  // Status colors
  success: "#10B981",
  warning: "#F59E0B",
  error: "#EF4444",
  info: "#3B82F6",

  // Background colors
  background: "#FFFFFF",
  surface: "#F8FAFC",

  // Text colors
  text: {
    primary: "#1F2937",
    secondary: "#6B7280",
    tertiary: "#9CA3AF",
    inverse: "#FFFFFF",
  },

  // Border colors
  border: "#E5E7EB",
  borderLight: "#F3F4F6",

  // Notification badge colors
  badge: "#EF4444",
  badgeTeal: "#20B2AA",
} as const;
