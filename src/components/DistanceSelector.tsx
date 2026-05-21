import React from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../constants/colors";
import { Spacing, BorderRadius } from "../constants/spacing";
import { Typography } from "../constants/typography";
import { DISTANCE_OPTIONS } from "../constants/filterOptions";

interface DistanceSelectorProps {
  visible: boolean;
  selectedMiles: number | null | undefined;
  onClose: () => void;
  onApply: (miles: number | null) => void;
}

/**
 * Radius picker for the search filter. Cloned from LastLoginSelector so
 * the visual language matches all other filter selectors (header, list,
 * checkmark, apply CTA). Six fixed options instead of a slider — bands
 * are coarse on purpose (matching SQL distance bands) and a slider here
 * would imply a precision the matching algorithm doesn't actually use.
 */
const DistanceSelector: React.FC<DistanceSelectorProps> = ({
  visible,
  selectedMiles,
  onClose,
  onApply,
}) => {
  const [tempSelected, setTempSelected] = React.useState<number | null | undefined>(
    selectedMiles,
  );

  React.useEffect(() => {
    setTempSelected(selectedMiles);
  }, [selectedMiles, visible]);

  const handleApply = () => {
    onApply(tempSelected ?? null);
    onClose();
  };

  const handleClear = () => {
    setTempSelected(null);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={Colors.gray[600]} />
          </TouchableOpacity>
          <Text style={styles.title}>Distance</Text>
          <TouchableOpacity onPress={handleClear}>
            <Text style={styles.clearButton}>Clear</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {DISTANCE_OPTIONS.map((option) => {
            const isSelected = tempSelected === option.value;
            return (
              <TouchableOpacity
                key={option.value?.toString() ?? "null"}
                style={[styles.option, isSelected && styles.optionSelected]}
                onPress={() => setTempSelected(option.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
              >
                <Text
                  style={[
                    styles.optionText,
                    isSelected && styles.optionTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
                {isSelected && (
                  <Ionicons name="checkmark" size={20} color={Colors.primary} />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.applyButton} onPress={handleApply}>
            <Text style={styles.applyButtonText}>Apply</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
  },
  clearButton: {
    fontSize: Typography.fontSize.base,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
  },
  content: {
    flex: 1,
    backgroundColor: Colors.white,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  option: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  optionSelected: {
    backgroundColor: Colors.primaryLight,
  },
  optionText: {
    fontSize: Typography.fontSize.base,
    color: Colors.text.primary,
  },
  optionTextSelected: {
    color: Colors.primary,
    fontWeight: Typography.fontWeight.semibold,
  },
  actionButtons: {
    padding: Spacing.md,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  applyButton: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
  },
  applyButtonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.white,
  },
});

export default DistanceSelector;
