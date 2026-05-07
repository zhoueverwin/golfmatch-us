/**
 * Test Account Runner
 *
 * Run this script to create test accounts for development.
 * Usage: Import and call the functions in your development environment.
 */

import {
  createDefaultTestAccounts,
  createTestAccount,
  runAuthSystemTest,
  listTestAccounts,
  validateTestEnvironment,
} from "./testAccountCreator";

/**
 * Main function to run test account creation
 */
export const runTestAccountSetup = async () => {
  console.log("🚀 Starting Test Account Setup...\n");

  // Validate environment first
  const envCheck = validateTestEnvironment();
  if (!envCheck.isValid) {
    console.error("❌ Environment not properly configured:");
    envCheck.issues.forEach((issue) => console.error(`   - ${issue}`));
    console.log("\n💡 Please configure your Supabase environment variables:");
    console.log("   - EXPO_PUBLIC_SUPABASE_URL");
    console.log("   - EXPO_PUBLIC_SUPABASE_ANON_KEY");
    return;
  }

  console.log("✅ Environment validation passed\n");

  // Option 1: Run comprehensive system test
  console.log("🧪 Running comprehensive authentication system test...");
  const systemTest = await runAuthSystemTest();

  if (systemTest.success) {
    console.log("✅ Authentication system test passed!\n");
  } else {
    console.error("❌ Authentication system test failed. See details below:\n");
    systemTest.results.forEach((result) => {
      console.log(`   ${result.test}: ${result.success ? "✅" : "❌"}`);
      if (result.error) console.log(`     Error: ${result.error}`);
      if (result.issues)
        console.log(`     Issues: ${result.issues.join(", ")}`);
    });
    return;
  }

  // Option 2: Create default test accounts
  console.log("👥 Creating default test accounts...");
  const defaultAccountsResult = await createDefaultTestAccounts();

  if (defaultAccountsResult.success) {
    console.log("✅ Default test accounts created successfully!\n");
  } else {
    console.log("⚠️ Some test accounts may not have been created:\n");
    defaultAccountsResult.results.forEach((result, index) => {
      const account = listTestAccounts()[index];
      console.log(`   ${account.email}: ${result.success ? "✅" : "❌"}`);
      if (result.error) console.log(`     Error: ${result.error}`);
    });
  }

  // Display available test accounts
  console.log("📋 Available Test Accounts:");
  console.log("==========================");
  listTestAccounts().forEach((account) => {
    console.log(`\n📧 Email: ${account.email}`);
    console.log(`🔑 Password: ${account.password}`);
    if (account.name) console.log(`👤 Name: ${account.name}`);
    if (account.phone) console.log(`📱 Phone: ${account.phone}`);
  });

  console.log("\n🎉 Test account setup completed!");
  console.log(
    "\n💡 You can now use these accounts to test the authentication system.",
  );
  console.log(
    "   Use the AuthScreen in the app to sign in with these credentials.",
  );
};

/**
 * Function to create a single custom test account
 */
export const createCustomTestAccount = async (
  email: string,
  password: string,
  name?: string,
) => {
  console.log(`🧪 Creating custom test account: ${email}`);

  const result = await createTestAccount(email, password, { name });

  if (result.success) {
    console.log(`✅ Custom account created: ${email}`);
    console.log(`🔑 Password: ${password}`);
    if (name) console.log(`👤 Name: ${name}`);
  } else {
    console.error(`❌ Failed to create custom account: ${result.error}`);
  }

  return result;
};

// Export for easy access
export {
  createDefaultTestAccounts,
  createTestAccount,
  runAuthSystemTest,
  listTestAccounts,
  validateTestEnvironment,
};

// Uncomment the line below and run this file to automatically create test accounts
// runTestAccountSetup();
