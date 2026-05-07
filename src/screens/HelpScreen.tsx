import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { RootStackParamList } from "../types";
import { Ionicons } from "@expo/vector-icons";
import StandardHeader from "../components/StandardHeader";
import { Colors } from "../constants/colors";
import { Spacing, BorderRadius } from "../constants/spacing";
import { Typography } from "../constants/typography";

type HelpScreenNavigationProp = StackNavigationProp<RootStackParamList, "Help">;

interface HelpCategory {
  id: string;
  title: string;
  items: HelpItem[];
}

interface HelpItem {
  id: string;
  title: string;
}

const helpCategories: HelpCategory[] = [
  {
    id: "profile",
    title: "プロフィール",
    items: [
      { id: "profile-setup", title: "プロフィール項目を設定・変更したい" },
      { id: "main-photo", title: "メイン写真の設定・変更をしたい" },
      { id: "sub-photo", title: "サブ写真の設定・変更をしたい" },
      { id: "photo-permission", title: "写真設定時のアクセス権限について" },
    ],
  },
  {
    id: "likes",
    title: "いいね・マッチング",
    items: [
      { id: "like-send", title: "いいねの送り方" },
      { id: "like-receive", title: "いいねの確認方法" },
      { id: "like-match", title: "マッチングとは?" },
      { id: "like-history", title: "過去のいいねを確認したい" },
    ],
  },
  {
    id: "messages",
    title: "メッセージ",
    items: [
      { id: "message-send", title: "メッセージの送り方" },
      { id: "message-read", title: "メッセージの確認方法" },
      { id: "message-notification", title: "メッセージ通知の設定" },
      { id: "message-block", title: "ユーザーをブロックしたい" },
    ],
  },
  {
    id: "posts",
    title: "投稿",
    items: [
      { id: "post-create", title: "投稿の作り方" },
      { id: "post-media", title: "写真・動画の追加方法" },
      { id: "post-react", title: "投稿にリアクションしたい" },
      { id: "post-delete", title: "投稿を削除したい" },
    ],
  },
  {
    id: "features",
    title: "機能",
    items: [
      { id: "search-feature", title: "検索機能の使い方" },
      { id: "filter-feature", title: "フィルター機能について" },
      { id: "calendar-feature", title: "カレンダー機能の使い方" },
      { id: "connections-feature", title: "つながり機能について" },
      { id: "footprints-feature", title: "足あと機能について" },
    ],
  },
  {
    id: "membership",
    title: "メンバーシップ",
    items: [
      { id: "membership-benefits", title: "メンバーシップの特典" },
      { id: "membership-purchase", title: "メンバーシップの購入方法" },
      { id: "membership-cancel", title: "メンバーシップの解約方法" },
      { id: "membership-restore", title: "購入を復元したい" },
    ],
  },
  {
    id: "kyc-verification",
    title: "本人確認",
    items: [
      { id: "kyc-process", title: "本人確認の手順" },
      { id: "kyc-documents", title: "使用できる本人確認書類" },
      { id: "kyc-required", title: "本人確認が必要な理由" },
      { id: "kyc-failed", title: "本人確認ができない場合" },
    ],
  },
  {
    id: "safety-moderation",
    title: "安全・モデレーション",
    items: [
      { id: "moderation-overview", title: "投稿の監視体制について" },
      { id: "moderation-guidelines", title: "コミュニティガイドライン" },
      { id: "moderation-action", title: "違反コンテンツへの対応" },
    ],
  },
  {
    id: "reporting",
    title: "通報・ブロック",
    items: [
      { id: "report-user", title: "ユーザーを通報したい" },
      { id: "report-reason", title: "通報理由の選択方法" },
      { id: "block-user", title: "ユーザーをブロックしたい" },
      { id: "hidden-posts", title: "投稿を非表示にしたい" },
      { id: "report-safety", title: "安全に利用するために" },
    ],
  },
  {
    id: "withdrawal",
    title: "退会",
    items: [
      { id: "withdrawal-process", title: "退会手続きの方法" },
      { id: "withdrawal-data", title: "退会時のデータ取り扱い" },
    ],
  },
  {
    id: "bugs",
    title: "不具合について",
    items: [
      { id: "bug-report", title: "不具合を報告したい" },
      { id: "bug-common", title: "よくある不具合と対処法" },
      { id: "bug-app-update", title: "アプリの更新方法" },
    ],
  },
  {
    id: "other",
    title: "その他",
    items: [
      { id: "privacy-policy", title: "プライバシーポリシー" },
      { id: "terms-of-service", title: "利用規約" },
      { id: "contact-support", title: "サポートへのお問い合わせ" },
    ],
  },
];

const HelpScreen: React.FC = () => {
  const navigation = useNavigation<HelpScreenNavigationProp>();
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set()
  );

  const toggleCategory = (categoryId: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId);
    } else {
      newExpanded.add(categoryId);
    }
    setExpandedCategories(newExpanded);
  };

  const handleItemPress = (itemId: string) => {
    navigation.navigate("HelpDetail", { itemId });
  };

  const handleContactPress = () => {
    navigation.navigate("ContactReply");
  };

  return (
    <SafeAreaView style={styles.container}>
      <StandardHeader
        title="ヘルプ・お問い合わせ"
        showBackButton
        onBackPress={() => navigation.goBack()}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {helpCategories.map((category) => {
          const isExpanded = expandedCategories.has(category.id);

          return (
            <View key={category.id} style={styles.categoryContainer}>
              <TouchableOpacity
                style={styles.categoryHeader}
                onPress={() => toggleCategory(category.id)}
                activeOpacity={0.7}
              >
                <Text style={styles.categoryTitle}>{category.title}</Text>
                <Ionicons
                  name={isExpanded ? "chevron-up" : "chevron-down"}
                  size={20}
                  color={Colors.gray[600]}
                />
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.itemsContainer}>
                  {category.items.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.itemRow}
                      onPress={() => handleItemPress(item.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.itemText}>{item.title}</Text>
                      <Ionicons
                        name="chevron-forward"
                        size={16}
                        color={Colors.primary}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        <View style={styles.contactSection}>
          <Text style={styles.contactText}>ヘルプで解決しない場合</Text>
          <TouchableOpacity
            style={styles.contactButton}
            onPress={handleContactPress}
            activeOpacity={0.8}
          >
            <Text style={styles.contactButtonText}>お問い合わせ</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.xl,
  },
  categoryContainer: {
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  categoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  categoryTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
    color: Colors.text.primary,
  },
  itemsContainer: {
    backgroundColor: Colors.gray[50],
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  itemText: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.primary,
    marginRight: Spacing.sm,
  },
  contactSection: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.md,
    alignItems: "center",
  },
  contactText: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    marginBottom: Spacing.md,
    textAlign: "center",
  },
  contactButton: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  contactButtonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.white,
  },
});

export default HelpScreen;








