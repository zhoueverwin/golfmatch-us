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
  blood_type?: string;
  height?: string;
  body_type?: string;
  smoking?: string;
  golf_skill_level?: string;
  golf_experience?: string;
  average_score?: number;
  transportation?: string;
  available_days?: string;
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

  const contextValue: AuthContextType = {
    ...authState,
    profileId,
    userProfile,
    signInWithGoogle: authService.signInWithGoogle.bind(authService),
    signInWithApple: authService.signInWithApple.bind(authService),
    linkEmail: authService.linkEmail.bind(authService),
    linkGoogle: authService.linkGoogle.bind(authService),
    linkApple: authService.linkApple.bind(authService),
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
