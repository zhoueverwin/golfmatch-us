import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { Colors } from "../constants/colors";
import { Spacing, BorderRadius, Shadows } from "../constants/spacing";
import { Typography } from "../constants/typography";

export type SortOption = "recommended" | "login" | "likes" | "registration";

interface SortOptionItem {
  key: SortOption;
  label: string;
  description: string;
  iconOutline: keyof typeof Ionicons.glyphMap;
  iconFilled: keyof typeof Ionicons.glyphMap;
}

/**
 * Each option carries a short description that demystifies the sort logic
 * — "Recommended" alone doesn't tell the user what the algorithm actually
 * does; "Best matches for you" does. Subtitles also help differentiate
 * "Recently active" from "Newest members" which can read as similar at a
 * glance.
 */
const SORT_OPTIONS: SortOptionItem[] = [
  {
    key: "recommended",
    label: "Recommended",
    description: "Best matches for you",
    iconOutline: "ribbon-outline",
    iconFilled: "ribbon",
  },
  {
    key: "login",
    label: "Recently active",
    description: "Active in the last few hours",
    iconOutline: "time-outline",
    iconFilled: "time",
  },
  {
    key: "likes",
    label: "Most liked",
    description: "Profiles with the most Likes",
    iconOutline: "heart-outline",
    iconFilled: "heart",
  },
  {
    key: "registration",
    label: "Newest members",
    description: "Recently joined GolfMatch",
    iconOutline: "person-add-outline",
    iconFilled: "person-add",
  },
];

interface SortModalProps {
  visible: boolean;
  currentSort: SortOption;
  onSelect: (sort: SortOption) => void;
  onClose: () => void;
}

const SortModal: React.FC<SortModalProps> = ({
  visible,
  currentSort,
  onSelect,
  onClose,
}) => {
  const insets = useSafeAreaInsets();

  const handleSelect = (option: SortOptionItem) => {
    onSelect(option.key);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* Tap-anywhere-outside-to-dismiss scrim */}
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay} />
      </TouchableWithoutFeedback>

      <View
        style={[
          styles.sheet,
          { paddingBottom: Math.max(insets.bottom, Spacing.md) },
        ]}
      >
        {/* iOS-style drag handle. Visual affordance for swipe-down-to-dismiss
            (the underlying Modal already handles the gesture on iOS). */}
        <View style={styles.handleContainer}>
          <View style={styles.handle} />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Close sort options"
          >
            <Ionicons name="close" size={24} color={Colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Sort by</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Options card */}
        <View style={styles.cardWrapper}>
          <View style={styles.card}>
            {SORT_OPTIONS.map((option, index) => {
              const isSelected = currentSort === option.key;
              const isLast = index === SORT_OPTIONS.length - 1;

              return (
                <TouchableOpacity
                  key={option.key}
                  style={[styles.row, !isLast && styles.rowBorder]}
                  onPress={() => handleSelect(option)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${option.label}, ${option.description}`}
                  accessibilityState={{ selected: isSelected }}
                >
                  <View style={styles.rowLeft}>
                    <View
                      style={[
                        styles.iconContainer,
                        isSelected && styles.iconContainerActive,
                      ]}
                    >
                      <Ionicons
                        name={isSelected ? option.iconFilled : option.iconOutline}
                        size={18}
                        color={isSelected ? Colors.primary : Colors.gray[500]}
                      />
                    </View>
                    <View style={styles.rowText}>
                      <Text
                        style={[
                          styles.rowLabel,
                          isSelected && styles.rowLabelActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                      <Text style={styles.rowDescription}>
                        {option.description}
                      </Text>
                    </View>
                  </View>
                  {isSelected ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={22}
                      color={Colors.primary}
                    />
                  ) : (
                    <View style={styles.unselectedDot} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
  },

  // iOS drag handle (purely visual — the gesture is handled by Modal itself)
  handleContainer: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 4,
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.gray[300],
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
  },
  headerSpacer: {
    width: 32,
  },

  // Options card
  cardWrapper: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    ...Shadows.small,
  },

  // Row
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    minHeight: 64,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.gray[200],
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.gray[100],
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.sm + 2,
  },
  iconContainerActive: {
    backgroundColor: Colors.primary + "15",
  },
  rowText: {
    flex: 1,
  },
  rowLabel: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.primary,
    marginBottom: 2,
  },
  rowLabelActive: {
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.primary,
  },
  rowDescription: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    lineHeight: 16,
  },

  // Empty placeholder circle for unselected rows — keeps the right column
  // a constant width so labels don't shift when the user picks a new sort.
  unselectedDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: Colors.gray[300],
  },
});

export default SortModal;
