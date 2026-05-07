/**
 * Quick Authentication Test
 *
 * Use this to test authentication without email confirmation issues
 */

import { supabase } from "../services/supabase";

export const quickAuthTest = async () => {
  console.log("🚀 Quick Auth Test - Using Magic Link\n");

  // Test accounts that work with magic links
  const testEmails = [
    "test.user@golfmatch.com",
    "golf.pro@golfmatch.com",
    "beginner@golfmatch.com",
  ];

  for (const email of testEmails) {
    try {
      console.log(`📧 Sending magic link to: ${email}`);

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          // This will send a magic link that bypasses email confirmation
          emailRedirectTo: "golfmatch://auth/callback",
        },
      });

      if (error) {
        console.log(`❌ Failed for ${email}: ${error.message}`);
      } else {
        console.log(`✅ Magic link sent to ${email}`);
        console.log("   Check your email and click the link to sign in");
      }
    } catch (error) {
      console.log(`❌ Error for ${email}:`, error);
    }
  }

  console.log("\n💡 Alternative: Use the Supabase dashboard to:");
  console.log("   1. Go to Authentication → Users");
  console.log("   2. Find the test users");
  console.log('   3. Click "Confirm User" for each account');
};

// For immediate testing
export const testSignInWithMagicLink = async (email: string) => {
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: "golfmatch://auth/callback",
      },
    });

    if (error) {
      return { success: false, error: error.message };
    } else {
      return { success: true, message: "Magic link sent to email" };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};
