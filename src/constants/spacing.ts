export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  "2xl": 48,
  "3xl": 64,
  "4xl": 96,
} as const;

export const BorderRadius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  "2xl": 24,
  full: 9999,
} as const;

// Responsive dimensions
export const Dimensions = {
  // Profile card dimensions (responsive)
  profileCardWidth: "48%",
  profileImageSize: 60,
  profileImageSizeLarge: 80,

  // Button dimensions
  buttonHeight: 48,
  buttonHeightSmall: 36,
  buttonHeightLarge: 56,

  // Icon sizes
  iconSize: 20,
  iconSizeSmall: 16,
  iconSizeLarge: 24,

  // Touch targets (minimum 44pt for accessibility)
  touchTarget: 44,
  touchTargetSmall: 36,
} as const;

// Shadow presets
export const Shadows = {
  small: {
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  medium: {
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  large: {
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
} as const;
