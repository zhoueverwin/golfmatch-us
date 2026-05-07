// Debug utility to test DataProvider methods
import { DataProvider } from "../services";

export const debugDataProvider = async () => {
  console.log("🔍 Debugging DataProvider...");

  try {
    // Test 1: Get user by ID
    console.log('Testing getUserById for user "1"...');
    const user1Response = await DataProvider.getUserById("1");
    console.log("User 1 response:", user1Response);

    // Test 2: Get user by ID
    console.log('Testing getUserById for user "2"...');
    const user2Response = await DataProvider.getUserById("2");
    console.log("User 2 response:", user2Response);

    // Test 3: Get user by ID
    console.log('Testing getUserById for user "3"...');
    const user3Response = await DataProvider.getUserById("3");
    console.log("User 3 response:", user3Response);

    // Test 4: Like a user
    console.log("Testing likeUser...");
    const likeResponse = await DataProvider.likeUser("current_user", "1");
    console.log("Like response:", likeResponse);

    // Test 5: Get user interactions
    console.log("Testing getUserInteractions...");
    const interactionsResponse =
      await DataProvider.getUserInteractions("current_user");
    console.log("Interactions response:", interactionsResponse);

    console.log("✅ DataProvider debug completed!");
    return true;
  } catch (error) {
    console.error("❌ DataProvider debug failed:", error);
    return false;
  }
};
