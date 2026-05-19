/**
 * Characterization test for userMappingService behavior.
 *
 * Written 2026-05-19 as Phase 0 safety net. Documents the current
 * auth.users.id -> profiles.id mapping behavior so that refactors in
 * later phases (especially #2 legacy_id centralization) cannot silently
 * change identity-resolution semantics.
 */

let mockAuthUser: { id: string; email?: string } | null = null;
const mockClearAuthCache = jest.fn();

jest.mock("../services/authCache", () => ({
  getCachedAuthUser: jest.fn(async () => mockAuthUser),
  clearAuthCache: (...args: any[]) => mockClearAuthCache(...args),
}));

jest.mock("../services/supabase", () => {
  let nextResolve: any = { data: null, error: null };
  const builder: any = {};
  const passThrough = jest.fn(() => builder);
  builder.from = passThrough;
  builder.select = passThrough;
  builder.eq = passThrough;
  builder.single = jest.fn(() => Promise.resolve(nextResolve));
  builder.then = (resolve: any, reject: any) =>
    Promise.resolve(nextResolve).then(resolve, reject);
  return {
    supabase: builder,
    __setNextResolve: (v: any) => {
      nextResolve = v;
    },
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { __setNextResolve } = require("../services/supabase");
import userMappingService from "../services/userMappingService";

describe("userMappingService behavior", () => {
  beforeEach(() => {
    mockAuthUser = null;
    userMappingService.clearCache();
    mockClearAuthCache.mockClear();
    __setNextResolve({ data: null, error: null });
  });

  describe("getProfileIdFromAuth", () => {
    it("returns null when no auth user is cached", async () => {
      mockAuthUser = null;

      const result = await userMappingService.getProfileIdFromAuth();

      expect(result).toBeNull();
    });

    it("returns the profile id when found in DB", async () => {
      mockAuthUser = { id: "auth-uuid-1" };
      __setNextResolve({ data: { id: "profile-uuid-1" }, error: null });

      const result = await userMappingService.getProfileIdFromAuth();

      expect(result).toBe("profile-uuid-1");
    });

    it("returns null when profile query returns an error", async () => {
      mockAuthUser = { id: "auth-uuid-2" };
      __setNextResolve({ data: null, error: { message: "not found" } });

      const result = await userMappingService.getProfileIdFromAuth();

      expect(result).toBeNull();
    });

    it("returns null when profile query returns no data", async () => {
      mockAuthUser = { id: "auth-uuid-3" };
      __setNextResolve({ data: null, error: null });

      const result = await userMappingService.getProfileIdFromAuth();

      expect(result).toBeNull();
    });

    it("caches the auth->profile mapping (second call does not re-query)", async () => {
      mockAuthUser = { id: "auth-uuid-4" };
      __setNextResolve({ data: { id: "profile-uuid-4" }, error: null });

      const first = await userMappingService.getProfileIdFromAuth();

      // Change the DB response. If the mapping is cached, the second call
      // should still return the original value.
      __setNextResolve({ data: { id: "profile-uuid-OTHER" }, error: null });
      const second = await userMappingService.getProfileIdFromAuth();

      expect(first).toBe("profile-uuid-4");
      expect(second).toBe("profile-uuid-4");
    });
  });

  describe("clearCache", () => {
    it("forces a re-query on next call after clearing", async () => {
      mockAuthUser = { id: "auth-uuid-5" };
      __setNextResolve({ data: { id: "profile-A" }, error: null });
      await userMappingService.getProfileIdFromAuth();

      userMappingService.clearCache();

      __setNextResolve({ data: { id: "profile-B" }, error: null });
      const second = await userMappingService.getProfileIdFromAuth();

      expect(second).toBe("profile-B");
    });

    it("delegates to clearAuthCache so the upstream auth cache also clears", () => {
      userMappingService.clearCache();
      expect(mockClearAuthCache).toHaveBeenCalled();
    });
  });

  describe("getCurrentUserId", () => {
    it("returns the resolved profile id when auth user has a profile", async () => {
      mockAuthUser = { id: "auth-uuid-6" };
      __setNextResolve({ data: { id: "profile-uuid-6" }, error: null });

      const result = await userMappingService.getCurrentUserId();

      expect(result).toBe("profile-uuid-6");
    });

    it("falls back to EXPO_PUBLIC_TEST_USER_ID when no profile resolves", async () => {
      mockAuthUser = null;
      const originalTestId = process.env.EXPO_PUBLIC_TEST_USER_ID;
      process.env.EXPO_PUBLIC_TEST_USER_ID = "test-fallback-id";

      const result = await userMappingService.getCurrentUserId();

      expect(result).toBe("test-fallback-id");
      process.env.EXPO_PUBLIC_TEST_USER_ID = originalTestId;
    });
  });

  describe("getCurrentUserEmail", () => {
    it("returns the email from the cached auth user", async () => {
      mockAuthUser = { id: "auth-uuid-7", email: "user@example.com" };

      const result = await userMappingService.getCurrentUserEmail();

      expect(result).toBe("user@example.com");
    });

    it("returns null when no auth user is cached", async () => {
      mockAuthUser = null;

      const result = await userMappingService.getCurrentUserEmail();

      expect(result).toBeNull();
    });
  });
});
