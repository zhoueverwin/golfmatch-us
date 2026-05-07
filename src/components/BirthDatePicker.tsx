import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Platform,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../constants/colors";
import { Spacing, BorderRadius } from "../constants/spacing";
import { Typography } from "../constants/typography";
import { calculateAge } from "../utils/formatters";

interface BirthDatePickerProps {
  visible: boolean;
  selectedDate: string | undefined; // ISO date string (YYYY-MM-DD)
  onClose: () => void;
  onApply: (date: string) => void;
  minAge?: number; // Minimum age allowed (default: 18)
  maxAge?: number; // Maximum age allowed (default: 100)
}

const BirthDatePicker: React.FC<BirthDatePickerProps> = ({
  visible,
  selectedDate,
  onClose,
  onApply,
  minAge = 18,
  maxAge = 100,
}) => {
  // Calculate min/max dates based on age constraints
  const today = new Date();
  const maxDate = new Date(
    today.getFullYear() - minAge,
    today.getMonth(),
    today.getDate()
  );
  const minDate = new Date(
    today.getFullYear() - maxAge,
    today.getMonth(),
    today.getDate()
  );

  // Default to 30 years ago if no date selected
  const defaultDate = new Date(
    today.getFullYear() - 30,
    today.getMonth(),
    today.getDate()
  );

  const [tempDate, setTempDate] = useState<Date>(
    selectedDate ? new Date(selectedDate) : defaultDate
  );

  useEffect(() => {
    if (visible) {
      setTempDate(selectedDate ? new Date(selectedDate) : defaultDate);
    }
  }, [selectedDate, visible]);

  const handleDateChange = (_event: any, date?: Date) => {
    if (date) {
      setTempDate(date);
    }
  };

  const handleApply = () => {
    // Format date as YYYY-MM-DD
    const year = tempDate.getFullYear();
    const month = String(tempDate.getMonth() + 1).padStart(2, "0");
    const day = String(tempDate.getDate()).padStart(2, "0");
    const isoDate = `${year}-${month}-${day}`;
    onApply(isoDate);
    onClose();
  };

  const calculatedAge = calculateAge(tempDate);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={Colors.gray[600]} />
          </TouchableOpacity>
          <Text style={styles.title}>生年月日</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.agePreview}>
            <Text style={styles.agePreviewLabel}>選択中の年齢</Text>
            <Text style={styles.agePreviewValue}>{calculatedAge}歳</Text>
          </View>

          <View style={styles.pickerContainer}>
            <DateTimePicker
              value={tempDate}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={handleDateChange}
              maximumDate={maxDate}
              minimumDate={minDate}
              locale="ja-JP"
              style={styles.picker}
            />
          </View>

          <Text style={styles.hint}>
            {minAge}歳以上{maxAge}歳以下の方がご利用いただけます
          </Text>
        </View>

        {/* Action Button */}
        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.applyButton} onPress={handleApply}>
            <Text style={styles.applyButtonText}>適用</Text>
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
  content: {
    flex: 1,
    backgroundColor: Colors.white,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  agePreview: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  agePreviewLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text.secondary,
    marginBottom: Spacing.xs,
  },
  agePreviewValue: {
    fontSize: Typography.fontSize["3xl"],
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.primary,
  },
  pickerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  picker: {
    width: "100%",
    height: 200,
  },
  hint: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text.tertiary,
    textAlign: "center",
    paddingVertical: Spacing.md,
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

export default BirthDatePicker;
