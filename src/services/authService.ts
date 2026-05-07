import { supabase } from "./supabase";
import { Session, User, AuthError } from "@supabase/supabase-js";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import * as Crypto from "expo-crypto";
import * as AppleAuthentication from "expo-apple-authentication";
import { Platform } from "react-native";
import {
  translateAuthError,
  logAuthError,
} from "../utils/authErrorTranslator";
import { clearAuthCache } from "./authCache";
import {
  logCompleteRegistration,
  setUserId,
  clearUserId,
  flushEvents,
} from "./facebookAnalytics";
import {
  logCompleteRegistration as firebaseLogRegistration,
  logLogin as firebaseLogLogin,
  setUserId as firebaseSetUserId,
  clearUserId as firebaseClearUserId,
} from "./firebaseAnalytics";

// Conditional import for Google Sign-In (not available in Expo Go)
let GoogleSignin: any;
let statusCodes: any;
let isErrorWithCode: any;
let isSuccessResponse: any;
let isNoSavedCredentialFoundResponse: any;

try {
  const googleSignInModule = require("@react-native-google-signin/google-signin");
  GoogleSignin = googleSignInModule.GoogleSignin;
  statusCodes = googleSignInModule.statusCodes;
  isErrorWithCode = googleSignInModule.isErrorWithCode;
  isSuccessResponse = googleSignInModule.isSuccessResponse;
  isNoSavedCredentialFoundResponse = googleSignInModule.isNoSavedCredentialFoundResponse;
} catch (error) {
  // Google Sign-In not available (Expo Go)
  console.warn("⚠️ Google Sign-In module not available. Running in Expo Go or module not installed.");
  GoogleSignin = null;
  statusCodes = {};
  isErrorWithCode = () => false;
  isSuccessResponse = () => false;
  isNoSavedCredentialFoundResponse = () => false;
}

// Local type guard to safely narrow unknown errors that may carry a code
type ErrorWithCode = { code: string; message?: string };
const isErrorWithCodeSafe = (err: unknown): err is ErrorWithCode => {
  try {
    if (typeof isErrorWithCode === "function" && isErrorWithCode(err)) {
      return true;
    }
  } catch (_) {
    // ignore
  }
  return typeof err === "object" && err !== null && "code" in err;
};

// Configure WebBrowser for OAuth
WebBrowser.maybeCompleteAuthSession();

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

export interface PhoneAuthResult {
  success: boolean;
  error?: string;
  messageId?: string;
}

export interface OTPVerificationResult {
  success: boolean;
  error?: string;
  session?: Session;
}

export interface IdentityLinkResult {
  success: boolean;
  error?: string;
  message?: string;
}

class AuthService {
  private authStateListeners: ((state: AuthState) => void)[] = [];
  private currentAuthState: AuthState = {
    user: null,
    session: null,
    loading: true,
  };

  constructor() {
    this.configureGoogleSignIn();
    this.initializeAuth();
  }

  private configureGoogleSignIn(): void {
    try {
      // Check if Google Sign-In is available (not in Expo Go)
      if (!GoogleSignin || typeof GoogleSignin.configure !== 'function') {
        console.warn("⚠️ Google Sign-In not available. Running in Expo Go - use email/password authentication instead.");
        return;
      }

      GoogleSignin.configure({
        // Web Client ID from Google Cloud Console (used for Supabase authentication)
        // This is the OAuth 2.0 Client ID of type "Web application"
        webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || "986630263277-rv4ir98jarhmi43pcjptq7m7e7sf37od.apps.googleusercontent.com",
        
        // iOS Client ID (optional - will be read from GoogleService-Info.plist if not provided)
        iosClientId: "986630263277-4n44sucemnougkvqotdksvbjcis3vivt.apps.googleusercontent.com",
        
        // Request offline access to get refresh tokens
        offlineAccess: true,
        
        // Request basic profile and email
        scopes: ["email", "profile"],
      });
      
      if (__DEV__) {
        console.log("✅ Google Sign-In configured");
      }
    } catch (error) {
      console.warn("⚠️ Failed to configure Google Sign-In:", error);
    }
  }

  private async initializeAuth(): Promise<void> {
    try {
      // Get initial session
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) {
        logAuthError("Error getting session", error);
        
        // If refresh token is invalid/expired, clear the session
        if (error.message?.includes('Refresh Token') || error.message?.includes('refresh_token')) {
          console.log('[Auth] Clearing invalid session from storage');
          await supabase.auth.signOut({ scope: 'local' });
        }
      }

      this.updateAuthState({
        user: session?.user || null,
        session,
        loading: false,
      });

      // Listen for auth state changes
      supabase.auth.onAuthStateChange((event, session) => {
        if (__DEV__) {
          console.log("Auth state changed:", event, session?.user?.id);
        }
        this.updateAuthState({
          user: session?.user || null,
          session,
          loading: false,
        });
      });
    } catch (error) {
      logAuthError("Error initializing auth", error);
      this.updateAuthState({
        user: null,
        session: null,
        loading: false,
      });
    }
  }

  private updateAuthState(newState: AuthState): void {
    this.currentAuthState = newState;
    this.authStateListeners.forEach((listener) => listener(newState));
  }

  // Subscribe to auth state changes
  subscribeToAuthState(listener: (state: AuthState) => void): () => void {
    this.authStateListeners.push(listener);

    // Call immediately with current state
    listener(this.currentAuthState);

    // Return unsubscribe function
    return () => {
      const index = this.authStateListeners.indexOf(listener);
      if (index > -1) {
        this.authStateListeners.splice(index, 1);
      }
    };
  }

  // Phone number authentication
  async sendOTP(phoneNumber: string): Promise<PhoneAuthResult> {
    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: phoneNumber,
      });

      if (error) {
        return {
          success: false,
          error: translateAuthError(error.message),
        };
      }

      return {
        success: true,
        messageId: "OTP sent successfully",
      };
    } catch (error) {
      return {
        success: false,
        error: translateAuthError(
          error instanceof Error ? error.message : "Failed to send OTP"
        ),
      };
    }
  }

  async verifyOTP(
    phoneNumber: string,
    token: string,
  ): Promise<OTPVerificationResult> {
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        phone: phoneNumber,
        token,
        type: "sms",
      });

      if (error) {
        return {
          success: false,
          error: translateAuthError(error.message),
        };
      }

      // Track registration with Facebook + Firebase Analytics (phone OTP)
      if (data.session?.user) {
        logCompleteRegistration('phone');
        setUserId(data.session.user.id);
        firebaseLogRegistration('phone');
        firebaseSetUserId(data.session.user.id);
      }

      return {
        success: true,
        session: data.session || undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: translateAuthError(
          error instanceof Error ? error.message : "Failed to verify OTP"
        ),
      };
    }
  }

  // Email/Password authentication
  // Allowed non-JP email domains for email/password signup
  private static readonly ALLOWED_NON_JP_DOMAINS = [
    'icloud.com',
    'me.com',
    'mac.com',
    'au.com',
  ];

  async signUpWithEmail(
    email: string,
    password: string,
  ): Promise<OTPVerificationResult> {
    try {
      // Only allow JP domains and select non-JP domains for email/password signup
      // Gmail users should use Google OAuth, Apple users should use Apple Sign-In
      const emailDomain = email.split('@')[1]?.toLowerCase();
      if (!emailDomain || (!emailDomain.endsWith('.jp') && !AuthService.ALLOWED_NON_JP_DOMAINS.includes(emailDomain))) {
        return {
          success: false,
          error: 'メールアドレスでの登録はJPドメイン(.jp)のメールのみ対応しています。Gmailの方はGoogleログイン、Apple IDの方はAppleでサインインをご利用ください。',
        };
      }

      // Check blocked domains and banned emails before calling Supabase
      const { data: configData } = await supabase
        .from('app_config')
        .select('value')
        .eq('key', 'blocked_domains')
        .single();

      const blockedDomains: string[] = configData?.value?.domains || [];
      if (blockedDomains.includes(emailDomain)) {
        return {
          success: false,
          error: configData?.value?.message || 'このメールドメインは登録に使用できません。',
        };
      }

      const { data: bannedEmail } = await supabase
        .from('banned_emails')
        .select('id')
        .eq('email', email.toLowerCase())
        .maybeSingle();

      if (bannedEmail) {
        return {
          success: false,
          error: 'このメールアドレスでは登録できません。',
        };
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: undefined, // Use OTP flow instead of magic link
        }
      });

      if (error) {
        if (__DEV__) {
          console.log("❌ [AuthService] Signup error:", error);
        }
        return {
          success: false,
          error: translateAuthError(error.message),
        };
      }

      if (__DEV__) {
        console.log("📊 [AuthService] Signup response:", {
          hasUser: !!data.user,
          hasSession: !!data.session,
          emailConfirmed: !!data.user?.email_confirmed_at,
          userId: data.user?.id,
        });
      }

      // Check if user already exists and is verified (repeated signup)
      // Supabase returns a user object but doesn't send a new confirmation email
      // When email is already confirmed, email_confirmed_at will be a truthy value (Date string)
      // Also check if user exists but no session was created (indicates existing verified user)
      const isExistingVerifiedUser = data.user &&
        (data.user.email_confirmed_at || data.user.confirmed_at) &&
        !data.session;

      if (isExistingVerifiedUser) {
        if (__DEV__) {
          console.log("⚠️ [AuthService] User already exists and is verified", {
            emailConfirmed: !!data.user?.email_confirmed_at,
            confirmed: !!data.user?.confirmed_at,
            hasSession: !!data.session,
          });
        }
        return {
          success: false,
          error: "このメールアドレスは既に登録されています。ログインしてください。",
        };
      }

      // Check if email confirmation is required (new OR existing unverified user)
      if (data.user && !data.session) {
        // Check if this is an EXISTING unverified user vs a NEW user
        // For new users, signUp() already sends verification email - no need to resend
        // For existing unverified users, we need to explicitly resend
        const createdAt = data.user.created_at ? new Date(data.user.created_at).getTime() : 0;
        const now = Date.now();
        const isNewUser = (now - createdAt) < 10000; // Created within last 10 seconds

        if (__DEV__) {
          console.log("📧 [AuthService] Email confirmation required", {
            isNewUser,
            createdAt: data.user.created_at,
            timeSinceCreation: now - createdAt,
          });
        }

        // Only resend for existing unverified users (not new signups)
        // Fire and forget - don't block UI waiting for resend result
        if (!isNewUser) {
          supabase.auth.resend({
            type: "signup",
            email: email,
          }).then(({ error: resendError }) => {
            if (__DEV__) {
              if (resendError) {
                console.log("⚠️ [AuthService] Resend verification result:", resendError.message);
              } else {
                console.log("✅ [AuthService] Verification email resent successfully");
              }
            }
          }).catch((resendErr) => {
            if (__DEV__) {
              console.log("⚠️ [AuthService] Resend exception:", resendErr);
            }
          });
        }

        return {
          success: true,
          session: undefined,
          error: "メールアドレスを確認してください。",
        };
      }

      if (__DEV__) {
        console.log("✅ [AuthService] Signup successful with session");
      }

      // Track registration with Facebook + Firebase Analytics
      if (data.session?.user) {
        logCompleteRegistration('email');
        setUserId(data.session.user.id);
        firebaseLogRegistration('email');
        firebaseSetUserId(data.session.user.id);
      }

      return {
        success: true,
        session: data.session || undefined,
      };
    } catch (error) {
      if (__DEV__) {
        console.log("💥 [AuthService] Signup exception:", error);
      }
      return {
        success: false,
        error: translateAuthError(
          error instanceof Error ? error.message : "Failed to sign up"
        ),
      };
    }
  }

  async signInWithEmail(
    email: string,
    password: string,
  ): Promise<OTPVerificationResult> {
    try {
      if (__DEV__) {
        console.log('🔐 Attempting email login:', email);
      }
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        logAuthError('Login error from Supabase', error, {
          status: error.status,
          name: error.name,
        });
        return {
          success: false,
          error: translateAuthError(error.message),
        };
      }

      if (__DEV__) {
        console.log('✅ Login successful:', {
          userId: data.user?.id,
          email: data.user?.email,
          hasSession: !!data.session,
        });
      }

      // Set Facebook + Firebase Analytics user ID for returning users
      if (data.session?.user) {
        setUserId(data.session.user.id);
        firebaseLogLogin('email');
        firebaseSetUserId(data.session.user.id);
      }

      return {
        success: true,
        session: data.session || undefined,
      };
    } catch (error) {
      logAuthError('Login exception', error, {
        stack: error instanceof Error ? error.stack : undefined,
      });
      
      // Check if it's a JSON parse error
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('JSON') || errorMessage.includes('parse') || errorMessage.includes('unexpected')) {
        return {
          success: false,
          error: translateAuthError('Network error'),
        };
      }
      
      return {
        success: false,
        error: translateAuthError(error instanceof Error ? error.message : "Failed to sign in"),
      };
    }
  }

  // Native Google Sign-In
  async signInWithGoogle(): Promise<OTPVerificationResult> {
    try {
      // Check if Google Sign-In is available (not in Expo Go)
      if (!GoogleSignin || typeof GoogleSignin.signIn !== 'function') {
        return {
          success: false,
          error: "Google Sign-Inは開発ビルドでのみ利用可能です。\n\nExpo Goでは使用できません。メールアドレスでログインしてください。",
        };
      }

      if (__DEV__) {
        console.log("🔵 [GoogleAuth] Starting native Google Sign-In");
      }

      // Check if Play Services are available (Android only, always resolves true on iOS)
      try {
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
        if (__DEV__) {
          console.log("✅ [GoogleAuth] Play Services available");
        }
      } catch (playServicesError) {
        if (__DEV__) {
          console.log("❌ [GoogleAuth] Play Services error:", playServicesError);
        }
        logAuthError("Google Play Services check failed", playServicesError);
        return {
          success: false,
          error: translateAuthError("Google Play Servicesが利用できません"),
        };
      }

      // Trigger native Google Sign-In flow
      if (__DEV__) {
        console.log("📱 [GoogleAuth] Calling GoogleSignin.signIn()...");
      }
      
      const response = await GoogleSignin.signIn();

      if (__DEV__) {
        console.log("📊 [GoogleAuth] Raw response received:", JSON.stringify(response, null, 2));
        console.log("📊 [GoogleAuth] Response has type property:", 'type' in response);
        console.log("📊 [GoogleAuth] Response type value:", (response as any).type);
      }

      // Check if user cancelled the sign-in
      if (!isSuccessResponse(response)) {
        if (__DEV__) {
          console.log("🚫 [GoogleAuth] Google Sign-In not successful - cancelled or no credential");
        }
        return {
          success: false,
          error: translateAuthError("OAuth cancelled"),
        };
      }

      if (__DEV__) {
        console.log("✅ [GoogleAuth] isSuccessResponse check passed");
      }

      const { data } = response;

      if (__DEV__) {
        console.log("📦 [GoogleAuth] Response data structure:", {
          hasData: !!data,
          hasUser: !!(data as any)?.user,
          hasIdToken: !!(data as any)?.idToken,
          userEmail: (data as any)?.user?.email,
          userName: (data as any)?.user?.name,
        });
      }

      if (!data) {
        logAuthError("No data in Google Sign-In response", new Error("Missing data object"));
        return {
          success: false,
          error: translateAuthError("Googleからのレスポンスにデータがありません"),
        };
      }

      // Get the ID token to authenticate with Supabase
      const { idToken } = data as any;

      if (__DEV__) {
        console.log("🔑 [GoogleAuth] ID Token status:", {
          hasIdToken: !!idToken,
          tokenLength: idToken?.length || 0,
          tokenPreview: idToken ? `${idToken.substring(0, 20)}...` : 'null',
        });
      }

      if (!idToken) {
        logAuthError("No ID token received from Google", new Error("Missing ID token"), {
          responseData: data,
        });
        return {
          success: false,
          error: translateAuthError("GoogleからIDトークンを取得できませんでした"),
        };
      }

      if (__DEV__) {
        console.log("🔐 [GoogleAuth] Authenticating with Supabase using Google ID token...");
      }

      // Sign in to Supabase with the Google ID token
      const { data: supabaseData, error: supabaseError } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: idToken,
      });

      if (supabaseError) {
        logAuthError("Supabase Google auth error", supabaseError, {
          errorStatus: supabaseError.status,
          errorName: supabaseError.name,
        });
        return {
          success: false,
          error: translateAuthError(supabaseError.message),
        };
      }

      if (__DEV__) {
        console.log("✅ [GoogleAuth] Supabase authentication successful");
        console.log("🎫 [GoogleAuth] Session created:", {
          userId: supabaseData.session?.user?.id,
          userEmail: supabaseData.session?.user?.email,
          hasAccessToken: !!supabaseData.session?.access_token,
          hasRefreshToken: !!supabaseData.session?.refresh_token,
        });
      }

      // Track registration/login with Facebook + Firebase Analytics (Google)
      if (supabaseData.session?.user) {
        logCompleteRegistration('google');
        setUserId(supabaseData.session.user.id);
        firebaseLogRegistration('google');
        firebaseSetUserId(supabaseData.session.user.id);
      }

      return {
        success: true,
        session: supabaseData.session || undefined,
      };
    } catch (error) {
      // Handle specific Google Sign-In errors
      if (isErrorWithCodeSafe(error)) {
        if (__DEV__) {
          console.log("❌ [GoogleAuth] Google Sign-In error with code:", error.code);
        }

        switch (error.code) {
          case statusCodes.SIGN_IN_CANCELLED:
            if (__DEV__) {
              console.log("🚫 [GoogleAuth] User cancelled the sign-in flow");
            }
            return {
              success: false,
              error: translateAuthError("OAuth cancelled"),
            };

          case statusCodes.IN_PROGRESS:
            if (__DEV__) {
              console.log("⏳ [GoogleAuth] Sign-in already in progress");
            }
            return {
              success: false,
              error: translateAuthError("Sign in already in progress"),
            };

          case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
            if (__DEV__) {
              console.log("❌ [GoogleAuth] Google Play Services not available");
            }
            return {
              success: false,
              error: translateAuthError("Google Play Servicesが利用できません"),
            };

          default:
            logAuthError("Google Sign-In error with code", error, {
              code: error.code,
              message: error.message,
            });
            return {
              success: false,
              error: translateAuthError(error.message || "Googleログインに失敗しました"),
            };
        }
      }

      // Handle general errors
      logAuthError("Google Sign-In exception", error, {
        errorType: typeof error,
        errorString: String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      });
      
      return {
        success: false,
        error: translateAuthError(
          error instanceof Error ? error.message : "Failed to sign in with Google"
        ),
      };
    }
  }

  // LINE Sign In
  async signInWithLine(lineAccessToken: string, lineIdToken?: string): Promise<OTPVerificationResult> {
    try {
      if (__DEV__) {
        console.log("🟢 [LINEAuth] Starting LINE authentication");
      }

      // Call our Supabase Edge Function to verify LINE token and create/find user
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
      const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";

      const response = await fetch(`${supabaseUrl}/functions/v1/line-auth`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          accessToken: lineAccessToken,
          idToken: lineIdToken,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.session) {
        if (__DEV__) {
          console.log("❌ [LINEAuth] Edge function error:", result.error);
        }
        logAuthError("LINE auth edge function failed", new Error(result.error));
        return {
          success: false,
          error: translateAuthError(result.error || "LINE認証に失敗しました"),
        };
      }

      if (__DEV__) {
        console.log("✅ [LINEAuth] Got session from edge function");
      }

      // Set the session in Supabase client
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token,
      });

      if (sessionError) {
        if (__DEV__) {
          console.log("❌ [LINEAuth] Failed to set session:", sessionError);
        }
        logAuthError("Failed to set LINE session", sessionError);
        return {
          success: false,
          error: translateAuthError(sessionError.message),
        };
      }

      // Track with analytics
      logCompleteRegistration('line');
      if (result.user?.id) {
        setUserId(result.user.id);
        firebaseLogRegistration('line');
        firebaseSetUserId(result.user.id);
      }

      if (__DEV__) {
        console.log("✅ [LINEAuth] LINE authentication successful");
      }

      return {
        success: true,
        session: result.session,
      };
    } catch (error) {
      if (__DEV__) {
        console.log("💥 [LINEAuth] Exception:", error);
      }
      logAuthError("LINE sign-in exception", error);
      return {
        success: false,
        error: translateAuthError(
          error instanceof Error ? error.message : "LINE認証に失敗しました"
        ),
      };
    }
  }

  // Apple Sign In
  async signInWithApple(): Promise<OTPVerificationResult> {
    try {
      if (Platform.OS === "ios") {
        // iOS: Use native Apple Authentication
        // Check if Apple Sign In is available on this device
        const isAvailable = await AppleAuthentication.isAvailableAsync();
        if (!isAvailable) {
          return {
            success: false,
            error: translateAuthError("Apple Sign-In is not available on this device"),
          };
        }

        // Request Apple authentication
        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
        });

        // The identityToken is a JWT that contains the user's information
        if (!credential.identityToken) {
          logAuthError("No identity token received from Apple", new Error("Missing identity token"));
          return {
            success: false,
            error: translateAuthError("No identity token received from Apple"),
          };
        }

        // Sign in to Supabase with the Apple identity token
        const { data: supabaseData, error: supabaseError } = await supabase.auth.signInWithIdToken({
          provider: "apple",
          token: credential.identityToken,
        });

        if (supabaseError) {
          logAuthError("Supabase Apple auth error", supabaseError);
          return {
            success: false,
            error: translateAuthError(supabaseError.message),
          };
        }

        // Track registration/login with Facebook + Firebase Analytics (Apple)
        if (supabaseData.session?.user) {
          logCompleteRegistration('apple');
          setUserId(supabaseData.session.user.id);
          firebaseLogRegistration('apple');
          firebaseSetUserId(supabaseData.session.user.id);
        }

        return {
          success: true,
          session: supabaseData.session || undefined,
        };
      } else {
        // Android: Use web-based OAuth flow with nonce
        // Generate a random nonce for security
        const nonce = Crypto.randomUUID();
        const hashedNonce = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          nonce
        );

        // Create the deep link redirect URL for the app
        const appRedirectUrl = AuthSession.makeRedirectUri({
          scheme: "golfmatch",
          path: "auth/callback",
        });

        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: "apple",
          options: {
            redirectTo: appRedirectUrl,
            scopes: "name email",
          },
        });

        if (error) {
          logAuthError("Apple OAuth error", error);
          return {
            success: false,
            error: translateAuthError(error.message),
          };
        }

        if (data.url) {
          const result = await WebBrowser.openAuthSessionAsync(
            data.url,
            appRedirectUrl,
            {
              showInRecents: false,
              preferEphemeralSession: true,
            },
          );

          if (result.type === "success" && result.url) {
            const url = new URL(result.url);
            const accessToken = url.searchParams.get("access_token");
            const refreshToken = url.searchParams.get("refresh_token");
            const errorParam = url.searchParams.get("error");
            const errorDescription = url.searchParams.get("error_description");

            if (errorParam) {
              logAuthError("Apple OAuth returned error", new Error(errorParam), {
                description: errorDescription,
              });
              return {
                success: false,
                error: translateAuthError(errorDescription || `OAuth error: ${errorParam}`),
              };
            }

            if (accessToken && refreshToken) {
              const { data: sessionData, error: sessionError } =
                await supabase.auth.setSession({
                  access_token: accessToken,
                  refresh_token: refreshToken,
                });

              if (sessionError) {
                logAuthError("Apple session error", sessionError);
                return {
                  success: false,
                  error: translateAuthError(sessionError.message),
                };
              }

              // Track registration/login with Facebook + Firebase Analytics (Apple on Android)
              if (sessionData.session?.user) {
                logCompleteRegistration('apple');
                setUserId(sessionData.session.user.id);
                firebaseLogRegistration('apple');
                firebaseSetUserId(sessionData.session.user.id);
              }

              return {
                success: true,
                session: sessionData.session || undefined,
              };
            } else {
              logAuthError("Missing tokens in Apple OAuth response", new Error("Missing tokens"), {
                hasAccessToken: !!accessToken,
                hasRefreshToken: !!refreshToken,
              });
            }
          } else if (result.type === "cancel") {
            return {
              success: false,
              error: translateAuthError("OAuth cancelled"),
            };
          }
        }

        return {
          success: false,
          error: translateAuthError("Apple sign-in was cancelled or failed"),
        };
      }
    } catch (error) {
      // Handle Apple authentication specific errors
      if (error && typeof error === "object" && "code" in error) {
        const appleError = error as { code: string };
        if (appleError.code === "ERR_REQUEST_CANCELED") {
          return {
            success: false,
            error: translateAuthError("OAuth cancelled"),
          };
        }
      }

      logAuthError("Apple authentication exception", error);
      return {
        success: false,
        error: translateAuthError(
          error instanceof Error
            ? error.message
            : "Failed to sign in with Apple"
        ),
      };
    }
  }

  // Identity linking
  async linkEmail(
    email: string,
    password: string,
  ): Promise<IdentityLinkResult> {
    try {
      // For email linking, we need to use the updateUser method
      const { error } = await supabase.auth.updateUser({
        email,
        password,
      });

      if (error) {
        return {
          success: false,
          error: translateAuthError(error.message),
        };
      }

      return {
        success: true,
        message: "Email successfully linked to your account",
      };
    } catch (error) {
      return {
        success: false,
        error: translateAuthError(
          error instanceof Error ? error.message : "Failed to link email"
        ),
      };
    }
  }

  async linkPhone(phoneNumber: string): Promise<IdentityLinkResult> {
    try {
      // For phone linking, we need to use the updateUser method
      const { error } = await supabase.auth.updateUser({
        phone: phoneNumber,
      });

      if (error) {
        return {
          success: false,
          error: translateAuthError(error.message),
        };
      }

      return {
        success: true,
        message: "Phone number successfully linked to your account",
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to link phone number",
      };
    }
  }

  async linkGoogle(): Promise<IdentityLinkResult> {
    try {
      // Check if Google Sign-In is available (not in Expo Go)
      if (!GoogleSignin || typeof GoogleSignin.signIn !== 'function') {
        return {
          success: false,
          error: "Google Sign-Inは開発ビルドでのみ利用可能です。Expo Goでは使用できません。",
        };
      }

      if (__DEV__) {
        console.log("🔗 [GoogleAuth] Starting native Google account linking");
      }

      // Check if Play Services are available (Android only)
      try {
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      } catch (playServicesError) {
        if (__DEV__) {
          console.log("❌ [GoogleAuth] Play Services error during linking:", playServicesError);
        }
        return {
          success: false,
          error: "Google Play Servicesが利用できません",
        };
      }

      // Trigger native Google Sign-In flow for linking
      const response = await GoogleSignin.signIn();

      if (__DEV__) {
        console.log("📊 [GoogleAuth] Link response received:", JSON.stringify(response, null, 2));
      }

      if (!isSuccessResponse(response)) {
        if (__DEV__) {
          console.log("🚫 [GoogleAuth] Google account linking cancelled by user");
        }
        return {
          success: false,
          error: "Google linking was cancelled",
        };
      }

      const { data } = response;
      const { idToken } = data as any;

      if (__DEV__) {
        console.log("🔑 [GoogleAuth] Link ID Token status:", {
          hasIdToken: !!idToken,
          tokenLength: idToken?.length || 0,
        });
      }

      if (!idToken) {
        logAuthError("No ID token received from Google during linking", new Error("Missing ID token"));
        return {
          success: false,
          error: "GoogleからIDトークンを取得できませんでした",
        };
      }

      if (__DEV__) {
        console.log("🔐 [GoogleAuth] Linking Google account with Supabase");
      }

      // Link the Google account to the current user using ID token
      const { data: linkData, error: linkError } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: idToken,
        options: {
          // This will link the identity if user is already signed in
        },
      });

      if (linkError) {
        logAuthError("Failed to link Google account", linkError, {
          errorStatus: linkError.status,
          errorName: linkError.name,
        });
        return {
          success: false,
          error: translateAuthError(linkError.message),
        };
      }

      if (__DEV__) {
        console.log("✅ [GoogleAuth] Google account linked successfully");
      }

      return {
        success: true,
        message: "Google account successfully linked",
      };
    } catch (error) {
      if (isErrorWithCodeSafe(error)) {
        if (__DEV__) {
          console.log("❌ [GoogleAuth] Google linking error with code:", error.code);
        }
        switch (error.code) {
          case statusCodes.SIGN_IN_CANCELLED:
            return {
              success: false,
              error: "Google linking was cancelled",
            };
          case statusCodes.IN_PROGRESS:
            return {
              success: false,
              error: "Sign in already in progress",
            };
          case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
            return {
              success: false,
              error: "Google Play Servicesが利用できません",
            };
          default:
            logAuthError("Google account linking error", error, {
              code: error.code,
              message: error.message,
            });
            return {
              success: false,
              error: error.message || "Failed to link Google account",
            };
        }
      }

      logAuthError("Google account linking exception", error, {
        errorType: typeof error,
        errorString: String(error),
      });
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to link Google account",
      };
    }
  }

  async linkApple(): Promise<IdentityLinkResult> {
    try {
      if (Platform.OS === "ios") {
        // iOS: Use native Apple Authentication for linking
        // Check if Apple Sign In is available on this device
        const isAvailable = await AppleAuthentication.isAvailableAsync();
        if (!isAvailable) {
          return {
            success: false,
            error: "Apple Sign-In is not available on this device",
          };
        }

        // Request Apple authentication for linking
        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
        });

        if (!credential.identityToken) {
          return {
            success: false,
            error: "No identity token received from Apple",
          };
        }

        // Link the Apple account to the current user using ID token
        const { data: linkData, error: linkError } = await supabase.auth.signInWithIdToken({
          provider: "apple",
          token: credential.identityToken,
          options: {
            // This will link the identity if user is already signed in
          },
        });

        if (linkError) {
          logAuthError("Failed to link Apple account", linkError);
          return {
            success: false,
            error: translateAuthError(linkError.message),
          };
        }

        return {
          success: true,
          message: "Apple account successfully linked",
        };
      } else {
        // Android: Use web-based OAuth flow for linking
        const redirectUrl = AuthSession.makeRedirectUri({
          scheme: "golfmatch",
          path: "auth/callback",
        });

        // For OAuth linking, we need to use signInWithOAuth
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: "apple",
          options: {
            redirectTo: redirectUrl,
            scopes: "name email",
          },
        });

        if (error) {
          return {
            success: false,
            error: translateAuthError(error.message),
          };
        }

        if (data.url) {
          const result = await WebBrowser.openAuthSessionAsync(
            data.url,
            redirectUrl,
            {
              showInRecents: false,
              preferEphemeralSession: true,
            },
          );

          if (result.type === "success") {
            return {
              success: true,
              message: "Apple account successfully linked",
            };
          } else if (result.type === "cancel") {
            return {
              success: false,
              error: "Apple linking was cancelled",
            };
          }
        }

        return {
          success: false,
          error: "Apple linking was cancelled or failed",
        };
      }
    } catch (error) {
      // Handle Apple authentication specific errors
      if (error && typeof error === "object" && "code" in error) {
        const appleError = error as { code: string };
        if (appleError.code === "ERR_REQUEST_CANCELED") {
          return {
            success: false,
            error: "Apple linking was cancelled",
          };
        }
      }

      logAuthError("Apple account linking exception", error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to link Apple account",
      };
    }
  }

  // Silent Google Sign-In (auto sign-in if user previously signed in)
  async signInWithGoogleSilently(): Promise<OTPVerificationResult> {
    try {
      // Check if Google Sign-In is available (not in Expo Go)
      if (!GoogleSignin || typeof GoogleSignin.signInSilently !== 'function') {
        return {
          success: false,
          error: "Google Sign-Inは開発ビルドでのみ利用可能です。",
        };
      }

      if (__DEV__) {
        console.log("🔍 [GoogleAuth] Attempting silent Google Sign-In");
      }

      // Check if user has previously signed in
      if (!GoogleSignin.hasPreviousSignIn()) {
        if (__DEV__) {
          console.log("ℹ️ [GoogleAuth] No previous Google Sign-In found");
        }
        return {
          success: false,
          error: "No previous sign-in",
        };
      }

      // Attempt silent sign-in
      const response = await GoogleSignin.signInSilently();

      if (__DEV__) {
        console.log("📊 [GoogleAuth] Silent sign-in response:", JSON.stringify(response, null, 2));
      }

      // Check if no saved credential was found
      if (isNoSavedCredentialFoundResponse(response)) {
        if (__DEV__) {
          console.log("ℹ️ [GoogleAuth] No saved credentials found for silent sign-in");
        }
        return {
          success: false,
          error: "No saved credentials",
        };
      }

      // Response is SignInSuccessResponse
      const { data } = response;
      const { idToken } = data as any;

      if (__DEV__) {
        console.log("🔑 [GoogleAuth] Silent ID Token status:", {
          hasIdToken: !!idToken,
          tokenLength: idToken?.length || 0,
        });
      }

      if (!idToken) {
        logAuthError("No ID token received from silent sign-in", new Error("Missing ID token"));
        return {
          success: false,
          error: "No ID token received",
        };
      }

      // Sign in to Supabase with the Google ID token
      const { data: supabaseData, error: supabaseError } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: idToken,
      });

      if (supabaseError) {
        logAuthError("Silent Google auth error", supabaseError, {
          errorStatus: supabaseError.status,
          errorName: supabaseError.name,
        });
        return {
          success: false,
          error: translateAuthError(supabaseError.message),
        };
      }

      if (__DEV__) {
        console.log("✅ [GoogleAuth] Silent Google Sign-In successful");
      }

      return {
        success: true,
        session: supabaseData.session || undefined,
      };
    } catch (error) {
      if (__DEV__) {
        console.log("❌ [GoogleAuth] Silent sign-in exception:", error);
      }
      logAuthError("Silent sign-in exception", error, {
        errorType: typeof error,
        errorString: String(error),
      });
      return {
        success: false,
        error: "Silent sign-in failed",
      };
    }
  }

  // Delete account and all associated data
  async deleteAccount(reasonCode?: string, reasonDetail?: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      if (!user?.id) {
        return {
          success: false,
          error: "ユーザーが見つかりません",
        };
      }

      if (__DEV__) {
        console.log('[AuthService] Starting account deletion for user:', user.id);
      }

      // Call the database function to delete all user data
      const { error: deleteError } = await supabase.rpc('delete_user_account', {
        user_uuid: user.id,
        reason_code: reasonCode || 'unknown',
        reason_detail: reasonDetail || null,
      });

      if (deleteError) {
        logAuthError('Failed to delete user data', deleteError);
        return {
          success: false,
          error: translateAuthError(deleteError.message),
        };
      }

      if (__DEV__) {
        console.log('[AuthService] User data deleted successfully');
      }

      // Sign out from Google if applicable
      try {
        if (GoogleSignin && typeof GoogleSignin.signOut === 'function') {
          await GoogleSignin.signOut();
          if (__DEV__) {
            console.log("✅ Google Sign-In session cleared during account deletion");
          }
        }
      } catch (googleSignOutError) {
        if (__DEV__) {
          console.log("⚠️ Failed to clear Google Sign-In session:", googleSignOutError);
        }
      }

      // Sign out the user (this will also clear the local session)
      const { error: signOutError } = await supabase.auth.signOut();

      if (signOutError) {
        logAuthError('Error signing out after account deletion', signOutError);
        // Don't return error here as the account is already deleted
      }

      // Clear Facebook + Firebase Analytics user ID and flush events
      clearUserId();
      flushEvents();
      firebaseClearUserId();

      if (__DEV__) {
        console.log('[AuthService] Account deletion completed successfully');
      }

      return {
        success: true,
      };
    } catch (error) {
      logAuthError('Account deletion exception', error);
      return {
        success: false,
        error: translateAuthError(
          error instanceof Error ? error.message : "アカウントの削除に失敗しました"
        ),
      };
    }
  }

  // Sign out
  async signOut(): Promise<{ success: boolean; error?: string }> {
    try {
      // Get current user before signing out
      const { data: { user } } = await supabase.auth.getUser();
      
      // Update last_active_at to current time on logout
      // This preserves the "last seen" timestamp so other users can see when they were last active
      // The online status check uses a 5-minute threshold, so user will appear offline after logout
      if (user?.id) {
        try {
          if (__DEV__) {
            console.log('[AuthService] Updating last_active_at on logout:', user.id);
          }
          await supabase
            .from("profiles")
            .update({ last_active_at: new Date().toISOString() })
            .eq("id", user.id);
        } catch (presenceError) {
          logAuthError('[AuthService] Error updating presence on logout', presenceError);
          // Don't block logout if this fails
        }
      }

      // Sign out from Supabase
      const { error } = await supabase.auth.signOut();

      if (error) {
        return {
          success: false,
          error: translateAuthError(error.message),
        };
      }

      // Also sign out from Google to clear the native session
      try {
        if (GoogleSignin && typeof GoogleSignin.signOut === 'function') {
          await GoogleSignin.signOut();
          if (__DEV__) {
            console.log("✅ Google Sign-In session cleared");
          }
        }
      } catch (googleSignOutError) {
        // Don't fail the entire sign-out if Google sign-out fails
        if (__DEV__) {
          console.log("⚠️ Failed to clear Google Sign-In session:", googleSignOutError);
        }
      }

      // Clear the cached auth user
      clearAuthCache();

      // Clear Facebook + Firebase Analytics user ID and flush events
      clearUserId();
      flushEvents();
      firebaseClearUserId();

      return {
        success: true,
      };
    } catch (error) {
      return {
        success: false,
        error: translateAuthError(
          error instanceof Error ? error.message : "Failed to sign out"
        ),
      };
    }
  }

  // Get current user
  getCurrentUser(): User | null {
    return this.currentAuthState.user;
  }

  // Get current session
  getCurrentSession(): Session | null {
    return this.currentAuthState.session;
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    return !!this.currentAuthState.user;
  }

  // Get user identities (linked accounts)
  async getUserIdentities(): Promise<{
    success: boolean;
    identities?: any[];
    error?: string;
  }> {
    try {
      const { data, error } = await supabase.auth.getUser();

      if (error) {
        return {
          success: false,
          error: translateAuthError(error.message),
        };
      }

      return {
        success: true,
        identities: data.user?.identities || [],
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to get user identities",
      };
    }
  }
}

// Export singleton instance
export const authService = new AuthService();
