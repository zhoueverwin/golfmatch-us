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
  { name: "プロフィール閲覧", free: true, premium: true },
  { name: "いいね送信", free: true, premium: true },
  { name: "マッチング", free: true, premium: true },
  { name: "投稿の閲覧・作成", free: true, premium: true },
  { name: "募集の閲覧・作成", free: true, premium: true },
  { name: "検索（性別・年齢・地域・スキル等）", free: false, premium: true },
  { name: "メッセージ送信", free: false, premium: true },
  { name: "並び替えオプション", free: false, premium: true },
  { name: "毎日のおすすめ", free: true, premium: true, freeNote: "3枚", premiumNote: "5枚", femaleNote: "10枚" },
  { name: "おすすめ・本日限定で上位表示", free: false, premium: true },
];

// KYC status display configuration
const KYC_STATUS_CONFIG: Record<
  KycStatus,
  { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  approved: { label: "確認済み", color: Colors.success, icon: "checkmark-circle" },
  pending_review: { label: "審査中", color: Colors.warning, icon: "time" },
  retry: { label: "再提出が必要", color: Colors.error, icon: "alert-circle" },
  rejected: { label: "否認", color: Colors.error, icon: "close-circle" },
  not_started: { label: "未確認", color: Colors.gray[400], icon: "remove-circle" },
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
        "サブスクリプション管理",
        Platform.OS === "ios"
          ? "設定アプリ → Apple ID → サブスクリプション からサブスクリプションを管理できます。"
          : "Google Play ストア → メニュー → 定期購入 からサブスクリプションを管理できます。"
      );
    }
  };

  const formatExpirationDate = (date: Date): string => {
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日まで`;
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
                <Text style={styles.statusLabelPremium}>有料会員</Text>
              </View>
              {expirationDate && (
                <Text style={styles.expirationText}>
                  {formatExpirationDate(expirationDate)}
                </Text>
              )}
              {willRenew && (
                <View style={styles.renewBadge}>
                  <Ionicons name="refresh" size={14} color={Colors.white} />
                  <Text style={styles.renewText}>自動更新</Text>
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
                <Text style={styles.statusLabelFree}>無料会員</Text>
              </View>
              <Text style={styles.upgradeHint}>
                アップグレードで全機能を解放
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Section B: 本人確認 (Identity Verification) */}
        <TouchableOpacity
          style={styles.kycCard}
          onPress={() => navigation.navigate("KycVerification")}
        >
          <View style={styles.kycContent}>
            <View style={styles.kycLeft}>
              <Text style={styles.kycTitle}>本人確認</Text>
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
          <Text style={styles.tableTitle}>機能比較</Text>
          <Text style={styles.tableSummary}>
            有料会員になると、おすすめや検索で上位に表示され、メッセージも送れるため、マッチしやすくなります。
          </Text>

          {/* Table Header */}
          <View style={styles.tableHeader}>
            <View style={styles.tableFeatureCol}>
              <Text style={styles.tableHeaderText}>機能</Text>
            </View>
            <View style={styles.tableStatusCol}>
              <Text style={styles.tableHeaderText}>無料会員</Text>
            </View>
            <View style={styles.tableStatusCol}>
              <Text style={[styles.tableHeaderText, styles.premiumHeaderText]}>
                有料会員
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
              ※ 女性会員はメッセージを無料で送信できます
            </Text>
          )}
        </View>

        {/* Section D: Badge Introduction */}
        <View style={styles.badgeCard}>
          <Text style={styles.badgeCardTitle}>バッジについて</Text>

          {/* Premium badge */}
          <View style={styles.badgeRow}>
            <Image
              source={require("../../assets/images/badges/Gold.png")}
              style={styles.badgeSampleIcon}
              resizeMode="contain"
            />
            <View style={styles.badgeRowText}>
              <Text style={styles.badgeRowTitle}>有料会員バッジ</Text>
              <Text style={styles.badgeRowDesc}>
                有料会員になると、プロフィール・投稿・検索結果・募集などでお名前の横にゴールドバッジが表示されます。信頼感がアップし、マッチ率の向上が期待できます。
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
              <Text style={styles.badgeRowTitle}>本人確認バッジ</Text>
              <Text style={styles.badgeRowDesc}>
                本人確認を完了すると、お名前の横にブルーバッジが表示されます。お相手に安心感を与え、より多くの「いいね」やマッチにつながります。
              </Text>
            </View>
          </View>

          {/* Example display */}
          <View style={styles.badgeExampleBox}>
            <Text style={styles.badgeExampleLabel}>表示例</Text>
            <View style={styles.badgeExample}>
              <View style={styles.badgeExampleAvatar}>
                <Ionicons name="person" size={18} color={Colors.gray[400]} />
              </View>
              <Text style={styles.badgeExampleName}>ゴルフ太郎</Text>
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
                サブスクリプションを管理
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
                  <Text style={styles.upgradeButtonText}>有料会員になる</Text>
                </LinearGradient>
              </TouchableOpacity>
              <Text style={styles.priceLabel}>月額 ¥3,000</Text>
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
