import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import CalendarEditScreen from "../screens/CalendarEditScreen";
import { AuthProvider } from "../contexts/AuthContext";
import { NavigationContainer } from "@react-navigation/native";
import { DataProvider } from "../services";

// Mock navigation
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock("@react-navigation/native", () => {
  const actualNav = jest.requireActual("@react-navigation/native");
  return {
    ...actualNav,
    useNavigation: () => ({
      navigate: mockNavigate,
      goBack: mockGoBack,
    }),
  };
});

// Mock DataProvider
jest.mock("../services", () => ({
  DataProvider: {
    getUserAvailability: jest.fn(),
    updateUserAvailability: jest.fn(),
  },
}));

// Mock Alert
jest.spyOn(Alert, "alert");

const wrap = (ui: React.ReactElement) => (
  <AuthProvider>
    <NavigationContainer>{ui}</NavigationContainer>
  </AuthProvider>
);

describe("CalendarEditScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock responses
    (DataProvider.getUserAvailability as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });
    
    (DataProvider.updateUserAvailability as jest.Mock).mockResolvedValue({
      success: true,
      data: true,
    });
  });

  describe("Initial Render", () => {
    it("renders calendar edit screen", async () => {
      const { getByText } = render(wrap(<CalendarEditScreen />));
      
      await waitFor(() => {
        expect(getByText(/月/)).toBeTruthy();
      });
    });

    it("displays day names", async () => {
      const { getByText } = render(wrap(<CalendarEditScreen />));
      
      await waitFor(() => {
        const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
        dayNames.forEach((day) => {
          expect(getByText(day)).toBeTruthy();
        });
      });
    });

    it("shows save button", async () => {
      const { getByText } = render(wrap(<CalendarEditScreen />));
      
      await waitFor(() => {
        expect(getByText("保存")).toBeTruthy();
      });
    });
  });

  describe("Loading Availability", () => {
    it("loads user availability on mount", async () => {
      render(wrap(<CalendarEditScreen />));
      
      await waitFor(() => {
        expect(DataProvider.getUserAvailability).toHaveBeenCalled();
      });
    });

    it("displays loaded availability data", async () => {
      const mockData = [
        {
          id: "1",
          user_id: "test-user-id",
          date: "2025-11-01",
          is_available: true,
          time_slots: ["09:00"],
          notes: "午前のみ",
        },
      ];

      (DataProvider.getUserAvailability as jest.Mock).mockResolvedValue({
        success: true,
        data: mockData,
      });

      const { getByText } = render(wrap(<CalendarEditScreen />));
      
      await waitFor(() => {
        expect(getByText("1")).toBeTruthy();
      });
    });

    it("handles loading error gracefully", async () => {
      (DataProvider.getUserAvailability as jest.Mock).mockRejectedValue(
        new Error("Network error")
      );

      const { getByText } = render(wrap(<CalendarEditScreen />));
      
      await waitFor(() => {
        // Should still render the calendar
        expect(getByText(/月/)).toBeTruthy();
      });
    });
  });

  describe("Date Selection", () => {
    it("toggles date availability on press", async () => {
      const { getByText } = render(wrap(<CalendarEditScreen />));
      
      await waitFor(() => {
        const day1 = getByText("1");
        expect(day1).toBeTruthy();
      });

      const day1 = getByText("1");
      
      // First press - mark as available
      fireEvent.press(day1);
      
      // Second press - mark as unavailable
      fireEvent.press(day1);
      
      // Third press - mark as unsure (clear)
      fireEvent.press(day1);
    });

    it("allows selecting multiple dates", async () => {
      const { getByText } = render(wrap(<CalendarEditScreen />));
      
      await waitFor(() => {
        expect(getByText("1")).toBeTruthy();
      });

      const day1 = getByText("1");
      const day2 = getByText("2");
      const day3 = getByText("3");
      
      fireEvent.press(day1);
      fireEvent.press(day2);
      fireEvent.press(day3);
      
      // All three dates should be selected
    });
  });

  describe("Month Navigation", () => {
    it("navigates to next month", async () => {
      const { getByTestId } = render(wrap(<CalendarEditScreen />));
      
      await waitFor(() => {
        const nextButton = getByTestId("next-month-button");
        expect(nextButton).toBeTruthy();
      });

      const nextButton = getByTestId("next-month-button");
      fireEvent.press(nextButton);
      
      // Should load availability for next month
      await waitFor(() => {
        expect(DataProvider.getUserAvailability).toHaveBeenCalledTimes(2);
      });
    });

    it("navigates to previous month", async () => {
      const { getByTestId } = render(wrap(<CalendarEditScreen />));
      
      await waitFor(() => {
        const prevButton = getByTestId("prev-month-button");
        expect(prevButton).toBeTruthy();
      });

      const prevButton = getByTestId("prev-month-button");
      fireEvent.press(prevButton);
      
      // Should load availability for previous month
      await waitFor(() => {
        expect(DataProvider.getUserAvailability).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe("Saving Availability", () => {
    it("saves availability when save button is pressed", async () => {
      const { getByText } = render(wrap(<CalendarEditScreen />));
      
      await waitFor(() => {
        expect(getByText("1")).toBeTruthy();
      });

      // Select a date
      const day1 = getByText("1");
      fireEvent.press(day1);
      
      // Press save button
      const saveButton = getByText("保存");
      fireEvent.press(saveButton);
      
      await waitFor(() => {
        expect(DataProvider.updateUserAvailability).toHaveBeenCalled();
      });
    });

    it("shows success alert on successful save", async () => {
      const { getByText } = render(wrap(<CalendarEditScreen />));
      
      await waitFor(() => {
        expect(getByText("保存")).toBeTruthy();
      });

      const saveButton = getByText("保存");
      fireEvent.press(saveButton);
      
      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          "保存完了",
          "ゴルフ可能日を更新しました。",
          expect.any(Array)
        );
      });
    });

    it("shows error alert on save failure", async () => {
      (DataProvider.updateUserAvailability as jest.Mock).mockResolvedValue({
        success: false,
        error: "Save failed",
      });

      const { getByText } = render(wrap(<CalendarEditScreen />));
      
      await waitFor(() => {
        expect(getByText("保存")).toBeTruthy();
      });

      const saveButton = getByText("保存");
      fireEvent.press(saveButton);
      
      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          "エラー",
          "保存に失敗しました。"
        );
      });
    });

    it("navigates back after successful save", async () => {
      const { getByText } = render(wrap(<CalendarEditScreen />));
      
      await waitFor(() => {
        expect(getByText("保存")).toBeTruthy();
      });

      const saveButton = getByText("保存");
      fireEvent.press(saveButton);
      
      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalled();
      });

      // Simulate pressing OK on alert
      const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
      const okButton = alertCall[2][0]; // Get OK button from alert options
      okButton.onPress();
      
      expect(mockGoBack).toHaveBeenCalled();
    });

    it("disables save button while saving", async () => {
      const { getByText } = render(wrap(<CalendarEditScreen />));
      
      await waitFor(() => {
        expect(getByText("保存")).toBeTruthy();
      });

      const saveButton = getByText("保存");
      fireEvent.press(saveButton);
      
      // Button should show "保存中..." while saving
      await waitFor(() => {
        expect(getByText("保存中...")).toBeTruthy();
      });
    });
  });

  describe("Data Persistence", () => {
    it("only saves dates with availability state (not unsure)", async () => {
      const { getByText } = render(wrap(<CalendarEditScreen />));
      
      await waitFor(() => {
        expect(getByText("1")).toBeTruthy();
      });

      // Select day 1 as available
      const day1 = getByText("1");
      fireEvent.press(day1);
      
      // Select day 2 as unavailable
      const day2 = getByText("2");
      fireEvent.press(day2);
      fireEvent.press(day2);
      
      // Select day 3 and cycle back to unsure
      const day3 = getByText("3");
      fireEvent.press(day3);
      fireEvent.press(day3);
      fireEvent.press(day3);
      
      // Save
      const saveButton = getByText("保存");
      fireEvent.press(saveButton);
      
      await waitFor(() => {
        const callArgs = (DataProvider.updateUserAvailability as jest.Mock).mock.calls[0];
        const availabilityData = callArgs[3];
        
        // Should only include day 1 and day 2, not day 3
        expect(availabilityData.length).toBe(2);
      });
    });
  });

  describe("Error Handling", () => {
    it("handles network errors during save", async () => {
      (DataProvider.updateUserAvailability as jest.Mock).mockRejectedValue(
        new Error("Network error")
      );

      const { getByText } = render(wrap(<CalendarEditScreen />));
      
      await waitFor(() => {
        expect(getByText("保存")).toBeTruthy();
      });

      const saveButton = getByText("保存");
      fireEvent.press(saveButton);
      
      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          "エラー",
          "保存中にエラーが発生しました。"
        );
      });
    });

    it("handles missing user authentication", async () => {
      // Mock no authenticated user
      process.env.EXPO_PUBLIC_TEST_USER_ID = "";

      const { getByText } = render(wrap(<CalendarEditScreen />));
      
      await waitFor(() => {
        expect(getByText("保存")).toBeTruthy();
      });

      const saveButton = getByText("保存");
      fireEvent.press(saveButton);
      
      // Should not attempt to save without user ID
      expect(DataProvider.updateUserAvailability).not.toHaveBeenCalled();
    });
  });
});


