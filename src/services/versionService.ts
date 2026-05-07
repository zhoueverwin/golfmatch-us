import { Platform, Linking } from "react-native";
import Constants from "expo-constants";
import { supabase } from "./supabase";

interface PlatformVersionConfig {
  latest_version: string;
  minimum_version?: string; // Versions below this MUST update (force update)
  store_url: string;
}

interface UpdateMessage {
  title: string;
  body: string;
  button_text: string;
  dismiss_text?: string; // Optional for force updates
}

interface VersionConfig {
  ios: PlatformVersionConfig;
  android: PlatformVersionConfig;
  update_message: UpdateMessage;
  force_update_message?: UpdateMessage; // Different message for forced updates
}

export interface VersionCheckResult {
  needsUpdate: boolean;
  isForced: boolean; // True if version is below minimum_version
  currentVersion: string;
  latestVersion: string;
  storeUrl: string;
  message: UpdateMessage;
}

class VersionService {
  private cachedConfig: VersionConfig | null = null;
  private lastFetchTime: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Get the current app version from expo config
   */
  getCurrentVersion(): string {
    return Constants.expoConfig?.version || "1.0.0";
  }

  /**
   * Compare two semantic version strings
   * Returns: -1 if a < b, 0 if a === b, 1 if a > b
   */
  compareVersions(a: string, b: string): number {
    const partsA = a.split(".").map(Number);
    const partsB = b.split(".").map(Number);

    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const numA = partsA[i] || 0;
      const numB = partsB[i] || 0;

      if (numA < numB) return -1;
      if (numA > numB) return 1;
    }

    return 0;
  }

  /**
   * Fetch version config from Supabase
   */
  async fetchVersionConfig(): Promise<VersionConfig | null> {
    // Return cached config if still valid
    const now = Date.now();
    if (this.cachedConfig && now - this.lastFetchTime < this.CACHE_TTL) {
      return this.cachedConfig;
    }

    try {
      const { data, error } = await supabase
        .from("app_config")
        .select("value")
        .eq("key", "app_version")
        .single();

      if (error) {
        console.error("[VersionService] Error fetching version config:", error);
        return null;
      }

      this.cachedConfig = data.value as VersionConfig;
      this.lastFetchTime = now;

      return this.cachedConfig;
    } catch (error) {
      console.error("[VersionService] Exception fetching version config:", error);
      return null;
    }
  }

  /**
   * Check if an update is available
   */
  async checkForUpdate(): Promise<VersionCheckResult | null> {
    const config = await this.fetchVersionConfig();
    if (!config) return null;

    const platform = Platform.OS as "ios" | "android";
    const platformConfig = config[platform];

    if (!platformConfig) {
      console.warn(`[VersionService] No config for platform: ${platform}`);
      return null;
    }

    const currentVersion = this.getCurrentVersion();
    const latestVersion = platformConfig.latest_version;
    const minimumVersion = platformConfig.minimum_version;

    const needsUpdate = this.compareVersions(currentVersion, latestVersion) < 0;
    const isForced = minimumVersion !== undefined &&
      this.compareVersions(currentVersion, minimumVersion) < 0;
    const message = (isForced && config.force_update_message) || config.update_message;

    return {
      needsUpdate: needsUpdate || isForced, // isForced implies needsUpdate
      isForced,
      currentVersion,
      latestVersion,
      storeUrl: platformConfig.store_url,
      message,
    };
  }

  /**
   * Open the appropriate app store
   */
  async openStore(storeUrl: string): Promise<void> {
    const canOpen = await Linking.canOpenURL(storeUrl).catch(() => false);
    if (canOpen) {
      await Linking.openURL(storeUrl).catch((error) => {
        console.error("[VersionService] Error opening store:", error);
      });
    }
  }

  /**
   * Clear cached config (useful for testing)
   */
  clearCache(): void {
    this.cachedConfig = null;
    this.lastFetchTime = 0;
  }
}

export default new VersionService();
