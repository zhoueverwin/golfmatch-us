import React, { useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { Colors } from "../constants/colors";
import { Spacing } from "../constants/spacing";
import { Typography } from "../constants/typography";

// Tinted teal layers, each ~3x stronger than the last — creates a sense of
// depth without leaning on drop shadows, which would feel heavy inside an
// already-soft card.
const TINT_BG = "rgba(32, 178, 170, 0.06)";
const TINT_BORDER = "rgba(32, 178, 170, 0.18)";
const TINT_DOT = "rgba(32, 178, 170, 0.22)";
const TINT_DOT_STRONG = "rgba(32, 178, 170, 0.34)";

type Props = {
  /** Whether the viewer is looking at their own profile. Switches the empty
   *  state from "encourage engagement with this person" to "encourage the
   *  owner to post their first post". */
  isOwnProfile?: boolean;
  /** Called when the owner taps the primary CTA. Only used when
   *  `isOwnProfile` is true. */
  onCreatePost?: () => void;
};

const EmptyPostsHint: React.FC<Props> = ({ isOwnProfile = false, onCreatePost }) => {
  // Two independent loops — float oscillates the icon vertically, pulse
  // breathes the halo behind it. Slightly different periods (3.6s vs 4.4s) so
  // the two motions never quite sync up, which reads as "alive" instead of
  // "metronomic."
  const float = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    float.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    pulse.value = withRepeat(
      withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [float, pulse]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (float.value - 0.5) * 6 }],
  }));

  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + pulse.value * 0.25,
    transform: [{ scale: 0.95 + pulse.value * 0.15 }],
  }));

  return (
    <View style={styles.card}>
      <View style={[styles.dot, styles.dotTL]} />
      <View style={[styles.dot, styles.dotBR]} />
      <View style={[styles.dotSmall, styles.dotTR]} />

      <View style={styles.iconStack}>
        <Animated.View style={[styles.halo, haloStyle]} />
        <Animated.View style={[styles.iconRing, iconStyle]}>
          <Ionicons name="sparkles" size={28} color={Colors.primary} />
        </Animated.View>
      </View>

      {isOwnProfile ? (
        <>
          <Text style={styles.title}>Your story starts here</Text>
          <Text style={styles.body}>
            Posts let others see your golf life — rounds you&apos;ve played,
            courses you love, the moments off the green. Profiles with posts
            attract more likes and matches.
          </Text>

          <View style={styles.divider} />

          {onCreatePost ? (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={onCreatePost}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Share your first post"
            >
              <Ionicons name="add-circle" size={18} color="#fff" />
              <Text style={styles.primaryButtonText}>Share your first post</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.tipBlock}>
              <View style={styles.tipHeader}>
                <Ionicons name="add-circle-outline" size={14} color={Colors.primary} />
                <Text style={styles.tipLabel}>How to post</Text>
              </View>
              <Text style={styles.tipBody}>
                Open the Feed tab and tap the + button to share a photo,
                video, or note. Your post will appear here.
              </Text>
            </View>
          )}
        </>
      ) : (
        <>
          <Text style={styles.title}>No posts shared yet</Text>
          <Text style={styles.body}>
            Posts are how members open up about their golf life — rounds played,
            courses they love, the small moments off the green. This profile
            hasn&apos;t added one yet.
          </Text>

          <View style={styles.divider} />

          <View style={styles.tipBlock}>
            <View style={styles.tipHeader}>
              <Ionicons name="heart-outline" size={14} color={Colors.primary} />
              <Text style={styles.tipLabel}>How to connect</Text>
            </View>
            <Text style={styles.tipBody}>
              Tap the like button below. If they like you back, you&apos;ll
              match and can start chatting to learn the rest of their story.
            </Text>
          </View>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: TINT_BG,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: TINT_BORDER,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: "center",
    overflow: "hidden",
    position: "relative",
  },
  dot: {
    position: "absolute",
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: TINT_DOT,
  },
  dotSmall: {
    position: "absolute",
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: TINT_DOT_STRONG,
  },
  // Asymmetric placement — symmetric dots read as decorative AI-default;
  // off-axis reads as intentional.
  dotTL: { top: 28, left: 28 },
  dotBR: { bottom: 38, right: 44 },
  dotTR: { top: 48, right: 64 },
  iconStack: {
    width: 84,
    height: 84,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  halo: {
    position: "absolute",
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "rgba(32, 178, 170, 0.18)",
  },
  iconRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "rgba(32, 178, 170, 0.4)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 3,
  },
  title: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    textAlign: "center",
    marginBottom: 6,
    letterSpacing: 0.1,
  },
  body: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 300,
  },
  // Hairline divider — 40pt wide, low-opacity teal. Narrower than the card so
  // it reads as a connector between two thoughts rather than a section break.
  divider: {
    width: 40,
    height: 1,
    backgroundColor: "rgba(32, 178, 170, 0.25)",
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  tipBlock: {
    alignItems: "center",
    maxWidth: 300,
  },
  tipHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  tipLabel: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.primary,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  tipBody: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    textAlign: "center",
    lineHeight: 19,
  },
  // Owner-mode CTA. Coloured shadow (teal-on-teal) gives the button a soft
  // glow consistent with the halo above it — same colour family throughout
  // the card, so the button reads as part of the composition rather than a
  // stamped-on system component.
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 24,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 4,
  },
  primaryButtonText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: "#fff",
    letterSpacing: 0.2,
  },
});

export default EmptyPostsHint;
