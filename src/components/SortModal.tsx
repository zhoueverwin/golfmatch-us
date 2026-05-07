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
import { Spacing, BorderRadius } from "../constants/spacing";
import { Typography } from "../constants/typography";

export type SortOption = "recommended" | "login" | "likes" | "registration";

interface SortOptionItem {
  key: SortOption;
  label: string;
  premium: boolean;
}

const SORT_OPTIONS: SortOptionItem[] = [
  { key: "recommended", label: "おすすめ順", premium: false },
  { key: "login", label: "ログインが新しい順", premium: true },
  { key: "likes", label: "いいね！の多い順", premium: true },
  { key: "registration", label: "登録日が新しい順", premium: true },
];

interface SortModalProps {
  visible: boolean;
  currentSort: SortOption;
  isPremium: boolean;
  onSelect: (sort: SortOption) => void;
  onClose: () => void;
  onPremiumPress?: () => void;
}

const SortModal: React.FC<SortModalProps> = ({
  visible,
  currentSort,
  isPremium,
  onSelect,
  onClose,
  onPremiumPress,
}) => {
  const insets = useSafeAreaInsets();

  const handleSelect = (option: SortOptionItem) => {
    if (option.premium && !isPremium) {
      onClose();
      onPremiumPress?.();
      return;
    }
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
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay} />
      </TouchableWithoutFeedback>

      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, Spacing.lg) }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={24} color={Colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>並び替え</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Options */}
        {SORT_OPTIONS.map((option, index) => {
          const isSelected = currentSort === option.key;
          const isLocked = option.premium && !isPremium;

          return (
            <React.Fragment key={option.key}>
              {/* Divider before premium section */}
              {index > 0 && !SORT_OPTIONS[index - 1].premium && option.premium && (
                <View style={styles.sectionDivider} />
              )}
              <TouchableOpacity
                style={[
                  styles.optionRow,
                  option.premium && styles.optionRowPremium,
                ]}
                onPress={() => handleSelect(option)}
                activeOpacity={isLocked ? 1 : 0.6}
              >
                <Text
                  style={[
                    styles.optionLabel,
                    isLocked && styles.optionLabelLocked,
                  ]}
                >
                  {option.label}
                </Text>
                {isSelected && !isLocked && (
                  <Ionicons name="checkmark" size={22} color={Colors.primary} />
                )}
                {isLocked && (
                  <Ionicons name="lock-closed" size={18} color="#D4A017" />
                )}
              </TouchableOpacity>
            </React.Fragment>
          );
        })}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
  },
  headerSpacer: {
    width: 32,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: Colors.gray[100],
    marginHorizontal: Spacing.lg,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md + 2,
  },
  optionRowPremium: {
    backgroundColor: "#FFF8E1",
  },
  optionLabel: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.primary,
  },
  optionLabelLocked: {
    color: Colors.text.secondary,
  },
});

export default SortModal;
