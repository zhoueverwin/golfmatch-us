import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Dimensions,
  Linking,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../constants/colors";
import { Typography } from "../constants/typography";
import { useAuth } from "../contexts/AuthContext";
import Loading from "../components/Loading";

const { width } = Dimensions.get("window");

const AuthScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const {
    signInWithGoogle,
    signInWithApple,
    loading,
    user,
  } = useAuth();

  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthProvider, setOauthProvider] = useState<"google" | "apple" | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Clear OAuth loading when user becomes authenticated
  useEffect(() => {
    if (user && oauthLoading) {
      setOauthLoading(false);
      setOauthProvider(null);
    }
  }, [user, oauthLoading]);

  const handleAppleAuth = async () => {
    setErrors({});
    setOauthLoading(true);
    setOauthProvider("apple");

    try {
      const result = await signInWithApple();
      if (!result.success) {
        setErrors({
          general: result.error || "Apple sign-in failed. Please try again.",
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
          general: result.error || "Google sign-in failed. Please try again.",
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

  if (loading || oauthLoading) {
    const loadingMessage = oauthProvider === "google"
      ? "Signing in with Google..."
      : oauthProvider === "apple"
      ? "Signing in with Apple..."
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
            <Text style={styles.tagline}>New connections that start with golf.</Text>
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
            {/* Apple Button */}
            <TouchableOpacity
              style={styles.socialButton}
              onPress={handleAppleAuth}
              disabled={oauthLoading}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Continue with Apple"
            >
              <View style={styles.buttonIconContainer}>
                <Ionicons name="logo-apple" size={22} color="#000000" />
              </View>
              <Text style={styles.socialButtonText}>Continue with Apple</Text>
            </TouchableOpacity>

            {/* Google Button */}
            <TouchableOpacity
              style={styles.socialButton}
              onPress={handleGoogleAuth}
              disabled={oauthLoading}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Continue with Google"
            >
              <View style={styles.buttonIconContainer}>
                <Ionicons name="logo-google" size={22} color="#DB4437" />
              </View>
              <Text style={styles.socialButtonText}>Continue with Google</Text>
            </TouchableOpacity>
          </View>

          {/* Age Notice */}
          <Text style={styles.ageNotice}>
            You must be 18 or older to sign up.
          </Text>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.termsText}>
              By continuing, you agree to our{" "}
              <Text
                style={styles.linkText}
                onPress={() => Linking.openURL("https://www.golfmatch.info/?page=termsofuse-jp")}
              >
                Terms of Service
              </Text>
              {" "}and{" "}
              <Text
                style={styles.linkText}
                onPress={() => Linking.openURL("https://www.golfmatch.info/?page=privacypolicy-jp")}
              >
                Privacy Policy
              </Text>
              .
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

  // Shared button icon container (positioned absolutely on left)
  buttonIconContainer: {
    position: "absolute",
    left: 20,
    width: 22,
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
