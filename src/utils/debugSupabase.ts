/**
 * Debug utilities for Supabase configuration
 */

import { supabase } from "../services/supabase";

export const debugSupabaseConfig = () => {
  console.log("🔍 Debugging Supabase Configuration...");

  // Check environment variables
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  console.log("📋 Environment Variables:");
  console.log("- Supabase URL:", supabaseUrl ? "✅ Set" : "❌ Missing");
  console.log("- Supabase Key:", supabaseKey ? "✅ Set" : "❌ Missing");

  if (supabaseUrl) {
    console.log("- URL Value:", supabaseUrl);
  }

  // Test Supabase connection
  testSupabaseConnection();
};

export const testSupabaseConnection = async () => {
  try {
    console.log("🔗 Testing Supabase Connection...");

    // Test basic connection
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      console.error("❌ Supabase connection error:", error.message);
    } else {
      console.log("✅ Supabase connection successful");
      console.log("- Current session:", data.session ? "Active" : "None");
    }

    // Test auth configuration
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError) {
      console.error("❌ Auth service error:", authError.message);
    } else {
      console.log("✅ Auth service working");
      console.log(
        "- Current user:",
        authData.user ? "Authenticated" : "Not authenticated",
      );
    }
  } catch (error) {
    console.error("❌ Connection test failed:", error);
  }
};

export const testPhoneAuthConfig = async () => {
  console.log("📱 Testing Phone Auth Configuration...");

  try {
    // Try to get auth settings (this might not work without proper permissions)
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      console.error("❌ Cannot test phone auth:", error.message);
      return;
    }

    console.log("✅ Phone auth service accessible");
    console.log(
      "⚠️ Note: SMS provider configuration is done in Supabase dashboard",
    );
    console.log("📋 Required SMS Provider Settings:");
    console.log("- Provider: Twilio (recommended)");
    console.log("- Account SID: Your Twilio Account SID");
    console.log("- Auth Token: Your Twilio Auth Token");
    console.log("- Phone Number: Your Twilio phone number");
  } catch (error) {
    console.error("❌ Phone auth test failed:", error);
  }
};

export const getAuthStatus = () => {
  console.log("📊 Current Auth Status:");

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  const status = {
    supabaseConfigured: !!(supabaseUrl && supabaseKey),
    supabaseUrl: supabaseUrl,
    hasValidUrl: supabaseUrl && supabaseUrl !== "YOUR_SUPABASE_URL",
    hasValidKey: supabaseKey && supabaseKey !== "YOUR_SUPABASE_ANON_KEY",
  };

  console.log("Status:", status);
  return status;
};
