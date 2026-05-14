import React, { memo } from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { Colors } from "../constants/colors";
import { Spacing, BorderRadius } from "../constants/spacing";
import { Typography } from "../constants/typography";
import { User } from "../types/dataModels";
import { getAgeRange, calculateAge, isUserOnline } from "../utils/formatters";

const PinOutlineIcon = require("../../assets/images/Icons/Pin-Outline.png");
const verifyBadge = require("../../assets/images/badges/Verify.png");
const goldBadge = require("../../assets/images/badges/Gold.png");

const CARD_WIDTH = 140;
const CARD_HEIGHT = 190;

interface CarouselProfileCardProps {
  profile: User;
  onPress: (user: User) => void;
}

const CarouselProfileCard: React.FC<CarouselProfileCardProps> = ({
  profile,
  onPress,
}) => {
  const online = isUserOnline(profile.last_active_at);
  const profileImage =
    profile.profile_pictures[0] ||
    "https://images.unsplash.com/photo-1494790108755-2616b612b786?w=400&h=400&fit=crop&crop=face";
  const age = profile.birth_date
    ? calculateAge(profile.birth_date)
    : profile.age;

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => onPress(profile)}
      activeOpacity={0.85}
    >
      <ExpoImage
        source={{ uri: profileImage }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={0}
        recyclingKey={profileImage}
      />

      {/* Online indicator */}
      {online && <View style={styles.onlineIndicator} />}

      {/* Gradient overlay with info */}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.35)", "rgba(0,0,0,0.75)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.gradientOverlay}
      >
        <View style={styles.infoContainer}>
          <View style={styles.topRow}>
            <Text style={styles.ageText}>{getAgeRange(age)}</Text>
            {profile.gender === "female" ? (
              <Ionicons name="female" size={12} color="#FF6B9D" />
            ) : profile.gender === "male" ? (
              <Ionicons name="male" size={12} color="#64B5F6" />
            ) : null}
            {profile.is_premium && (
              <Image
                source={goldBadge}
                style={styles.badgeIcon}
                resizeMode="contain"
              />
            )}
          </View>
          <View style={styles.locationRow}>
            <Image source={PinOutlineIcon} style={styles.pinIcon} />
            <Text style={styles.locationText} numberOfLines={1}>
              {profile.prefecture || "Not set"}
            </Text>
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
    backgroundColor: Colors.gray[200],
    marginRight: Spacing.sm,
  },
  onlineIndicator: {
    position: "absolute",
    top: Spacing.sm,
    right: Spacing.sm,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.success,
    borderWidth: 1.5,
    borderColor: Colors.white,
    zIndex: 2,
  },
  gradientOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.lg,
  },
  infoContainer: {
    gap: 2,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  ageText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.white,
  },
  badgeIcon: {
    width: 14,
    height: 14,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  pinIcon: {
    width: 10,
    height: 13,
    tintColor: Colors.white,
    marginRight: 3,
    resizeMode: "contain",
  },
  locationText: {
    fontSize: 10,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
    color: Colors.white,
    flexShrink: 1,
  },
});

const areEqual = (
  prevProps: CarouselProfileCardProps,
  nextProps: CarouselProfileCardProps,
) => {
  return (
    prevProps.profile.id === nextProps.profile.id &&
    prevProps.profile.profile_pictures[0] ===
      nextProps.profile.profile_pictures[0]
  );
};

export default memo(CarouselProfileCard, areEqual);
