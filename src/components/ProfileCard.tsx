import React, { memo } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  Dimensions,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { Colors } from "../constants/colors";
import { Spacing, BorderRadius } from "../constants/spacing";
import { Typography } from "../constants/typography";
import { ProfileCardProps } from "../types";
import Card from "./Card";
import { getAgeRange, calculateAge, isUserOnline } from "../utils/formatters";
import { StreakBadge } from "./StreakBadge";

const PinOutlineIcon = require("../../assets/images/Icons/Pin-Outline.png");
const verifyBadge = require("../../assets/images/badges/Verify.png");

const { width } = Dimensions.get("window");
const horizontalPadding = Spacing.md * 2;
const interItemSpacing = 10; // gap between cards
const cardWidth = (width - horizontalPadding - interItemSpacing) / 2;
const cardHeight = cardWidth * 1.3;
const cardBorderRadius = BorderRadius.xl;

// Pre-allocated constants to avoid re-creating objects during FlashList recycling
const GRADIENT_COLORS = ["transparent", "rgba(0,0,0,0.35)", "rgba(0,0,0,0.75)"] as const;
const GRADIENT_START = { x: 0, y: 0 } as const;
const GRADIENT_END = { x: 0, y: 1 } as const;

const ProfileCard: React.FC<ProfileCardProps> = ({
  profile,
  onViewProfile,
  testID,
}) => {
  // Calculate if user is online using shared utility
  const isOnline = isUserOnline(profile.last_active_at);

  const profileImage = profile.profile_pictures[0] ||
    "https://images.unsplash.com/photo-1494790108755-2616b612b786?w=400&h=400&fit=crop&crop=face";

  return (
    <Card
      style={styles.container}
      onPress={() => onViewProfile(profile.id)}
      shadow="none"
      padding="none"
      borderRadius={cardBorderRadius}
      testID={testID}
    >
      {/* Profile Image */}
      <View style={styles.imageContainer}>
        <ExpoImage
          source={{ uri: profileImage }}
          style={styles.profileImage}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={0}
          placeholderContentFit="cover"
          recyclingKey={profileImage}
          accessibilityLabel={`${profile.name}'s profile photo`}
        />

        {/* Online Status Indicator - only show if user is online */}
        {isOnline && <View style={styles.onlineIndicator} />}

        {/* Overlay Info */}
        <LinearGradient
          colors={GRADIENT_COLORS}
          start={GRADIENT_START}
          end={GRADIENT_END}
          style={styles.imageOverlay}
        >
          <View style={styles.overlayContent}>
            <View style={[styles.overlayRow, styles.overlayRowTop]}>
              <Text style={styles.overlayAgeText}>
                {getAgeRange(profile.birth_date ? calculateAge(profile.birth_date) : profile.age)}
              </Text>
              {profile.gender === "female" ? (
                <Ionicons name="female" size={14} color="#FF6B9D" />
              ) : profile.gender === "male" ? (
                <Ionicons name="male" size={14} color="#64B5F6" />
              ) : null}
              <StreakBadge days={profile.current_streak_days} />
            </View>
            <View style={styles.overlayRow}>
              <Image source={PinOutlineIcon} style={styles.pinIcon} />
              <Text style={styles.overlayLocationText}>
                {profile.prefecture || "Not set"}
              </Text>
            </View>
          </View>
        </LinearGradient>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  container: {
    width: cardWidth,
    height: cardHeight,
    marginBottom: interItemSpacing,
    borderRadius: cardBorderRadius,
    overflow: "hidden",
  },
  imageContainer: {
    position: "relative",
    width: "100%",
    height: "100%",
    backgroundColor: Colors.gray[200],
  },
  profileImage: {
    width: "100%",
    height: "100%",
  },
  onlineIndicator: {
    position: "absolute",
    top: Spacing.sm,
    right: Spacing.sm,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.success,
    borderWidth: 2,
    borderColor: Colors.white,
  },
  imageOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  overlayContent: {
    paddingTop: Spacing.xs,
  },
  overlayRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  overlayRowTop: {
    marginBottom: Spacing.xs,
  },
  overlayAgeText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.white,
  },
  verificationPill: {
    marginLeft: Spacing.xs,
  },
  premiumPill: {
    marginLeft: Spacing.xs,
  },
  badgeIcon: {
    width: 16,
    height: 16,
  },
  pinIcon: {
    width: 12,
    height: 16,
    tintColor: Colors.white,
    marginRight: Spacing.xs,
    resizeMode: "contain",
  },
  overlayLocationText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
    color: Colors.white,
  },
});

// Custom comparison function for memo - only re-render when essential props change
const areEqual = (prevProps: ProfileCardProps, nextProps: ProfileCardProps) => {
  return (
    prevProps.profile.id === nextProps.profile.id &&
    prevProps.profile.isLiked === nextProps.profile.isLiked &&
    prevProps.profile.isPassed === nextProps.profile.isPassed &&
    prevProps.profile.profile_pictures[0] === nextProps.profile.profile_pictures[0]
  );
};

export default memo(ProfileCard, areEqual);
