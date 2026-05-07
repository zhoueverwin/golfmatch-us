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
import { useCurrentUserProfile } from "../hooks/queries/useProfile";

type NavigationProp = StackNavigationProp<RootStackParamList>;

// Feature comparison data
interface Feature {
  name: string;
  free: boolean;
  premium: boolean;
  freeNote?: string;
  premiumNote?: string;
  femaleNote?: string;
}

const FEATURES: Feature[] = [
  { name: "View profiles", free: true, premium: true },
  { name: "Send Likes", free: true, premium: true },
  { name: "Matching", free: true, premium: true },
  { name: "View and create posts", free: true, premium: true },
  { name: "Search (gender, age, location, skill, etc.)", free: false, premium: true },
  { name: "Send messages", free: false, premium: true },
  { name: "Sorting options", free: false, premium: true },
  { name: "Daily recommendations", free: true, premium: true, freeNote: "3", premiumNote: "5", femaleNote: "10" },
  { name: "Featured placement in recommendations", free: false, premium: true },
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
  const { isProMember, expirationDate, willRenew } = useRevenueCat();
  const { profileId } = useAuth();
  const { profile: currentUser } = useCurrentUserProfile();
  const [kycStatus, setKycStatus] = useState<KycStatus>("not_started");

  useEffect(() => {
    const fetchKycStatus = async () => {
      if (!profileId) return;
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

  const formatExpirationDate = (date: Date): string => {
    return `Until ${date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`;
  };

  const kycConfig = KYC_STATUS_CONFIG[kycStatus];

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
        {/* Section A: Current Status Card */}
        {isProMember ? (
          <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate("Store")}>
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
              {expirationDate && (
                <Text style={styles.expirationText}>
                  {formatExpirationDate(expirationDate)}
                </Text>
              )}
              {willRenew && (
                <View style={styles.renewBadge}>
                  <Ionicons name="refresh" size={14} color={Colors.white} />
                  <Text style={styles.renewText}>Auto-renews</Text>
                </View>
              )}
            </LinearGradient>
          </TouchableOpacity>
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
              <View style={styles.kycBadge}>
                <Ionicons
                  name={kycConfig.icon}
                  size={16}
                  color={kycConfig.color}
                />
                <Text style={[styles.kycStatusText, { color: kycConfig.color }]}>
                  {kycConfig.label}
                </Text>
              </View>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={Colors.gray[400]}
            />
          </View>
        </TouchableOpacity>

        {/* Section C: Feature Comparison Table */}
        <View style={styles.tableCard}>
          <Text style={styles.tableTitle}>Feature Comparison</Text>
          <Text style={styles.tableSummary}>
            Premium members rank higher in recommendations and search, and can send messages — making it easier to connect and match.
          </Text>

          {/* Table Header */}
          <View style={styles.tableHeader}>
            <View style={styles.tableFeatureCol}>
              <Text style={styles.tableHeaderText}>Feature</Text>
            </View>
            <View style={styles.tableStatusCol}>
              <Text style={styles.tableHeaderText}>Free</Text>
            </View>
            <View style={styles.tableStatusCol}>
              <Text style={[styles.tableHeaderText, styles.premiumHeaderText]}>
                Premium
              </Text>
            </View>
          </View>

          {/* Table Rows */}
          {FEATURES.map((feature, index) => {
            const isPremiumOnly = !feature.free && feature.premium;
            const isFemale = currentUser?.gender === "female";
            const freeNote = isFemale && feature.femaleNote ? feature.femaleNote : feature.freeNote;
            const premiumNote = isFemale && feature.femaleNote ? feature.femaleNote : feature.premiumNote;
            return (
              <View
                key={index}
                style={[
                  styles.tableRow,
                  isPremiumOnly && styles.tableRowHighlight,
                  index === FEATURES.length - 1 && styles.tableRowLast,
                ]}
              >
                <View style={styles.tableFeatureCol}>
                  <Text style={styles.tableFeatureText}>{feature.name}</Text>
                </View>
                <View style={styles.tableStatusCol}>
                  {freeNote ? (
                    <Text style={styles.tableNoteText}>{freeNote}</Text>
                  ) : feature.free ? (
                    <Image
                      source={require("../../assets/images/Icons/Check-FillGreen.png")}
                      style={styles.checkIcon}
                      resizeMode="contain"
                    />
                  ) : (
                    <Ionicons
                      name="close-circle-outline"
                      size={20}
                      color={Colors.gray[300]}
                    />
                  )}
                </View>
                <View style={styles.tableStatusCol}>
                  {premiumNote ? (
                    <Text style={[styles.tableNoteText, styles.tableNoteTextPremium]}>{premiumNote}</Text>
                  ) : feature.premium ? (
                    <Image
                      source={require("../../assets/images/Icons/Check-FillGreen.png")}
                      style={styles.checkIcon}
                      resizeMode="contain"
                    />
                  ) : (
                    <Ionicons
                      name="close-circle-outline"
                      size={20}
                      color={Colors.gray[300]}
                    />
                  )}
                </View>
              </View>
            );
          })}

          {/* Footnote for female users */}
          {currentUser?.gender === "female" && (
            <Text style={styles.tableFootnote}>
              * Women can send messages for free.
            </Text>
          )}
        </View>

        {/* Section D: Badge Introduction */}
        <View style={styles.badgeCard}>
          <Text style={styles.badgeCardTitle}>About Badges</Text>

          {/* Premium badge */}
          <View style={styles.badgeRow}>
            <Image
              source={require("../../assets/images/badges/Gold.png")}
              style={styles.badgeSampleIcon}
              resizeMode="contain"
            />
            <View style={styles.badgeRowText}>
              <Text style={styles.badgeRowTitle}>Premium Badge</Text>
              <Text style={styles.badgeRowDesc}>
                Premium members get a gold badge next to their name across profiles, posts, and search results. It builds trust and helps you stand out — leading to more matches.
              </Text>
            </View>
          </View>

          <View style={styles.badgeDivider} />

          {/* Verification badge */}
          <View style={styles.badgeRow}>
            <Image
              source={require("../../assets/images/badges/Verify.png")}
              style={styles.badgeSampleIcon}
              resizeMode="contain"
            />
            <View style={styles.badgeRowText}>
              <Text style={styles.badgeRowTitle}>Verified Badge</Text>
              <Text style={styles.badgeRowDesc}>
                Once you complete identity verification, a blue badge appears next to your name. It reassures others you're real — leading to more Likes and matches.
              </Text>
            </View>
          </View>

          {/* Example display */}
          <View style={styles.badgeExampleBox}>
            <Text style={styles.badgeExampleLabel}>Example</Text>
            <View style={styles.badgeExample}>
              <View style={styles.badgeExampleAvatar}>
                <Ionicons name="person" size={18} color={Colors.gray[400]} />
              </View>
              <Text style={styles.badgeExampleName}>Alex</Text>
              <Image
                source={require("../../assets/images/badges/Verify.png")}
                style={styles.badgeExampleIcon}
                resizeMode="contain"
              />
              <Image
                source={require("../../assets/images/badges/Gold.png")}
                style={styles.badgeExampleIcon}
                resizeMode="contain"
              />
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
              <Text style={styles.priceLabel}>¥3,000 / month</Text>
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
    marginBottom: 8,
  },
  renewBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  renewText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.white,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
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
  },
  kycStatusText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
  },

  // Feature Comparison Table
  tableCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.small,
  },
  tableTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    marginBottom: 6,
  },
  tableSummary: {
    fontSize: Typography.fontSize.xs,
    color: Colors.text.secondary,
    fontFamily: Typography.fontFamily.regular,
    lineHeight: 18,
    marginBottom: Spacing.md,
  },
  tableHeader: {
    flexDirection: "row",
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
    marginBottom: 4,
  },
  tableFeatureCol: {
    flex: 2,
    justifyContent: "center",
  },
  tableStatusCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tableHeaderText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.secondary,
  },
  premiumHeaderText: {
    color: Colors.primary,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.gray[100],
  },
  tableRowHighlight: {
    backgroundColor: "rgba(32, 178, 170, 0.04)",
  },
  tableRowLast: {
    borderBottomWidth: 0,
  },
  tableFeatureText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text.primary,
    fontFamily: Typography.fontFamily.regular,
  },
  checkIcon: {
    width: 20,
    height: 20,
  },
  tableNoteText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.secondary,
  },
  tableNoteTextPremium: {
    color: Colors.primary,
  },
  tableFootnote: {
    fontSize: Typography.fontSize.xs,
    color: Colors.text.secondary,
    fontFamily: Typography.fontFamily.regular,
    marginTop: Spacing.sm,
    lineHeight: 18,
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
    marginBottom: Spacing.md,
  },
  badgeRow: {
    flexDirection: "row",
    gap: 12,
  },
  badgeSampleIcon: {
    width: 28,
    height: 28,
    marginTop: 2,
  },
  badgeRowText: {
    flex: 1,
  },
  badgeRowTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    marginBottom: 4,
  },
  badgeRowDesc: {
    fontSize: Typography.fontSize.xs,
    color: Colors.text.secondary,
    fontFamily: Typography.fontFamily.regular,
    lineHeight: 18,
  },
  badgeDivider: {
    height: 1,
    backgroundColor: Colors.gray[100],
    marginVertical: Spacing.md,
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
