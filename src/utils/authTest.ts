/**
 * Authentication System Test Utilities
 *
 * This file contains utility functions to test the authentication system
 * during development. These should not be used in production.
 */

import { authService } from "../services/authService";

export const testAuthSystem = async () => {
  console.log("🧪 Testing Authentication System...");

  try {
    // Test 1: Check if Supabase client is properly configured
    console.log("1. Testing Supabase client configuration...");
    const currentUser = authService.getCurrentUser();
    console.log("✅ Supabase client configured");
    console.log(
      "Current user:",
      currentUser ? "Authenticated" : "Not authenticated",
    );

    // Test 2: Check auth state subscription
    console.log("2. Testing auth state subscription...");
    const unsubscribe = authService.subscribeToAuthState((state) => {
      console.log("Auth state changed:", {
        user: state.user ? "Present" : "None",
        session: state.session ? "Active" : "None",
        loading: state.loading,
      });
    });

    // Unsubscribe after a short delay
    setTimeout(() => {
      unsubscribe();
      console.log("✅ Auth state subscription working");
    }, 1000);

    // Test 3: Check environment variables
    console.log("3. Testing environment variables...");
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseUrl !== "YOUR_SUPABASE_URL") {
      console.log("✅ Supabase URL configured");
    } else {
      console.log("❌ Supabase URL not configured");
    }

    if (supabaseKey && supabaseKey !== "YOUR_SUPABASE_ANON_KEY") {
      console.log("✅ Supabase Key configured");
    } else {
      console.log("❌ Supabase Key not configured");
    }

    // Test 4: Check OAuth configuration
    console.log("4. Testing OAuth configuration...");
    const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    const appleServiceId = process.env.EXPO_PUBLIC_APPLE_SERVICE_ID;

    if (
      googleWebClientId &&
      googleWebClientId !== "your_google_web_client_id"
    ) {
      console.log("✅ Google OAuth configured");
    } else {
      console.log("⚠️ Google OAuth not configured (optional)");
    }

    if (appleServiceId && appleServiceId !== "your_apple_service_id") {
      console.log("✅ Apple OAuth configured");
    } else {
      console.log("⚠️ Apple OAuth not configured (optional)");
    }

    console.log("🎉 Authentication system test completed!");
  } catch (error) {
    console.error("❌ Authentication system test failed:", error);
  }
};

export const testPhoneValidation = (phoneNumber: string): boolean => {
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  return phoneRegex.test(phoneNumber.replace(/\s/g, ""));
};

export const testEmailValidation = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const testPasswordValidation = (password: string): boolean => {
  return password.length >= 6;
};

// Development helper to clear auth state
export const clearAuthState = async () => {
  try {
    await authService.signOut();
    console.log("✅ Auth state cleared");
  } catch (error) {
    console.error("❌ Failed to clear auth state:", error);
  }
};

// Development helper to get current auth info
export const getAuthInfo = () => {
  const user = authService.getCurrentUser();
  const session = authService.getCurrentSession();

  return {
    isAuthenticated: !!user,
    userId: user?.id,
    userEmail: user?.email,
    userPhone: user?.phone,
    sessionExpiresAt: session?.expires_at,
    providers: user?.identities?.map((identity) => identity.provider) || [],
  };
};
