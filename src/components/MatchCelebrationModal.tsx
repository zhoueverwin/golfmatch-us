import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Image,
  StatusBar,
  Animated,
  Dimensions,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { Colors } from "../constants/colors";
import { Spacing, BorderRadius } from "../constants/spacing";
import { Typography } from "../constants/typography";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PROFILE_IMAGE_SIZE = SCREEN_WIDTH * 0.28;
const TEMPLATE_CARD_WIDTH = SCREEN_WIDTH * 0.65;

interface MatchCelebrationModalProps {
  visible: boolean;
  matchData: {
    matchId: string;
    otherUser: {
      id: string;
      name: string;
      image: string;
    };
    currentUser?: {
      id: string;
      name: string;
      image: string;
    };
  };
  onSendMessage: (message?: string) => void;
  onClose: () => void;
}

const getMessageTemplates = (otherUserName: string): string[] => [
  `${otherUserName}さん、マッチありがとうございます！\n趣味が近い気がするので、いろいろお話できたらうれしいです！`,
  `こんにちは！${otherUserName}さんのプロフィール拝見しました。\nぜひ一緒にラウンドしましょう！⛳`,
  `はじめまして！\nどのコースでよくプレーされますか？\n今度ご一緒できたらうれしいです！`,
  `${otherUserName}さん、はじめまして！\nゴルフのお話できるの楽しみです😊`,
];

const MatchCelebrationModal: React.FC<MatchCelebrationModalProps> = ({
  visible,
  matchData,
  onSendMessage,
  onClose,
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const titleAnim = useRef(new Animated.Value(0)).current;
  const profileScaleAnim = useRef(new Animated.Value(0)).current;
  const contentAnim = useRef(new Animated.Value(0)).current;

  const [customMessage, setCustomMessage] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null);
  const [isSending, setIsSending] = useState(false);

  const templates = getMessageTemplates(matchData.otherUser.name);

  useEffect(() => {
    if (visible) {
      // Reset state
      setCustomMessage("");
      setSelectedTemplate(null);
      setIsSending(false);

      // Reset animations
      fadeAnim.setValue(0);
      titleAnim.setValue(0);
      profileScaleAnim.setValue(0);
      contentAnim.setValue(0);

      // Entrance animation sequence
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();

      setTimeout(() => {
        Animated.spring(titleAnim, {
          toValue: 1,
          tension: 50,
          friction: 8,
          useNativeDriver: true,
        }).start();
      }, 200);

      setTimeout(() => {
        Animated.spring(profileScaleAnim, {
          toValue: 1,
          tension: 45,
          friction: 7,
          useNativeDriver: true,
        }).start();
      }, 350);

      setTimeout(() => {
        Animated.spring(contentAnim, {
          toValue: 1,
          tension: 40,
          friction: 8,
          useNativeDriver: true,
        }).start();
      }, 550);
    }
  }, [visible]);

  const handleSendTemplate = async (index: number) => {
    if (isSending) return;
    setSelectedTemplate(index);
    setIsSending(true);
    try {
      await onSendMessage(templates[index]);
    } catch (err) {
      console.error("[MatchCelebrationModal] handleSendTemplate failed:", err);
    } finally {
      setIsSending(false);
    }
  };

  const handleSendCustom = async () => {
    if (isSending || !customMessage.trim()) return;
    Keyboard.dismiss();
    setIsSending(true);
    try {
      await onSendMessage(customMessage.trim());
    } catch (err) {
      console.error("[MatchCelebrationModal] handleSendCustom failed:", err);
    } finally {
      setIsSending(false);
    }
  };

  const handleContinue = () => {
    onClose();
  };

  const currentUserImage =
    matchData.currentUser?.image ||
    "https://via.placeholder.com/150/cccccc/ffffff?text=You";
  const otherUserImage =
    matchData.otherUser?.image ||
    "https://via.placeholder.com/150/cccccc/ffffff?text=User";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" />
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        <LinearGradient
          colors={["#1FB8B0", "#1AADA5", "#17A39B"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.gradient}
        >
          <KeyboardAvoidingView
            style={styles.keyboardAvoid}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
              <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                bounces={false}
              >
                {/* Match Title */}
                <Animated.View
                  style={[
                    styles.titleSection,
                    {
                      opacity: titleAnim,
                      transform: [{
                        translateY: titleAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [-30, 0],
                        }),
                      }],
                    },
                  ]}
                >
                  <Text style={styles.matchName}>
                    {matchData.otherUser.name}さんと
                  </Text>
                  <Text style={styles.matchTitle}>マッチングしました！</Text>
                </Animated.View>

                {/* Profile Images with Heart */}
                <Animated.View
                  style={[
                    styles.profileSection,
                    {
                      opacity: profileScaleAnim,
                      transform: [{ scale: profileScaleAnim }],
                    },
                  ]}
                >
                  <View style={styles.profileImagesRow}>
                    <View style={styles.profileImageWrapper}>
                      <Image
                        source={{ uri: currentUserImage }}
                        style={styles.profileImage}
                        resizeMode="cover"
                      />
                    </View>

                    <View style={styles.heartContainer}>
                      <Ionicons name="heart" size={28} color={Colors.white} />
                    </View>

                    <View style={styles.profileImageWrapper}>
                      <Image
                        source={{ uri: otherUserImage }}
                        style={styles.profileImage}
                        resizeMode="cover"
                      />
                    </View>
                  </View>
                </Animated.View>

                {/* Message Templates Section */}
                <Animated.View
                  style={[
                    styles.messageSection,
                    {
                      opacity: contentAnim,
                      transform: [{
                        translateY: contentAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [40, 0],
                        }),
                      }],
                    },
                  ]}
                >
                  <View style={styles.messageSectionHeader}>
                    <Ionicons
                      name="chatbubble-ellipses"
                      size={20}
                      color={Colors.white}
                    />
                    <Text style={styles.messageSectionTitle}>
                      あなたからメッセージしてみよう
                    </Text>
                  </View>

                  {/* Template Cards - Horizontal Scroll */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.templatesContainer}
                    decelerationRate="fast"
                    snapToInterval={TEMPLATE_CARD_WIDTH + 12}
                    snapToAlignment="start"
                  >
                    {templates.map((template, index) => (
                      <TouchableOpacity
                        key={index}
                        style={[
                          styles.templateCard,
                          selectedTemplate === index && styles.templateCardSelected,
                        ]}
                        onPress={() => handleSendTemplate(index)}
                        activeOpacity={0.8}
                        disabled={isSending}
                      >
                        <Text
                          style={[
                            styles.templateText,
                            selectedTemplate === index && styles.templateTextSelected,
                          ]}
                          numberOfLines={4}
                        >
                          {template}
                        </Text>
                        {selectedTemplate === index && isSending && (
                          <View style={styles.sendingIndicator}>
                            <Text style={styles.sendingText}>送信中...</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  {/* Custom Message Input */}
                  <View style={styles.inputContainer}>
                    <TextInput
                      style={styles.messageInput}
                      placeholder="メッセージを入力"
                      placeholderTextColor="rgba(255,255,255,0.5)"
                      value={customMessage}
                      onChangeText={setCustomMessage}
                      multiline={false}
                      returnKeyType="send"
                      onSubmitEditing={handleSendCustom}
                    />
                    <TouchableOpacity
                      style={[
                        styles.sendButton,
                        !customMessage.trim() && styles.sendButtonDisabled,
                      ]}
                      onPress={handleSendCustom}
                      disabled={!customMessage.trim() || isSending}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="send"
                        size={20}
                        color={
                          customMessage.trim()
                            ? Colors.primary
                            : "rgba(255,255,255,0.3)"
                        }
                      />
                    </TouchableOpacity>
                  </View>

                  {/* Moderation Notice */}
                  <Text style={styles.moderationNotice}>
                    健全なサービスを運営する目的で運営者がメッセージ内容を確認・削除する場合があります。
                  </Text>
                </Animated.View>

                {/* Continue Button */}
                <Animated.View
                  style={[
                    styles.continueSection,
                    {
                      opacity: contentAnim,
                    },
                  ]}
                >
                  <TouchableOpacity
                    style={styles.continueButton}
                    onPress={handleContinue}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.continueText}>続ける</Text>
                  </TouchableOpacity>
                </Animated.View>
              </ScrollView>
            </SafeAreaView>
          </KeyboardAvoidingView>
        </LinearGradient>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  keyboardAvoid: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingBottom: Spacing.lg,
  },

  // Title
  titleSection: {
    alignItems: "center",
    paddingTop: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  matchName: {
    fontSize: 26,
    fontWeight: "700",
    fontFamily: Typography.getFontFamily("700"),
    color: Colors.white,
    textAlign: "center",
    letterSpacing: 0.5,
  },
  matchTitle: {
    fontSize: 26,
    fontWeight: "700",
    fontFamily: Typography.getFontFamily("700"),
    color: Colors.white,
    textAlign: "center",
    letterSpacing: 0.5,
    marginTop: 2,
  },

  // Profile Images
  profileSection: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  profileImagesRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  profileImageWrapper: {
    width: PROFILE_IMAGE_SIZE,
    height: PROFILE_IMAGE_SIZE,
    borderRadius: PROFILE_IMAGE_SIZE / 2,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.8)",
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  profileImage: {
    width: "100%",
    height: "100%",
  },
  heartContainer: {
    marginHorizontal: Spacing.md,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Message Section
  messageSection: {
    paddingHorizontal: Spacing.lg,
  },
  messageSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
    gap: 8,
  },
  messageSectionTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: "600",
    fontFamily: Typography.getFontFamily("600"),
    color: Colors.white,
  },

  // Template Cards
  templatesContainer: {
    paddingRight: Spacing.lg,
    gap: 12,
    marginBottom: Spacing.md,
  },
  templateCard: {
    width: TEMPLATE_CARD_WIDTH,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md + 4,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.2)",
    minHeight: 90,
    justifyContent: "center",
  },
  templateCardSelected: {
    backgroundColor: "rgba(255,255,255,0.3)",
    borderColor: Colors.white,
  },
  templateText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.white,
    lineHeight: 22,
  },
  templateTextSelected: {
    fontWeight: "500",
  },
  sendingIndicator: {
    marginTop: 8,
    alignItems: "flex-end",
  },
  sendingText: {
    fontSize: Typography.fontSize.xs,
    color: "rgba(255,255,255,0.7)",
    fontStyle: "italic",
  },

  // Custom Input
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: BorderRadius.full,
    paddingLeft: Spacing.md + 4,
    paddingRight: Spacing.xs,
    height: 48,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    marginBottom: Spacing.sm,
  },
  messageInput: {
    flex: 1,
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.white,
    paddingVertical: 0,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    backgroundColor: "rgba(255,255,255,0.1)",
  },

  // Moderation Notice
  moderationNotice: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.regular,
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
    lineHeight: 16,
    paddingHorizontal: Spacing.sm,
    marginTop: Spacing.xs,
  },

  // Continue
  continueSection: {
    alignItems: "center",
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  continueButton: {
    paddingVertical: Spacing.sm + 4,
    paddingHorizontal: Spacing.xl,
  },
  continueText: {
    fontSize: Typography.fontSize.base,
    fontWeight: "500",
    fontFamily: Typography.getFontFamily("500"),
    color: Colors.white,
    textDecorationLine: "underline",
    textDecorationColor: "rgba(255,255,255,0.5)",
  },
});

export default MatchCelebrationModal;
