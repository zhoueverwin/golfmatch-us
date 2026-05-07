/**
 * Translates authentication errors from Supabase to user-friendly English messages
 * This ensures users see helpful messages instead of technical error details
 */

/**
 * Maps Supabase authentication error messages to user-friendly English messages
 */
export function translateAuthError(error: string | undefined | null): string {
  if (!error) {
    return "Authentication failed. Please try again.";
  }

  const lowerError = error.toLowerCase();

  // Invalid credentials
  if (
    lowerError.includes("invalid login credentials") ||
    lowerError.includes("invalid credentials") ||
    lowerError.includes("wrong password") ||
    lowerError.includes("incorrect password")
  ) {
    return "Incorrect email or password.";
  }

  // Email not confirmed - MUST CHECK FIRST (before "user not found" which had wrong mapping)
  // Supabase returns: "Signing in is not allowed for this user as the email address is not confirmed."
  if (
    lowerError.includes("email not confirmed") ||
    lowerError.includes("email address is not confirmed") ||
    lowerError.includes("confirmation required") ||
    lowerError.includes("email_not_confirmed")
  ) {
    return "EMAIL_NOT_CONFIRMED"; // Special marker for UI to show resend option
  }

  // User not found
  if (
    lowerError.includes("user not found") ||
    lowerError.includes("no user found")
  ) {
    return "This email address is not registered.";
  }

  // Email already exists
  if (
    lowerError.includes("user already registered") ||
    lowerError.includes("already registered") ||
    lowerError.includes("email already exists")
  ) {
    return "This email address is already registered. Please sign in instead.";
  }

  // Password too weak
  if (
    lowerError.includes("password") &&
    (lowerError.includes("weak") ||
      lowerError.includes("too short") ||
      lowerError.includes("minimum"))
  ) {
    return "Password is too short. Please use at least 6 characters.";
  }

  // Invalid email format
  if (
    lowerError.includes("invalid email") ||
    lowerError.includes("email format") ||
    lowerError.includes("malformed email")
  ) {
    return "Please enter a valid email address.";
  }

  // Network errors
  if (
    lowerError.includes("network") ||
    lowerError.includes("fetch") ||
    lowerError.includes("connection") ||
    lowerError.includes("timeout") ||
    lowerError.includes("failed to fetch")
  ) {
    return "Network error. Please check your connection and try again.";
  }

  // OAuth errors
  if (lowerError.includes("oauth") || lowerError.includes("cancelled")) {
    if (lowerError.includes("cancel")) {
      return "Sign-in was cancelled.";
    }
    return "Social sign-in failed. Please try again.";
  }

  // Rate limiting (includes Supabase security throttling)
  // Supabase returns: "For security purposes, you can only request this after X seconds."
  if (
    lowerError.includes("too many requests") ||
    lowerError.includes("rate limit") ||
    lowerError.includes("quota") ||
    lowerError.includes("for security purposes") ||
    lowerError.includes("you can only request this after")
  ) {
    return "Too many attempts. Please wait a moment and try again.";
  }

  // Token errors
  if (
    lowerError.includes("token") ||
    lowerError.includes("session") ||
    lowerError.includes("expired")
  ) {
    return "Your session has expired. Please sign in again.";
  }

  // Generic error fallback
  return "Authentication failed. Please try again.";
}

/**
 * Safely logs errors only in development mode
 */
export function logAuthError(
  context: string,
  error: any,
  details?: Record<string, any>
): void {
  if (__DEV__) {
    console.error(`[Auth] ${context}:`, {
      message: error?.message || String(error),
      ...details,
    });
  }
}




