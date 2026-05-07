import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { Colors } from "../constants/colors";
import { Spacing, BorderRadius } from "../constants/spacing";
import { Typography } from "../constants/typography";
import { Availability, CalendarData } from "../types/dataModels";
import { DataProvider } from "../services";

interface GolfCalendarProps {
  visible?: boolean;
  onClose?: () => void;
  userId?: string;
  // For inline usage in UserProfile
  calendarData?: CalendarData;
  onDatePress?: (date: string) => void;
  onMonthChange?: (year: number, month: number) => Promise<void>;
  currentYear?: number;
  currentMonth?: number;
}

const GolfCalendar: React.FC<GolfCalendarProps> = ({
  visible = false,
  onClose,
  userId = "current_user",
  calendarData,
  onDatePress,
  onMonthChange,
  currentYear,
  currentMonth,
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [availabilityStates, setAvailabilityStates] = useState<
    Record<string, "available" | "unavailable" | "unsure">
  >({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Generate calendar data
  const generateCalendarData = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }

    return days;
  };

  const calendarDays = generateCalendarData(currentDate);
  const monthNames = [
    "1月",
    "2月",
    "3月",
    "4月",
    "5月",
    "6月",
    "7月",
    "8月",
    "9月",
    "10月",
    "11月",
    "12月",
  ];
  const dayNames = ["日", "月", "火", "水", "木", "金", "土"];

  // Load availability data
  const loadAvailability = async () => {
    try {
      setLoading(true);

      // If calendarData is provided (inline usage), use it directly
      if (calendarData) {
        const states: Record<string, "available" | "unavailable" | "unsure"> =
          {};

        (calendarData.days || []).forEach((availability: Availability) => {
          if (availability.is_available) {
            states[availability.date] = "available";
          } else {
            states[availability.date] = "unavailable";
          }
        });

        setAvailabilityStates(states);
        return;
      }

      // Otherwise, fetch from DataProvider (modal usage)
      const response = await DataProvider.getUserAvailability(
        userId,
        currentDate.getMonth() + 1,
        currentDate.getFullYear(),
      );


      if (response.data) {
        const states: Record<string, "available" | "unavailable" | "unsure"> =
          {};

        (response.data.days || []).forEach((availability: Availability) => {
          if (availability.is_available) {
            states[availability.date] = "available";
          } else {
            states[availability.date] = "unavailable";
          }
        });

        setAvailabilityStates(states);
      }
    } catch (error) {
      console.error("Error loading availability:", error);
    } finally {
      setLoading(false);
    }
  };

  // Save availability data
  const saveAvailability = async () => {
    try {
      setSaving(true);
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;

      const availabilityData = Object.entries(availabilityStates)
        .filter(([_, state]) => state !== "unsure")
        .map(([date, state]) => ({
          user_id: userId,
          date,
          is_available: state === "available",
        }));

      const response = await DataProvider.updateUserAvailability(
        userId,
        year,
        month,
        availabilityData,
      );

      if (response.error) {
        Alert.alert("エラー", "保存に失敗しました。");
      } else {
        Alert.alert("保存完了", "ゴルフ可能日を更新しました。");
      }
    } catch (error) {
      console.error("Error saving availability:", error);
      Alert.alert("エラー", "保存中にエラーが発生しました。");
    } finally {
      setSaving(false);
    }
  };

  // Handle date selection
  const handleDatePress = (day: number) => {
    if (!day) return;

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    const dateString = `${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;

    // If onDatePress is provided (inline usage), call it
    if (onDatePress) {
      onDatePress(dateString);
      return;
    }

    // Otherwise, handle selection for modal usage - cycle through three states
    setAvailabilityStates((prev) => {
      const currentState = prev[dateString];
      let nextState: "available" | "unavailable" | "unsure";

      // Cycle through states: unsure -> available -> unavailable -> unsure
      if (!currentState || currentState === "unsure") {
        nextState = "available";
      } else if (currentState === "available") {
        nextState = "unavailable";
      } else {
        nextState = "unsure";
      }

      return {
        ...prev,
        [dateString]: nextState,
      };
    });
  };

  // Navigate months
  const navigateMonth = (direction: "prev" | "next") => {
    const newDate = new Date(currentDate);
    if (direction === "prev") {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setCurrentDate(newDate);

    // If onMonthChange is provided (inline usage), call it
    if (onMonthChange) {
      onMonthChange(newDate.getFullYear(), newDate.getMonth() + 1);
    }
  };

  // Load data when component mounts or month changes
  // Use JSON.stringify for calendarData to avoid infinite loop from object reference changes
  const calendarDataString = calendarData ? JSON.stringify(calendarData.days) : null;

  useEffect(() => {
    if (visible || calendarData) {
      loadAvailability();
    }
  }, [visible, currentDate, calendarDataString]);

  // For modal usage, only render if visible
  if (visible === false && !calendarData) return null;

  // For inline usage, render the calendar content directly
  if (calendarData) {
    return (
      <View style={styles.inlineContainer}>
        {/* Month Navigation */}
        <View style={styles.monthNavigation}>
          <TouchableOpacity
            onPress={() => navigateMonth("prev")}
            style={styles.navButton}
            testID="prev-month-button"
          >
            <Ionicons name="chevron-back" size={24} color={Colors.primary} />
          </TouchableOpacity>

          <Text style={styles.monthTitle}>
            {currentDate.getFullYear()}年 {monthNames[currentDate.getMonth()]}
          </Text>

          <TouchableOpacity
            onPress={() => navigateMonth("next")}
            style={styles.navButton}
            testID="next-month-button"
          >
            <Ionicons name="chevron-forward" size={24} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Calendar */}
        <View style={styles.calendar}>
          {/* Day headers */}
          <View style={styles.dayHeaders}>
            {dayNames.map((day, index) => (
              <View key={index} style={styles.dayHeader}>
                <Text
                  style={[
                    styles.dayHeaderText,
                    index === 0 && styles.sundayText,
                    index === 6 && styles.saturdayText,
                  ]}
                >
                  {day}
                </Text>
              </View>
            ))}
          </View>

          {/* Calendar grid */}
          <View style={styles.calendarGrid}>
            {calendarDays.map((day, index) => {
              if (!day) {
                return <View key={index} style={styles.dayCell} />;
              }

              const year = currentDate.getFullYear();
              const month = currentDate.getMonth() + 1;
              const dateString = `${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
              const availabilityState =
                availabilityStates[dateString] || "unsure";
              const isToday =
                new Date().toDateString() ===
                new Date(year, month - 1, day).toDateString();
              const dayOfWeek = new Date(year, month - 1, day).getDay();

              return (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.dayCell,
                    availabilityState === "available" && styles.availableDay,
                    availabilityState === "unavailable" && styles.unavailableDay,
                    isToday && availabilityState === "unsure" && styles.todayDay,
                  ]}
                  onPress={() => handleDatePress(day)}
                >
                  <View style={styles.dayContent}>
                    <Text
                      style={[
                        styles.dayText,
                        availabilityState === "available" && styles.availableDayText,
                        availabilityState === "unavailable" && styles.unavailableDayText,
                        isToday && availabilityState === "unsure" && styles.todayText,
                        dayOfWeek === 0 && styles.sundayText,
                        dayOfWeek === 6 && styles.saturdayText,
                      ]}
                    >
                      {day}
                    </Text>

                    {/* Availability Icon - only show for available/unavailable */}
                    <View style={styles.availabilityIcon}>
                      {availabilityState === "available" && (
                        <Ionicons
                          name="checkmark-circle"
                          size={12}
                          color={Colors.success}
                        />
                      )}
                      {availabilityState === "unavailable" && (
                        <Ionicons
                          name="close-circle"
                          size={12}
                          color={Colors.error}
                        />
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.headerButton} testID="close-calendar-button">
          <Ionicons name="close" size={24} color={Colors.gray[600]} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>ゴルフ可能日</Text>

        <TouchableOpacity
          onPress={saveAvailability}
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          disabled={saving}
        >
          <Text style={[styles.saveText, saving && styles.saveTextDisabled]}>
            {saving ? "保存中..." : "保存"}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Month Navigation */}
        <View style={styles.monthNavigation}>
          <TouchableOpacity
            onPress={() => navigateMonth("prev")}
            style={styles.navButton}
            testID="prev-month-button"
          >
            <Ionicons name="chevron-back" size={24} color={Colors.primary} />
          </TouchableOpacity>

          <Text style={styles.monthTitle}>
            {currentDate.getFullYear()}年 {monthNames[currentDate.getMonth()]}
          </Text>

          <TouchableOpacity
            onPress={() => navigateMonth("next")}
            style={styles.navButton}
            testID="next-month-button"
          >
            <Ionicons name="chevron-forward" size={24} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Calendar */}
        <View style={styles.calendar}>
          {/* Day headers */}
          <View style={styles.dayHeaders}>
            {dayNames.map((day, index) => (
              <View key={index} style={styles.dayHeader}>
                <Text
                  style={[
                    styles.dayHeaderText,
                    index === 0 && styles.sundayText,
                    index === 6 && styles.saturdayText,
                  ]}
                >
                  {day}
                </Text>
              </View>
            ))}
          </View>

          {/* Calendar grid */}
          <View style={styles.calendarGrid}>
            {calendarDays.map((day, index) => {
              if (!day) {
                return <View key={index} style={styles.dayCell} />;
              }

              const year = currentDate.getFullYear();
              const month = currentDate.getMonth() + 1;
              const dateString = `${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
              const availabilityState =
                availabilityStates[dateString] || "unsure";
              const isToday =
                new Date().toDateString() ===
                new Date(year, month - 1, day).toDateString();
              const dayOfWeek = new Date(year, month - 1, day).getDay();

              return (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.dayCell,
                    availabilityState === "available" && styles.availableDay,
                    availabilityState === "unavailable" && styles.unavailableDay,
                    isToday && availabilityState === "unsure" && styles.todayDay,
                  ]}
                  onPress={() => handleDatePress(day)}
                >
                  <View style={styles.dayContent}>
                    <Text
                      style={[
                        styles.dayText,
                        availabilityState === "available" && styles.availableDayText,
                        availabilityState === "unavailable" && styles.unavailableDayText,
                        isToday && availabilityState === "unsure" && styles.todayText,
                        dayOfWeek === 0 && styles.sundayText,
                        dayOfWeek === 6 && styles.saturdayText,
                      ]}
                    >
                      {day}
                    </Text>

                    {/* Availability Icon - only show for available/unavailable */}
                    <View style={styles.availabilityIcon}>
                      {availabilityState === "available" && (
                        <Ionicons
                          name="checkmark-circle"
                          size={12}
                          color={Colors.success}
                        />
                      )}
                      {availabilityState === "unavailable" && (
                        <Ionicons
                          name="close-circle"
                          size={12}
                          color={Colors.error}
                        />
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Legend */}
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <Ionicons
              name="checkmark-circle"
              size={16}
              color={Colors.success}
            />
            <Text style={styles.legendText}>ゴルフ可能日</Text>
          </View>
          <View style={styles.legendItem}>
            <Ionicons name="close-circle" size={16} color={Colors.error} />
            <Text style={styles.legendText}>ゴルフ不可</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  inlineContainer: {
    backgroundColor: "transparent",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerButton: {
    padding: Spacing.sm,
  },
  headerTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
  },
  saveButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  saveButtonDisabled: {
    backgroundColor: Colors.gray[300],
  },
  saveText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.white,
  },
  saveTextDisabled: {
    color: Colors.gray[500],
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.md,
  },
  monthNavigation: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.sm,
  },
  navButton: {
    padding: Spacing.sm,
  },
  monthTitle: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
  },
  calendar: {
    backgroundColor: "transparent",
    paddingHorizontal: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  dayHeaders: {
    flexDirection: "row",
    marginBottom: Spacing.xs,
  },
  dayHeader: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.xs,
  },
  dayHeaderText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
    color: Colors.text.secondary,
  },
  sundayText: {
    color: Colors.error,
  },
  saturdayText: {
    color: Colors.primary,
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayCell: {
    width: "14.28%",
    height: 44,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 6,
    position: "relative",
  },
  dayContent: {
    alignItems: "center",
  },
  availableDay: {
    backgroundColor: Colors.success + "20",
    borderRadius: BorderRadius.md,
  },
  unavailableDay: {
    backgroundColor: Colors.error + "20",
    borderRadius: BorderRadius.md,
  },
  todayDay: {
    borderWidth: 2,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.md,
  },
  dayText: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.text.primary,
  },
  availableDayText: {
    color: Colors.success,
    fontWeight: Typography.fontWeight.bold,
  },
  unavailableDayText: {
    color: Colors.error,
    fontWeight: Typography.fontWeight.bold,
  },
  todayText: {
    color: Colors.primary,
    fontWeight: Typography.fontWeight.bold,
  },
  availabilityIcon: {
    position: "absolute",
    bottom: -10,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  legendText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
  },
});

export default GolfCalendar;
