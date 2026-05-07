/**
 * Auth Cache Service
 *
 * Centralized caching for auth user to avoid redundant supabase.auth.getUser() calls.
 * Multiple services often need the current auth user, and calling getUser() repeatedly
 * adds unnecessary latency and API calls.
 */

import { supabase } from "./supabase";

interface CachedAuthUser {
  id: string;
  email?: string;
  timestamp: number;
}

// Cache TTL: 1 minute - short enough to stay fresh but long enough to reduce redundant calls
const AUTH_CACHE_TTL = 60 * 1000;

let cachedAuthUser: CachedAuthUser | null = null;

/**
 * Get the cached auth user or fetch from Supabase if stale/missing.
 * This should be used instead of direct supabase.auth.getUser() calls
 * to reduce redundant API calls.
 */
export async function getCachedAuthUser(): Promise<{ id: string; email?: string } | null> {
  const now = Date.now();

  // Return cached value if still fresh
  if (cachedAuthUser && (now - cachedAuthUser.timestamp) < AUTH_CACHE_TTL) {
    return { id: cachedAuthUser.id, email: cachedAuthUser.email };
  }

  // Fetch fresh auth user
  try {
    const { data, error } = await supabase.auth.getUser();

    if (error || !data?.user) {
      cachedAuthUser = null;
      return null;
    }

    // Update cache
    cachedAuthUser = {
      id: data.user.id,
      email: data.user.email,
      timestamp: now,
    };

    return { id: cachedAuthUser.id, email: cachedAuthUser.email };
  } catch {
    cachedAuthUser = null;
    return null;
  }
}

/**
 * Get just the auth user ID (most common use case)
 */
export async function getCachedAuthUserId(): Promise<string | null> {
  const user = await getCachedAuthUser();
  return user?.id || null;
}

/**
 * Clear the auth cache - should be called on logout
 */
export function clearAuthCache(): void {
  cachedAuthUser = null;
}

/**
 * Force refresh the auth cache - useful after login/signup
 */
export async function refreshAuthCache(): Promise<{ id: string; email?: string } | null> {
  cachedAuthUser = null;
  return getCachedAuthUser();
}
