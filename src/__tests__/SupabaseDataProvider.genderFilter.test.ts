import supabaseDataProvider from "../services/supabaseDataProvider";
import { ProfilesService } from "../services/supabase/profiles.service";

describe("SupabaseDataProvider gender filtering", () => {
  let prepareViewerContextSpy: jest.SpyInstance;
  let searchProfilesSpy: jest.SpyInstance;

  beforeEach(() => {
    prepareViewerContextSpy = jest.spyOn(
      supabaseDataProvider as any,
      "prepareViewerContext",
    );
    searchProfilesSpy = jest
      .spyOn(ProfilesService.prototype, "searchProfiles")
      .mockResolvedValue({ success: true, data: [] });
  });

  afterEach(() => {
    prepareViewerContextSpy.mockRestore();
    searchProfilesSpy.mockRestore();
  });

  it("does not apply automatic gender filter for getUsers", async () => {
    prepareViewerContextSpy.mockResolvedValue({
      profileId: "profile-123",
      gender: "male",
    });

    searchProfilesSpy.mockResolvedValue({ success: true, data: [] } as any);

    await supabaseDataProvider.getUsers({}, "recommended");

    const callArgs = searchProfilesSpy.mock.calls[0][0];
    expect(callArgs.gender).toBeUndefined();
  });

  it("keeps explicit gender filter when provided", async () => {
    prepareViewerContextSpy.mockResolvedValue({
      profileId: "profile-123",
      gender: "male",
    });

    searchProfilesSpy.mockResolvedValue({ success: true, data: [] } as any);

    await supabaseDataProvider.getUsers({ gender: "male" }, "registration");

    expect(searchProfilesSpy).toHaveBeenCalledWith(
      expect.objectContaining({ gender: "male" }),
      1,
      100,
      "registration",
    );
  });

  it("allows users to search for any gender", async () => {
    prepareViewerContextSpy.mockResolvedValue({
      profileId: "profile-123",
      gender: "male",
    });

    searchProfilesSpy.mockResolvedValue({ success: true, data: [] } as any);

    // Male user can explicitly search for male users
    await supabaseDataProvider.getUsers({ gender: "male" }, "recommended");

    expect(searchProfilesSpy).toHaveBeenCalledWith(
      expect.objectContaining({ gender: "male" }),
      1,
      100,
      "recommended",
    );
  });

  it("does not apply automatic gender filter for searchUsers", async () => {
    prepareViewerContextSpy.mockResolvedValue({
      profileId: "profile-123",
      gender: "female",
    });

    searchProfilesSpy.mockResolvedValue({ success: true, data: [] } as any);

    await supabaseDataProvider.searchUsers({}, 1, 20);

    const callArgs = searchProfilesSpy.mock.calls[0][0];
    expect(callArgs.gender).toBeUndefined();
  });
});
