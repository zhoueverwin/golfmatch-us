import React, { useEffect, useRef } from "react";
import { StyleSheet, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, CommonActions } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import RevenueCatUI from "react-native-purchases-ui";
import { useQueryClient } from "@tanstack/react-query";
import { Colors } from "../../constants/colors";
import { useAuth } from "../../contexts/AuthContext";
import { useRevenueCat } from "../../contexts/RevenueCatContext";
import CacheService from "../../services/cacheService";
import { RootStackParamList } from "../../types";

type Nav = StackNavigationProp<RootStackParamList, "OnboardingPaywall">;

/**
 * Hard paywall for verified male users — last step before they can use the
 * app, also used as the app-level gate when a returning male's subscription
 * has lapsed.
 *
 * Uses RevenueCat's prebuilt <Paywall> which:
 *   - pulls offering + localized price from the Apple Store automatically
 *   - renders Restore Purchases, ToS / Privacy links, auto-renew disclosures
 *     (all Apple-required per Guideline 3.1.1)
 *   - lets you redesign the paywall in the RC dashboard without rebuilding
 *
 * The paywall design lives in the RC dashboard (Paywalls section). If no
 * design has been published, the component renders empty.
 */
const OnboardingPaywallScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { isProMember, refreshCustomerInfo } = useRevenueCat();
  const { profileId, refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const advancedRef = useRef(false);

  // Auto-advance if RC says we're already pro (e.g. user restored mid-flow,
  // or the webhook updated state while the screen was pushed).
  useEffect(() => {
    if (isProMember && !advancedRef.current) {
      advanceToMain();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProMember]);

  // Clear every cache layer holding the user's profile so Main / MyPage see
  // the freshly-verified + freshly-premium state on first render. Two cache
  // shapes exist (User and UserProfile) — clear both.
  const refreshAllCaches = async () => {
    if (profileId) {
      await Promise.all([
        CacheService.remove(`user_${profileId}`),
        CacheService.remove(`user_profile_${profileId}`),
      ]);
    }
    await refreshProfile();
    queryClient.invalidateQueries({ queryKey: ["profile"] });
    queryClient.invalidateQueries({ queryKey: ["currentUserProfile"] });
  };

  const advanceToMain = async () => {
    if (advancedRef.current) return;
    advancedRef.current = true;
    await refreshAllCaches();
    navigation.dispatch(
      CommonActions.reset({ index: 0, routes: [{ name: "Main" }] }),
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <RevenueCatUI.Paywall
        options={{ displayCloseButton: false }}
        onPurchaseCompleted={async () => {
          await refreshCustomerInfo();
          advanceToMain();
        }}
        onRestoreCompleted={async ({ customerInfo }) => {
          await refreshCustomerInfo();
          const hasActive =
            Object.keys(customerInfo.entitlements.active).length > 0;
          if (hasActive) {
            advanceToMain();
          } else {
            Alert.alert(
              "No active subscription",
              "We couldn't find an active subscription on this Apple ID.",
            );
          }
        }}
        onPurchaseError={({ error }) => {
          if (!error.userCancelled) {
            Alert.alert(
              "Purchase failed",
              error.message || "Please try again.",
            );
          }
        }}
        onPurchaseCancelled={() => {
          // User dismissed Apple's purchase sheet — stay on paywall.
        }}
        onRestoreError={({ error }) => {
          Alert.alert(
            "Couldn't restore",
            error.message ||
              "No active subscription was found on this Apple ID.",
          );
        }}
        onDismiss={() => {
          // displayCloseButton is false so this rarely fires, but if it does
          // after a successful purchase, advance.
          if (isProMember) advanceToMain();
        }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
});

export default OnboardingPaywallScreen;
