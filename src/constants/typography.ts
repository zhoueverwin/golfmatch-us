// Font family names - will be set after fonts are loaded
export const FontFamily = {
  regular: "NotoSansJP_400Regular",
  medium: "NotoSansJP_500Medium",
  semibold: "NotoSansJP_600SemiBold",
  bold: "NotoSansJP_700Bold",
  // Fallback for when fonts haven't loaded yet
  default: "NotoSansJP_400Regular",
} as const;

/**
 * Get font family based on font weight
 * Use this in StyleSheet.create() to apply Noto Sans JP fonts
 * 
 * @param fontWeight - Font weight string (e.g., "400", "500", "600", "700")
 * @returns Font family name for Noto Sans JP
 * 
 * @example
 * const styles = StyleSheet.create({
 *   title: {
 *     fontSize: Typography.fontSize.lg,
 *     fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
 *   },
 * });
 */
export const getFontFamily = (fontWeight?: string): string => {
  switch (fontWeight) {
    case "400":
      return FontFamily.regular;
    case "500":
      return FontFamily.medium;
    case "600":
      return FontFamily.semibold;
    case "700":
      return FontFamily.bold;
    default:
      return FontFamily.regular;
  }
};

export const Typography = {
  // Font family
  fontFamily: FontFamily,
  
  // Helper function to get font family
  getFontFamily,

  // Font sizes
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    "2xl": 24,
    "3xl": 30,
    "4xl": 36,
    "5xl": 48,
  },

  // Font weights
  fontWeight: {
    normal: "400" as const,
    medium: "500" as const,
    semibold: "600" as const,
    bold: "700" as const,
    extrabold: "800" as const,
  },

  // Line heights
  lineHeight: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75,
  },

  // Letter spacing
  letterSpacing: {
    tight: -0.025,
    normal: 0,
    wide: 0.025,
  },
} as const;
