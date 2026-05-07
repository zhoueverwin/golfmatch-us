// Test utility to verify user interactions are working
import { DataProvider } from "../services";

export const testUserInteractions = async () => {
  console.log("🧪 Testing User Interactions...");

  try {
    // Test 1: Like a user
    console.log("Testing like user...");
    const likeResponse = await DataProvider.likeUser("current_user", "1");
    console.log("Like response:", likeResponse);

    // Test 2: Super like a user
    console.log("Testing super like user...");
    const superLikeResponse = await DataProvider.superLikeUser(
      "current_user",
      "2",
    );
    console.log("Super like response:", superLikeResponse);

    // Test 3: Pass a user
    console.log("Testing pass user...");
    const passResponse = await DataProvider.passUser("current_user", "3");
    console.log("Pass response:", passResponse);

    // Test 4: Get user interactions
    console.log("Testing get user interactions...");
    const interactionsResponse =
      await DataProvider.getUserInteractions("current_user");
    console.log("Interactions response:", interactionsResponse);

    // Test 5: Get recommended users
    console.log("Testing get recommended users...");
    const recommendedResponse = await DataProvider.getRecommendedUsers(
      "current_user",
      5,
    );
    console.log("Recommended users response:", recommendedResponse);

    console.log("✅ All tests completed successfully!");
    return true;
  } catch (error) {
    console.error("❌ Test failed:", error);
    return false;
  }
};
