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
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { RootStackParamList } from "../types";
import Loading from "../components/Loading";

type Nav = StackNavigationProp<RootStackParamList>;

const { width } = Dimensions.get("window");

const AuthScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
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
          {/* Logo + tagline section — kicker for ceremony, logo for brand,
              Fraunces italic tagline + Manrope subtitle for encouraging,
              warm framing that matches the paywall + onboarding language. */}
          <View style={styles.logoSection}>
            <Text style={styles.kicker}>WELCOME</Text>
            <Image
              source={require("../../assets/images/welcome/GolfMatch-GetStarted-Logo.png")}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={styles.tagline}>
              Single golfers near you are ready to play.
            </Text>
            <Text style={styles.subtitle}>
              Sign in or sign up to find your next round.
            </Text>
          </View>

          {/* Error Display */}
          {errors.general && (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={20} color={Colors.error} />
              <Text style={styles.errorText}>{errors.general}</Text>
            </View>
          )}

          {/* Social Login Buttons — Apple (black) + Google (white) form a
              visually paired social-auth set; "or" divider; Email (ink with
              gold text) closes the section with the same heavyweight CTA
              language used on the paywall. Three differentiated buttons
              break the monotone-pill-stack feel of the old design. */}
          <View style={styles.buttonsSection}>
            {/* Apple Button — Apple HIG black variant */}
            <TouchableOpacity
              style={[styles.socialButton, styles.appleButton]}
              onPress={handleAppleAuth}
              disabled={oauthLoading}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Continue with Apple"
            >
              <View style={styles.buttonIconContainer}>
                <Ionicons name="logo-apple" size={22} color="#FFFFFF" />
              </View>
              <Text style={[styles.socialButtonText, styles.appleButtonText]}>
                Continue with Apple
              </Text>
            </TouchableOpacity>

            {/* Google Button — white variant per Google brand guidelines */}
            <TouchableOpacity
              style={[styles.socialButton, styles.googleButton]}
              onPress={handleGoogleAuth}
              disabled={oauthLoading}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Continue with Google"
            >
              <View style={styles.buttonIconContainer}>
                <Ionicons name="logo-google" size={22} color="#DB4437" />
              </View>
              <Text style={styles.socialButtonText}>Continue with Google</Text>
            </TouchableOpacity>

            {/* OR divider — typographic break between social and email
                auth, signals "you can pick either path" rather than
                making them feel like three equivalent choices. */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Email Button — opens EmailAuthScreen. Ink fill with gold
                text echoes the paywall CTA — premium "alternative" feel
                rather than a third equivalent button. */}
            <TouchableOpacity
              style={[styles.socialButton, styles.emailButton]}
              onPress={() => navigation.navigate("EmailAuth")}
              disabled={oauthLoading}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Continue with email"
            >
              <View style={styles.buttonIconContainer}>
                <Ionicons name="mail" size={22} color="#F4D35E" />
              </View>
              <Text style={[styles.socialButtonText, styles.emailButtonText]}>
                Continue with email
              </Text>
            </TouchableOpacity>
          </View>

          {/* Footer — age + terms grouped at the bottom for clean legal
              layer, refined typography to match the editorial register. */}
          <View style={styles.footer}>
            <Text style={styles.ageNotice}>
              You must be 18 or older to sign up.
            </Text>
            <Text style={styles.termsText}>
              By continuing, you agree to our{" "}
              <Text
                style={styles.linkText}
                onPress={() => Linking.openURL("https://dating.golfmatch.info/terms.html")}
              >
                Terms of Service
              </Text>
              {" "}and{" "}
              <Text
                style={styles.linkText}
                onPress={() => Linking.openURL("https://dating.golfmatch.info/privacy.html")}
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
    marginBottom: 36,
  },
  kicker: {
    fontFamily: "Manrope_700Bold",
    fontSize: 11,
    letterSpacing: 2.6,
    color: "#E0B743", // goldDeep
    marginBottom: 18,
  },
  logoImage: {
    width: width * 0.5,
    height: 45,
    marginBottom: 20,
  },
  tagline: {
    fontFamily: "Fraunces_400Regular_Italic",
    fontSize: 19,
    color: "#14342B", // ink
    letterSpacing: -0.3,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  subtitle: {
    fontFamily: "Manrope_400Regular",
    fontSize: 14,
    color: "#3F5A50", // inkSoft
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 12,
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
    marginBottom: 28,
  },

  // Shared button shape — three variants override background + text color
  // below. Same height + corner-radius across all three keeps the visual
  // rhythm consistent even with different fills.
  socialButton: {
    height: 56,
    borderRadius: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  socialButtonText: {
    fontSize: 16,
    fontFamily: "Manrope_600SemiBold",
    color: "#14342B", // ink default
    letterSpacing: 0.2,
  },

  // Apple — HIG black variant. White text + white Apple logo.
  appleButton: {
    backgroundColor: "#000000",
  },
  appleButtonText: {
    color: "#FFFFFF",
  },

  // Google — white per Google brand. Subtle ink border keeps it from
  // disappearing into the gradient background.
  googleButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E8E0CB", // inkLine
  },

  // Email — ink fill with gold text. Matches the paywall CTA exactly so
  // users see the same "premium button" shape from auth through purchase.
  emailButton: {
    backgroundColor: "#14342B", // ink
    shadowColor: "#14342B",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 6,
  },
  emailButtonText: {
    color: "#F4D35E", // gold
  },

  // Shared button icon container (positioned absolutely on left)
  buttonIconContainer: {
    position: "absolute",
    left: 22,
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },

  // OR divider between social auth and email auth
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 4,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#88806A", // muted
    opacity: 0.5,
  },
  dividerText: {
    fontFamily: "Manrope_500Medium",
    fontSize: 11,
    letterSpacing: 2.4,
    color: "#88806A", // muted
    textTransform: "uppercase",
  },

  // Footer — age + terms grouped together with refined typography
  footer: {
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 4,
  },
  ageNotice: {
    fontSize: 12,
    fontFamily: "Manrope_500Medium",
    color: "#88806A", // muted
    textAlign: "center",
    letterSpacing: 0.2,
  },
  termsText: {
    fontSize: 11,
    fontFamily: "Manrope_400Regular",
    color: "#88806A", // muted
    textAlign: "center",
    lineHeight: 17,
    paddingHorizontal: 12,
  },
  linkText: {
    color: "#0E7C73", // teal
    textDecorationLine: "underline",
  },
});

export default AuthScreen;
