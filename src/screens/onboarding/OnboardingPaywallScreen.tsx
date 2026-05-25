import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, CommonActions } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Defs, Pattern, Circle, Rect, RadialGradient, Stop } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import type { PurchasesPackage } from "react-native-purchases";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "../../contexts/AuthContext";
import { useRevenueCat } from "../../contexts/RevenueCatContext";
import { revenueCatService } from "../../services/revenueCatService";
import CacheService from "../../services/cacheService";
import {
  logOnboardingPaywallShown,
  logOnboardingPaywallCompleted,
  logOnboardingHomeReached,
} from "../../services/firebaseAnalytics";
import { RootStackParamList } from "../../types";

type Nav = StackNavigationProp<RootStackParamList, "OnboardingPaywall">;

// Brand palette from the HTML design
const C = {
  ink: "#14342B",
  inkSoft: "#3F5A50",
  teal: "#0E7C73",
  tealMint: "#D4EDE9",
  gold: "#F4D35E",
  goldDeep: "#E0B743",
  cream: "#FAF6EE",
  cream2: "#F2EBD9",
  paper: "#FFFFFF",
  line: "#E8E0CB",
  muted: "#88806A",
};

const F = {
  display: "Fraunces_600SemiBold",
  displayReg: "Fraunces_400Regular",
  displayItalic: "Fraunces_400Regular_Italic",
  sans: "Manrope_400Regular",
  sansMed: "Manrope_500Medium",
  sansSemi: "Manrope_600SemiBold",
  sansBold: "Manrope_700Bold",
};

const monthsByPackageType: Record<string, number> = {
  MONTHLY: 1,
  TWO_MONTH: 2,
  THREE_MONTH: 3,
  SIX_MONTH: 6,
  ANNUAL: 12,
};

interface TierViewData {
  pkg: PurchasesPackage;
  months: number;
  pricePerMonth: string; // e.g. "$0.83"
  strikePrice?: string; // monthly compare-at, e.g. "$9.99"
  savePct?: number; // 91 → "SAVE 91%"
}

/**
 * Hard paywall for verified male users — last step before they can use the
 * app, also used as the app-level gate when a returning male's subscription
 * has lapsed.
 *
 * Custom React Native rendering of the Golfmatch Premium paywall design.
 * Pricing is read live from RevenueCat's current offering so adding/removing
 * a tier in the RC dashboard updates the screen automatically.
 */
const OnboardingPaywallScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { isProMember, refreshCustomerInfo, currentOffering, isInitialized } =
    useRevenueCat();
  const { profileId, refreshProfile, signOut, userProfile } = useAuth();
  const queryClient = useQueryClient();
  const advancedRef = useRef(false);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Fire-and-forget impression log for the paywall funnel. Mounted-once
  // pattern: ref guard prevents double-firing if RC re-renders the
  // component before the user acts.
  const shownLoggedRef = useRef(false);
  useEffect(() => {
    if (shownLoggedRef.current) return;
    shownLoggedRef.current = true;
    void logOnboardingPaywallShown();
  }, []);

  // Diamond bob animation — mirrors the CSS @keyframes gmBob loop
  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          toValue: 1,
          duration: 3000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(bob, {
          toValue: 0,
          duration: 3000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob]);

  // Build tier view data from the live RC offering. We map by packageType so
  // the screen is resilient to identifier renames in the RC dashboard.
  const tiers = useMemo<{
    annual?: TierViewData;
    sixMonth?: TierViewData;
    monthly?: TierViewData;
  }>(() => {
    const packages = currentOffering?.availablePackages ?? [];
    const byType: Record<string, PurchasesPackage> = {};
    for (const pkg of packages) byType[pkg.packageType] = pkg;

    const monthly = byType.MONTHLY;
    const sixMonth = byType.SIX_MONTH;
    const annual = byType.ANNUAL;

    const fmt = (amount: number, currency: string) =>
      new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(amount);

    const monthlyRate = monthly
      ? monthly.product.price / monthsByPackageType.MONTHLY
      : null;

    const build = (pkg?: PurchasesPackage): TierViewData | undefined => {
      if (!pkg) return undefined;
      const months = monthsByPackageType[pkg.packageType] ?? 1;
      const rate = pkg.product.price / months;
      const currency = pkg.product.currencyCode || "USD";
      const pricePerMonth = fmt(rate, currency);
      const strikePrice =
        monthly && pkg.packageType !== "MONTHLY"
          ? monthly.product.priceString
          : undefined;
      const savePct =
        monthlyRate && pkg.packageType === "ANNUAL"
          ? Math.round((1 - rate / monthlyRate) * 100)
          : undefined;
      return { pkg, months, pricePerMonth, strikePrice, savePct };
    };

    return {
      annual: build(annual),
      sixMonth: build(sixMonth),
      monthly: build(monthly),
    };
  }, [currentOffering]);

  // Default selection: 6-month "Most Chosen" if available, else annual, else monthly.
  const defaultSelectionKey: "annual" | "sixMonth" | "monthly" = tiers.sixMonth
    ? "sixMonth"
    : tiers.annual
      ? "annual"
      : "monthly";
  const [selected, setSelected] = useState<"annual" | "sixMonth" | "monthly">(
    defaultSelectionKey,
  );

  // If offering loads after first render and the previously-selected tier
  // doesn't exist in the new offering, fall back to a valid default.
  useEffect(() => {
    const t = tiers[selected];
    if (!t) setSelected(defaultSelectionKey);
  }, [tiers, selected, defaultSelectionKey]);

  // Auto-advance if RC says we're already pro (e.g. user restored mid-flow,
  // or the webhook updated state while the screen was pushed).
  useEffect(() => {
    if (isProMember && !advancedRef.current) advanceToMain();
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

  const advanceToMain = () => {
    if (advancedRef.current) return;
    advancedRef.current = true;
    // v1.1 paywall-before-liveness: if the user hasn't completed liveness
    // yet, reset to OnboardingKyc (the liveness screen) instead of Main.
    // AppNavigator's needsKycGate would also catch this on next render,
    // but resetting synchronously avoids a one-frame flash of Main while
    // the gate re-evaluates. If the user is already verified (returning
    // member with lapsed sub), reset straight to Main.
    const needsLiveness = !userProfile?.is_verified;
    const nextRoute = needsLiveness ? "OnboardingKyc" : "Main";
    void logOnboardingPaywallCompleted();
    if (!needsLiveness) {
      // Only fire home_reached here if liveness was already done; the
      // liveness screen fires it otherwise to ensure exactly-once.
      void logOnboardingHomeReached();
    }
    navigation.dispatch(
      CommonActions.reset({ index: 0, routes: [{ name: nextRoute }] }),
    );
    void refreshAllCaches();
  };

  const handlePurchase = async () => {
    const tier = tiers[selected];
    if (!tier) {
      Alert.alert("Unavailable", "This plan isn't available right now.");
      return;
    }
    try {
      setPurchasing(true);
      const result = await revenueCatService.purchasePackage(tier.pkg);
      if (result.success) {
        await refreshCustomerInfo();
        advanceToMain();
      } else if (result.error && result.error !== "cancelled") {
        Alert.alert("Purchase failed", result.error);
      }
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    try {
      setRestoring(true);
      const result = await revenueCatService.restorePurchases();
      const accountLabel =
        Platform.OS === "ios" ? "Apple ID" : "Google account";
      if (!result.success) {
        Alert.alert(
          "Couldn't restore",
          result.error ||
            `No active subscription was found on this ${accountLabel}.`,
        );
        return;
      }
      await refreshCustomerInfo();
      const hasActive = await revenueCatService.checkProEntitlement();
      if (hasActive) {
        advanceToMain();
      } else {
        Alert.alert(
          "No active subscription",
          `We couldn't find an active subscription on this ${accountLabel}.`,
        );
      }
    } finally {
      setRestoring(false);
    }
  };

  const openUrl = (url: string) => Linking.openURL(url).catch(() => {});

  // Escape hatch: lets users switch accounts or back out of a stuck paywall.
  // After signOut, AuthContext clears `user`, AppNavigator swaps to the Auth
  // stack, and the user can re-sign-in (same or different account).
  const handleSignOut = () => {
    Alert.alert(
      "Sign out?",
      "You'll be returned to the sign-in screen. You can sign back in with a different account.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: async () => {
            const result = await signOut();
            if (!result.success && result.error) {
              Alert.alert("Couldn't sign out", result.error);
            }
          },
        },
      ],
    );
  };

  // Bob translation: -8px at the midpoint, matching the CSS keyframe
  const bobTranslate = bob.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -8],
  });

  // While RC is still loading, show a cream-toned spinner so we don't flash
  // an empty paywall (the offering arrives async after configure()).
  if (!isInitialized || !currentOffering) {
    return (
      <SafeAreaView style={styles.loading} edges={["top", "bottom"]}>
        <ActivityIndicator size="large" color={C.teal} />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={C.cream} />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          {/* HERO */}
          <View style={styles.hero}>
            {/* Soft gold halo behind the diamond */}
            <Svg
              style={styles.halo}
              width={560}
              height={560}
              pointerEvents="none"
            >
              <Defs>
                <RadialGradient
                  id="halo"
                  cx="50%"
                  cy="50%"
                  rx="50%"
                  ry="50%"
                  fx="50%"
                  fy="50%"
                >
                  <Stop offset="0%" stopColor={C.gold} stopOpacity={0.55} />
                  <Stop offset="62%" stopColor={C.gold} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Rect width="100%" height="100%" fill="url(#halo)" />
            </Svg>

            {/* Dimple pattern overlay (golf-ball texture) */}
            <Svg style={styles.dimples} pointerEvents="none">
              <Defs>
                <Pattern
                  id="dimples"
                  x="0"
                  y="0"
                  width="22"
                  height="22"
                  patternUnits="userSpaceOnUse"
                >
                  <Circle cx="11" cy="11" r="1.1" fill="rgba(14,124,115,0.18)" />
                </Pattern>
              </Defs>
              <Rect width="100%" height="100%" fill="url(#dimples)" />
            </Svg>

            {/* Top nav — hard paywall: no close button (must purchase to enter app) */}
            <View style={styles.topnav}>
              <View style={styles.topnavSpacer} />
              <Text style={styles.topnavTitle}>GOLFMATCH PREMIUM</Text>
              <View style={styles.topnavSpacer} />
            </View>

            <Text style={styles.kicker}>The gold tee</Text>

            <Text style={styles.headline}>
              Skip the{"\n"}
              <Text style={[styles.headlineItalic, { color: C.goldDeep }]}>
                small talk.
              </Text>
              {"\n"}
              Tee off{" "}
              <Text style={[styles.headlineItalic, { color: C.teal }]}>
                together.
              </Text>
            </Text>

            <View style={styles.diamondWrap}>
              <Animated.View style={{ transform: [{ translateY: bobTranslate }] }}>
                <Image
                  source={require("../../../assets/images/paymentpageassets/diamond.png")}
                  style={styles.diamond}
                  resizeMode="contain"
                />
              </Animated.View>
            </View>

            <Text style={styles.sub}>
              Real chemistry takes{" "}
              <Text style={styles.subItalic}>four hours on a course</Text>, not
              four swipes apart. Unlock Premium and meet the singles who'd
              rather walk the back nine with you.
            </Text>
          </View>

          {/* BODY */}
          <View style={styles.body}>
            <View style={styles.card}>
              {tiers.annual && (
                <TierRow
                  selected={selected === "annual"}
                  onPress={() => setSelected("annual")}
                  name="12 months"
                  billed="Billed yearly"
                  tier={tiers.annual}
                />
              )}
              {tiers.sixMonth && (
                <TierRow
                  selected={selected === "sixMonth"}
                  onPress={() => setSelected("sixMonth")}
                  name="6 months"
                  billed="Billed every 6 months"
                  tier={tiers.sixMonth}
                  hero
                  badge="MOST CHOSEN"
                />
              )}
              {tiers.monthly && (
                <TierRow
                  selected={selected === "monthly"}
                  onPress={() => setSelected("monthly")}
                  name="Monthly"
                  billed="Start month-to-month"
                  tier={tiers.monthly}
                  hideStrike
                />
              )}

              <View style={styles.divider} />

              <View style={styles.benefits}>
                <Benefit
                  n="01"
                  title="Find single golfers near your home course."
                  body="Filter by area, age, and golf skill to see who plays nearby."
                />
                <BenefitDivider />
                <Benefit
                  n="02"
                  title="Message your matches."
                  body="Send a message, plan a tee time, meet at the course."
                />
                <BenefitDivider />
                <Benefit
                  n="03"
                  title="A curated shortlist each morning."
                  body="Compatible golfers, chosen for you. Not random scrolling."
                />
              </View>

              <View style={styles.taglineRule} />
              <Text style={styles.tagline}>
                "It's a long walk between two strangers —{"\n"}
                make it count."
              </Text>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.cta,
                pressed && { transform: [{ translateY: -1 }] },
                purchasing && { opacity: 0.7 },
              ]}
              onPress={handlePurchase}
              disabled={purchasing}
            >
              {purchasing ? (
                <ActivityIndicator size="small" color={C.gold} />
              ) : (
                <Text style={styles.ctaText}>Unlock Premium  →</Text>
              )}
            </Pressable>

            <Pressable
              style={styles.restoreRow}
              onPress={handleRestore}
              disabled={restoring}
            >
              <Text style={styles.restoreText}>
                {restoring ? "Restoring…" : "Restore purchase"}
              </Text>
            </Pressable>

            <Pressable
              style={styles.learnMoreRow}
              onPress={() => openUrl("https://dating.golfmatch.info/")}
            >
              <Text style={styles.learnMoreText}>
                Learn more about Golfmatch  ↗
              </Text>
            </Pressable>

            <Text style={styles.disclosure}>
              Subscriptions auto-renew at the listed price unless canceled at
              least 24 hours before the end of the period. Cancel anytime in
              Settings.{" "}
              {Platform.OS === "ios"
                ? "Charged to your Apple ID on confirmation of purchase."
                : "Charged to your Google Play account on confirmation of purchase."}
            </Text>

            <View style={styles.links}>
              <Pressable
                onPress={() =>
                  openUrl("https://dating.golfmatch.info/privacy.html")
                }
              >
                <Text style={styles.linkText}>Privacy</Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  openUrl("https://dating.golfmatch.info/terms.html")
                }
              >
                <Text style={styles.linkText}>Terms</Text>
              </Pressable>
              <Pressable onPress={handleSignOut}>
                <Text style={styles.linkText}>Sign out</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

// ─── TierRow ──────────────────────────────────────────────────────────
interface TierRowProps {
  tier: TierViewData;
  name: string;
  billed: string;
  selected: boolean;
  onPress: () => void;
  hero?: boolean;
  badge?: string;
  hideStrike?: boolean;
}

const TierRow: React.FC<TierRowProps> = ({
  tier,
  name,
  billed,
  selected,
  onPress,
  hero,
  badge,
  hideStrike,
}) => {
  const isHero = !!hero;
  const borderColor = isHero
    ? selected
      ? C.gold
      : C.ink
    : selected
      ? C.goldDeep
      : C.cream2;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[
        styles.tier,
        { borderColor },
        isHero && styles.tierHero,
      ]}
    >
      {badge && (
        <View style={styles.tierBadge}>
          <Text style={styles.tierBadgeText}>{badge}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={[styles.tierName, isHero && { color: C.cream }]}>
          {name}
        </Text>
        <Text style={[styles.tierBilled, isHero && { color: C.tealMint }]}>
          {billed}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        {!hideStrike && tier.strikePrice && (
          <Text
            style={[
              styles.strike,
              isHero && { color: "rgba(250,246,238,0.5)" },
            ]}
          >
            {tier.strikePrice}
          </Text>
        )}
        <View style={{ flexDirection: "row", alignItems: "baseline" }}>
          <Text style={[styles.price, isHero && { color: C.gold, fontSize: 18 }]}>
            {tier.pricePerMonth}
          </Text>
          <Text
            style={[styles.priceUnit, isHero && { color: C.tealMint }]}
          >
            {" "}
            / mo
          </Text>
        </View>
        {tier.savePct !== undefined && tier.savePct > 0 && (
          <View style={styles.save}>
            <Text style={styles.saveText}>SAVE {tier.savePct}%</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
};

// ─── Benefit row ──────────────────────────────────────────────────────
// ─── Editorial benefit row ────────────────────────────────────────────
// Numbered catalogue entry: italic serif numeral + Fraunces headline +
// Manrope body line. Replaces the old check-bulleted feature list with a
// printed-club-letter feel.
const Benefit: React.FC<{ n: string; title: string; body: string }> = ({
  n,
  title,
  body,
}) => (
  <View style={styles.benefitRow}>
    <Text style={styles.benefitNum}>{n}</Text>
    <View style={styles.benefitCol}>
      <Text style={styles.benefitTitle}>{title}</Text>
      <Text style={styles.benefitBody}>{body}</Text>
    </View>
  </View>
);

const BenefitDivider: React.FC = () => <View style={styles.benefitDivider} />;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.cream },
  safe: { flex: 1 },
  loading: {
    flex: 1,
    backgroundColor: C.cream,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: { paddingBottom: 24 },

  // Hero
  hero: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 28,
    alignItems: "center",
    overflow: "hidden",
    position: "relative",
  },
  halo: {
    position: "absolute",
    top: -120,
    alignSelf: "center",
    opacity: 1,
  },
  dimples: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.5,
  },
  topnav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    alignSelf: "stretch",
    zIndex: 1,
  },
  topnavSpacer: { width: 28, height: 28 },
  topnavTitle: {
    fontFamily: F.sansSemi,
    color: C.inkSoft,
    fontSize: 11,
    letterSpacing: 2,
  },
  kicker: {
    marginTop: 22,
    fontFamily: F.sansBold,
    color: C.goldDeep,
    fontSize: 11,
    letterSpacing: 2.4,
    textTransform: "uppercase",
    zIndex: 1,
  },
  headline: {
    marginTop: 6,
    fontFamily: F.display,
    color: C.ink,
    fontSize: 44,
    lineHeight: 46,
    textAlign: "center",
    letterSpacing: -1.4,
    zIndex: 1,
  },
  headlineItalic: {
    fontFamily: F.displayItalic,
    fontSize: 44,
    lineHeight: 46,
  },
  diamondWrap: {
    marginTop: 14,
    marginBottom: 4,
    alignItems: "center",
    zIndex: 1,
  },
  diamond: {
    width: 200,
    height: 200,
    // RN doesn't support drop-shadow filter; mimic with shadow props
    shadowColor: C.goldDeep,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.45,
    shadowRadius: 30,
  },
  sub: {
    marginTop: 14,
    fontFamily: F.sans,
    fontSize: 15,
    lineHeight: 23,
    color: C.inkSoft,
    textAlign: "center",
    paddingHorizontal: 6,
    zIndex: 1,
  },
  subItalic: { fontFamily: F.displayItalic, color: C.inkSoft },

  // Body
  body: { paddingHorizontal: 20, paddingBottom: 4 },
  card: {
    backgroundColor: C.paper,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 22,
    padding: 14,
    paddingTop: 16,
    shadowColor: C.ink,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.1,
    shadowRadius: 28,
    elevation: 6,
  },

  // Tier
  tier: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: C.paper,
    marginTop: 10,
    position: "relative",
  },
  tierHero: {
    backgroundColor: C.ink,
    paddingTop: 18,
    paddingBottom: 14,
    shadowColor: C.ink,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 6,
  },
  tierBadge: {
    position: "absolute",
    top: -10,
    left: 14,
    backgroundColor: C.gold,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  tierBadgeText: {
    fontFamily: F.sansBold,
    color: C.ink,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  tierName: { fontFamily: F.sansSemi, fontSize: 15, color: C.ink },
  tierBilled: {
    fontFamily: F.sans,
    fontSize: 12,
    color: C.inkSoft,
    marginTop: 2,
  },
  strike: {
    fontFamily: F.sans,
    fontSize: 12,
    color: C.muted,
    textDecorationLine: "line-through",
  },
  price: { fontFamily: F.sansSemi, fontSize: 16, color: C.ink },
  priceUnit: { fontFamily: F.sans, fontSize: 12, color: C.inkSoft },
  save: {
    marginTop: 4,
    backgroundColor: C.ink,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    alignSelf: "flex-end",
  },
  saveText: {
    fontFamily: F.sansBold,
    color: C.gold,
    fontSize: 10,
    letterSpacing: 0.8,
  },

  // Benefits — editorial numbered list. Hairline dividers between rows
  // give a printed-catalogue feel within the white card.
  divider: { height: 1, backgroundColor: C.line, marginVertical: 14, marginHorizontal: 4 },
  benefits: {
    marginTop: 2,
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 14,
    gap: 16,
  },
  benefitNum: {
    fontFamily: F.displayItalic,
    fontSize: 22,
    lineHeight: 24,
    color: C.goldDeep,
    letterSpacing: -0.4,
    width: 30,
    marginTop: 2,
  },
  benefitCol: {
    flex: 1,
    gap: 4,
  },
  benefitTitle: {
    fontFamily: F.display,
    fontSize: 17,
    lineHeight: 22,
    color: C.ink,
    letterSpacing: -0.3,
  },
  benefitBody: {
    fontFamily: F.sans,
    fontSize: 13,
    lineHeight: 19,
    color: C.inkSoft,
  },
  benefitDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.line,
    marginHorizontal: 4,
    opacity: 0.7,
  },

  // Tagline — italic pull-quote with a small gold rule above as a
  // typographic "section break". Centered, two-line, teal italic.
  taglineRule: {
    alignSelf: "center",
    width: 28,
    height: 1,
    backgroundColor: C.goldDeep,
    marginTop: 20,
    marginBottom: 12,
    opacity: 0.75,
  },
  tagline: {
    fontFamily: F.displayItalic,
    fontSize: 15,
    lineHeight: 22,
    color: C.teal,
    textAlign: "center",
    paddingHorizontal: 16,
  },

  // CTA
  cta: {
    marginTop: 18,
    backgroundColor: C.ink,
    borderRadius: 999,
    paddingVertical: 17,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: C.ink,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.3,
    shadowRadius: 22,
    elevation: 8,
  },
  ctaText: {
    color: C.gold,
    fontFamily: F.sansSemi,
    fontSize: 16,
    letterSpacing: 0.4,
  },
  restoreRow: { marginTop: 12, alignItems: "center" },
  restoreText: {
    fontFamily: F.sans,
    color: C.inkSoft,
    fontSize: 13,
    textDecorationLine: "underline",
  },
  learnMoreRow: { marginTop: 10, alignItems: "center" },
  learnMoreText: {
    fontFamily: F.sansMed,
    color: C.teal,
    fontSize: 13,
  },
  disclosure: {
    marginTop: 14,
    paddingHorizontal: 6,
    fontFamily: F.sans,
    fontSize: 10,
    lineHeight: 16,
    color: C.muted,
    textAlign: "center",
  },
  links: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 22,
    marginTop: 8,
    marginBottom: 10,
  },
  linkText: {
    fontFamily: F.sans,
    fontSize: 11,
    color: C.inkSoft,
    textDecorationLine: "underline",
  },
});

export default OnboardingPaywallScreen;
