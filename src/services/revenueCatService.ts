import Purchases, {
  CustomerInfo,
  PurchasesOffering,
  LOG_LEVEL,
  PurchasesPackage,
} from "react-native-purchases";
import { Platform } from "react-native";
import { logSubscribe } from "./facebookAnalytics";
import { logSubscribe as firebaseLogSubscribe } from "./firebaseAnalytics";

// RevenueCat API Keys from environment variables
const REVENUECAT_API_KEY_IOS = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS || "";
const REVENUECAT_API_KEY_ANDROID = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID || "";

// Entitlement identifier (must match RevenueCat dashboard)
export const ENTITLEMENT_ID = "Golfmatch Pro";

// Offering identifier
export const OFFERING_ID = "default";

export interface RevenueCatState {
  isInitialized: boolean;
  customerInfo: CustomerInfo | null;
  currentOffering: PurchasesOffering | null;
  isProMember: boolean;
}

class RevenueCatService {
  private isConfigured = false;
  private customerInfoUpdateListeners: ((customerInfo: CustomerInfo) => void)[] = [];

  /**
   * Configure RevenueCat SDK
   * Should be called once at app startup
   */
  async configure(appUserID?: string | null): Promise<boolean> {
    if (this.isConfigured) {
      console.log("[RevenueCat] Already configured");
      return true;
    }

    try {
      // Set log level for debugging (remove in production)
      if (__DEV__) {
        Purchases.setLogLevel(LOG_LEVEL.DEBUG);
      }

      const apiKey =
        Platform.OS === "ios" ? REVENUECAT_API_KEY_IOS : REVENUECAT_API_KEY_ANDROID;

      if (!apiKey) {
        console.error("[RevenueCat] API key not found. Make sure EXPO_PUBLIC_REVENUECAT_API_KEY_IOS or EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID is set in .env");
        return false;
      }

      console.log("[RevenueCat] Configuring with API key:", apiKey.substring(0, 10) + "...");

      await Purchases.configure({
        apiKey,
        appUserID: appUserID || undefined, // Let RevenueCat generate anonymous ID if null
      });

      // Set up customer info update listener
      Purchases.addCustomerInfoUpdateListener((info) => {
        console.log("[RevenueCat] Customer info updated");
        this.notifyCustomerInfoUpdateListeners(info);
      });

      this.isConfigured = true;
      console.log("[RevenueCat] Successfully configured");
      return true;
    } catch (error: any) {
      console.error("[RevenueCat] Configuration failed:", error);
      return false;
    }
  }

  /**
   * Identify user with their app user ID (e.g., profile ID from auth)
   * Call this after user logs in
   */
  async login(appUserID: string): Promise<CustomerInfo | null> {
    try {
      console.log("[RevenueCat] Attempting login with appUserID:", appUserID);
      const { customerInfo } = await Purchases.logIn(appUserID);
      console.log("[RevenueCat] User logged in:", appUserID);
      console.log("[RevenueCat] Login result - originalAppUserId:", customerInfo.originalAppUserId);
      console.log("[RevenueCat] Login result - active entitlements:", Object.keys(customerInfo.entitlements.active));
      return customerInfo;
    } catch (error: any) {
      console.error("[RevenueCat] Login failed:", error);
      console.error("[RevenueCat] Login error details:", JSON.stringify(error, null, 2));
      return null;
    }
  }

  /**
   * Log out user (reset to anonymous)
   * Call this when user logs out
   */
  async logout(): Promise<CustomerInfo | null> {
    try {
      const customerInfo = await Purchases.logOut();
      console.log("[RevenueCat] User logged out");
      return customerInfo;
    } catch (error: any) {
      console.error("[RevenueCat] Logout failed:", error);
      return null;
    }
  }

  /**
   * Get current customer info
   */
  async getCustomerInfo(): Promise<CustomerInfo | null> {
    try {
      const customerInfo = await Purchases.getCustomerInfo();
      return customerInfo;
    } catch (error: any) {
      console.error("[RevenueCat] Failed to get customer info:", error);
      return null;
    }
  }

  /**
   * Check if user has active "Golfmatch Pro" entitlement
   */
  async checkProEntitlement(): Promise<boolean> {
    try {
      const customerInfo = await Purchases.getCustomerInfo();
      console.log("[RevenueCat] checkProEntitlement - active entitlements:", Object.keys(customerInfo.entitlements.active));

      let isActive = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;

      // Fallback: if exact entitlement ID not found, check if ANY active entitlement exists
      if (!isActive && Object.keys(customerInfo.entitlements.active).length > 0) {
        console.log("[RevenueCat] FALLBACK: Exact entitlement not found, but user has active entitlements");
        isActive = true;
      }

      console.log("[RevenueCat] Pro entitlement active:", isActive);
      return isActive;
    } catch (error: any) {
      console.error("[RevenueCat] Entitlement check failed:", error);
      return false;
    }
  }

  /**
   * Get current offerings (subscription packages)
   */
  async getOfferings(): Promise<PurchasesOffering | null> {
    try {
      console.log("[RevenueCat] 📦 Fetching offerings...");
      const offerings = await Purchases.getOfferings();

      // DEBUG: Log all available offerings
      console.log("[RevenueCat] All offerings:", Object.keys(offerings.all));

      if (offerings.current !== null) {
        console.log("[RevenueCat] ✅ Current offering:", offerings.current.identifier);

        // DEBUG: Log all packages in current offering
        console.log("[RevenueCat] Available packages:", offerings.current.availablePackages.map(pkg => ({
          identifier: pkg.identifier,
          packageType: pkg.packageType,
          productId: pkg.product.identifier,
          price: pkg.product.priceString,
        })));

        // DEBUG: Log specific package types
        console.log("[RevenueCat] Monthly package:", offerings.current.monthly ? {
          productId: offerings.current.monthly.product.identifier,
          price: offerings.current.monthly.product.priceString,
        } : "NOT FOUND");

        return offerings.current;
      }
      console.log("[RevenueCat] ⚠️ No current offering available");
      console.log("[RevenueCat] All offerings data:", JSON.stringify(offerings, null, 2));
      return null;
    } catch (error: any) {
      console.error("[RevenueCat] ❌ Failed to get offerings:", error);
      console.error("[RevenueCat] Offerings error details:", JSON.stringify(error, null, 2));
      return null;
    }
  }

  /**
   * Purchase a package
   */
  async purchasePackage(
    packageToPurchase: PurchasesPackage
  ): Promise<{ success: boolean; customerInfo?: CustomerInfo; error?: string }> {
    try {
      // DEBUG: Log package details before purchase
      console.log("[RevenueCat] 🛒 Starting purchase...");
      console.log("[RevenueCat] Package details:", {
        identifier: packageToPurchase.identifier,
        packageType: packageToPurchase.packageType,
        productIdentifier: packageToPurchase.product.identifier,
        productTitle: packageToPurchase.product.title,
        productPrice: packageToPurchase.product.priceString,
        productCurrencyCode: packageToPurchase.product.currencyCode,
      });

      const { customerInfo } = await Purchases.purchasePackage(packageToPurchase);
      console.log("[RevenueCat] ✅ Purchase successful");

      // Track subscription with Facebook + Firebase Analytics
      logSubscribe({
        currency: packageToPurchase.product.currencyCode,
        value: packageToPurchase.product.price,
        productId: packageToPurchase.product.identifier,
        subscriptionPeriod: packageToPurchase.identifier,
      });
      firebaseLogSubscribe({
        currency: packageToPurchase.product.currencyCode,
        value: packageToPurchase.product.price,
        productId: packageToPurchase.product.identifier,
        subscriptionPeriod: packageToPurchase.identifier,
      });

      return { success: true, customerInfo };
    } catch (error: any) {
      // DEBUG: Detailed error logging
      console.error("[RevenueCat] ❌ Purchase error details:");
      console.error("[RevenueCat] Error name:", error.name);
      console.error("[RevenueCat] Error message:", error.message);
      console.error("[RevenueCat] Error code:", error.code);
      console.error("[RevenueCat] Error userInfo:", JSON.stringify(error.userInfo, null, 2));
      console.error("[RevenueCat] Error underlyingErrorMessage:", error.underlyingErrorMessage);
      console.error("[RevenueCat] Full error object:", JSON.stringify(error, null, 2));

      if (error.userCancelled) {
        console.log("[RevenueCat] Purchase cancelled by user");
        return { success: false, error: "cancelled" };
      }

      // Provide more specific error messages
      let errorMessage = error.message || "Purchase failed";
      if (error.code === 1) {
        errorMessage = "App Store接続エラー。ネットワーク接続を確認してください。";
      } else if (error.code === 2) {
        errorMessage = "製品が見つかりません。App Store Connectの設定を確認してください。";
      } else if (error.code === 3) {
        errorMessage = "購入が許可されていません。";
      }

      console.error("[RevenueCat] Purchase failed:", errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Restore purchases
   */
  async restorePurchases(): Promise<{
    success: boolean;
    customerInfo?: CustomerInfo;
    error?: string;
  }> {
    try {
      const customerInfo = await Purchases.restorePurchases();
      console.log("[RevenueCat] Purchases restored");
      return { success: true, customerInfo };
    } catch (error: any) {
      console.error("[RevenueCat] Restore failed:", error);
      return { success: false, error: error.message || "Restore failed" };
    }
  }

  /**
   * Sync purchases with RevenueCat (useful after app reinstall or device transfer)
   */
  async syncPurchases(): Promise<void> {
    try {
      await Purchases.syncPurchases();
      console.log("[RevenueCat] Purchases synced");
    } catch (error: any) {
      console.error("[RevenueCat] Sync failed:", error);
    }
  }

  /**
   * Get expiration date for Pro entitlement
   */
  async getProExpirationDate(): Promise<Date | null> {
    try {
      const customerInfo = await Purchases.getCustomerInfo();
      const entitlement = customerInfo.entitlements.active[ENTITLEMENT_ID];
      if (entitlement && entitlement.expirationDate) {
        return new Date(entitlement.expirationDate);
      }
      return null;
    } catch (error: any) {
      console.error("[RevenueCat] Failed to get expiration date:", error);
      return null;
    }
  }

  /**
   * Check if subscription will renew
   */
  async willRenew(): Promise<boolean> {
    try {
      const customerInfo = await Purchases.getCustomerInfo();
      const entitlement = customerInfo.entitlements.active[ENTITLEMENT_ID];
      return entitlement ? entitlement.willRenew : false;
    } catch (error: any) {
      console.error("[RevenueCat] Failed to check renewal status:", error);
      return false;
    }
  }

  /**
   * Add listener for customer info updates
   */
  addCustomerInfoUpdateListener(listener: (customerInfo: CustomerInfo) => void): () => void {
    this.customerInfoUpdateListeners.push(listener);
    return () => {
      this.customerInfoUpdateListeners = this.customerInfoUpdateListeners.filter(
        (l) => l !== listener
      );
    };
  }

  /**
   * Notify all listeners of customer info update
   */
  private notifyCustomerInfoUpdateListeners(customerInfo: CustomerInfo): void {
    this.customerInfoUpdateListeners.forEach((listener) => {
      try {
        listener(customerInfo);
      } catch (error) {
        console.error("[RevenueCat] Listener error:", error);
      }
    });
  }

  /**
   * Get subscription management URL (for iOS subscription management)
   */
  async getManagementURL(): Promise<string | null> {
    try {
      const customerInfo = await Purchases.getCustomerInfo();
      return customerInfo.managementURL || null;
    } catch (error: any) {
      console.error("[RevenueCat] Failed to get management URL:", error);
      return null;
    }
  }

  /**
   * Check if RevenueCat is configured
   */
  isReady(): boolean {
    return this.isConfigured;
  }

  /**
   * DEBUG: Check product availability and diagnose issues
   */
  async debugProductAvailability(): Promise<void> {
    console.log("\n========== RevenueCat Debug Info ==========");

    try {
      // 1. Check configuration
      console.log("[DEBUG] 1. Configuration status:", this.isConfigured ? "✅ Configured" : "❌ Not configured");

      // 2. Get customer info
      const customerInfo = await Purchases.getCustomerInfo();
      console.log("[DEBUG] 2. Customer Info:");
      console.log("   - App User ID:", customerInfo.originalAppUserId);
      console.log("   - Active Entitlements:", Object.keys(customerInfo.entitlements.active));
      console.log("   - All Entitlements:", Object.keys(customerInfo.entitlements.all));

      // 3. Get offerings
      const offerings = await Purchases.getOfferings();
      console.log("[DEBUG] 3. Offerings:");
      console.log("   - Current offering:", offerings.current?.identifier || "NONE");
      console.log("   - All offerings:", Object.keys(offerings.all));

      if (offerings.current) {
        console.log("[DEBUG] 4. Current Offering Packages:");
        offerings.current.availablePackages.forEach((pkg, index) => {
          console.log(`   [${index}] ${pkg.identifier}:`);
          console.log(`       - Product ID: ${pkg.product.identifier}`);
          console.log(`       - Title: ${pkg.product.title}`);
          console.log(`       - Description: ${pkg.product.description}`);
          console.log(`       - Price: ${pkg.product.priceString}`);
          console.log(`       - Currency: ${pkg.product.currencyCode}`);
          console.log(`       - Introductory Price: ${pkg.product.introPrice?.priceString || "None"}`);
        });

        // Check monthly specifically
        if (offerings.current.monthly) {
          console.log("[DEBUG] 5. Monthly Package (used for purchase):");
          console.log("   - Product ID:", offerings.current.monthly.product.identifier);
          console.log("   - Price:", offerings.current.monthly.product.priceString);
          console.log("   - Product object valid:", !!offerings.current.monthly.product);
        } else {
          console.log("[DEBUG] 5. ⚠️ NO MONTHLY PACKAGE FOUND - This will cause purchase to fail!");
          console.log("   Available package types:");
          offerings.current.availablePackages.forEach(pkg => {
            console.log(`   - ${pkg.packageType}: ${pkg.product.identifier}`);
          });
        }
      } else {
        console.log("[DEBUG] ⚠️ No current offering - Products cannot be purchased!");
      }

      console.log("========== End Debug Info ==========\n");
    } catch (error: any) {
      console.error("[DEBUG] Error during diagnosis:", error);
      console.error("[DEBUG] Error details:", JSON.stringify(error, null, 2));
    }
  }
}

export const revenueCatService = new RevenueCatService();
