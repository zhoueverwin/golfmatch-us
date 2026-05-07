import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
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

type AccountLinkingScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  "AccountLinking"
>;

interface ProviderInfo {
  provider: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  isLinked: boolean;
}

const PROVIDER_CONFIG: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  email: { label: "メールアドレス", icon: "mail", color: "#EA4335" },
  google: { label: "Google", icon: "logo-google", color: "#4285F4" },
  apple: { label: "Apple ID", icon: "logo-apple", color: "#000000" },
  line: { label: "LINE", icon: "chatbubble", color: "#06C755" },
};

const AccountLinkingScreen: React.FC = () => {
  const navigation = useNavigation<AccountLinkingScreenNavigationProp>();
  const { linkEmail, getUserIdentities } = useAuth();

  const [identities, setIdentities] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [isLinking, setIsLinking] = useState(false);

  const isEmailLinked = identities.some(
    (i) => i.provider === "email" && i.isLinked
  );

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isFormValid =
    emailRegex.test(email) &&
    password.length >= 8 &&
    password === passwordConfirm &&
    !isLinking;

  const fetchIdentities = useCallback(async () => {
    setLoading(true);
    const result = await getUserIdentities();
    if (result.success && result.identities) {
      const linkedProviders = new Set(
        result.identities.map((id: any) => id.provider)
      );
      const providers: ProviderInfo[] = Object.entries(PROVIDER_CONFIG).map(
        ([key, config]) => ({
          provider: key,
          label: config.label,
          icon: config.icon,
          color: config.color,
          isLinked: linkedProviders.has(key),
        })
      );
      setIdentities(providers);
    }
    setLoading(false);
  }, [getUserIdentities]);

  useEffect(() => {
    fetchIdentities();
  }, [fetchIdentities]);

  const handleLinkEmail = async () => {
    if (!emailRegex.test(email)) {
      Alert.alert("エラー", "有効なメールアドレスを入力してください");
      return;
    }
    if (password.length < 8) {
      Alert.alert("エラー", "パスワードは8文字以上で入力してください");
      return;
    }
    if (password !== passwordConfirm) {
      Alert.alert("エラー", "パスワードが一致しません");
      return;
    }

    setIsLinking(true);
    const result = await linkEmail(email, password);
    setIsLinking(false);

    if (result.success) {
      Alert.alert(
        "連携完了",
        "メールアドレスの連携が完了しました。次回からメールアドレスとパスワードでもログインできます。",
        [{ text: "OK", onPress: () => { fetchIdentities(); setEmail(""); setPassword(""); setPasswordConfirm(""); } }]
      );
    } else {
      Alert.alert("エラー", result.error || "メールアドレスの連携に失敗しました");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StandardHeader
        title="アカウント連携"
        showBackButton={true}
        onBackPress={() => navigation.goBack()}
      />
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* 連携状況 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>現在の連携状況</Text>
            {loading ? (
              <ActivityIndicator
                color={Colors.primary}
                style={{ paddingVertical: Spacing.lg }}
              />
            ) : (
              identities.map((provider) => (
                <View key={provider.provider} style={styles.providerRow}>
                  <View style={[styles.providerIcon, { backgroundColor: provider.color + "15" }]}>
                    <Ionicons
                      name={provider.icon}
                      size={20}
                      color={provider.color}
                    />
                  </View>
                  <Text style={styles.providerLabel}>{provider.label}</Text>
                  {provider.isLinked ? (
                    <View style={styles.linkedBadge}>
                      <Ionicons
                        name="checkmark-circle"
                        size={18}
                        color={Colors.primary}
                      />
                      <Text style={styles.linkedText}>連携済み</Text>
                    </View>
                  ) : (
                    <Text style={styles.unlinkedText}>未連携</Text>
                  )}
                </View>
              ))
            )}
          </View>

          {/* メール連携フォーム */}
          {!isEmailLinked && !loading && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>メールアドレスを連携</Text>
              <Text style={styles.description}>
                メールアドレスとパスワードを設定すると、メールアドレスでもログインできるようになります。
              </Text>

              <Text style={styles.inputLabel}>メールアドレス</Text>
              <TextInput
                style={styles.input}
                placeholder="example@email.com"
                placeholderTextColor={Colors.gray[400]}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isLinking}
              />

              <Text style={styles.inputLabel}>パスワード（8文字以上）</Text>
              <TextInput
                style={styles.input}
                placeholder="パスワードを入力"
                placeholderTextColor={Colors.gray[400]}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                textContentType="newPassword"
                autoComplete="new-password"
                editable={!isLinking}
              />

              <Text style={styles.inputLabel}>パスワード（確認）</Text>
              <TextInput
                style={styles.input}
                placeholder="パスワードを再入力"
                placeholderTextColor={Colors.gray[400]}
                value={passwordConfirm}
                onChangeText={setPasswordConfirm}
                secureTextEntry
                textContentType="newPassword"
                autoComplete="new-password"
                editable={!isLinking}
              />

              {password.length > 0 && password.length < 8 && (
                <Text style={styles.validationError}>
                  パスワードは8文字以上で入力してください
                </Text>
              )}
              {passwordConfirm.length > 0 && password !== passwordConfirm && (
                <Text style={styles.validationError}>
                  パスワードが一致しません
                </Text>
              )}

              <View style={styles.buttonContainer}>
                <View
                  style={[
                    styles.linkButton,
                    !isFormValid && styles.linkButtonDisabled,
                  ]}
                >
                  {isLinking ? (
                    <ActivityIndicator color={Colors.white} />
                  ) : (
                    <Text
                      style={styles.linkButtonText}
                      onPress={isFormValid ? handleLinkEmail : undefined}
                    >
                      連携する
                    </Text>
                  )}
                </View>
              </View>
            </View>
          )}

          {/* 連携済みメッセージ */}
          {isEmailLinked && !loading && (
            <View style={styles.section}>
              <View style={styles.completedContainer}>
                <Ionicons
                  name="checkmark-circle"
                  size={48}
                  color={Colors.primary}
                />
                <Text style={styles.completedText}>
                  メールアドレスは連携済みです
                </Text>
                <Text style={styles.completedSubtext}>
                  メールアドレスとパスワードでログインできます
                </Text>
              </View>
            </View>
          )}
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
  section: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: 16,
    marginBottom: Spacing.lg,
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
  providerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  providerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  providerLabel: {
    fontSize: 15,
    fontWeight: "500",
    fontFamily: Typography.getFontFamily("500"),
    color: Colors.text.primary,
    flex: 1,
  },
  linkedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  linkedText: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: "500",
    fontFamily: Typography.getFontFamily("500"),
  },
  unlinkedText: {
    fontSize: 14,
    color: Colors.text.secondary,
  },
  description: {
    fontSize: 14,
    color: Colors.text.secondary,
    lineHeight: 22,
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "500",
    fontFamily: Typography.getFontFamily("500"),
    color: Colors.text.primary,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    fontSize: 16,
    color: Colors.text.primary,
  },
  validationError: {
    fontSize: 13,
    color: Colors.error,
    marginTop: 6,
  },
  buttonContainer: {
    marginTop: 20,
  },
  linkButton: {
    backgroundColor: Colors.primary,
    padding: 16,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  linkButtonDisabled: {
    backgroundColor: Colors.gray[300],
  },
  linkButtonText: {
    fontSize: 16,
    fontWeight: "600",
    fontFamily: Typography.getFontFamily("600"),
    color: Colors.white,
  },
  completedContainer: {
    alignItems: "center",
    paddingVertical: Spacing.lg,
  },
  completedText: {
    fontSize: 16,
    fontWeight: "600",
    fontFamily: Typography.getFontFamily("600"),
    color: Colors.text.primary,
    marginTop: 12,
  },
  completedSubtext: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginTop: 6,
  },
});

export default AccountLinkingScreen;
