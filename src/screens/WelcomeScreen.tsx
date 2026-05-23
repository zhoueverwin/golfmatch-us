import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Dimensions,
  StatusBar,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { RootStackParamList } from "../types";
import { Colors } from "../constants/colors";
import { Typography } from "../constants/typography";

const { width, height } = Dimensions.get("window");

type WelcomeScreenNavigationProp = StackNavigationProp<RootStackParamList, "Welcome">;

const WelcomeScreen: React.FC = () => {
  const navigation = useNavigation<WelcomeScreenNavigationProp>();
  const insets = useSafeAreaInsets();

  const handleGetStarted = () => {
    navigation.navigate("Auth");
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      {/* Background Gradient - diagonal from top-right (white) to bottom-left (teal) */}
      <LinearGradient
        colors={[
          "rgba(255, 255, 255, 1)",      // Top right: FFFFFF 100%
          "rgba(156, 255, 252, 0.75)",   // Middle: 9CFFFC 75%
          "rgba(0, 184, 177, 0.5)",      // Bottom left: 00B8B1 50%
        ]}
        locations={[0, 0.5, 1]}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.backgroundGradient}
      />

      {/* Top Section with Logo and Screenshots */}
      <View style={[styles.topSection, { paddingTop: insets.top + 30 }]}>
        {/* GolfMatch Logo */}
        <Image
          source={require("../../assets/images/welcome/GolfMatch-GetStarted-Logo.png")}
          style={styles.logo}
          resizeMode="contain"
        />

        {/* App Screenshots */}
        <Image
          source={require("../../assets/images/welcome/GolfMatchGetStarted.png")}
          style={styles.screenshotImage}
          resizeMode="contain"
        />
      </View>

      {/* Bottom Section with curved wave background */}
      <View style={styles.bottomSection}>
        {/* Curved Wave Background */}
        <Image
          source={require("../../assets/images/welcome/Background-layer01.png")}
          style={styles.waveBackground}
          resizeMode="stretch"
        />

        {/* Content on top of wave */}
        <View style={[styles.bottomContent, { paddingBottom: insets.bottom + 40 }]}>
          <Text style={styles.welcomeKicker}>FOR SINGLES WHO PLAY</Text>
          <Text style={styles.welcomeTitle}>
            Your next round{"\n"}could be the one.
          </Text>
          <Text style={styles.welcomeDescription}>
            Real single golfers in your area, looking for{"\n"}
            someone who gets why Saturday{"\n"}
            morning matters.
          </Text>

          <TouchableOpacity
            style={styles.startButton}
            onPress={handleGetStarted}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Get started"
          >
            <Text style={styles.startButtonText}>Get Started  →</Text>
          </TouchableOpacity>
        </View>
      </View>
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
  topSection: {
    flex: 6,
    alignItems: "center",
  },
  logo: {
    width: width * 0.5,
    height: 45,
    marginBottom: 15,
  },
  screenshotImage: {
    flex: 1,
    width: width * 0.95,
  },
  bottomSection: {
    flex: 4,
    position: "relative",
  },
  waveBackground: {
    position: "absolute",
    top: -40,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "120%",
  },
  bottomContent: {
    flex: 1,
    paddingHorizontal: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  welcomeKicker: {
    fontFamily: "Manrope_700Bold",
    fontSize: 11,
    letterSpacing: 2.6,
    color: "#E0B743", // goldDeep — matches paywall + onboarding shell
    marginBottom: 14,
    textAlign: "center",
  },
  welcomeTitle: {
    fontSize: 32,
    fontFamily: "Fraunces_600SemiBold",
    color: "#14342B", // ink
    marginBottom: 16,
    textAlign: "center",
    letterSpacing: -0.8,
    lineHeight: 36,
  },
  welcomeDescription: {
    fontSize: 15,
    fontFamily: "Manrope_400Regular",
    color: "#3F5A50", // inkSoft
    textAlign: "center",
    lineHeight: 23,
    marginBottom: 36,
  },
  startButton: {
    backgroundColor: "#14342B", // ink — matches paywall CTA
    paddingVertical: 17,
    paddingHorizontal: 80,
    borderRadius: 999,
    shadowColor: "#14342B",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.3,
    shadowRadius: 22,
    elevation: 8,
  },
  startButtonText: {
    color: "#F4D35E", // gold — paywall CTA style
    fontSize: 16,
    fontFamily: "Manrope_600SemiBold",
    letterSpacing: 0.3,
  },
});

export default WelcomeScreen;
