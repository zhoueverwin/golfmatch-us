/**
 * Translates authentication errors from Supabase to user-friendly Japanese messages
 * This ensures users see helpful messages instead of technical error details
 */

/**
 * Maps Supabase authentication error messages to user-friendly Japanese messages
 */
export function translateAuthError(error: string | undefined | null): string {
  if (!error) {
    return "認証に失敗しました。もう一度お試しください。";
  }

  const lowerError = error.toLowerCase();

  // Invalid credentials
  if (
    lowerError.includes("invalid login credentials") ||
    lowerError.includes("invalid credentials") ||
    lowerError.includes("wrong password") ||
    lowerError.includes("incorrect password")
  ) {
    return "メールアドレスまたはパスワードが正しくありません。";
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
    return "このメールアドレスは登録されていません。";
  }

  // Email already exists
  if (
    lowerError.includes("user already registered") ||
    lowerError.includes("already registered") ||
    lowerError.includes("email already exists")
  ) {
    return "このメールアドレスは既に登録されています。ログインしてください。";
  }

  // Password too weak
  if (
    lowerError.includes("password") &&
    (lowerError.includes("weak") ||
      lowerError.includes("too short") ||
      lowerError.includes("minimum"))
  ) {
    return "パスワードが短すぎます。6文字以上で入力してください。";
  }

  // Invalid email format
  if (
    lowerError.includes("invalid email") ||
    lowerError.includes("email format") ||
    lowerError.includes("malformed email")
  ) {
    return "有効なメールアドレスを入力してください。";
  }

  // Network errors
  if (
    lowerError.includes("network") ||
    lowerError.includes("fetch") ||
    lowerError.includes("connection") ||
    lowerError.includes("timeout") ||
    lowerError.includes("failed to fetch")
  ) {
    return "ネットワークエラーが発生しました。接続を確認して再度お試しください。";
  }

  // OAuth errors
  if (lowerError.includes("oauth") || lowerError.includes("cancelled")) {
    if (lowerError.includes("cancel")) {
      return "ログインがキャンセルされました。";
    }
    return "ソーシャルログインに失敗しました。もう一度お試しください。";
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
    return "しばらく時間をおいて再度お試しください。";
  }

  // Token errors
  if (
    lowerError.includes("token") ||
    lowerError.includes("session") ||
    lowerError.includes("expired")
  ) {
    return "セッションの有効期限が切れました。再度ログインしてください。";
  }

  // Generic error fallback
  return "認証に失敗しました。もう一度お試しください。";
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





