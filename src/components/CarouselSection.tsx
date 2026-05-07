import React from "react";
import { View, Text, FlatList, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Colors } from "../constants/colors";
import { Spacing } from "../constants/spacing";
import { Typography } from "../constants/typography";
import { User } from "../types/dataModels";
import CarouselProfileCard from "./CarouselProfileCard";

interface CarouselSectionProps {
  title: string;
  users: User[];
  loading: boolean;
  onCardPress: (user: User, index: number) => void;
  locked?: boolean;
  onLockedPress?: () => void;
}

const SkeletonCard = () => (
  <View style={styles.skeletonCard} />
);

const CarouselSection: React.FC<CarouselSectionProps> = ({
  title,
  users,
  loading,
  onCardPress,
  locked,
  onLockedPress,
}) => {
  if (!loading && users.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{title}</Text>
        {locked && (
          <Ionicons name="lock-closed" size={16} color="#D4A017" style={styles.lockIcon} />
        )}
      </View>

      {loading ? (
        <View style={styles.skeletonRow}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : (
        <View>
          <FlatList
            data={users}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => (
              <CarouselProfileCard
                profile={item}
                onPress={(user) =>
                  locked && onLockedPress ? onLockedPress() : onCardPress(user, index)
                }
              />
            )}
          />
          {locked && (
            <View style={styles.lockedOverlay} pointerEvents="none" />
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.lg,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  title: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
  },
  lockIcon: {
    marginLeft: Spacing.xs,
  },
  listContent: {
    paddingHorizontal: Spacing.md,
  },
  skeletonRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  skeletonCard: {
    width: 140,
    height: 190,
    borderRadius: 16,
    backgroundColor: Colors.gray[200],
  },
  lockedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255, 255, 255, 0.4)",
    borderRadius: 16,
  },
});

export default CarouselSection;
