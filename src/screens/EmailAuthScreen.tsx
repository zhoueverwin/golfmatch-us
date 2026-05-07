import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Dimensions,
  Linking,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { Colors } from "../constants/colors";
import { Typography } from "../constants/typography";
import { useAuth } from "../contexts/AuthContext";
import AuthInput from "../components/AuthInput";
import Button from "../components/Button";
import Loading from "../components/Loading";
import VerifyEmailScreen from "./VerifyEmailScreen";
import { supabase } from "../services/supabase";

const { width } = Dimensions.get("window");

type AuthMode = "login" | "signup" | "verify";

const EmailAuthScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const {
    signInWithEmail,
    signUpWithEmail,
    loading,
  } = useAuth();

  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState("");
  const [showEmailNotConfirmed, setShowEmailNotConfirmed] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  const handleResendVerification = async () => {
    if (!email) return;

    setResendingVerification(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email,
      });

      if (error) {
        Alert.alert("エラー", error.message);
      } else {
        setPendingVerificationEmail(email);
        setMode("verify");
        setShowEmailNotConfirmed(false);
        setErrors({});
      }
    } catch (error) {
      Alert.alert(
        "エラー",
        error instanceof Error ? error.message : "再送信に失敗しました"
      );
    } finally {
      setResendingVerification(false);
    }
  };

  const validateEmail = (emailValue: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(emailValue);
  };

  const validatePassword = (passwordValue: string): boolean => {
    return passwordValue.length >= 6;
  };

  const handleAuth = async () => {
    if (authLoading) return;

    const newErrors: Record<string, string> = {};

    if (!validateEmail(email)) {
      newErrors.email = "有効なメールアドレスを入力してください";
    }

    if (!validatePassword(password)) {
      newErrors.password = "パスワードは6文字以上である必要があります";
    }

    if (mode === "signup" && password !== confirmPassword) {
      newErrors.confirmPassword = "パスワードが一致しません";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setAuthLoading(true);

    try {
      if (mode === "login") {
        const result = await signInWithEmail(email, password);
        if (!result.success) {
          if (result.error === "EMAIL_NOT_CONFIRMED") {
            setShowEmailNotConfirmed(true);
            setErrors({
              general: "メールアドレスの確認が完了していません。確認コードを再送信してください。",
            });
          } else {
            setShowEmailNotConfirmed(false);
            setErrors({
              general: result.error || "ログインに失敗しました。もう一度お試しください。",
            });
          }
        }
      } else {
        const result = await signUpWithEmail(email, password);
        if (__DEV__) {
          console.log("📊 [EmailAuthScreen] Signup result:", {
            success: result.success,
            hasError: !!result.error,
            error: result.error,
          });
        }
        if (result.success) {
          if (result.error) {
            setPendingVerificationEmail(email);
            setMode("verify");
          } else {
            Alert.alert("登録成功", "アカウントが作成されました！");
          }
        } else {
          if (__DEV__) {
            console.log("❌ [EmailAuthScreen] Setting signup error:", result.error);
          }
          setErrors({
            general: result.error || "登録に失敗しました。もう一度お試しください。",
          });
        }
      }
    } finally {
      setAuthLoading(false);
    }
  };

  if (loading) {
    return <Loading fullScreen />;
  }

  // Show verification screen if email needs to be verified
  if (mode === "verify" && pendingVerificationEmail) {
    return (
      <VerifyEmailScreen
        email={pendingVerificationEmail}
        onVerified={() => {
          setMode("login");
          setPendingVerificationEmail("");
          Alert.alert("確認完了", "ログインできます");
        }}
        onBack={() => {
          setMode("login");
          setPendingVerificationEmail("");
        }}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* Background Gradient */}
      <LinearGradient
        colors={[
          "rgba(255, 255, 255, 1)",
          "rgba(156, 255, 252, 0.75)",
          "rgba(0, 184, 177, 0.5)",
        ]}
        locations={[0, 0.5, 1]}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.backgroundGradient}
      />

      <SafeAreaView
        style={styles.safeArea}
        testID={mode === "login" ? "AUTH.EMAIL_LOGIN_SCREEN.ROOT" : "AUTH.EMAIL_SIGNUP_SCREEN.ROOT"}
        edges={["bottom"]}
      >
        <KeyboardAvoidingView
          style={styles.keyboardAvoidingView}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          {/* Header with back button */}
          <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
              accessibilityRole="button"
              accessibilityLabel="戻る"
            >
              <Ionicons name="chevron-back" size={28} color={Colors.text.primary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>メールアドレスでサインイン</Text>
            <View style={styles.headerSpacer} />
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={Keyboard.dismiss}
          >
            {/* Tab Switcher */}
            <View style={styles.tabContainer}>
              <TouchableOpacity
                testID="AUTH.EMAIL.TAB.LOGIN"
                style={[styles.tab, mode === "login" && styles.activeTab]}
                onPress={() => {
                  setMode("login");
                  setErrors({});
                  setConfirmPassword("");
                }}
                accessibilityRole="button"
                accessibilityLabel="ログインタブ"
              >
                <Text style={[styles.tabText, mode === "login" && styles.activeTabText]}>
                  ログイン
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="AUTH.EMAIL.TAB.SIGNUP"
                style={[styles.tab, mode === "signup" && styles.activeTab]}
                onPress={() => {
                  setMode("signup");
                  setErrors({});
                }}
                accessibilityRole="button"
                accessibilityLabel="新規登録タブ"
              >
                <Text style={[styles.tabText, mode === "signup" && styles.activeTabText]}>
                  新規登録
                </Text>
              </TouchableOpacity>
            </View>

            {/* Form Section */}
            <View style={styles.formSection}>
              {/* General Error Message */}
              {errors.general && (
                <View style={styles.errorContainer}>
                  <View style={styles.errorRow}>
                    <Ionicons name="alert-circle" size={20} color={Colors.error} />
                    <Text style={styles.errorText}>{errors.general}</Text>
                  </View>
                  {showEmailNotConfirmed && (
                    <TouchableOpacity
                      style={styles.resendVerificationButton}
                      onPress={handleResendVerification}
                      disabled={resendingVerification}
                      accessibilityRole="button"
                      accessibilityLabel="確認コードを再送信"
                    >
                      <Ionicons name="mail-outline" size={18} color={Colors.primary} />
                      <Text style={styles.resendVerificationText}>
                        {resendingVerification ? "送信中..." : "確認コードを再送信する"}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              <AuthInput
                testID={`AUTH.EMAIL_${mode.toUpperCase()}_SCREEN.EMAIL_INPUT`}
                label="メールアドレス"
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  if (errors.general) {
                    const { general, ...rest } = errors;
                    setErrors(rest);
                  }
                }}
                placeholder="example@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
                leftIcon="mail"
                error={errors.email}
              />

              <AuthInput
                testID={`AUTH.EMAIL_${mode.toUpperCase()}_SCREEN.PASSWORD_INPUT`}
                label="パスワード"
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  if (errors.general) {
                    const { general, ...rest } = errors;
                    setErrors(rest);
                  }
                }}
                placeholder="6文字以上"
                isPassword
                showPassword={showPassword}
                onTogglePassword={() => setShowPassword(!showPassword)}
                leftIcon="lock-closed"
                error={errors.password}
              />

              {mode === "signup" && (
                <AuthInput
                  testID="AUTH.EMAIL_SIGNUP_SCREEN.CONFIRM_PASSWORD_INPUT"
                  label="パスワード確認"
                  value={confirmPassword}
                  onChangeText={(text) => {
                    setConfirmPassword(text);
                    if (errors.confirmPassword) {
                      const { confirmPassword: _, ...rest } = errors;
                      setErrors(rest);
                    }
                  }}
                  placeholder="パスワードを再入力"
                  isPassword
                  showPassword={showConfirmPassword}
                  onTogglePassword={() => setShowConfirmPassword(!showConfirmPassword)}
                  leftIcon="lock-closed"
                  error={errors.confirmPassword}
                />
              )}

              <Button
                testID={`AUTH.EMAIL_${mode.toUpperCase()}_SCREEN.SUBMIT_BTN`}
                title={mode === "login" ? "ログイン" : "登録する"}
                onPress={handleAuth}
                style={styles.primaryButton}
                textStyle={styles.buttonText}
                disabled={loading || authLoading || !email.trim() || !password.trim() || (mode === "signup" && !confirmPassword.trim())}
              />

              {/* Terms */}
              <Text style={styles.termsText}>
                続行することで、
                <Text
                  style={styles.linkText}
                  onPress={() => Linking.openURL("https://www.golfmatch.info/?page=termsofuse-jp")}
                >
                  利用規約
                </Text>
                と
                <Text
                  style={styles.linkText}
                  onPress={() => Linking.openURL("https://www.golfmatch.info/?page=privacypolicy-jp")}
                >
                  プライバシーポリシー
                </Text>
                に同意したことになります。
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  backgroundGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  safeArea: {
    flex: 1,
  },
  keyboardAvoidingView: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: Typography.fontSize.lg,
    fontFamily: Typography.getFontFamily("600"),
    fontWeight: "600",
    color: Colors.text.primary,
    textAlign: "center",
  },
  headerSpacer: {
    width: 40,
  },

  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },

  // Tab Switcher
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.7)",
    borderRadius: 12,
    padding: 4,
    marginBottom: 32,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  activeTab: {
    backgroundColor: Colors.white,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  tabText: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.getFontFamily("600"),
    color: Colors.text.secondary,
    fontWeight: "600",
  },
  activeTabText: {
    color: Colors.primary,
  },

  // Form Section
  formSection: {
    flex: 1,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    marginTop: 16,
    marginBottom: 20,
  },
  buttonText: {
    color: Colors.white,
    fontWeight: "600",
  },

  // Error Container
  errorContainer: {
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.2)",
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  errorText: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.error,
    marginLeft: 8,
    lineHeight: 20,
  },
  resendVerificationButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: "rgba(0, 184, 177, 0.1)",
    borderRadius: 8,
    gap: 8,
  },
  resendVerificationText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.getFontFamily("600"),
    color: Colors.primary,
    fontWeight: "600",
  },

  // Terms
  termsText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    textAlign: "center",
    lineHeight: 18,
    marginTop: 8,
    paddingHorizontal: 8,
  },
  linkText: {
    color: Colors.primary,
    textDecorationLine: "underline",
  },
});

export default EmailAuthScreen;
