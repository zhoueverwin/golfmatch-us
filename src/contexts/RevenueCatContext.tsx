import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { CustomerInfo, PurchasesOffering } from "react-native-purchases";
import { revenueCatService, ENTITLEMENT_ID } from "../services/revenueCatService";
import { useAuth } from "./AuthContext";
import { supabase } from "../services/supabase";
import { useQueryClient } from "@tanstack/react-query";
import { Platform } from "react-native";

interface RevenueCatContextType {
  isInitialized: boolean;
  isProMember: boolean;
  customerInfo: CustomerInfo | null;
  currentOffering: PurchasesOffering | null;
  expirationDate: Date | null;
  willRenew: boolean;
  refreshCustomerInfo: () => Promise<void>;
  checkEntitlement: () => Promise<boolean>;
}

const RevenueCatContext = createContext<RevenueCatContextType | undefined>(undefined);

export const useRevenueCat = () => {
  const context = useContext(RevenueCatContext);
  if (context === undefined) {
    throw new Error("useRevenueCat must be used within a RevenueCatProvider");
  }
  return context;
};

interface RevenueCatProviderProps {
  children: React.ReactNode;
}

export const RevenueCatProvider: React.FC<RevenueCatProviderProps> = ({ children }) => {
  const { profileId, user } = useAuth();
  const queryClient = useQueryClient();
  const [isInitialized, setIsInitialized] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [currentOffering, setCurrentOffering] = useState<PurchasesOffering | null>(null);
  const [isProMember, setIsProMember] = useState(false);
  const [expirationDate, setExpirationDate] = useState<Date | null>(null);
  const [willRenew, setWillRenew] = useState(false);

  // Track previous user to detect logout (not initial load)
  const previousUserRef = useRef<typeof user>(undefined);
  // Track if we've already logged in for the current profile to prevent repeated calls
  const loggedInProfileRef = useRef<string | null>(null);

  // Sync premium status to database and create/update membership record
  // KEY PRINCIPLE: Database is source of truth for manual/permanent grants
  // RevenueCat can only UPGRADE status, never DOWNGRADE manual/permanent grants
  const syncPremiumStatusToDatabase = useCallback(async (isPro: boolean, entitlementInfo?: any) => {
    if (!profileId) return;

    try {
      // STEP 1: Fetch current premium_source from database FIRST
      // This determines if we're allowed to modify premium status
      const { data: currentProfile, error: fetchError } = await supabase
        .from("profiles")
        .select("is_premium, premium_source")
        .eq("id", profileId)
        .single();

      if (fetchError) {
        console.error("[RevenueCatContext] Error fetching current profile:", fetchError);
        return;
      }

      const currentSource = currentProfile?.premium_source;
      const isProtectedSource = currentSource === 'manual' || currentSource === 'permanent';

      console.log("[RevenueCatContext] Current premium_source:", currentSource, "isProtected:", isProtectedSource);

      // STEP 2: Handle based on RevenueCat entitlement status
      if (isPro) {
        // RevenueCat says user has active subscription
        // Only update if not already protected by manual/permanent grant
        if (!isProtectedSource) {
          const { error } = await supabase
            .from("profiles")
            .update({
              is_premium: true,
              premium_source: 'revenuecat',
              premium_granted_at: new Date().toISOString()
            })
            .eq("id", profileId);

          if (error) {
            console.error("[RevenueCatContext] Error syncing premium status:", error);
          } else {
            console.log("[RevenueCatContext] Set premium via RevenueCat");
          }
        } else {
          console.log("[RevenueCatContext] User has protected premium source, not overwriting with revenuecat");
        }

        // Create membership record if needed (for tracking purposes)
        const { data: existingMembership } = await supabase
          .from("memberships")
          .select("id")
          .eq("user_id", profileId)
          .eq("is_active", true)
          .maybeSingle();

        if (!existingMembership) {
          const planType = entitlementInfo?.expirationDate ? "basic" : "permanent";
          const expirationDate = entitlementInfo?.expirationDate || null;

          const { error: membershipError } = await supabase
            .from("memberships")
            .insert({
              user_id: profileId,
              plan_type: planType,
              price: 0,
              purchase_date: new Date().toISOString(),
              expiration_date: expirationDate,
              is_active: true,
              store_transaction_id: entitlementInfo?.productIdentifier || null,
              platform: Platform.OS as "ios" | "android",
            });

          if (membershipError) {
            console.error("[RevenueCatContext] Error creating membership:", membershipError);
          } else {
            console.log("[RevenueCatContext] Created membership record");
          }
        }
      } else {
        // RevenueCat says NO active subscription
        console.log("[RevenueCatContext] No RevenueCat entitlement");

        // CRITICAL: Check if premium is protected - if so, ENSURE it stays true
        if (isProtectedSource) {
          console.log("[RevenueCatContext] Premium source is protected (" + currentSource + "), ensuring is_premium stays true");

          // Ensure is_premium is true (in case it was somehow set to false)
          if (!currentProfile?.is_premium) {
            const { error } = await supabase
              .from("profiles")
              .update({ is_premium: true })
              .eq("id", profileId);

            if (error) {
              console.error("[RevenueCatContext] Error restoring protected premium:", error);
            } else {
              console.log("[RevenueCatContext] Restored protected premium status");
            }
          }
          return; // Don't proceed with downgrade
        }

        // Also check for permanent membership in memberships table (legacy support)
        const { data: permanentMembership } = await supabase
          .from("memberships")
          .select("id")
          .eq("user_id", profileId)
          .eq("plan_type", "permanent")
          .eq("is_active", true)
          .maybeSingle();

        if (permanentMembership) {
          console.log("[RevenueCatContext] Found permanent membership, upgrading premium_source");

          // Upgrade to protected status
          const { error } = await supabase
            .from("profiles")
            .update({
              is_premium: true,
              premium_source: 'permanent',
              premium_granted_at: new Date().toISOString()
            })
            .eq("id", profileId);

          if (error) {
            console.error("[RevenueCatContext] Error setting permanent premium:", error);
          } else {
            console.log("[RevenueCatContext] Set premium_source to permanent");
          }
          return; // Don't downgrade
        }

        // No protection - safe to downgrade
        console.log("[RevenueCatContext] No protection found, downgrading premium");

        const { error: profileError } = await supabase
          .from("profiles")
          .update({
            is_premium: false,
            premium_source: null,
            premium_granted_at: null
          })
          .eq("id", profileId);

        if (profileError) {
          console.error("[RevenueCatContext] Error removing premium:", profileError);
        } else {
          console.log("[RevenueCatContext] Removed premium status");
        }

        // Deactivate non-permanent memberships
        const { error: membershipError } = await supabase
          .from("memberships")
          .update({ is_active: false })
          .eq("user_id", profileId)
          .eq("is_active", true)
          .neq("plan_type", "permanent");

        if (membershipError) {
          console.error("[RevenueCatContext] Error deactivating membership:", membershipError);
        }
      }

      // Invalidate React Query cache
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['currentUserProfile'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      console.log("[RevenueCatContext] Invalidated cache");
    } catch (error) {
      console.error("[RevenueCatContext] Exception syncing premium status:", error);
    }
  }, [profileId, queryClient]);

  // Update local state from CustomerInfo - MUST be defined before useEffects that use it
  // Also checks database for protected premium status (manual/permanent grants)
  const updateCustomerState = useCallback(async (info: CustomerInfo) => {
    console.log("[RevenueCatContext] updateCustomerState called");
    console.log("[RevenueCatContext] All active entitlements:", JSON.stringify(info.entitlements.active, null, 2));
    console.log("[RevenueCatContext] Looking for entitlement ID:", ENTITLEMENT_ID);

    setCustomerInfo(info);
    let entitlement = info.entitlements.active[ENTITLEMENT_ID];
    let isPro = entitlement !== undefined;

    // Fallback: if exact entitlement ID not found, check if ANY active entitlement exists
    if (!isPro && Object.keys(info.entitlements.active).length > 0) {
      const firstEntitlementKey = Object.keys(info.entitlements.active)[0];
      console.log("[RevenueCatContext] FALLBACK: Using first active entitlement:", firstEntitlementKey);
      entitlement = info.entitlements.active[firstEntitlementKey];
      isPro = true;
    }

    // CRITICAL: Check database for protected premium status BEFORE setting local state
    // This ensures UI reflects backend-granted premium even if RevenueCat says no
    if (!isPro && profileId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_premium, premium_source")
        .eq("id", profileId)
        .single();

      if (profile?.premium_source === 'manual' || profile?.premium_source === 'permanent') {
        console.log("[RevenueCatContext] Database has protected premium (" + profile.premium_source + "), setting isPro=true");
        isPro = true;
      }
    }

    console.log("[RevenueCatContext] Final isPro:", isPro);
    setIsProMember(isPro);

    // Sync to database (this will respect protected sources)
    syncPremiumStatusToDatabase(isPro, entitlement);

    if (entitlement) {
      setExpirationDate(entitlement.expirationDate ? new Date(entitlement.expirationDate) : null);
      setWillRenew(entitlement.willRenew);
    } else {
      setExpirationDate(null);
      setWillRenew(false);
    }
  }, [profileId, syncPremiumStatusToDatabase]);

  // Initialize RevenueCat on mount
  useEffect(() => {
    const initializeRevenueCat = async () => {
      console.log("[RevenueCatContext] Initializing...");
      const success = await revenueCatService.configure();
      if (success) {
        setIsInitialized(true);
        // Fetch initial offerings
        const offering = await revenueCatService.getOfferings();
        setCurrentOffering(offering);
        console.log("[RevenueCatContext] Initialized successfully");
      } else {
        console.error("[RevenueCatContext] Failed to initialize");
        // Still set initialized to true to prevent infinite loading
        setIsInitialized(true);
      }
    };

    initializeRevenueCat();
  }, []);

  // Handle user login/logout with RevenueCat
  useEffect(() => {
    const handleAuthChange = async () => {
      if (!isInitialized) return;

      const isAuthenticated = user !== null;
      const wasAuthenticated = previousUserRef.current !== null && previousUserRef.current !== undefined;

      if (isAuthenticated && profileId) {
        // Only login if we haven't already logged in for this profile
        if (loggedInProfileRef.current !== profileId) {
          console.log("[RevenueCatContext] User authenticated, logging in to RevenueCat:", profileId);
          const info = await revenueCatService.login(profileId);
          loggedInProfileRef.current = profileId;
          if (info) {
            updateCustomerState(info);
          }
        }
      } else if (!isAuthenticated && wasAuthenticated) {
        // User logged out (was previously logged in) - reset RevenueCat
        console.log("[RevenueCatContext] User logged out, resetting RevenueCat");
        await revenueCatService.logout();
        loggedInProfileRef.current = null;
        setCustomerInfo(null);
        setIsProMember(false);
        setExpirationDate(null);
        setWillRenew(false);
      }

      // Update previous user ref
      previousUserRef.current = user;
    };

    handleAuthChange();
  }, [user, profileId, isInitialized, updateCustomerState]);

  // Set up customer info update listener
  useEffect(() => {
    if (!isInitialized) return;

    const removeListener = revenueCatService.addCustomerInfoUpdateListener((info) => {
      console.log("[RevenueCatContext] Customer info updated via listener");
      updateCustomerState(info);
    });

    return () => {
      removeListener();
    };
  }, [isInitialized, updateCustomerState]);

  // Refresh customer info manually
  const refreshCustomerInfo = useCallback(async () => {
    const info = await revenueCatService.getCustomerInfo();
    if (info) {
      updateCustomerState(info);
    }
  }, [updateCustomerState]);

  // Check entitlement (useful for one-off checks)
  const checkEntitlement = useCallback(async (): Promise<boolean> => {
    return await revenueCatService.checkProEntitlement();
  }, []);

  const value: RevenueCatContextType = {
    isInitialized,
    isProMember,
    customerInfo,
    currentOffering,
    expirationDate,
    willRenew,
    refreshCustomerInfo,
    checkEntitlement,
  };

  return <RevenueCatContext.Provider value={value}>{children}</RevenueCatContext.Provider>;
};
