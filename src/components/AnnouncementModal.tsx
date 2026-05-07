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
import { Image as ExpoImage } from "expo-image";

import { Colors } from "../constants/colors";
import { Spacing, BorderRadius } from "../constants/spacing";
import { Typography } from "../constants/typography";
import { Announcement } from "../hooks/useAnnouncements";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = Math.min(SCREEN_WIDTH - Spacing.xl * 2, 340);

interface AnnouncementModalProps {
  visible: boolean;
  announcement: Announcement;
  onAction: () => void;
  onDismiss: () => void;
}

const AnnouncementModal: React.FC<AnnouncementModalProps> = ({
  visible,
  announcement,
  onAction,
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

  const hasCta = !!(announcement.cta_url || announcement.cta_screen);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <Animated.View
          style={[
            styles.container,
            { transform: [{ scale: scaleAnim }] },
          ]}
        >
          {/* Cover Image */}
          {announcement.image_url && (
            <ExpoImage
              source={{ uri: announcement.image_url }}
              style={styles.coverImage}
              contentFit="cover"
              transition={200}
            />
          )}

          {/* Content area */}
          <View style={styles.content}>
            {/* Title */}
            <Text style={styles.title}>{announcement.title}</Text>

            {/* Body */}
            {announcement.body && (
              <Text style={styles.body}>{announcement.body}</Text>
            )}

            {/* CTA Button */}
            {hasCta && (
              <TouchableOpacity
                style={styles.ctaButton}
                onPress={onAction}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={announcement.cta_text}
              >
                <LinearGradient
                  colors={[Colors.primary, Colors.primaryDark]}
                  style={styles.ctaButtonGradient}
                >
                  <Text style={styles.ctaButtonText}>
                    {announcement.cta_text}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            )}

            {/* Dismiss Button */}
            <TouchableOpacity
              style={styles.dismissButton}
              onPress={onDismiss}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="閉じる"
            >
              <Text style={styles.dismissButtonText}>閉じる</Text>
            </TouchableOpacity>
          </View>
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
    width: CARD_WIDTH,
    overflow: "hidden",
    alignItems: "center",
  },
  coverImage: {
    width: "100%",
    aspectRatio: 16 / 9,
  },
  content: {
    padding: Spacing.xl,
    width: "100%",
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
  body: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.normal,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.normal),
    color: Colors.text.secondary,
    textAlign: "center",
    lineHeight: Typography.fontSize.base * Typography.lineHeight.relaxed,
    marginBottom: Spacing.lg,
  },
  ctaButton: {
    width: "100%",
    marginBottom: Spacing.md,
  },
  ctaButtonGradient: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  ctaButtonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.white,
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

export default AnnouncementModal;
