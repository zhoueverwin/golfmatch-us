import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { Ionicons } from "@expo/vector-icons";

import { Colors } from "../constants/colors";
import { Spacing, BorderRadius } from "../constants/spacing";
import { Typography } from "../constants/typography";
import { RootStackParamList } from "../types";
import { reportsService, ReportType } from "../services/supabase/reports.service";
import { useAuth } from "../contexts/AuthContext";

type ReportScreenRouteProp = RouteProp<RootStackParamList, "Report">;
type ReportScreenNavigationProp = StackNavigationProp<RootStackParamList>;

interface ReportCategory {
  value: ReportType;
  label: string;
  description: string;
}

const REPORT_CATEGORIES: ReportCategory[] = [
  {
    value: "inappropriate_content",
    label: "不適切なコンテンツ",
    description: "暴力的、性的、または攻撃的なコンテンツ",
  },
  {
    value: "spam",
    label: "スパム",
    description: "迷惑な広告や繰り返しの投稿",
  },
  {
    value: "harassment",
    label: "嫌がらせ",
    description: "いじめ、脅迫、または嫌がらせ行為",
  },
  {
    value: "fraud",
    label: "詐欺",
    description: "詐欺行為やなりすまし",
  },
  {
    value: "inappropriate_media",
    label: "不適切な画像/動画",
    description: "不適切な写真やビデオコンテンツ",
  },
  {
    value: "false_information",
    label: "誤った情報",
    description: "虚偽の情報やデマの拡散",
  },
  {
    value: "other",
    label: "その他",
    description: "上記に当てはまらないその他の問題",
  },
];

const MIN_DESCRIPTION_LENGTH = 10;
const MAX_DESCRIPTION_LENGTH = 1000;

const ReportScreen: React.FC = () => {
  const navigation = useNavigation<ReportScreenNavigationProp>();
  const route = useRoute<ReportScreenRouteProp>();
  const { profileId } = useAuth();

  const {
    reportedUserId,
    reportedPostId,
    reportedMessageId,
    reportedUserName,
  } = route.params;

  const [selectedCategory, setSelectedCategory] = useState<ReportType | null>(null);
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCategorySelect = (category: ReportType) => {
    setSelectedCategory(category);
    setError(null);
  };

  const validateForm = (): boolean => {
    if (!selectedCategory) {
      setError("通報の種類を選択してください");
      return false;
    }

    if (description.length < MIN_DESCRIPTION_LENGTH) {
      setError(`詳細は${MIN_DESCRIPTION_LENGTH}文字以上で入力してください`);
      return false;
    }

    if (description.length > MAX_DESCRIPTION_LENGTH) {
      setError(`詳細は${MAX_DESCRIPTION_LENGTH}文字以内で入力してください`);
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    if (!profileId || !selectedCategory) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await reportsService.createReport({
        reporterId: profileId,
        reportedUserId,
        reportedPostId,
        reportedMessageId,
        reportType: selectedCategory,
        description: description.trim(),
      });

      if (result.success) {
        Alert.alert(
          "通報完了",
          "通報を受け付けました。ご協力ありがとうございます。",
          [
            {
              text: "OK",
              onPress: () => navigation.goBack(),
            },
          ]
        );
      } else {
        setError(result.error || "通報の送信に失敗しました");
      }
    } catch (err: any) {
      setError(err.message || "通報の送信に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (description.length > 0 || selectedCategory) {
      Alert.alert(
        "通報をキャンセル",
        "入力内容が破棄されます。よろしいですか？",
        [
          { text: "続ける", style: "cancel" },
          {
            text: "キャンセル",
            style: "destructive",
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } else {
      navigation.goBack();
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancel} style={styles.headerButton}>
          <Ionicons name="close" size={24} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>通報</Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* User Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>通報対象</Text>
          <Text style={styles.userName}>{reportedUserName}</Text>
          {reportedPostId && (
            <Text style={styles.targetInfo}>投稿に関する通報</Text>
          )}
          {reportedMessageId && (
            <Text style={styles.targetInfo}>メッセージに関する通報</Text>
          )}
        </View>

        {/* Category Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>通報の種類 *</Text>
          <Text style={styles.sectionSubtitle}>
            最も適切な理由を選択してください
          </Text>

          {REPORT_CATEGORIES.map((category) => (
            <TouchableOpacity
              key={category.value}
              style={[
                styles.categoryItem,
                selectedCategory === category.value && styles.categoryItemSelected,
              ]}
              onPress={() => handleCategorySelect(category.value)}
              activeOpacity={0.7}
            >
              <View style={styles.categoryContent}>
                <Text
                  style={[
                    styles.categoryLabel,
                    selectedCategory === category.value &&
                      styles.categoryLabelSelected,
                  ]}
                >
                  {category.label}
                </Text>
                <Text style={styles.categoryDescription}>
                  {category.description}
                </Text>
              </View>
              <View
                style={[
                  styles.radioOuter,
                  selectedCategory === category.value && styles.radioOuterSelected,
                ]}
              >
                {selectedCategory === category.value && (
                  <View style={styles.radioInner} />
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>詳細 *</Text>
          <Text style={styles.sectionSubtitle}>
            問題の詳細を具体的に説明してください（{MIN_DESCRIPTION_LENGTH}〜
            {MAX_DESCRIPTION_LENGTH}文字）
          </Text>

          <TextInput
            style={styles.textInput}
            placeholder="具体的な内容を入力してください..."
            placeholderTextColor={Colors.gray[400]}
            value={description}
            onChangeText={(text) => {
              setDescription(text);
              setError(null);
            }}
            multiline
            maxLength={MAX_DESCRIPTION_LENGTH}
            textAlignVertical="top"
          />

          <Text style={styles.charCount}>
            {description.length} / {MAX_DESCRIPTION_LENGTH}
          </Text>
        </View>

        {/* Error Message */}
        {error && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={20} color={Colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Submit Button */}
        <TouchableOpacity
          style={[
            styles.submitButton,
            (!selectedCategory || description.length < MIN_DESCRIPTION_LENGTH) &&
              styles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={
            isSubmitting ||
            !selectedCategory ||
            description.length < MIN_DESCRIPTION_LENGTH
          }
          activeOpacity={0.8}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <Text style={styles.submitButtonText}>通報を送信</Text>
          )}
        </TouchableOpacity>

        {/* Privacy Notice */}
        <Text style={styles.privacyNotice}>
          通報者の情報は通報対象のユーザーに公開されません。
          虚偽の通報を繰り返した場合、アカウントが停止される場合があります。
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl * 2,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    marginBottom: Spacing.xs,
  },
  sectionSubtitle: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    marginBottom: Spacing.md,
  },
  userName: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
    color: Colors.text.primary,
  },
  targetInfo: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    marginTop: Spacing.xs,
  },
  categoryItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
  },
  categoryItemSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + "08",
  },
  categoryContent: {
    flex: 1,
  },
  categoryLabel: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
    color: Colors.text.primary,
    marginBottom: 2,
  },
  categoryLabelSelected: {
    color: Colors.primary,
  },
  categoryDescription: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.gray[300],
    alignItems: "center",
    justifyContent: "center",
    marginLeft: Spacing.md,
  },
  radioOuterSelected: {
    borderColor: Colors.primary,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.primary,
  },
  textInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    minHeight: 120,
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.primary,
  },
  charCount: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    textAlign: "right",
    marginTop: Spacing.xs,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.error + "15",
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  errorText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.error,
    marginLeft: Spacing.sm,
    flex: 1,
  },
  submitButton: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  submitButtonDisabled: {
    backgroundColor: Colors.gray[300],
  },
  submitButtonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.white,
  },
  privacyNotice: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.tertiary,
    textAlign: "center",
    lineHeight: Typography.fontSize.xs * 1.5,
  },
});

export default ReportScreen;
