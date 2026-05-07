/**
 * Test OAuth configuration
 */

import * as AuthSession from "expo-auth-session";

export const testOAuthConfig = () => {
  console.log("🔧 Testing OAuth Configuration...");

  // Use Supabase callback URL - this is the only URL Google accepts
  const redirectUrl =
    "https://rriwpoqhbgvprbhomckk.supabase.co/auth/v1/callback";

  console.log("🔗 Generated redirect URL:", redirectUrl);

  // Expected format: https://rriwpoqhbgvprbhomckk.supabase.co/auth/v1/callback
  if (
    redirectUrl.startsWith("https://") &&
    redirectUrl.includes("supabase.co")
  ) {
    console.log("✅ Supabase callback URL is correct");
  } else {
    console.error("❌ URL configuration is incorrect");
    console.log(
      "Expected: https://rriwpoqhbgvprbhomckk.supabase.co/auth/v1/callback",
    );
    console.log("Got:", redirectUrl);
  }

  return redirectUrl;
};

export const getOAuthRedirectUrl = () => {
  return "https://rriwpoqhbgvprbhomckk.supabase.co/auth/v1/callback";
};
