/**
 * Characterization test for the legacy_id resolution pattern.
 *
 * Written 2026-05-19 as Phase 0 safety net for refactor #2 (centralize
 * legacy_id resolution). 19 inline copies of this pattern exist across
 * the service layer — they all share the same regex and the same
 * "if not UUID, look up by legacy_id" branch. Phase 2 will replace
 * them with a single helper; this test pins the behavior the helper
 * must preserve.
 *
 * Subject: ContactInquiriesService.createContactInquiry (only 2 sites,
 * smallest blast radius among the 7 files with this pattern).
 */

const mockTableCalls: string[] = [];
let mockProfileLookupResult: { data: any; error: any } = { data: null, error: null };
let mockInsertResult: { data: any; error: any } = { data: null, error: null };

jest.mock("../services/supabase", () => {
  const builder: any = {};
  const passThrough = jest.fn(() => builder);
  // .from records the table name so tests can assert which tables were queried
  builder.from = jest.fn((table: string) => {
    mockTableCalls.push(table);
    builder.__currentTable = table;
    return builder;
  });
  builder.select = passThrough;
  builder.insert = passThrough;
  builder.eq = passThrough;
  builder.single = jest.fn(() => {
    // Route the resolved value based on which table is being queried
    if (builder.__currentTable === "profiles") {
      return Promise.resolve(mockProfileLookupResult);
    }
    return Promise.resolve(mockInsertResult);
  });
  builder.then = (resolve: any, reject: any) =>
    Promise.resolve(mockInsertResult).then(resolve, reject);
  return { supabase: builder };
});

import { ContactInquiriesService } from "../services/supabase/contact-inquiries.service";

const UUID = "11111111-2222-3333-4444-555555555555";
const NOT_A_UUID = "user_42";

describe("legacy_id resolution pattern (ContactInquiriesService.createContactInquiry)", () => {
  let service: ContactInquiriesService;

  beforeEach(() => {
    service = new ContactInquiriesService();
    mockTableCalls.length = 0;
    mockProfileLookupResult = { data: null, error: null };
    mockInsertResult = { data: null, error: null };
  });

  describe("UUID input", () => {
    it("does NOT issue a legacy_id lookup against profiles when input is a valid UUID", async () => {
      mockInsertResult = {
        data: { id: "inq-1", user_id: UUID, subject: "s", message: "m", status: "pending" },
        error: null,
      };

      const result = await service.createContactInquiry(UUID, "s", "m");

      expect(result.success).toBe(true);
      expect(mockTableCalls).not.toContain("profiles");
      expect(mockTableCalls).toContain("contact_inquiries");
    });

    it("accepts mixed-case UUIDs (case-insensitive regex)", async () => {
      const upperUuid = UUID.toUpperCase();
      mockInsertResult = {
        data: { id: "inq-2", user_id: upperUuid, subject: "s", message: "m", status: "pending" },
        error: null,
      };

      const result = await service.createContactInquiry(upperUuid, "s", "m");

      expect(result.success).toBe(true);
      expect(mockTableCalls).not.toContain("profiles");
    });
  });

  describe("non-UUID input", () => {
    it("DOES issue a legacy_id lookup against profiles when input is not a UUID", async () => {
      mockProfileLookupResult = { data: { id: UUID }, error: null };
      mockInsertResult = {
        data: { id: "inq-3", user_id: UUID, subject: "s", message: "m", status: "pending" },
        error: null,
      };

      const result = await service.createContactInquiry(NOT_A_UUID, "s", "m");

      expect(result.success).toBe(true);
      expect(mockTableCalls[0]).toBe("profiles");
      expect(mockTableCalls).toContain("contact_inquiries");
    });

    it("returns 'User not found' error when legacy_id lookup yields no profile", async () => {
      mockProfileLookupResult = { data: null, error: { message: "no rows" } };

      const result = await service.createContactInquiry(NOT_A_UUID, "s", "m");

      expect(result.success).toBe(false);
      expect(result.error).toContain("User not found");
      // The insert into contact_inquiries should NOT have happened
      expect(mockTableCalls).not.toContain("contact_inquiries");
    });
  });

  describe("resolveProfileId helper (Phase 2 replacement)", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { resolveProfileId } = require("../services/userMappingService");

    it("returns input as-is for a UUID-shaped string (no DB query)", async () => {
      mockTableCalls.length = 0;
      const result = await resolveProfileId(UUID);
      expect(result).toBe(UUID);
      expect(mockTableCalls).not.toContain("profiles");
    });

    it("returns input as-is for an uppercase UUID", async () => {
      mockTableCalls.length = 0;
      const upper = UUID.toUpperCase();
      const result = await resolveProfileId(upper);
      expect(result).toBe(upper);
      expect(mockTableCalls).not.toContain("profiles");
    });

    it("looks up via legacy_id for non-UUID input", async () => {
      mockProfileLookupResult = { data: { id: UUID }, error: null };
      mockTableCalls.length = 0;
      const result = await resolveProfileId(NOT_A_UUID);
      expect(result).toBe(UUID);
      expect(mockTableCalls).toContain("profiles");
    });

    it("returns null when the legacy_id lookup fails", async () => {
      mockProfileLookupResult = { data: null, error: { message: "no rows" } };
      const result = await resolveProfileId(NOT_A_UUID);
      expect(result).toBeNull();
    });

    it("returns null on empty string input", async () => {
      mockTableCalls.length = 0;
      const result = await resolveProfileId("");
      expect(result).toBeNull();
      expect(mockTableCalls).not.toContain("profiles");
    });
  });

  describe("regex contract (pinned across 19 inline copies)", () => {
    // These cases document the exact regex behavior the centralized
    // helper in Phase 2 must match. The regex is:
    //   /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    it.each([
      ["lowercase uuid", "11111111-2222-3333-4444-555555555555", true],
      ["uppercase uuid", "ABCDEF12-3456-7890-ABCD-EF1234567890", true],
      ["mixed case", "AbCdEf12-3456-7890-aBcD-Ef1234567890", true],
      ["uuid with leading space", " 11111111-2222-3333-4444-555555555555", false],
      ["uuid with trailing space", "11111111-2222-3333-4444-555555555555 ", false],
      ["short string", "abc", false],
      ["legacy_id-shaped", "user_42", false],
      ["empty string", "", false],
      ["current_user literal", "current_user", false],
      ["uuid missing one group", "11111111-2222-3333-4444", false],
      ["uuid with extra group", "11111111-2222-3333-4444-555555555555-666", false],
    ])("matches %s -> %s", (_label, input, expected) => {
      expect(UUID_REGEX.test(input)).toBe(expected);
    });
  });
});
