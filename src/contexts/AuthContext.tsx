import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { Alert } from "react-native";
import { authService, AuthState } from "../services/authService";
import { User, Session } from "@supabase/supabase-js";
import { userMappingService } from "../services/userMappingService";
import { supabaseDataProvider } from "../services/supabaseDataProvider";
import { profilesService } from "../services/supabase/profiles.service";

// Minimal cached profile — avoids importing the full User type (name collision with Supabase's User)
interface CachedProfile {
  name: string;
  age: number;
  gender: string;
  prefecture: string;
  bio?: string;
  profile_pictures: string[];
  is_premium?: boolean;
  current_streak_days?: number;
  blood_type?: string;
  height?: string;
  body_type?: string;
  smoking?: string;
  golf_skill_level?: string;
  golf_experience?: string;
  average_score?: number;
  transportation?: string;
  available_days?: string;
  is_verified?: boolean;
  kyc_status?: string | null;
  birth_date?: string | null;
}
import { useUserPresence } from "../hooks/useUserPresence";
import { supabase } from "../services/supabase";
import { userInteractionService } from "../services/userInteractionService";

interface AuthContextType extends AuthState {
  profileId: string | null; // Profile ID from profiles table
  userProfile: CachedProfile | null; // Cached profile data (fetched once on login)
  signInWithGoogle: () => Promise<{
    success: boolean;
    error?: string;
    session?: Session;
  }>;
  signInWithApple: () => Promise<{
    success: boolean;
    error?: string;
    session?: Session;
  }>;
  signInWithEmail: (
    email: string,
    password: string,
  ) => Promise<{
    success: boolean;
    error?: string;
    session?: Session;
  }>;
  signUpWithEmail: (
    email: string,
    password: string,
  ) => Promise<{
    success: boolean;
    error?: string;
    session?: Session;
  }>;
  linkEmail: (
    email: string,
    password: string,
  ) => Promise<{ success: boolean; error?: string; message?: string }>;
  linkGoogle: () => Promise<{
    success: boolean;
    error?: string;
    message?: string;
  }>;
  linkApple: () => Promise<{
    success: boolean;
    error?: string;
    message?: string;
  }>;
  /** Re-fetches the current user's profile and updates `userProfile`. */
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<{ success: boolean; error?: string }>;
  deleteAccount: (reasonCode?: string, reasonDetail?: string) => Promise<{ success: boolean; error?: string }>;
  getUserIdentities: () => Promise<{
    success: boolean;
    identities?: any[];
    error?: string;
  }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
  });
  const [profileId, setProfileId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<CachedProfile | null>(null);

  useEffect(() => {
    let isMounted = true;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = authService.subscribeToAuthState(async (state) => {
      if (!isMounted) return;

      try {
        setAuthState(state);
        
        // Get profile ID when user is authenticated
        if (state.user) {
          // Helper function to retry profile fetch with delays
          const fetchProfileWithRetry = async (retryCount: number = 0): Promise<void> => {
            if (!isMounted) return;

            const id = await userMappingService.getProfileIdFromAuth();

            if (id && isMounted) {
              setProfileId(id);
              // Fetch and cache the user profile (used by AppNavigator, MessagesScreen, etc.)
              profilesService.getProfile(id).then(async (res) => {
                if (res.success && res.data && isMounted) {
                  // Check if user is banned
                  if ((res.data as any).is_banned === true) {
                    Alert.alert(
                      "Account suspended",
                      "Your account has been suspended. If you have any questions, please contact us.",
                      [{ text: "OK" }]
                    );
                    setProfileId(null);
                    setUserProfile(null);
                    try { await authService.signOut(); } catch (_) {}
                    return;
                  }
                  setUserProfile(res.data as unknown as CachedProfile);
                }
              }).catch(() => { /* non-critical */ });
              // Update last_login and last_active_at timestamps (fire and forget)
              (async () => {
                try {
                  const now = new Date().toISOString();
                  await supabase
                    .from("profiles")
                    .update({
                      last_login: now,
                      last_active_at: now
                    })
                    .eq("id", id);
                } catch (err) {
                  console.warn("[AuthContext] Failed to update login timestamps:", err);
                }
              })();
              // Bump the daily-return streak once per app open. Idempotent
              // server-side: same-day calls return the existing count unchanged.
              // We pass the device's IANA timezone so the server computes
              // "today" in the user's local calendar — otherwise users near
              // the UTC date boundary (e.g. JST at 22:00, PST at 17:00) get
              // their streak silently reset whenever consecutive local days
              // skip a UTC date.
              (async () => {
                try {
                  let tz = "UTC";
                  try {
                    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
                    if (resolved) tz = resolved;
                  } catch {
                    // Some old JSC builds don't expose resolvedOptions; UTC is fine.
                  }
                  const { data, error } = await supabase.rpc("bump_streak", {
                    p_user_id: id,
                    p_timezone: tz,
                  });
                  if (error || !isMounted) return;
                  const row = Array.isArray(data) ? data[0] : data;
                  const days = row?.current_streak_days;
                  if (typeof days === "number") {
                    setUserProfile((prev) =>
                      prev ? { ...prev, current_streak_days: days } : prev,
                    );
                  }
                } catch (err) {
                  console.warn("[AuthContext] bump_streak failed:", err);
                }
              })();
            } else if (retryCount < 3 && isMounted) {
              // Retry with increasing delays (1s, 2s, 3s)
              retryTimeout = setTimeout(() => {
                if (isMounted) {
                  fetchProfileWithRetry(retryCount + 1);
                }
              }, 1000 * (retryCount + 1));
            } else if (isMounted) {
              // Profile not found after retries - user's account may have been deleted
              // Sign out to clear the stale session and redirect to login
              console.log('[AuthContext] Profile not found after retries, signing out stale session');
              setProfileId(null);
              try {
                await authService.signOut();
              } catch (signOutError) {
                console.error('[AuthContext] Error signing out stale session:', signOutError);
              }
            }
          };

          // Start fetching profile
          fetchProfileWithRetry();
        } else {
          // Clear all caches when user logs out
          if (retryTimeout) {
            clearTimeout(retryTimeout);
            retryTimeout = null;
          }
          setProfileId(null);
          setUserProfile(null);
          if (isMounted) {
            supabaseDataProvider.clearCache().catch(() => {
              // Silently handle cache clear errors
            });
          }
          userMappingService.clearCache();
          userInteractionService.reset();
        }
      } catch (error) {
        // Set loading to false to prevent app from hanging
        if (isMounted) {
          setAuthState(prev => ({ ...prev, loading: false }));
        }
      }
    });

    return () => {
      isMounted = false;
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
      unsubscribe();
    };
  }, []);

  // Track user presence based on authentication state
  useUserPresence(profileId, !!profileId);

  // Subscribe to the user's own profile row so cross-screen state changes
  // (e.g. is_verified flipping to true when the Didit webhook lands while
  // the user is anywhere in the app) propagate to every component reading
  // from `userProfile` without manual refresh hooks per screen.
  //
  // IMPORTANT: ignore housekeeping fields like last_active_at. The presence
  // service writes that field on a short interval; without this filter,
  // every tick triggers setUserProfile → every consumer of useAuth()
  // re-renders → screens with useEffect deps on userProfile re-fetch their
  // feed. On the Connections / Messages empty state that looks like a
  // constantly refreshing page.
  useEffect(() => {
    if (!profileId) return;
    // Whitelist of fields whose changes should actually rebroadcast the
    // userProfile state. Anything not in this list is treated as a
    // housekeeping write and skipped.
    const RELEVANT_FIELDS: ReadonlyArray<keyof CachedProfile> = [
      "name",
      "age",
      "gender",
      "prefecture",
      "bio",
      "profile_pictures",
      "is_premium",
      "current_streak_days",
      "blood_type",
      "height",
      "body_type",
      "smoking",
      "golf_skill_level",
      "golf_experience",
      "average_score",
      "transportation",
      "available_days",
      "is_verified",
      "kyc_status",
      "birth_date",
    ];
    const channel = supabase
      .channel(`auth-profile-${profileId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${profileId}`,
        },
        (payload) => {
          const next = payload.new as Partial<CachedProfile> | null;
          const prev = payload.old as Partial<CachedProfile> | null;
          if (!next) return;
          // Bail if no whitelisted field actually changed. shallow compare
          // is enough — fields are scalars or arrays-of-strings; reference
          // equality for arrays from Postgres realtime is unreliable so we
          // JSON-stringify the few array-typed fields.
          const changed = RELEVANT_FIELDS.some((field) => {
            const a = next?.[field];
            const b = prev?.[field];
            if (a === b) return false;
            if (Array.isArray(a) || Array.isArray(b)) {
              return JSON.stringify(a) !== JSON.stringify(b);
            }
            return true;
          });
          if (!changed) return;
          setUserProfile((cached) =>
            cached ? ({ ...cached, ...next } as CachedProfile) : cached,
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [profileId]);

  const refreshProfile = async () => {
    if (!profileId) return;
    try {
      const res = await profilesService.getProfile(profileId);
      if (res.success && res.data) {
        setUserProfile(res.data as unknown as CachedProfile);
      }
    } catch (err) {
      console.warn("[AuthContext] refreshProfile failed:", err);
    }
  };

  const contextValue: AuthContextType = {
    ...authState,
    profileId,
    userProfile,
    signInWithGoogle: authService.signInWithGoogle.bind(authService),
    signInWithApple: authService.signInWithApple.bind(authService),
    signInWithEmail: authService.signInWithEmail.bind(authService),
    signUpWithEmail: authService.signUpWithEmail.bind(authService),
    linkEmail: authService.linkEmail.bind(authService),
    linkGoogle: authService.linkGoogle.bind(authService),
    linkApple: authService.linkApple.bind(authService),
    refreshProfile,
    signOut: authService.signOut.bind(authService),
    deleteAccount: (r?: string, d?: string) => authService.deleteAccount(r, d),
    getUserIdentities: authService.getUserIdentities.bind(authService),
  };

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
