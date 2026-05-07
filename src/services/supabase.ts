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

// Custom fetch wrapper with retry logic and connection monitoring
const customFetch: typeof fetch = async (input, init) => {
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
