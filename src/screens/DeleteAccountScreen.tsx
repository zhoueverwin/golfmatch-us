import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { Colors } from "../constants/colors";
import { Spacing, BorderRadius } from "../constants/spacing";
import { Typography } from "../constants/typography";
import { RootStackParamList } from "../types";
import { useAuth } from "../contexts/AuthContext";
import StandardHeader from "../components/StandardHeader";

type DeleteAccountScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  "DeleteAccount"
>;

const WITHDRAWAL_REASONS = [
  { code: "found_partner_here", label: "このアプリでゴルフ仲間が見つかった" },
  { code: "found_partner_other", label: "他のサービスでゴルフ仲間が見つかった" },
  { code: "no_matches", label: "マッチングしない・仲間が見つからない" },
  { code: "no_preferred_users", label: "近くにゴルフ仲間がいない" },
  { code: "too_expensive", label: "料金が高い" },
  { code: "hard_to_use", label: "使い方がわからない・使いにくい" },
  { code: "not_playing_golf", label: "ゴルフをする機会が減った" },
  { code: "privacy_concern", label: "プライバシーが心配" },
  { code: "taking_break", label: "しばらく休みたい" },
  { code: "other", label: "その他（自由入力）" },
] as const;

const DeleteAccountScreen: React.FC = () => {
  const navigation = useNavigation<DeleteAccountScreenNavigationProp>();
  const { deleteAccount } = useAuth();
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [otherReasonText, setOtherReasonText] = useState("");
  const scrollViewRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);

  const CONFIRM_WORD = "退会する";

  const isReasonValid =
    selectedReason !== null &&
    (selectedReason !== "other" || otherReasonText.trim().length > 0);

  const canDelete = isReasonValid && confirmText === CONFIRM_WORD && !isDeleting;

  const handleInputFocus = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const handleDeleteAccount = async () => {
    if (confirmText !== CONFIRM_WORD) {
      Alert.alert(
        "確認",
        `「${CONFIRM_WORD}」と入力してください`,
        [{ text: "OK" }]
      );
      return;
    }

    const reasonDetail =
      selectedReason === "other" ? otherReasonText.trim() : null;

    Alert.alert(
      "最終確認",
      "本当にアカウントを削除しますか？\n\nこの操作は取り消せません。すべてのデータが完全に削除されます。",
      [
        {
          text: "キャンセル",
          style: "cancel",
        },
        {
          text: "削除する",
          style: "destructive",
          onPress: async () => {
            setIsDeleting(true);
            try {
              const result = await deleteAccount(
                selectedReason || "unknown",
                reasonDetail ?? undefined,
              );
              if (!result.success) {
                Alert.alert(
                  "エラー",
                  result.error || "アカウントの削除に失敗しました",
                  [{ text: "OK" }]
                );
              }
            } catch (error) {
              Alert.alert(
                "エラー",
                "アカウントの削除に失敗しました。しばらくしてからもう一度お試しください。",
                [{ text: "OK" }]
              );
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StandardHeader
        title="退会"
        showBackButton={true}
        onBackPress={() => navigation.goBack()}
      />
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
        <View style={styles.warningSection}>
          <View style={styles.warningIconContainer}>
            <Ionicons name="warning" size={48} color={Colors.error} />
          </View>
          <Text style={styles.warningTitle}>アカウントを削除しますか？</Text>
          <Text style={styles.warningDescription}>
            アカウントを削除すると、以下のデータがすべて削除されます。この操作は取り消すことができません。
          </Text>
        </View>

        <View style={styles.dataListSection}>
          <Text style={styles.sectionTitle}>削除されるデータ</Text>
          <View style={styles.dataItem}>
            <Ionicons name="person" size={20} color={Colors.text.secondary} />
            <Text style={styles.dataItemText}>プロフィール情報</Text>
          </View>
          <View style={styles.dataItem}>
            <Ionicons name="heart" size={20} color={Colors.text.secondary} />
            <Text style={styles.dataItemText}>いいね・マッチング履歴</Text>
          </View>
          <View style={styles.dataItem}>
            <Ionicons name="chatbubbles" size={20} color={Colors.text.secondary} />
            <Text style={styles.dataItemText}>メッセージ履歴</Text>
          </View>
          <View style={styles.dataItem}>
            <Ionicons name="images" size={20} color={Colors.text.secondary} />
            <Text style={styles.dataItemText}>投稿・写真</Text>
          </View>
          <View style={styles.dataItem}>
            <Ionicons name="calendar" size={20} color={Colors.text.secondary} />
            <Text style={styles.dataItemText}>カレンダー・予定</Text>
          </View>
          <View style={styles.dataItem}>
            <Ionicons name="notifications" size={20} color={Colors.text.secondary} />
            <Text style={styles.dataItemText}>通知設定・履歴</Text>
          </View>
        </View>

        <View style={styles.reasonSection}>
          <Text style={styles.sectionTitle}>退会理由を選んでください</Text>
          {WITHDRAWAL_REASONS.map((reason) => (
            <TouchableOpacity
              key={reason.code}
              style={styles.reasonItem}
              onPress={() => setSelectedReason(reason.code)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.radioOuter,
                  selectedReason === reason.code && styles.radioOuterSelected,
                ]}
              >
                {selectedReason === reason.code && (
                  <View style={styles.radioInner} />
                )}
              </View>
              <Text style={styles.reasonLabel}>{reason.label}</Text>
            </TouchableOpacity>
          ))}
          {selectedReason === "other" && (
            <TextInput
              style={styles.otherReasonInput}
              placeholder="退会理由を入力してください"
              placeholderTextColor={Colors.gray[400]}
              value={otherReasonText}
              onChangeText={setOtherReasonText}
              multiline
              maxLength={500}
              editable={!isDeleting}
              onFocus={handleInputFocus}
            />
          )}
        </View>

        <View style={styles.confirmSection}>
          <Text style={styles.confirmLabel}>
            退会を確認するには「{CONFIRM_WORD}」と入力してください
          </Text>
          <TextInput
            ref={inputRef}
            style={styles.confirmInput}
            placeholder={CONFIRM_WORD}
            placeholderTextColor={Colors.gray[400]}
            value={confirmText}
            onChangeText={setConfirmText}
            editable={!isDeleting}
            onFocus={handleInputFocus}
          />
        </View>

        <View style={styles.buttonSection}>
          <TouchableOpacity
            style={[
              styles.deleteButton,
              !canDelete && styles.deleteButtonDisabled,
            ]}
            onPress={handleDeleteAccount}
            disabled={!canDelete}
          >
            {isDeleting ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <>
                <Ionicons name="trash" size={20} color={Colors.white} />
                <Text style={styles.deleteButtonText}>アカウントを削除</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => navigation.goBack()}
            disabled={isDeleting}
          >
            <Text style={styles.cancelButtonText}>キャンセル</Text>
          </TouchableOpacity>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: 40,
  },
  warningSection: {
    alignItems: "center",
    marginBottom: 32,
  },
  warningIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.error + "15",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  warningTitle: {
    fontSize: 20,
    fontWeight: "700",
    fontFamily: Typography.getFontFamily("700"),
    color: Colors.text.primary,
    marginBottom: 12,
    textAlign: "center",
  },
  warningDescription: {
    fontSize: 14,
    color: Colors.text.secondary,
    textAlign: "center",
    lineHeight: 22,
  },
  dataListSection: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    fontFamily: Typography.getFontFamily("600"),
    color: Colors.text.primary,
    marginBottom: 16,
  },
  dataItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  dataItemText: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginLeft: 12,
  },
  reasonSection: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  reasonItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.gray[300],
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
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
  reasonLabel: {
    fontSize: 14,
    color: Colors.text.primary,
    flex: 1,
  },
  otherReasonInput: {
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    fontSize: 14,
    color: Colors.text.primary,
    marginTop: 12,
    minHeight: 80,
    textAlignVertical: "top",
  },
  confirmSection: {
    marginBottom: 24,
  },
  confirmLabel: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginBottom: 8,
  },
  confirmInput: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    fontSize: 16,
    color: Colors.text.primary,
  },
  buttonSection: {
    gap: 12,
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.error,
    padding: 16,
    borderRadius: BorderRadius.lg,
    gap: 8,
  },
  deleteButtonDisabled: {
    backgroundColor: Colors.gray[300],
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: "600",
    fontFamily: Typography.getFontFamily("600"),
    color: Colors.white,
  },
  cancelButton: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    fontFamily: Typography.getFontFamily("600"),
    color: Colors.text.secondary,
  },
});

export default DeleteAccountScreen;
