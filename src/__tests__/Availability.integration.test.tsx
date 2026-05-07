import { DataProvider } from "../services";
import { CalendarData, Availability } from "../types/dataModels";

// Integration tests for Availability feature
// These tests verify the full flow from UI to database

describe("Availability Integration Tests", () => {
  const testUserId = process.env.EXPO_PUBLIC_TEST_USER_ID || "test-user-id";
  const testYear = 2025;
  const testMonth = 12; // December 2025

  beforeEach(() => {
    // Clear any cached data
    jest.clearAllMocks();
  });

  describe("getUserAvailability", () => {
    it("retrieves availability for a specific month", async () => {
      const result = await DataProvider.getUserAvailability(
        testUserId,
        testMonth,
        testYear
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.year).toBe(testYear);
      expect(result.data?.month).toBe(testMonth);
      expect(Array.isArray(result.data?.days)).toBe(true);
    });

    it("returns empty array for months with no availability", async () => {
      // Use a far future month that likely has no data
      const result = await DataProvider.getUserAvailability(
        testUserId,
        1,
        2030
      );

      expect(result.success).toBe(true);
      expect(result.data?.days).toEqual([]);
    });

    it("handles invalid user ID gracefully", async () => {
      const result = await DataProvider.getUserAvailability(
        "invalid-user-id",
        testMonth,
        testYear
      );

      // Should either return empty data or error
      expect(result).toBeDefined();
    });
  });

  describe("setAvailability", () => {
    const testDate = `${testYear}-${String(testMonth).padStart(2, "0")}-15`;

    it("sets availability for a specific date", async () => {
      const result = await DataProvider.setAvailability(
        testUserId,
        testDate,
        true,
        ["09:00", "14:00"],
        "テスト可能日"
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.date).toBe(testDate);
      expect(result.data?.is_available).toBe(true);
      expect(result.data?.time_slots).toEqual(["09:00", "14:00"]);
      expect(result.data?.notes).toBe("テスト可能日");
    });

    it("updates existing availability", async () => {
      // First, set availability
      await DataProvider.setAvailability(
        testUserId,
        testDate,
        true,
        ["09:00"],
        "午前のみ"
      );

      // Then update it
      const result = await DataProvider.setAvailability(
        testUserId,
        testDate,
        false,
        [],
        "予定変更"
      );

      expect(result.success).toBe(true);
      expect(result.data?.is_available).toBe(false);
      expect(result.data?.notes).toBe("予定変更");
    });

    it("handles availability without time slots", async () => {
      const result = await DataProvider.setAvailability(
        testUserId,
        testDate,
        true
      );

      expect(result.success).toBe(true);
      expect(result.data?.time_slots).toEqual([]);
    });
  });

  describe("updateUserAvailability", () => {
    it("batch updates availability for a month", async () => {
      const availabilityData: Partial<Availability>[] = [
        {
          date: `${testYear}-${String(testMonth).padStart(2, "0")}-01`,
          is_available: true,
          time_slots: ["09:00", "14:00"],
          notes: "週末可能",
        },
        {
          date: `${testYear}-${String(testMonth).padStart(2, "0")}-08`,
          is_available: true,
          time_slots: ["09:00"],
          notes: "午前のみ",
        },
        {
          date: `${testYear}-${String(testMonth).padStart(2, "0")}-15`,
          is_available: false,
          time_slots: [],
          notes: "予定あり",
        },
        {
          date: `${testYear}-${String(testMonth).padStart(2, "0")}-22`,
          is_available: true,
          time_slots: ["14:00"],
          notes: "午後のみ",
        },
      ];

      const result = await DataProvider.updateUserAvailability(
        testUserId,
        testYear,
        testMonth,
        availabilityData
      );

      expect(result.success).toBe(true);
      expect(result.data).toBe(true);

      // Verify the data was saved by retrieving it
      const retrieved = await DataProvider.getUserAvailability(
        testUserId,
        testMonth,
        testYear
      );

      expect(retrieved.success).toBe(true);
      expect(retrieved.data?.days.length).toBe(4);
    });

    it("replaces existing availability when updating", async () => {
      // First batch update
      const firstBatch: Partial<Availability>[] = [
        {
          date: `${testYear}-${String(testMonth).padStart(2, "0")}-01`,
          is_available: true,
          time_slots: ["09:00"],
          notes: "初回設定",
        },
      ];

      await DataProvider.updateUserAvailability(
        testUserId,
        testYear,
        testMonth,
        firstBatch
      );

      // Second batch update (should replace first)
      const secondBatch: Partial<Availability>[] = [
        {
          date: `${testYear}-${String(testMonth).padStart(2, "0")}-15`,
          is_available: true,
          time_slots: ["14:00"],
          notes: "更新後",
        },
      ];

      const result = await DataProvider.updateUserAvailability(
        testUserId,
        testYear,
        testMonth,
        secondBatch
      );

      expect(result.success).toBe(true);

      // Verify only the second batch exists
      const retrieved = await DataProvider.getUserAvailability(
        testUserId,
        testMonth,
        testYear
      );

      expect(retrieved.data?.days.length).toBe(1);
      expect(retrieved.data?.days[0].date).toContain("-15");
    });

    it("clears all availability when empty array is provided", async () => {
      // First, add some availability
      const initialData: Partial<Availability>[] = [
        {
          date: `${testYear}-${String(testMonth).padStart(2, "0")}-01`,
          is_available: true,
          time_slots: ["09:00"],
          notes: "削除予定",
        },
      ];

      await DataProvider.updateUserAvailability(
        testUserId,
        testYear,
        testMonth,
        initialData
      );

      // Clear all availability
      const result = await DataProvider.updateUserAvailability(
        testUserId,
        testYear,
        testMonth,
        []
      );

      expect(result.success).toBe(true);

      // Verify all data is cleared
      const retrieved = await DataProvider.getUserAvailability(
        testUserId,
        testMonth,
        testYear
      );

      expect(retrieved.data?.days.length).toBe(0);
    });
  });

  describe("deleteAvailability", () => {
    const testDate = `${testYear}-${String(testMonth).padStart(2, "0")}-20`;

    it("deletes availability for a specific date", async () => {
      // First, create availability
      await DataProvider.setAvailability(
        testUserId,
        testDate,
        true,
        ["09:00"],
        "削除テスト"
      );

      // Then delete it
      const result = await DataProvider.deleteAvailability(testUserId, testDate);

      expect(result.success).toBe(true);

      // Verify it's deleted by trying to retrieve
      const retrieved = await DataProvider.getUserAvailability(
        testUserId,
        testMonth,
        testYear
      );

      const deletedDate = retrieved.data?.days.find((d) => d.date === testDate);
      expect(deletedDate).toBeUndefined();
    });

    it("handles deleting non-existent availability", async () => {
      const nonExistentDate = `${testYear}-${String(testMonth).padStart(2, "0")}-25`;

      const result = await DataProvider.deleteAvailability(
        testUserId,
        nonExistentDate
      );

      // Should succeed even if nothing to delete
      expect(result.success).toBe(true);
    });
  });

  describe("getCalendarData", () => {
    it("retrieves calendar data using convenience method", async () => {
      const result = await DataProvider.getCalendarData(
        testUserId,
        testYear,
        testMonth
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.year).toBe(testYear);
      expect(result.data?.month).toBe(testMonth);
    });

    it("uses current date when year/month not provided", async () => {
      const result = await DataProvider.getCalendarData(testUserId);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.year).toBeDefined();
      expect(result.data?.month).toBeDefined();
    });
  });

  describe("Cross-month queries", () => {
    it("does not return data from other months", async () => {
      // Add availability for December
      const decemberData: Partial<Availability>[] = [
        {
          date: "2025-12-15",
          is_available: true,
          time_slots: ["09:00"],
          notes: "12月",
        },
      ];

      await DataProvider.updateUserAvailability(
        testUserId,
        2025,
        12,
        decemberData
      );

      // Query for November
      const novemberResult = await DataProvider.getUserAvailability(
        testUserId,
        11,
        2025
      );

      // Should not include December data
      const decemberDates = novemberResult.data?.days.filter((d) =>
        d.date.startsWith("2025-12")
      );
      expect(decemberDates?.length).toBe(0);
    });
  });

  describe("Multiple users", () => {
    it("keeps availability separate between users", async () => {
      const user1Id = testUserId;
      const user2Id = "0390447c-9a6c-4d5f-84c1-9061c05b24b3"; // Mai from test data

      const testDate = `${testYear}-${String(testMonth).padStart(2, "0")}-10`;

      // Set different availability for two users on same date
      await DataProvider.setAvailability(
        user1Id,
        testDate,
        true,
        ["09:00"],
        "User 1"
      );

      await DataProvider.setAvailability(
        user2Id,
        testDate,
        false,
        [],
        "User 2"
      );

      // Retrieve for user 1
      const user1Data = await DataProvider.getUserAvailability(
        user1Id,
        testMonth,
        testYear
      );

      // Retrieve for user 2
      const user2Data = await DataProvider.getUserAvailability(
        user2Id,
        testMonth,
        testYear
      );

      // Verify data is separate
      const user1Date = user1Data.data?.days.find((d) => d.date === testDate);
      const user2Date = user2Data.data?.days.find((d) => d.date === testDate);

      expect(user1Date?.is_available).toBe(true);
      expect(user2Date?.is_available).toBe(false);
    });
  });

  describe("Edge cases", () => {
    it("handles leap year dates correctly", async () => {
      const leapYearDate = "2024-02-29";

      const result = await DataProvider.setAvailability(
        testUserId,
        leapYearDate,
        true,
        ["09:00"],
        "うるう年"
      );

      expect(result.success).toBe(true);
      expect(result.data?.date).toBe(leapYearDate);
    });

    it("handles month boundaries correctly", async () => {
      // Last day of month
      const lastDay = "2025-11-30";
      // First day of next month
      const firstDay = "2025-12-01";

      await DataProvider.setAvailability(
        testUserId,
        lastDay,
        true,
        ["09:00"],
        "月末"
      );

      await DataProvider.setAvailability(
        testUserId,
        firstDay,
        true,
        ["09:00"],
        "月初"
      );

      // Query November - should only get November data
      const novData = await DataProvider.getUserAvailability(
        testUserId,
        11,
        2025
      );

      const hasLastDay = novData.data?.days.some((d) => d.date === lastDay);
      const hasFirstDay = novData.data?.days.some((d) => d.date === firstDay);

      expect(hasLastDay).toBe(true);
      expect(hasFirstDay).toBe(false);
    });

    it("handles very long notes", async () => {
      const longNotes = "あ".repeat(500); // 500 character note
      const testDate = `${testYear}-${String(testMonth).padStart(2, "0")}-05`;

      const result = await DataProvider.setAvailability(
        testUserId,
        testDate,
        true,
        ["09:00"],
        longNotes
      );

      expect(result.success).toBe(true);
      expect(result.data?.notes).toBe(longNotes);
    });

    it("handles many time slots", async () => {
      const manyTimeSlots = [
        "06:00",
        "07:00",
        "08:00",
        "09:00",
        "10:00",
        "11:00",
        "12:00",
        "13:00",
        "14:00",
        "15:00",
        "16:00",
        "17:00",
        "18:00",
      ];
      const testDate = `${testYear}-${String(testMonth).padStart(2, "0")}-06`;

      const result = await DataProvider.setAvailability(
        testUserId,
        testDate,
        true,
        manyTimeSlots,
        "終日可能"
      );

      expect(result.success).toBe(true);
      expect(result.data?.time_slots).toEqual(manyTimeSlots);
    });
  });
});


