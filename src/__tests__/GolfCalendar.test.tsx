import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import GolfCalendar from "../components/GolfCalendar";
import { CalendarData } from "../types/dataModels";

// Mock DataProvider
jest.mock("../services", () => ({
  DataProvider: {
    getUserAvailability: jest.fn(),
    updateUserAvailability: jest.fn(),
  },
}));

describe("GolfCalendar Component", () => {
  const mockCalendarData: CalendarData = {
    year: 2025,
    month: 11,
    days: [
      {
        id: "1",
        user_id: "test-user-id",
        date: "2025-11-01",
        is_available: true,
        time_slots: ["09:00", "14:00"],
        notes: "午前と午後可能",
      },
      {
        id: "2",
        user_id: "test-user-id",
        date: "2025-11-05",
        is_available: false,
        time_slots: [],
        notes: "予定あり",
      },
      {
        id: "3",
        user_id: "test-user-id",
        date: "2025-11-15",
        is_available: true,
        time_slots: ["09:00"],
        notes: "午前のみ",
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Inline Display Mode", () => {
    it("renders calendar with provided data", () => {
      const { getByText } = render(
        <GolfCalendar
          calendarData={mockCalendarData}
          userId="test-user-id"
        />
      );

      // Check month header is displayed
      expect(getByText("11月")).toBeTruthy();
    });

    it("displays day names correctly", () => {
      const { getByText } = render(
        <GolfCalendar
          calendarData={mockCalendarData}
          userId="test-user-id"
        />
      );

      // Check all day names are present
      const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
      dayNames.forEach((day) => {
        expect(getByText(day)).toBeTruthy();
      });
    });

    it("marks available dates correctly", () => {
      const { getByText } = render(
        <GolfCalendar
          calendarData={mockCalendarData}
          userId="test-user-id"
        />
      );

      // Day 1 should be available (marked)
      const day1 = getByText("1");
      expect(day1).toBeTruthy();
      
      // Day 5 should be unavailable (marked differently)
      const day5 = getByText("5");
      expect(day5).toBeTruthy();
    });

    it("calls onDatePress when date is pressed", () => {
      const mockOnDatePress = jest.fn();
      const { getByText } = render(
        <GolfCalendar
          calendarData={mockCalendarData}
          userId="test-user-id"
          onDatePress={mockOnDatePress}
        />
      );

      const day1 = getByText("1");
      fireEvent.press(day1);

      expect(mockOnDatePress).toHaveBeenCalledWith("2025-11-01");
    });

    it("calls onMonthChange when navigating months", () => {
      const mockOnMonthChange = jest.fn();
      const { getByTestId } = render(
        <GolfCalendar
          calendarData={mockCalendarData}
          userId="test-user-id"
          onMonthChange={mockOnMonthChange}
          currentYear={2025}
          currentMonth={11}
        />
      );

      // Find and press next month button
      const nextButton = getByTestId("next-month-button");
      fireEvent.press(nextButton);

      expect(mockOnMonthChange).toHaveBeenCalledWith(2025, 12);
    });

    it("navigates to previous month correctly", () => {
      const mockOnMonthChange = jest.fn();
      const { getByTestId } = render(
        <GolfCalendar
          calendarData={mockCalendarData}
          userId="test-user-id"
          onMonthChange={mockOnMonthChange}
          currentYear={2025}
          currentMonth={11}
        />
      );

      // Find and press previous month button
      const prevButton = getByTestId("prev-month-button");
      fireEvent.press(prevButton);

      expect(mockOnMonthChange).toHaveBeenCalledWith(2025, 10);
    });
  });

  describe("Modal Mode", () => {
    it("does not render when visible is false", () => {
      const { queryByText } = render(
        <GolfCalendar
          visible={false}
          userId="test-user-id"
        />
      );

      expect(queryByText("11月")).toBeNull();
    });

    it("renders when visible is true", () => {
      const { getByText } = render(
        <GolfCalendar
          visible={true}
          userId="test-user-id"
          calendarData={mockCalendarData}
        />
      );

      expect(getByText("11月")).toBeTruthy();
    });

    it("calls onClose when close button is pressed", () => {
      const mockOnClose = jest.fn();
      const { getByTestId } = render(
        <GolfCalendar
          visible={true}
          userId="test-user-id"
          calendarData={mockCalendarData}
          onClose={mockOnClose}
        />
      );

      const closeButton = getByTestId("close-calendar-button");
      fireEvent.press(closeButton);

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe("Empty State", () => {
    it("renders calendar with no availability data", () => {
      const emptyData: CalendarData = {
        year: 2025,
        month: 11,
        days: [],
      };

      const { getByText } = render(
        <GolfCalendar
          calendarData={emptyData}
          userId="test-user-id"
        />
      );

      // Should still render month header
      expect(getByText("11月")).toBeTruthy();
    });
  });

  describe("Date Formatting", () => {
    it("handles dates correctly across month boundaries", () => {
      const decemberData: CalendarData = {
        year: 2025,
        month: 12,
        days: [
          {
            id: "1",
            user_id: "test-user-id",
            date: "2025-12-31",
            is_available: true,
            time_slots: ["09:00"],
            notes: "年末可能",
          },
        ],
      };

      const { getByText } = render(
        <GolfCalendar
          calendarData={decemberData}
          userId="test-user-id"
        />
      );

      expect(getByText("12月")).toBeTruthy();
      expect(getByText("31")).toBeTruthy();
    });
  });
});


