import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { Colors } from "../constants/colors";
import { Spacing, BorderRadius } from "../constants/spacing";
import { Typography } from "../constants/typography";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface UpdatePromptModalProps {
  visible: boolean;
  title: string;
  body: string;
  buttonText: string;
  dismissText?: string;
  currentVersion: string;
  latestVersion: string;
  isForced?: boolean; // When true, user cannot dismiss the modal
  onUpdate: () => void;
  onDismiss: () => void;
}

const UpdatePromptModal: React.FC<UpdatePromptModalProps> = ({
  visible,
  title,
  body,
  buttonText,
  dismissText,
  currentVersion,
  latestVersion,
  isForced = false,
  onUpdate,
  onDismiss,
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    if (visible) {
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.9);

      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, fadeAnim, scaleAnim]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={isForced ? undefined : onDismiss}
      statusBarTranslucent
    >
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <Animated.View
          style={[
            styles.container,
            { transform: [{ scale: scaleAnim }] },
          ]}
        >
          {/* Icon */}
          <View style={styles.iconContainer}>
            <LinearGradient
              colors={[Colors.primary, Colors.primaryDark]}
              style={styles.iconGradient}
            >
              <Ionicons name="arrow-up-circle" size={40} color={Colors.white} />
            </LinearGradient>
          </View>

          {/* Title */}
          <Text style={styles.title}>{title}</Text>

          {/* Version info */}
          <View style={styles.versionContainer}>
            <Text style={styles.versionText}>
              現在: v{currentVersion} → 最新: v{latestVersion}
            </Text>
          </View>

          {/* Body */}
          <Text style={styles.body}>{body}</Text>

          {/* Update Button */}
          <TouchableOpacity
            style={styles.updateButton}
            onPress={onUpdate}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={buttonText}
          >
            <LinearGradient
              colors={[Colors.primary, Colors.primaryDark]}
              style={styles.updateButtonGradient}
            >
              <Ionicons name="download-outline" size={20} color={Colors.white} />
              <Text style={styles.updateButtonText}>{buttonText}</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Dismiss Button - hidden when force update is required */}
          {!isForced && dismissText && (
            <TouchableOpacity
              style={styles.dismissButton}
              onPress={onDismiss}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={dismissText}
            >
              <Text style={styles.dismissButtonText}>{dismissText}</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  container: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    width: SCREEN_WIDTH - Spacing.xl * 2,
    maxWidth: 340,
    alignItems: "center",
  },
  iconContainer: {
    marginBottom: Spacing.lg,
  },
  iconGradient: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  versionContainer: {
    backgroundColor: Colors.gray[100],
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  versionText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text.secondary,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
  },
  body: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.normal,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.normal),
    color: Colors.text.secondary,
    textAlign: "center",
    lineHeight: Typography.fontSize.base * Typography.lineHeight.relaxed,
    marginBottom: Spacing.lg,
  },
  updateButton: {
    width: "100%",
    marginBottom: Spacing.md,
  },
  updateButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  updateButtonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.white,
    marginLeft: Spacing.sm,
  },
  dismissButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  dismissButtonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.normal,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.normal),
    color: Colors.text.secondary,
    textAlign: "center",
  },
});

export default UpdatePromptModal;
