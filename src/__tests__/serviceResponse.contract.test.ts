/**
 * Characterization test for ServiceResponse<T> shape contract.
 *
 * Written 2026-05-19 as Phase 0 safety net for the refactor sequence
 * (#5 ServiceResponse discriminated union). Pins down the current
 * success/failure shapes returned by domain services so that the
 * discriminated-union migration in Phase 1 is verifiably behavior-preserving.
 *
 * BlocksService is the pilot subject because it has only two methods and
 * minimal dependencies — easier to mock cleanly than profiles or matches.
 */

jest.mock("../services/supabase", () => {
  // Postgrest-style thenable: every chained method returns the builder,
  // which is itself awaitable. The next-resolve value is set via the
  // exposed __setNextResolve hook below.
  let nextResolve: any = { data: null, error: null };
  const builder: any = {};
  const passThrough = jest.fn(() => builder);
  builder.from = passThrough;
  builder.insert = passThrough;
  builder.select = passThrough;
  builder.delete = passThrough;
  builder.update = passThrough;
  builder.upsert = passThrough;
  builder.eq = passThrough;
  builder.or = passThrough;
  builder.limit = passThrough;
  builder.not = passThrough;
  builder.in = passThrough;
  builder.neq = passThrough;
  builder.order = passThrough;
  builder.single = jest.fn(() => Promise.resolve(nextResolve));
  builder.maybeSingle = jest.fn(() => Promise.resolve(nextResolve));
  builder.then = (resolve: any, reject: any) =>
    Promise.resolve(nextResolve).then(resolve, reject);
  return {
    supabase: builder,
    __setNextResolve: (v: any) => {
      nextResolve = v;
    },
  };
});

import { BlocksService } from "../services/supabase/blocks.service";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { __setNextResolve } = require("../services/supabase");

describe("ServiceResponse shape contract (BlocksService)", () => {
  let service: BlocksService;

  beforeEach(() => {
    service = new BlocksService();
    __setNextResolve({ data: null, error: null });
  });

  describe("success shape", () => {
    it("blockUser returns { success: true, data } on insert success", async () => {
      const fakeRow = {
        id: "block-1",
        blocker_id: "a",
        blocked_user_id: "b",
        created_at: "2026-05-19T00:00:00Z",
      };
      __setNextResolve({ data: fakeRow, error: null });

      const result = await service.blockUser("a", "b");

      expect(result.success).toBe(true);
      expect(result.data).toEqual(fakeRow);
      expect(result.error).toBeUndefined();
    });

    it("unblockUser returns { success: true } with no data field on delete success", async () => {
      __setNextResolve({ error: null });

      const result = await service.unblockUser("a", "b");

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe("failure shape", () => {
    it("blockUser returns { success: false, error } for self-block (synchronous validation)", async () => {
      const result = await service.blockUser("a", "a");

      expect(result.success).toBe(false);
      expect(result.error).toBe("You cannot block yourself");
      expect(result.data).toBeUndefined();
    });

    it("blockUser returns { success: false, error } with friendly message on duplicate (23505)", async () => {
      __setNextResolve({
        data: null,
        error: { code: "23505", message: "duplicate key value" },
      });

      const result = await service.blockUser("a", "b");

      expect(result.success).toBe(false);
      expect(result.error).toBe("This user is already blocked");
    });

    it("blockUser returns { success: false, error } with thrown error message on generic failure", async () => {
      __setNextResolve({
        data: null,
        error: { code: "OTHER", message: "RLS denied" },
      });

      const result = await service.blockUser("a", "b");

      expect(result.success).toBe(false);
      expect(result.error).toBe("RLS denied");
    });

    it("unblockUser returns { success: false, error } on delete error", async () => {
      __setNextResolve({ error: { message: "RLS denied" } });

      const result = await service.unblockUser("a", "b");

      expect(result.success).toBe(false);
      expect(result.error).toBe("RLS denied");
    });
  });

  describe("invariants", () => {
    it("success:true responses never carry an error field", async () => {
      const fakeRow = { id: "x", blocker_id: "a", blocked_user_id: "b", created_at: "" };
      __setNextResolve({ data: fakeRow, error: null });

      const result = await service.blockUser("a", "b");

      if (result.success) {
        expect(result.error).toBeUndefined();
      }
    });

    it("success:false responses never carry a data field", async () => {
      const result = await service.blockUser("a", "a");

      if (!result.success) {
        expect(result.data).toBeUndefined();
      }
    });
  });
});
