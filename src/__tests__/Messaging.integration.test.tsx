/**
 * Messaging integration test stub (real Supabase when EXPO_PUBLIC_E2E=1)
 */
const runReal = process.env.EXPO_PUBLIC_E2E === "1";

describe("Messaging (integration toggled)", () => {
  it("get or create chat and send message (smoke)", async () => {
    if (!runReal) {
      expect(true).toBe(true);
      return;
    }
    const user1 =
      process.env.EXPO_PUBLIC_TEST_USER_ID ||
      "00000000-0000-0000-0000-000000000001";
    const user2 =
      process.env.EXPO_PUBLIC_TEST_USER_ID_2 ||
      "00000000-0000-0000-0000-000000000002";

    // Assume a match exists or just attempt a chat creation with a fake match ID if available
    const matchId = process.env.EXPO_PUBLIC_TEST_MATCH_ID || "";
    if (!matchId) {
      expect(true).toBe(true);
      return;
    }

    const { DataProvider } = require("../services");
    const chatRes = await DataProvider.getOrCreateChat(matchId, [user1, user2]);
    expect(chatRes.success).toBe(true);
    if (chatRes.data) {
      const sendRes = await DataProvider.sendMessage(chatRes.data, "hello");
      expect(sendRes.success).toBe(true);
    }
  });
});
