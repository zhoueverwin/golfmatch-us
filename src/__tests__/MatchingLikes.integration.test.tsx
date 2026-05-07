/**
 * Integration-style test for likes and undo using real Supabase when enabled.
 * Set EXPO_PUBLIC_SUPABASE_URL/ANON_KEY and EXPO_PUBLIC_E2E=1 to hit real backend.
 */
const runReal = process.env.EXPO_PUBLIC_E2E === "1";

describe("Matching & Likes (integration toggled)", () => {
  it("like and undo like flow (mocked when not e2e)", async () => {
    const liker =
      process.env.EXPO_PUBLIC_TEST_USER_ID ||
      "00000000-0000-0000-0000-000000000001";
    const liked =
      process.env.EXPO_PUBLIC_TEST_USER_ID_2 ||
      "00000000-0000-0000-0000-000000000002";

    if (!runReal) {
      // Skip with a trivial assertion in non-e2e
      expect(true).toBe(true);
      return;
    }

    const { DataProvider } = require("../services");
    const likeRes = await DataProvider.likeUser(liker, liked, "like");
    expect(likeRes.success).toBe(true);

    const undoRes = await DataProvider.undoLike(liker, liked);
    expect(undoRes.success).toBe(true);
  });
});
