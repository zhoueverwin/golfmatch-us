import { AppState, AppStateStatus } from "react-native";
import { supabase } from "./supabase";

/**
 * Service for tracking user online presence and activity
 * Updates last_active_at timestamp in database based on app state and user activity
 */
export class UserPresenceService {
  private static updateInterval: NodeJS.Timeout | null = null;
  private static appStateListener: any = null;
  private static backgroundTimeout: NodeJS.Timeout | null = null;
  private static lastUpdateTime: number = 0;
  private static isTracking: boolean = false;
  private static currentUserId: string | null = null;

  // Configuration constants
  private static readonly UPDATE_INTERVAL_MS = 30000; // Update every 30 seconds when active
  private static readonly THROTTLE_MS = 30000; // Minimum time between database writes
  private static readonly BACKGROUND_TIMEOUT_MS = 120000; // 2 minutes before marking offline

  /**
   * Start tracking user presence
   * Updates last_active_at periodically when app is active
   */
  static startTracking(userId: string): void {
    if (this.isTracking && this.currentUserId === userId) {
      return;
    }

    this.currentUserId = userId;
    this.isTracking = true;

    // Immediately update presence on start
    this.updateUserPresence(userId);

    // Set up periodic updates when app is active
    this.updateInterval = setInterval(() => {
      if (this.isTracking && AppState.currentState === "active") {
        this.updateUserPresence(userId);
      }
    }, this.UPDATE_INTERVAL_MS);

    // Listen to app state changes
    this.appStateListener = AppState.addEventListener("change", (nextAppState: AppStateStatus) => {
      this.handleAppStateChange(nextAppState, userId);
    });
  }

  /**
   * Stop tracking user presence
   * Cleans up intervals and listeners
   * Note: We do NOT set last_active_at to null - we leave it at the last value
   * so users can see when someone was last active
   */
  static async stopTracking(): Promise<void> {
    // Don't clear last_active_at - leave it at the last active timestamp
    // This preserves the "last access time" for display purposes

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    if (this.appStateListener) {
      this.appStateListener.remove();
      this.appStateListener = null;
    }

    if (this.backgroundTimeout) {
      clearTimeout(this.backgroundTimeout);
      this.backgroundTimeout = null;
    }

    this.isTracking = false;
    this.currentUserId = null;
    this.lastUpdateTime = 0;
  }

  /**
   * Handle app state changes (active/background/inactive)
   */
  private static handleAppStateChange(nextAppState: AppStateStatus, userId: string): void {
    if (nextAppState === "active") {
      // Clear background timeout if app comes back to foreground
      if (this.backgroundTimeout) {
        clearTimeout(this.backgroundTimeout);
        this.backgroundTimeout = null;
      }

      // Immediately update presence when app becomes active
      this.updateUserPresence(userId);
    } else if (nextAppState === "background" || nextAppState === "inactive") {
      // Set timeout to mark user offline after being in background for 2 minutes
      if (this.backgroundTimeout) {
        clearTimeout(this.backgroundTimeout);
      }

      this.backgroundTimeout = setTimeout(() => {
        // Note: We don't explicitly set offline - the 5-minute threshold in SQL will handle it
        // But we stop updating, so last_active_at won't refresh
      }, this.BACKGROUND_TIMEOUT_MS);
    }
  }

  /**
   * Update user's last_active_at timestamp in database
   * Throttled to prevent excessive database writes
   * Note: Timestamps are stored as UTC in database, but we calculate based on Tokyo timezone
   */
  static async updateUserPresence(userId: string): Promise<void> {
    const now = Date.now();

    // Throttle: only update if enough time has passed since last update
    if (this.lastUpdateTime > 0 && now - this.lastUpdateTime < this.THROTTLE_MS) {
      return;
    }

    try {
      // Store current UTC time (database handles timezone conversion)
      const { error } = await supabase
        .from("profiles")
        .update({ last_active_at: new Date().toISOString() })
        .eq("id", userId);

      if (error) {
        console.error("[UserPresenceService] Error updating presence:", error);
        return;
      }

      this.lastUpdateTime = now;
    } catch (error) {
      console.error("[UserPresenceService] Exception updating presence:", error);
    }
  }

  /**
   * Manually update presence (useful for user interactions)
   * This bypasses throttling to ensure immediate update
   */
  static async updatePresenceImmediately(userId: string): Promise<void> {
    try {
      // Store current UTC time (database handles timezone conversion)
      const { error } = await supabase
        .from("profiles")
        .update({ last_active_at: new Date().toISOString() })
        .eq("id", userId);

      if (error) {
        console.error("[UserPresenceService] Error updating presence immediately:", error);
        return;
      }

      this.lastUpdateTime = Date.now();
    } catch (error) {
      console.error("[UserPresenceService] Exception updating presence immediately:", error);
    }
  }

  /**
   * Check if currently tracking presence
   */
  static isActive(): boolean {
    return this.isTracking;
  }
}

