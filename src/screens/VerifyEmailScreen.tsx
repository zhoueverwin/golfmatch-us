import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../constants/colors";
import AuthInput from "../components/AuthInput";
import Button from "../components/Button";
import { supabase } from "../services/supabase";
import { Typography } from "../constants/typography";

interface VerifyEmailScreenProps {
  email: string;
  onVerified: () => void;
  onBack: () => void;
}

const VerifyEmailScreen: React.FC<VerifyEmailScreenProps> = ({
  email,
  onVerified,
  onBack,
}) => {
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const handleVerifyOTP = async () => {
    if (otp.length !== 6) {
      Alert.alert("エラー", "6桁の確認コードを入力してください");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: "email",
      });

      if (error) {
        Alert.alert("確認エラー", error.message);
        return;
      }

      if (data.session) {
        Alert.alert("成功", "メールアドレスが確認されました！", [
          { text: "OK", onPress: onVerified },
        ]);
      }
    } catch (error) {
      Alert.alert(
        "エラー",
        error instanceof Error ? error.message : "確認に失敗しました"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    setResending(true);

    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
      });

      if (error) {
        Alert.alert("エラー", error.message);
        return;
      }

      Alert.alert("送信完了", "新しい確認コードを送信しました");
    } catch (error) {
      Alert.alert(
        "エラー",
        error instanceof Error ? error.message : "再送信に失敗しました"
      );
    } finally {
      setResending(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} testID="AUTH.VERIFY_EMAIL_SCREEN.ROOT">
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>メール確認</Text>
            <Text style={styles.subtitle}>
              {email} に送信された6桁の確認コードを入力してください
            </Text>
          </View>

          {/* OTP Input */}
          <AuthInput
            testID="AUTH.VERIFY_EMAIL_SCREEN.OTP_INPUT"
            label="確認コード"
            value={otp}
            onChangeText={setOtp}
            placeholder="123456"
            keyboardType="number-pad"
            maxLength={6}
            autoCapitalize="none"
            autoFocus={true}
            leftIcon="keypad"
          />

          {/* Verify Button */}
          <Button
            testID="AUTH.VERIFY_EMAIL_SCREEN.VERIFY_BTN"
            title="確認する"
            onPress={handleVerifyOTP}
            style={styles.verifyButton}
            disabled={loading || otp.length !== 6}
          />

          {/* Resend Link */}
          <View style={styles.resendContainer}>
            <Text style={styles.resendText}>コードを受信していませんか？</Text>
            <TouchableOpacity
              testID="AUTH.VERIFY_EMAIL_SCREEN.RESEND_BTN"
              onPress={handleResendOTP}
              disabled={resending}
              accessibilityRole="button"
            >
              <Text style={styles.resendLink}>
                {resending ? "送信中..." : "再送信"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Back Button */}
          <TouchableOpacity
            testID="AUTH.VERIFY_EMAIL_SCREEN.BACK_BTN"
            style={styles.backButton}
            onPress={onBack}
            accessibilityRole="button"
          >
            <Text style={styles.backButtonText}>ログイン画面に戻る</Text>
          </TouchableOpacity>
        </View>
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
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  header: {
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    fontFamily: Typography.getFontFamily("bold"),
    color: Colors.text.primary,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.text.secondary,
    lineHeight: 24,
  },
  verifyButton: {
    backgroundColor: Colors.primary,
    marginTop: 24,
  },
  resendContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
    gap: 8,
  },
  resendText: {
    fontSize: 14,
    color: Colors.text.secondary,
  },
  resendLink: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: "600",
  },
  backButton: {
    marginTop: 32,
    alignItems: "center",
    paddingVertical: 12,
  },
  backButtonText: {
    fontSize: 14,
    color: Colors.text.secondary,
  },
});

export default VerifyEmailScreen;


