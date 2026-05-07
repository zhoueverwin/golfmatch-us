// Test script to verify Supabase migration is working
import { DataProvider } from "../services";

export const testMigration = async () => {
  console.log("🧪 Testing Supabase Migration...");

  try {
    // Test 1: Get current user
    console.log("1. Testing getCurrentUser...");
    const currentUserResult = await DataProvider.getCurrentUser();
    if (currentUserResult.success) {
      console.log(
        "✅ getCurrentUser successful:",
        currentUserResult.data?.name,
      );
    } else {
      console.log("❌ getCurrentUser failed:", currentUserResult.error);
    }

    // Test 2: Get posts
    console.log("2. Testing getPosts...");
    const postsResult = await DataProvider.getPosts(1, 5);
    if (postsResult.success) {
      const list = (postsResult.data as unknown as any[]) || [];
      console.log("✅ getPosts successful:", list.length, "posts found");
    } else {
      console.log("❌ getPosts failed:", postsResult.error);
    }

    // Test 3: Search users
    console.log("3. Testing searchUsers...");
    const searchResult = await DataProvider.searchUsers({}, 1, 5);
    if (searchResult.success) {
      const list = (searchResult.data as unknown as any[]) || [];
      console.log("✅ searchUsers successful:", list.length, "users found");
    } else {
      console.log("❌ searchUsers failed:", searchResult.error);
    }

    // Test 4: Get matches
    if (currentUserResult.success && currentUserResult.data) {
      console.log("4. Testing getMatches...");
      const matchesResult = await DataProvider.getMatches(
        currentUserResult.data.id,
      );
      if (matchesResult.success) {
        console.log(
          "✅ getMatches successful:",
          matchesResult.data?.length,
          "matches found",
        );
      } else {
        console.log("❌ getMatches failed:", matchesResult.error);
      }
    }

    // Test 5: Get message previews
    if (currentUserResult.success && currentUserResult.data) {
      console.log("5. Testing getMessagePreviews...");
      const messagesResult = await DataProvider.getMessagePreviews(
        currentUserResult.data.id,
      );
      if (messagesResult.success) {
        console.log(
          "✅ getMessagePreviews successful:",
          messagesResult.data?.length,
          "conversations found",
        );
      } else {
        console.log("❌ getMessagePreviews failed:", messagesResult.error);
      }
    }

    // Test 6: Get availability
    if (currentUserResult.success && currentUserResult.data) {
      console.log("6. Testing getUserAvailability...");
      const availabilityResult = await DataProvider.getUserAvailability(
        currentUserResult.data.id,
        10,
        2025,
      );
      if (availabilityResult.success) {
        console.log(
          "✅ getUserAvailability successful:",
          (availabilityResult.data as any)?.length || 0,
          "days",
        );
      } else {
        console.log("❌ getUserAvailability failed:", availabilityResult.error);
      }
    }

    console.log("🎉 Migration test completed!");
  } catch (error) {
    console.error("❌ Migration test failed:", error);
  }
};

// Export for use in other files
export default testMigration;
