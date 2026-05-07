import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  Dimensions,
  Linking,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { Colors } from "../constants/colors";
import { Typography } from "../constants/typography";
import { useAuth } from "../contexts/AuthContext";
import Loading from "../components/Loading";
import { RootStackParamList } from "../types";

const { width } = Dimensions.get("window");

type AuthScreenNavigationProp = StackNavigationProp<RootStackParamList, "Auth">;

const AuthScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<AuthScreenNavigationProp>();
  const {
    signInWithGoogle,
    signInWithApple,
    signInWithLine,
    loading,
    user,
  } = useAuth();

  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthProvider, setOauthProvider] = useState<"google" | "apple" | "line" | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Clear OAuth loading when user becomes authenticated
  useEffect(() => {
    if (user && oauthLoading) {
      setOauthLoading(false);
      setOauthProvider(null);
    }
  }, [user, oauthLoading]);

  const handleLineAuth = async () => {
    try {
      // Try to use the LINE SDK if available
      const lineModule = require("@xmartlabs/react-native-line");
      const LineLogin = lineModule.default;
      setErrors({});
      setOauthLoading(true);
      setOauthProvider("line");

      // Initialize LINE SDK with channel ID before login
      await LineLogin.setup({ channelId: "2009230449" });

      const loginResult = await LineLogin.login({
        scopes: ["profile", "openid", "email"],
      });
      const accessToken = loginResult?.accessToken?.accessToken;
      const idToken = loginResult?.accessToken?.idToken;

      if (!accessToken) {
        setOauthLoading(false);
        setOauthProvider(null);
        return;
      }

      const result = await signInWithLine(accessToken, idToken);
      if (!result.success) {
        setErrors({
          general: result.error || "LINEログインに失敗しました。もう一度お試しください。",
        });
        setOauthLoading(false);
        setOauthProvider(null);
      }
    } catch (error: any) {
      if (error?.code === "MODULE_NOT_FOUND" || error?.message?.includes("Cannot find module")) {
        Alert.alert("準備中", "LINE認証は近日対応予定です");
      } else if (error?.code === "CANCEL" || error?.message?.includes("cancel")) {
        // User cancelled LINE login
      } else {
        console.error("[AuthScreen] LINE auth error:", error);
        setErrors({
          general: "LINEログインに失敗しました。もう一度お試しください。",
        });
      }
      setOauthLoading(false);
      setOauthProvider(null);
    }
  };

  const handleAppleAuth = async () => {
    setErrors({});
    setOauthLoading(true);
    setOauthProvider("apple");

    try {
      const result = await signInWithApple();
      if (!result.success) {
        setErrors({
          general: result.error || "Appleログインに失敗しました。もう一度お試しください。",
        });
        setOauthLoading(false);
        setOauthProvider(null);
      }
    } catch (error) {
      setOauthLoading(false);
      setOauthProvider(null);
    }
  };

  const handleGoogleAuth = async () => {
    console.log("🔵 [AuthScreen] Google auth button pressed");
    setErrors({});
    setOauthLoading(true);
    setOauthProvider("google");

    try {
      console.log("🔄 [AuthScreen] Calling signInWithGoogle...");
      const result = await signInWithGoogle();
      console.log("📊 [AuthScreen] signInWithGoogle result:", result);

      if (!result.success) {
        console.log("❌ [AuthScreen] Google auth failed:", result.error);
        setErrors({
          general: result.error || "Googleログインに失敗しました。もう一度お試しください。",
        });
        setOauthLoading(false);
        setOauthProvider(null);
      } else {
        console.log("✅ [AuthScreen] Google auth succeeded");
      }
    } catch (error) {
      console.log("💥 [AuthScreen] Google auth exception:", error);
      setOauthLoading(false);
      setOauthProvider(null);
    }
  };

  const handleEmailAuth = () => {
    navigation.navigate("EmailAuth");
  };

  if (loading || oauthLoading) {
    const loadingMessage = oauthProvider === "google"
      ? "Googleアカウントで認証中..."
      : oauthProvider === "apple"
      ? "Appleアカウントで認証中..."
      : oauthProvider === "line"
      ? "LINEアカウントで認証中..."
      : undefined;

    return (
      <Loading
        fullScreen
        text={loadingMessage}
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
        testID="AUTH.LANDING_SCREEN.ROOT"
        edges={["top", "bottom"]}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Logo Section */}
          <View style={styles.logoSection}>
            <Image
              source={require("../../assets/images/welcome/GolfMatch-GetStarted-Logo.png")}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={styles.tagline}>ゴルフで始まる、新しい出会い。</Text>
          </View>

          {/* Error Display */}
          {errors.general && (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={20} color={Colors.error} />
              <Text style={styles.errorText}>{errors.general}</Text>
            </View>
          )}

          {/* Social Login Buttons */}
          <View style={styles.buttonsSection}>
            {/* LINE Button */}
            <TouchableOpacity
              style={styles.lineButton}
              onPress={handleLineAuth}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="LINEでサインイン"
            >
              <View style={styles.lineIconContainer}>
                <Text style={styles.lineIconText}>LINE</Text>
              </View>
              <Text style={styles.lineButtonText}>LINEでサインイン</Text>
            </TouchableOpacity>

            {/* Apple Button */}
            <TouchableOpacity
              style={styles.socialButton}
              onPress={handleAppleAuth}
              disabled={oauthLoading}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Appleでサインイン"
            >
              <View style={styles.buttonIconContainer}>
                <Ionicons name="logo-apple" size={22} color="#000000" />
              </View>
              <Text style={styles.socialButtonText}>Appleでサインイン</Text>
            </TouchableOpacity>

            {/* Google Button */}
            <TouchableOpacity
              style={styles.socialButton}
              onPress={handleGoogleAuth}
              disabled={oauthLoading}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Googleでサインイン"
            >
              <View style={styles.buttonIconContainer}>
                <Ionicons name="logo-google" size={22} color="#DB4437" />
              </View>
              <Text style={styles.socialButtonText}>Googleでサインイン</Text>
            </TouchableOpacity>

            {/* Email Button */}
            <TouchableOpacity
              style={styles.emailButton}
              onPress={handleEmailAuth}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="メールアドレスでサインイン"
            >
              <View style={styles.buttonIconContainer}>
                <Ionicons name="mail-outline" size={22} color={Colors.white} />
              </View>
              <Text style={styles.emailButtonText}>メールアドレスでサインイン</Text>
            </TouchableOpacity>
          </View>

          {/* Age Notice */}
          <Text style={styles.ageNotice}>
            18歳未満の方は、ご登録いただけません。
          </Text>

          {/* Footer */}
          <View style={styles.footer}>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 32,
    justifyContent: "center",
    paddingVertical: 24,
  },

  // Logo Section
  logoSection: {
    alignItems: "center",
    marginBottom: 40,
  },
  logoImage: {
    width: width * 0.5,
    height: 45,
    marginBottom: 16,
  },
  tagline: {
    fontSize: Typography.fontSize.lg,
    fontFamily: Typography.getFontFamily("500"),
    color: Colors.text.secondary,
    fontWeight: "500",
  },

  // Error Display
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.2)",
  },
  errorText: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.error,
    marginLeft: 8,
    lineHeight: 20,
  },

  // Buttons Section
  buttonsSection: {
    gap: 12,
    marginBottom: 24,
  },

  // LINE Button
  lineButton: {
    height: 56,
    borderRadius: 28,
    backgroundColor: "#06C755",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  lineIconText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  lineButtonText: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.getFontFamily("600"),
    fontWeight: "600",
    color: "#FFFFFF",
  },

  // Apple & Google Buttons
  socialButton: {
    height: 56,
    borderRadius: 28,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  socialButtonText: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.getFontFamily("600"),
    fontWeight: "600",
    color: Colors.text.primary,
  },

  // Email Button
  emailButton: {
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  emailButtonText: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.getFontFamily("600"),
    fontWeight: "600",
    color: "#FFFFFF",
  },

  // Shared button icon container (positioned absolutely on left)
  buttonIconContainer: {
    position: "absolute",
    left: 20,
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  lineIconContainer: {
    position: "absolute",
    left: 16,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },

  // Age Notice
  ageNotice: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.tertiary,
    textAlign: "center",
    marginBottom: 24,
  },

  // Footer
  footer: {
    alignItems: "center",
    gap: 12,
  },
  termsText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  linkText: {
    color: Colors.primary,
    textDecorationLine: "underline",
  },
});

export default AuthScreen;
