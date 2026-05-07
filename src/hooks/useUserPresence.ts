import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { UserPresenceService } from "../services/userPresenceService";

/**
 * Hook for tracking user online presence
 * Automatically starts/stops tracking based on user authentication state
 * 
 * @param userId - The user's profile ID (UUID)
 * @param enabled - Whether to enable presence tracking (default: true)
 */
export const useUserPresence = (userId: string | null | undefined, enabled: boolean = true) => {
  const appStateRef = useRef(AppState.currentState);
  const isInitializedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !userId) {
      // Stop tracking if disabled or no user
      if (isInitializedRef.current) {
        UserPresenceService.stopTracking();
        isInitializedRef.current = false;
      }
      return;
    }

    // Start tracking when user is available
    if (!isInitializedRef.current) {
      UserPresenceService.startTracking(userId);
      isInitializedRef.current = true;
    }

    // Cleanup on unmount or when userId changes
    return () => {
      if (isInitializedRef.current) {
        UserPresenceService.stopTracking();
        isInitializedRef.current = false;
      }
    };
  }, [userId, enabled]);

  // Handle app state changes for immediate updates
  useEffect(() => {
    if (!enabled || !userId) return;

    const subscription = AppState.addEventListener("change", (nextAppState: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && nextAppState === "active") {
        // App came to foreground - update presence immediately
        UserPresenceService.updatePresenceImmediately(userId);
      }
      appStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [userId, enabled]);

  /**
   * Manually trigger a presence update (useful after user interactions)
   */
  const updatePresence = () => {
    if (userId && enabled) {
      UserPresenceService.updatePresenceImmediately(userId);
    }
  };

  return {
    updatePresence,
    isTracking: UserPresenceService.isActive(),
  };
};

