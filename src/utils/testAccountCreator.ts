/**
 * Test Account Creator
 *
 * This utility helps create test accounts for development and testing purposes.
 * It provides functions to create test users with email/password authentication.
 *
 * IMPORTANT: This should only be used in development environments.
 */

import { authService } from "../services/authService";

export interface TestAccount {
  email: string;
  password: string;
  name?: string;
  phone?: string;
}

export interface TestAccountResult {
  success: boolean;
  account?: TestAccount;
  error?: string;
  session?: any;
}

/**
 * Default test accounts for development
 */
export const DEFAULT_TEST_ACCOUNTS: TestAccount[] = [
  {
    email: "test.user@golfmatch.com",
    password: "Test123!",
    name: "Test User",
    phone: "+818022582038",
  },
  {
    email: "golf.pro@golfmatch.com",
    password: "Golf123!",
    name: "Golf Pro",
    phone: "+818022582039",
  },
  {
    email: "beginner@golfmatch.com",
    password: "Begin123!",
    name: "Beginner Golfer",
    phone: "+818022582040",
  },
];

/**
 * Creates a test account with email and password
 */
export const createTestAccount = async (
  email: string,
  password: string,
  options?: { name?: string; phone?: string },
): Promise<TestAccountResult> => {
  try {
    console.log("🧪 Creating test account:", email);

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        success: false,
        error: "Invalid email format",
      };
    }

    // Validate password strength
    if (password.length < 6) {
      return {
        success: false,
        error: "Password must be at least 6 characters",
      };
    }

    // Create the account using the auth service
    const result = await authService.signUpWithEmail(email, password);

    if (result.success) {
      console.log("✅ Test account created successfully:", email);

      const account: TestAccount = {
        email,
        password,
        name: options?.name,
        phone: options?.phone,
      };

      return {
        success: true,
        account,
        session: result.session,
      };
    } else {
      console.error("❌ Failed to create test account:", result.error);
      return {
        success: false,
        error: result.error || "Failed to create account",
      };
    }
  } catch (error) {
    console.error("❌ Error creating test account:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
};

/**
 * Creates multiple test accounts from a list
 */
export const createMultipleTestAccounts = async (
  accounts: TestAccount[],
): Promise<{ success: boolean; results: TestAccountResult[] }> => {
  console.log("🧪 Creating multiple test accounts...");

  const results: TestAccountResult[] = [];

  for (const account of accounts) {
    const result = await createTestAccount(account.email, account.password, {
      name: account.name,
      phone: account.phone,
    });
    results.push(result);

    // Small delay between account creations
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const success = results.every((result) => result.success);
  console.log(
    `✅ Created ${results.filter((r) => r.success).length}/${accounts.length} test accounts`,
  );

  return {
    success,
    results,
  };
};

/**
 * Creates all default test accounts
 */
export const createDefaultTestAccounts = async (): Promise<{
  success: boolean;
  results: TestAccountResult[];
}> => {
  console.log("🧪 Creating default test accounts...");
  return await createMultipleTestAccounts(DEFAULT_TEST_ACCOUNTS);
};

/**
 * Signs in with a test account
 */
export const signInWithTestAccount = async (
  email: string,
  password: string,
): Promise<TestAccountResult> => {
  try {
    console.log("🔐 Signing in with test account:", email);

    const result = await authService.signInWithEmail(email, password);

    if (result.success) {
      console.log("✅ Signed in successfully:", email);
      return {
        success: true,
        account: { email, password },
        session: result.session,
      };
    } else {
      console.error("❌ Failed to sign in:", result.error);
      return {
        success: false,
        error: result.error || "Failed to sign in",
      };
    }
  } catch (error) {
    console.error("❌ Error signing in:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
};

/**
 * Deletes a test account (requires admin privileges in Supabase)
 * Note: This is a placeholder - actual account deletion requires Supabase admin API
 */
export const deleteTestAccount = async (
  email: string,
): Promise<{ success: boolean; error?: string }> => {
  console.log("🗑️ Attempting to delete test account:", email);

  // Note: Account deletion typically requires Supabase admin API
  // This is a placeholder for the concept

  return {
    success: false,
    error:
      "Account deletion requires Supabase admin API access. Use the Supabase dashboard to manage users.",
  };
};

/**
 * Lists all available test accounts
 */
export const listTestAccounts = (): TestAccount[] => {
  return DEFAULT_TEST_ACCOUNTS;
};

/**
 * Validates if Supabase is properly configured for testing
 */
export const validateTestEnvironment = (): {
  isValid: boolean;
  issues: string[];
} => {
  const issues: string[] = [];

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || supabaseUrl === "YOUR_SUPABASE_URL") {
    issues.push("Supabase URL not configured");
  }

  if (!supabaseKey || supabaseKey === "YOUR_SUPABASE_ANON_KEY") {
    issues.push("Supabase API key not configured");
  }

  return {
    isValid: issues.length === 0,
    issues,
  };
};

/**
 * Runs a comprehensive test of the authentication system
 */
export const runAuthSystemTest = async (): Promise<{
  success: boolean;
  results: any[];
}> => {
  console.log("🧪 Running comprehensive authentication system test...");

  const results: any[] = [];

  // Test 1: Environment validation
  const envValidation = validateTestEnvironment();
  results.push({
    test: "Environment Validation",
    success: envValidation.isValid,
    issues: envValidation.issues,
  });

  if (!envValidation.isValid) {
    console.error(
      "❌ Environment not properly configured:",
      envValidation.issues,
    );
    return { success: false, results };
  }

  // Test 2: Create a test account
  const testEmail = `test.${Date.now()}@golfmatch.com`;
  const testPassword = "Test123!";

  const createResult = await createTestAccount(testEmail, testPassword);
  results.push({
    test: "Account Creation",
    success: createResult.success,
    account: createResult.account,
    error: createResult.error,
  });

  if (!createResult.success) {
    console.error("❌ Account creation failed:", createResult.error);
    return { success: false, results };
  }

  // Test 3: Sign out
  await authService.signOut();
  results.push({
    test: "Sign Out",
    success: true,
  });

  // Test 4: Sign in with created account
  const signInResult = await signInWithTestAccount(testEmail, testPassword);
  results.push({
    test: "Account Sign In",
    success: signInResult.success,
    error: signInResult.error,
  });

  console.log("🎉 Authentication system test completed!");

  return {
    success: results.every((r) => r.success),
    results,
  };
};
