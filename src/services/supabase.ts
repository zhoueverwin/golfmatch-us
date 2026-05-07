import { AppState, Platform } from "react-native";
import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, processLock } from "@supabase/supabase-js";
import Constants from "expo-constants";

// Get environment variables with proper fallback chain
// Try Constants.expoConfig.extra first (for EAS builds), then process.env
const supabaseUrl = 
  Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_URL || 
  process.env.EXPO_PUBLIC_SUPABASE_URL;

const supabaseAnonKey = 
  Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_ANON_KEY || 
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Validate environment variables
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ CRITICAL: Supabase configuration missing!');
  console.error('Environment check:', {
    supabaseUrl: supabaseUrl ? '✅ Present' : '❌ MISSING',
    supabaseAnonKey: supabaseAnonKey ? '✅ Present' : '❌ MISSING',
    expoConfigExtra: Constants.expoConfig?.extra,
    processEnv: {
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL ? 'present' : 'missing',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ? 'present' : 'missing',
    }
  });
  
  throw new Error(
    'Supabase credentials not configured.\n\n' +
    'Required environment variables:\n' +
    '- EXPO_PUBLIC_SUPABASE_URL\n' +
    '- EXPO_PUBLIC_SUPABASE_ANON_KEY\n\n' +
    'Please run:\n' +
    'eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "YOUR_URL"\n' +
    'eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "YOUR_KEY"'
  );
}

// Validate that they're not placeholder values
if (supabaseUrl === 'YOUR_SUPABASE_URL' || supabaseAnonKey === 'YOUR_SUPABASE_ANON_KEY') {
  throw new Error(
    'Supabase credentials are still using placeholder values.\n' +
    'Please set actual values for EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY'
  );
}

// ============================================================================
// Connection Configuration for Scalability
// ============================================================================

// Retry configuration for resilience
// Note: React Query provides its own 2-retry layer on top, so keep this lean
const RETRY_CONFIG = {
  maxRetries: 2,
  initialDelayMs: 500,
  maxDelayMs: 3000,
  backoffMultiplier: 2,
};

// Track connection health
let consecutiveErrors = 0;
let lastSuccessTime = Date.now();

// ============================================================================
// READ-ONLY GUARD (development safety net for the JP production backend)
//
// While the .env still points at the JP production Supabase project, this guard
// prevents any write — table mutations, RPCs, uploads, account changes — from
// reaching the server. RLS would already reject most writes, but this is a
// belt-and-braces layer that doesn't depend on RLS being correct or the
// signed-in user's permissions.
//
// Set EXPO_PUBLIC_SUPABASE_READ_ONLY=false (or remove this block) once you've
// cut over to the new US Supabase project and want writes to land normally.
// ============================================================================
const READ_ONLY_BACKEND =
  (Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_READ_ONLY ??
    process.env.EXPO_PUBLIC_SUPABASE_READ_ONLY ??
    'true') !== 'false';

// Allowed POST endpoints when read-only is on. These are auth flows (token
// refresh, sign-in, sign-out, OTP) which are necessary even in read-only mode.
const READ_ONLY_POST_ALLOWLIST = [
  '/auth/v1/token',
  '/auth/v1/logout',
  '/auth/v1/otp',
  '/auth/v1/recover',
  '/auth/v1/magiclink',
];

function isWriteBlocked(input: RequestInfo | URL, method: string): boolean {
  if (!READ_ONLY_BACKEND) return false;
  const m = method.toUpperCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return false;
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
      ? input.toString()
      : (input as Request).url;
  if (m === 'POST' && READ_ONLY_POST_ALLOWLIST.some((p) => url.includes(p))) {
    return false;
  }
  return true;
}

// Custom fetch wrapper with retry logic and connection monitoring
const customFetch: typeof fetch = async (input, init) => {
  const method = (init?.method ?? 'GET').toString();

  if (isWriteBlocked(input, method)) {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
        ? input.toString()
        : (input as Request).url;
    const msg = `[supabase] BLOCKED ${method} ${url} — read-only mode is on. ` +
      `Set EXPO_PUBLIC_SUPABASE_READ_ONLY=false in .env to allow writes.`;
    console.warn(msg);
    return new Response(
      JSON.stringify({
        code: 'READ_ONLY_MODE',
        message: msg,
      }),
      {
        status: 451, // 451 Unavailable For Legal Reasons — repurposed as a clear "blocked by client policy" signal
        statusText: 'Blocked by read-only mode',
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  let lastError: Error | null = null;
  let delay = RETRY_CONFIG.initialDelayMs;

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      // Add timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

      const response = await fetch(input, {
        ...init,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Track success
      consecutiveErrors = 0;
      lastSuccessTime = Date.now();

      // Handle rate limiting from server
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : delay;

        if (attempt < RETRY_CONFIG.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, waitTime));
          delay = Math.min(delay * RETRY_CONFIG.backoffMultiplier, RETRY_CONFIG.maxDelayMs);
          continue;
        }
      }

      return response;
    } catch (error: any) {
      lastError = error;
      consecutiveErrors++;

      // Don't retry on abort
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }

      // Retry on network errors
      if (attempt < RETRY_CONFIG.maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * RETRY_CONFIG.backoffMultiplier, RETRY_CONFIG.maxDelayMs);
        continue;
      }
    }
  }

  throw lastError || new Error('Request failed after retries');
};

// Get connection health status
export function getConnectionHealth(): {
  healthy: boolean;
  consecutiveErrors: number;
  lastSuccessAge: number;
} {
  return {
    healthy: consecutiveErrors < 3,
    consecutiveErrors,
    lastSuccessAge: Date.now() - lastSuccessTime,
  };
}

if (READ_ONLY_BACKEND) {
  console.warn(
    `🔒 [supabase] READ-ONLY mode is ACTIVE (${supabaseUrl}). All write requests will be blocked client-side. Set EXPO_PUBLIC_SUPABASE_READ_ONLY=false in .env to allow writes.`,
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    ...(Platform.OS !== "web" ? { storage: AsyncStorage } : {}),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    lock: processLock,
  },
  global: {
    fetch: customFetch,
    headers: {
      // Enable connection pooling hints
      'x-connection-timeout': '30000',
    },
  },
  // Realtime configuration for scalability
  realtime: {
    params: {
      eventsPerSecond: 10, // Limit events to prevent flooding
    },
  },
  db: {
    schema: 'public',
  },
});

// Tells Supabase Auth to continuously refresh the session automatically
// if the app is in the foreground. When this is added, you will continue
// to receive `onAuthStateChange` events with the `TOKEN_REFRESHED` or
// `SIGNED_OUT` event if the user's session is terminated. This should
// only be registered once.
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}

// Database table names
export const TABLES = {
  PROFILES: "profiles",
  LIKES: "likes",
  MATCHES: "matches",
  CHAT_MESSAGES: "chat_messages",
  POSTS: "posts",
  POST_LIKES: "post_likes",
  POST_COMMENTS: "post_comments",
  NOTIFICATIONS: "notifications",
  NOTIFICATION_PREFERENCES: "notification_preferences",
} as const;
