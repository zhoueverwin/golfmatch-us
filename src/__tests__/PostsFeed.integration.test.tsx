/**
 * Posts feed integration test stub (real Supabase when EXPO_PUBLIC_E2E=1)
 */
const runReal = process.env.EXPO_PUBLIC_E2E === "1";

describe("Posts & Feed (integration toggled)", () => {
  it("create text-only post and fetch posts", async () => {
    if (!runReal) {
      expect(true).toBe(true);
      return;
    }
    const { DataProvider } = require("../services");
    const userId =
      process.env.EXPO_PUBLIC_TEST_USER_ID ||
      "00000000-0000-0000-0000-000000000001";
    const createRes = await DataProvider.createPost(
      userId,
      "test post from CI",
      [],
      [],
    );
    expect(createRes.success).toBe(true);

    const getRes = await DataProvider.getPosts(1, 10);
    expect(getRes.success).toBe(true);
  });
});
