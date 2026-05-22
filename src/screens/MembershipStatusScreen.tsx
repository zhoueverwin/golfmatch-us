import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Linking,
  Platform,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { Ionicons } from "@expo/vector-icons";

import { RootStackParamList } from "../types";
import { KycStatus } from "../types/dataModels";
import { Colors } from "../constants/colors";
import { Spacing, BorderRadius, Shadows } from "../constants/spacing";
import { Typography } from "../constants/typography";
import { useRevenueCat } from "../contexts/RevenueCatContext";
import { useAuth } from "../contexts/AuthContext";
import { kycService } from "../services/kycService";
import { revenueCatService } from "../services/revenueCatService";
import StandardHeader from "../components/StandardHeader";
import { StreakBadge } from "../components/StreakBadge";

type NavigationProp = StackNavigationProp<RootStackParamList>;

// Premium benefits content. Reads from the audience perspective: premium
// males get a confirmation of what they're paying for; free females get a
// "you already have access" reassurance. The bullet list itself is the
// same for everyone — only the lead paragraph adapts.
interface PremiumBenefit {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
}

const PREMIUM_BENEFITS: PremiumBenefit[] = [
  {
    icon: "ribbon",
    title: "Featured placement",
    description:
      "Your profile is featured in daily recommendations and search results across the app.",
  },
  {
    icon: "chatbubble-ellipses",
    title: "Direct messaging",
    description:
      "Send messages to anyone you've matched with and start conversations.",
  },
  {
    icon: "sparkles",
    title: "Daily curated picks",
    description:
      "A fresh batch of hand-picked compatible golfers delivered every day.",
  },
];

// KYC status display configuration
const KYC_STATUS_CONFIG: Record<
  KycStatus,
  { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  approved: { label: "Verified", color: Colors.success, icon: "checkmark-circle" },
  pending_review: { label: "Under review", color: Colors.warning, icon: "time" },
  retry: { label: "Resubmission required", color: Colors.error, icon: "alert-circle" },
  rejected: { label: "Rejected", color: Colors.error, icon: "close-circle" },
  not_started: { label: "Not verified", color: Colors.gray[400], icon: "remove-circle" },
};

const MembershipStatusScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { isProMember, expirationDate, willRenew, currentOffering } = useRevenueCat();
  // Lowest effective monthly across all available tiers — drives the "From
  // $X/mo" upsell label so adding a 6-month or annual tier in RevenueCat
  // automatically discounts the visible headline. Falls back to a USD
  // placeholder while RC is still loading.
  //
  // packageType strings come from RC: 'MONTHLY', 'SIX_MONTH', 'ANNUAL', etc.
  // Mapping back to "months in this package" lets us divide the total price
  // and find the cheapest per-month rate, regardless of which tiers are
  // actually enabled in the dashboard.
  const monthsByPackageType: Record<string, number> = {
    MONTHLY: 1,
    TWO_MONTH: 2,
    THREE_MONTH: 3,
    SIX_MONTH: 6,
    ANNUAL: 12,
  };
  const cheapestMonthlyLabel = (() => {
    const packages = currentOffering?.availablePackages ?? [];
    if (packages.length === 0) return "$29.99";
    let bestRate = Infinity;
    let bestFormatter:
      | ((value: number) => string)
      | null = null;
    for (const pkg of packages) {
      const months = monthsByPackageType[pkg.packageType] ?? 0;
      if (months === 0) continue;
      const rate = pkg.product.price / months;
      if (rate < bestRate) {
        bestRate = rate;
        // Re-use the source product's locale + currency so the rounded
        // number renders correctly across regions (¥, €, etc.).
        const currencyCode = pkg.product.currencyCode || "USD";
        bestFormatter = (value) =>
          new Intl.NumberFormat(undefined, {
            style: "currency",
            currency: currencyCode,
            maximumFractionDigits: 2,
          }).format(value);
      }
    }
    if (!Number.isFinite(bestRate) || !bestFormatter) {
      return currentOffering?.monthly?.product.priceString ?? "$29.99";
    }
    return bestFormatter(bestRate);
  })();
  const { profileId, userProfile: cachedProfile } = useAuth();
  // Bootstrap from the cached profile so verified users (i.e. everyone
  // who reaches this screen — AppNavigator's needsKycGate guarantees it)
  // see "Verified" on the very first paint instead of flashing through
  // the default "Not verified" while kycService.getKycStatus resolves.
  // null = "haven't resolved yet"; the badge stays hidden until then.
  const [kycStatus, setKycStatus] = useState<KycStatus | null>(
    cachedProfile?.is_verified ? "approved" : null,
  );

  useEffect(() => {
    const fetchKycStatus = async () => {
      if (!profileId) return;
      // Still fetch the granular status so e.g. retry/pending_review can
      // override the bootstrapped "approved" if the user's KYC has been
      // flagged for re-review since the cache was last refreshed.
      const status = await kycService.getKycStatus(profileId);
      setKycStatus(status);
    };
    fetchKycStatus();
  }, [profileId]);

  const handleManageSubscription = async () => {
    try {
      const managementURL = await revenueCatService.getManagementURL();
      if (managementURL) {
        await Linking.openURL(managementURL);
      } else {
        if (Platform.OS === "ios") {
          await Linking.openURL("https://apps.apple.com/account/subscriptions");
        } else {
          await Linking.openURL(
            "https://play.google.com/store/account/subscriptions"
          );
        }
      }
    } catch (error) {
      Alert.alert(
        "Manage Subscription",
        Platform.OS === "ios"
          ? "You can manage your subscription in Settings → Apple ID → Subscriptions."
          : "You can manage your subscription in Google Play Store → Menu → Subscriptions."
      );
    }
  };

  // Renders just the date — the verb ("Renews" / "Access ends") sits in
  // the JSX so the same helper serves both auto-renewing and canceled
  // states without hardcoded "Until …" framing that misled active users.
  const formatDate = (date: Date): string =>
    date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  const kycConfig = kycStatus ? KYC_STATUS_CONFIG[kycStatus] : null;

  return (
    <SafeAreaView style={styles.container}>
      <StandardHeader
        title=""
        showBackButton
        onBackPress={() => navigation.goBack()}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Section A: Current Status Card.
            Premium card is a static status display — the bottom
            "Manage Subscription" button is the canonical path to
            Apple/Google's subscription management. The Free card stays
            tappable since that's a legitimate upgrade entry point. */}
        {isProMember ? (
          <LinearGradient
            colors={["#16E4D8", "#20B1AA"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.statusCardPremium}
          >
            <View style={styles.statusCardHeader}>
              <Image
                source={require("../../assets/images/paymentpageassets/Diamond-Final.png")}
                style={styles.statusDiamondIcon}
                resizeMode="contain"
              />
              <Text style={styles.statusLabelPremium}>Premium Member</Text>
            </View>
            {/* Auto-renewing: show next billing date. willRenew=true and a
                non-null expirationDate together mean Apple/Google will
                attempt the next charge on that date and roll the
                subscription forward. The verb "Renews" makes that explicit
                instead of the prior misleading "Until …" phrasing. */}
            {expirationDate && willRenew && (
              <Text style={styles.expirationText}>
                Renews {formatDate(expirationDate)}
              </Text>
            )}

            {/* Canceled-in-grace: auto-renew is off but access remains
                until the period ends. Surface a Reactivate affordance
                directly on the card — it deep-links to Apple's
                subscriptions panel where a one-tap resume avoids creating
                a duplicate purchase. */}
            {expirationDate && !willRenew && (
              <>
                <Text style={styles.expirationText}>
                  Access ends {formatDate(expirationDate)}
                </Text>
                <TouchableOpacity
                  style={styles.reactivateButton}
                  onPress={handleManageSubscription}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Reactivate subscription"
                >
                  <Ionicons name="refresh" size={14} color={Colors.primary} />
                  <Text style={styles.reactivateButtonText}>Reactivate</Text>
                </TouchableOpacity>
              </>
            )}
          </LinearGradient>
        ) : (
          <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate("Store")}>
            <View style={styles.statusCardFree}>
              <View style={styles.statusCardHeader}>
                <Image
                  source={require("../../assets/images/paymentpageassets/Diamond-Final.png")}
                  style={styles.statusDiamondIcon}
                  resizeMode="contain"
                />
                <Text style={styles.statusLabelFree}>Free Member</Text>
              </View>
              <Text style={styles.upgradeHint}>
                Upgrade to unlock all features
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Section B: Identity Verification */}
        <TouchableOpacity
          style={styles.kycCard}
          onPress={() => navigation.navigate("KycVerification")}
        >
          <View style={styles.kycContent}>
            <View style={styles.kycLeft}>
              <Text style={styles.kycTitle}>Identity Verification</Text>
              {/* Badge slot keeps a fixed minHeight so the card stays a
                  consistent size whether kycConfig is still loading
                  (renders nothing) or already resolved (renders icon +
                  label). Prevents card-height jump on first paint. */}
              <View style={styles.kycBadge}>
                {kycConfig && (
                  <>
                    <Ionicons
                      name={kycConfig.icon}
                      size={16}
                      color={kycConfig.color}
                    />
                    <Text style={[styles.kycStatusText, { color: kycConfig.color }]}>
                      {kycConfig.label}
                    </Text>
                  </>
                )}
              </View>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={Colors.gray[400]}
            />
          </View>
        </TouchableOpacity>

        {/* Section C: Premium Benefits. Replaces the prior feature
            comparison table — only Premium and free-female users reach
            this screen, so a side-by-side comparison was noise. Now it's
            a narrative explanation of what Premium unlocks. */}
        <View style={styles.benefitsCard}>
          <Text style={styles.benefitsCardTitle}>Premium Benefits</Text>
          <Text style={styles.benefitsLead}>
            Your premium subscription includes the features below.
          </Text>

          {PREMIUM_BENEFITS.map((benefit, index) => (
            <React.Fragment key={benefit.title}>
              {index > 0 && <View style={styles.benefitsDivider} />}
              <View style={styles.benefitsRow}>
                <View style={styles.benefitsIconCircle}>
                  <Ionicons
                    name={benefit.icon}
                    size={20}
                    color={Colors.primary}
                  />
                </View>
                <View style={styles.benefitsRowText}>
                  <Text style={styles.benefitsRowTitle}>{benefit.title}</Text>
                  <Text style={styles.benefitsRowDesc}>
                    {benefit.description}
                  </Text>
                </View>
              </View>
            </React.Fragment>
          ))}
        </View>

        {/* Section D: Streak Badge introduction.
            Earlier versions of this screen also introduced "Premium Gold"
            and "Verified" badges — both have been removed from product (a
            grep across src/ confirms neither PNG is rendered next to user
            names anywhere). Section D now focuses on the single badge that
            users actually see in feeds, profiles, and search results. */}
        <View style={styles.badgeCard}>
          <Text style={styles.badgeCardTitle}>About the Streak Badge</Text>
          <Text style={styles.streakIntroText}>
            Open GolfMatch every day to build an active-days streak. The streak badge appears next to your name once you reach 7 days, and upgrades through three tiers as your streak grows — signalling you're an engaged member and helping you stand out.
          </Text>

          {/* Tier preview — renders the live StreakBadge at each threshold
              so the color/tier mapping stays accurate even if tierStyle()
              is tuned in the component later. */}
          <View style={styles.streakTiersRow}>
            <View style={styles.streakTierItem}>
              <StreakBadge days={7} />
              <Text style={styles.streakTierLabel}>Bronze</Text>
              <Text style={styles.streakTierRange}>7+ days</Text>
            </View>
            <View style={styles.streakTierItem}>
              <StreakBadge days={30} />
              <Text style={styles.streakTierLabel}>Silver</Text>
              <Text style={styles.streakTierRange}>30+ days</Text>
            </View>
            <View style={styles.streakTierItem}>
              <StreakBadge days={100} />
              <Text style={styles.streakTierLabel}>Gold</Text>
              <Text style={styles.streakTierRange}>100+ days</Text>
            </View>
          </View>

          {/* Example display — shows how the streak badge appears next to
              a user's name in feeds, profiles, and search results. */}
          <View style={styles.badgeExampleBox}>
            <Text style={styles.badgeExampleLabel}>Example</Text>
            <View style={styles.badgeExample}>
              <View style={styles.badgeExampleAvatar}>
                <Ionicons name="person" size={18} color={Colors.gray[400]} />
              </View>
              <Text style={styles.badgeExampleName}>Alex</Text>
              <StreakBadge days={42} />
            </View>
          </View>
        </View>

        {/* CTA Section */}
        <View style={styles.ctaSection}>
          {isProMember ? (
            <TouchableOpacity
              style={styles.manageButton}
              onPress={handleManageSubscription}
            >
              <Text style={styles.manageButtonText}>
                Manage Subscription
              </Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                onPress={() => navigation.navigate("Store")}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={["#16E4D8", "#20B1AA"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.upgradeButton}
                >
                  <Text style={styles.upgradeButtonText}>Become a Premium Member</Text>
                </LinearGradient>
              </TouchableOpacity>
              <Text style={styles.priceLabel}>From {cheapestMonthlyLabel}/mo</Text>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: 100,
  },

  // Status Card — Premium
  statusCardPremium: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  statusCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  statusDiamondIcon: {
    width: 36,
    height: 36,
  },
  statusLabelPremium: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.white,
  },
  expirationText: {
    fontSize: Typography.fontSize.sm,
    color: "rgba(255,255,255,0.9)",
    fontFamily: Typography.fontFamily.regular,
  },
  // Reactivate pill — only rendered when willRenew=false. White surface
  // on the teal gradient gives it primary-action emphasis (Apple HIG-style
  // tinted button), while the teal text keeps it visually rooted in the
  // card's brand palette.
  reactivateButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    backgroundColor: Colors.white,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    marginTop: 12,
  },
  reactivateButtonText: {
    fontSize: 13,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.primary,
  },

  // Status Card — Free
  statusCardFree: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.small,
  },
  statusLabelFree: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
  },
  upgradeHint: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text.secondary,
    fontFamily: Typography.fontFamily.regular,
  },

  // KYC Card
  kycCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.small,
  },
  kycContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  kycLeft: {
    flex: 1,
  },
  kycTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    marginBottom: 4,
  },
  kycBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    // Reserve the line-height of the badge so the card stays a stable
    // size while kycConfig is null (loading) — avoids a one-frame
    // height-jump when the badge content renders.
    minHeight: 20,
  },
  kycStatusText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
  },

  // Premium Benefits Card — replaces the prior feature-comparison table.
  // Matches the visual rhythm of the Badge Introduction card below
  // (white surface, small shadow, semibold title) but uses a circular
  // tinted icon container instead of PNG badge images so the two cards
  // read as related but distinct sections.
  benefitsCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.small,
  },
  benefitsCardTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    marginBottom: 8,
  },
  benefitsLead: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text.secondary,
    fontFamily: Typography.fontFamily.regular,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  benefitsRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  benefitsIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(32, 178, 170, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  benefitsRowText: {
    flex: 1,
    paddingTop: 2,
  },
  benefitsRowTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    marginBottom: 2,
  },
  benefitsRowDesc: {
    fontSize: Typography.fontSize.xs,
    color: Colors.text.secondary,
    fontFamily: Typography.fontFamily.regular,
    lineHeight: 18,
  },
  benefitsDivider: {
    height: 1,
    backgroundColor: Colors.gray[100],
    marginVertical: Spacing.md,
  },

  // Badge Introduction Card
  badgeCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.small,
  },
  badgeCardTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    marginBottom: 8,
  },
  streakIntroText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text.secondary,
    fontFamily: Typography.fontFamily.regular,
    lineHeight: 20,
  },
  // Tier preview strip — three equal-flex columns, each showing the live
  // StreakBadge pill at the threshold for that tier plus a label/range
  // underneath. Variable-width pills (e.g. "🔥100") are centered within
  // their cell so they don't need a fixed-width container.
  streakTiersRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    marginTop: Spacing.sm,
    gap: 8,
  },
  streakTierItem: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  streakTierLabel: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    marginTop: 4,
  },
  streakTierRange: {
    fontSize: 11,
    color: Colors.text.secondary,
    fontFamily: Typography.fontFamily.regular,
  },
  badgeExampleBox: {
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginTop: Spacing.md,
  },
  badgeExampleLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.text.secondary,
    fontFamily: Typography.fontFamily.regular,
    marginBottom: 8,
  },
  badgeExample: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  badgeExampleAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.gray[200],
    alignItems: "center",
    justifyContent: "center",
  },
  badgeExampleName: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
  },
  badgeExampleIcon: {
    width: 18,
    height: 18,
  },

  // CTA Section
  ctaSection: {
    alignItems: "center",
    paddingTop: Spacing.sm,
  },
  upgradeButton: {
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: BorderRadius.full,
    alignItems: "center",
  },
  upgradeButtonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.white,
  },
  priceLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text.secondary,
    fontFamily: Typography.fontFamily.regular,
    marginTop: 8,
  },
  manageButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    alignItems: "center",
  },
  manageButtonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.primary,
  },
});

export default MembershipStatusScreen;
