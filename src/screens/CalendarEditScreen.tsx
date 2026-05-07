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
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";

import { Colors } from "../constants/colors";
import { Spacing, BorderRadius } from "../constants/spacing";
import { Typography } from "../constants/typography";
import { RootStackParamList } from "../types";
import { Availability } from "../types/dataModels";
import { DataProvider } from "../services";
import StandardHeader from "../components/StandardHeader";

type CalendarEditScreenNavigationProp = StackNavigationProp<RootStackParamList>;

const CalendarEditScreen: React.FC = () => {
  const navigation = useNavigation<CalendarEditScreenNavigationProp>();
  const { profileId } = useAuth(); // Get current user's profile ID
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
      
      // Get current user ID from AuthContext
      const userId = profileId || process.env.EXPO_PUBLIC_TEST_USER_ID;
      
      
      if (!userId) {
        console.error("No authenticated user found");
        Alert.alert("Error", "Please sign in to edit your calendar");
        return;
      }

      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;
      
      
      const response = await DataProvider.getUserAvailability(
        userId,
        month,
        year,
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
      } else {
        setAvailabilityStates({});
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
      
      // Get current user ID from AuthContext
      const userId = profileId || process.env.EXPO_PUBLIC_TEST_USER_ID;
      
      if (!userId) {
        console.error("No authenticated user found");
        Alert.alert("Error", "Please sign in to save your calendar");
        setSaving(false);
        return;
      }
      
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;

      // Filter to only include dates from the current month being edited
      const availabilityData = Object.entries(availabilityStates)
        .filter(([date, state]) => {
          // Only include dates that are not "unsure"
          if (state === "unsure") return false;
          
          // Only include dates that belong to the current month/year
          const dateYear = parseInt(date.split('-')[0]);
          const dateMonth = parseInt(date.split('-')[1]);
          
          return dateYear === year && dateMonth === month;
        })
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
        console.error("Save failed:", response.error);
        Alert.alert("エラー", `保存に失敗しました: ${response.error}`);
      } else {
        Alert.alert("保存完了", "ゴルフ可能日を更新しました。", [
          {
            text: "OK",
            onPress: () => navigation.goBack(),
          },
        ]);
      }
    } catch (error) {
      console.error("Error saving availability:", error);
      Alert.alert("エラー", "保存中にエラーが発生しました。");
    } finally {
      setSaving(false);
    }
  };

  // Handle date selection - cycle through three states
  const handleDatePress = (day: number) => {
    if (!day) return;

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    const dateString = `${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;

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
  };

  // Load data when component mounts
  useEffect(() => {
    loadAvailability();
  }, []);

  // Load data when month changes
  useEffect(() => {
    loadAvailability();
  }, [currentDate]);

  const saveButtonComponent = (
    <TouchableOpacity
      onPress={saveAvailability}
      style={[styles.saveButton, saving && styles.saveButtonDisabled]}
      disabled={saving}
    >
      <Text style={[styles.saveText, saving && styles.saveTextDisabled]}>
        {saving ? "保存中..." : "保存"}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <StandardHeader
        title="カレンダー"
        showBackButton={true}
        onBackPress={() => navigation.goBack()}
        rightComponent={saveButtonComponent}
      />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Month Navigation */}
        <View style={styles.monthNavigation}>
          <TouchableOpacity
            onPress={() => navigateMonth("prev")}
            style={styles.navButton}
          >
            <Ionicons name="chevron-back" size={24} color={Colors.primary} />
          </TouchableOpacity>

          <Text style={styles.monthTitle}>
            {currentDate.getFullYear()}年 {monthNames[currentDate.getMonth()]}
          </Text>

          <TouchableOpacity
            onPress={() => navigateMonth("next")}
            style={styles.navButton}
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
                  testID={`calendar-day-${day}`}
                  style={[
                    styles.dayCell,
                    availabilityState === "available" && styles.availableDay,
                    availabilityState === "unavailable" &&
                      styles.unavailableDay,
                    isToday && styles.todayDay,
                  ]}
                  onPress={() => handleDatePress(day)}
                >
                  <View style={styles.dayContent}>
                    <Text
                      style={[
                        styles.dayText,
                        availabilityState === "available" &&
                          styles.availableDayText,
                        availabilityState === "unavailable" &&
                          styles.unavailableDayText,
                        isToday && !availabilityState && styles.todayText,
                        dayOfWeek === 0 && styles.sundayText,
                        dayOfWeek === 6 && styles.saturdayText,
                      ]}
                    >
                      {day}
                    </Text>

                    {/* Availability Icon */}
                    <View style={styles.availabilityIcon}>
                      {availabilityState === "available" && (
                        <Ionicons
                          name="checkmark-circle"
                          size={16}
                          color={Colors.success}
                        />
                      )}
                      {availabilityState === "unavailable" && (
                        <Ionicons
                          name="close-circle"
                          size={16}
                          color={Colors.error}
                        />
                      )}
                      {availabilityState === "unsure" && (
                        <Ionicons
                          name="remove-circle"
                          size={16}
                          color={Colors.gray[400]}
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
          <View style={styles.legendItem}>
            <Ionicons name="remove-circle" size={16} color={Colors.gray[400]} />
            <Text style={styles.legendText}>未設定</Text>
          </View>
        </View>

        {/* Instructions */}
        <View style={styles.instructionsCard}>
          <View style={styles.instructionsHeader}>
            <Ionicons name="help-circle" size={20} color={Colors.primary} />
            <Text style={styles.instructionsTitle}>使い方</Text>
          </View>

          <View style={styles.instructionsList}>
            <View style={styles.instructionItem}>
              <View style={styles.instructionIconWrapper}>
                <Ionicons name="finger-print-outline" size={18} color={Colors.primary} />
              </View>
              <Text style={styles.instructionText}>
                日付をタップして状態を切り替え
              </Text>
            </View>

            <View style={styles.instructionItem}>
              <View style={[styles.instructionIconWrapper, { backgroundColor: Colors.success + "15" }]}>
                <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
              </View>
              <Text style={styles.instructionText}>
                ゴルフ可能日として設定
              </Text>
            </View>

            <View style={styles.instructionItem}>
              <View style={[styles.instructionIconWrapper, { backgroundColor: Colors.error + "15" }]}>
                <Ionicons name="close-circle" size={18} color={Colors.error} />
              </View>
              <Text style={styles.instructionText}>
                ゴルフ不可として設定
              </Text>
            </View>

            <View style={styles.instructionItem}>
              <View style={[styles.instructionIconWrapper, { backgroundColor: Colors.gray[200] }]}>
                <Ionicons name="remove-circle" size={18} color={Colors.gray[500]} />
              </View>
              <Text style={styles.instructionText}>
                未設定に戻す
              </Text>
            </View>
          </View>

          <View style={styles.instructionTip}>
            <Ionicons name="information-circle" size={16} color={Colors.primary} />
            <Text style={styles.instructionTipText}>
              保存ボタンを押すとプロフィールに反映されます
            </Text>
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
  saveButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
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
    paddingVertical: Spacing.lg,
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
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    shadowColor: Colors.black,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  dayHeaders: {
    flexDirection: "row",
    marginBottom: Spacing.sm,
  },
  dayHeader: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.sm,
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
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  dayContent: {
    alignItems: "center",
    justifyContent: "center",
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
    color: Colors.text.primary,
    fontWeight: Typography.fontWeight.medium,
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
    marginTop: 2,
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
    color: Colors.text.secondary,
  },
  instructionsCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    shadowColor: Colors.black,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: Colors.gray[100],
  },
  instructionsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  instructionsTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
  },
  instructionsList: {
    gap: Spacing.sm,
  },
  instructionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  instructionIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  instructionText: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
  },
  instructionTip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[100],
  },
  instructionTipText: {
    flex: 1,
    fontSize: 11,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.primary,
  },
});

export default CalendarEditScreen;
