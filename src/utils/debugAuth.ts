/**
 * Debug utilities for authentication
 * Use this to test and debug authentication flows
 */

import { authService } from "../services/authService";

export const debugAuthState = () => {
  console.log("🔍 Current Auth State:");
  console.log(
    "- User:",
    authService.getCurrentUser()?.id || "Not authenticated",
  );
  console.log(
    "- Session:",
    authService.getCurrentSession() ? "Active" : "No session",
  );
  console.log("- Is Authenticated:", authService.isAuthenticated());
};

export const testPhoneAuth = async (phoneNumber: string) => {
  console.log("📱 Testing Phone Auth for:", phoneNumber);

  try {
    // Test phone number validation
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    const isValid = phoneRegex.test(phoneNumber.replace(/\s/g, ""));

    if (!isValid) {
      console.error("❌ Invalid phone number format");
      return;
    }

    console.log("✅ Phone number format is valid");

    // Send OTP
    console.log("📤 Sending OTP...");
    const result = await authService.sendOTP(phoneNumber);

    if (result.success) {
      console.log("✅ OTP sent successfully");
      console.log("Message:", result.messageId);
    } else {
      console.error("❌ Failed to send OTP:", result.error);
    }

    return result;
  } catch (error) {
    console.error("❌ Phone auth test failed:", error);
  }
};

export const testOTPVerification = async (
  phoneNumber: string,
  otpCode: string,
) => {
  console.log("🔐 Testing OTP Verification...");
  console.log("Phone:", phoneNumber);
  console.log("OTP:", otpCode);

  try {
    const result = await authService.verifyOTP(phoneNumber, otpCode);

    if (result.success) {
      console.log("✅ OTP verified successfully");
      console.log("Session created:", !!result.session);
    } else {
      console.error("❌ OTP verification failed:", result.error);
    }

    return result;
  } catch (error) {
    console.error("❌ OTP verification test failed:", error);
  }
};

export const checkSupabaseConfig = () => {
  console.log("🔧 Supabase Configuration Check:");

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  console.log(
    "- URL configured:",
    !!supabaseUrl && supabaseUrl !== "YOUR_SUPABASE_URL",
  );
  console.log(
    "- Key configured:",
    !!supabaseKey && supabaseKey !== "YOUR_SUPABASE_ANON_KEY",
  );
  console.log("- URL:", supabaseUrl);

  if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Supabase configuration missing");
    return false;
  }

  if (
    supabaseUrl === "YOUR_SUPABASE_URL" ||
    supabaseKey === "YOUR_SUPABASE_ANON_KEY"
  ) {
    console.error("❌ Supabase configuration not updated");
    return false;
  }

  console.log("✅ Supabase configuration looks good");
  return true;
};
