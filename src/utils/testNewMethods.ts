// Test script to verify the new methods are working
import { DataProvider } from "../services";

export const testNewMethods = async () => {
  console.log("🧪 Testing New Methods...");

  try {
    // Test 1: getRecommendedPosts
    console.log("1. Testing getRecommendedPosts...");
    const recommendedPostsResult = await DataProvider.getRecommendedPosts(1, 5);
    if (recommendedPostsResult.success) {
      console.log(
        "✅ getRecommendedPosts successful:",
        (recommendedPostsResult.data as unknown as any[])?.length,
        "posts found",
      );
    } else {
      console.log(
        "❌ getRecommendedPosts failed:",
        recommendedPostsResult.error,
      );
    }

    // Test 2: getFollowingPosts
    console.log("2. Testing getFollowingPosts...");
    const followingPostsResult = await DataProvider.getFollowingPosts(1, 5);
    if (followingPostsResult.success) {
      console.log(
        "✅ getFollowingPosts successful:",
        (followingPostsResult.data as unknown as any[])?.length,
        "posts found",
      );
    } else {
      console.log("❌ getFollowingPosts failed:", followingPostsResult.error);
    }

    // Test 3: getRecommendedUsers
    console.log("3. Testing getRecommendedUsers...");
    const recommendedUsersResult = await DataProvider.getRecommendedUsers(
      "current_user",
      5,
    );
    if (recommendedUsersResult.success) {
      console.log(
        "✅ getRecommendedUsers successful:",
        recommendedUsersResult.data?.length,
        "users found",
      );
    } else {
      console.log(
        "❌ getRecommendedUsers failed:",
        recommendedUsersResult.error,
      );
    }

    // Test 4: getUserProfile
    console.log("4. Testing getUserProfile...");
    const userProfileResult = await DataProvider.getUserProfile("current_user");
    if (userProfileResult.success) {
      console.log(
        "✅ getUserProfile successful:",
        userProfileResult.data?.basic?.name,
      );
    } else {
      console.log("❌ getUserProfile failed:", userProfileResult.error);
    }

    console.log("🎉 New methods test completed!");
  } catch (error) {
    console.error("❌ New methods test failed:", error);
  }
};

// Export for use in other files
export default testNewMethods;
