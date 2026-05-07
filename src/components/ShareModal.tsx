/**
 * ShareModal
 * Bottom sheet modal with share options.
 * Includes quick-access platform buttons and general share/save options.
 */

import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TouchableWithoutFeedback,
  Animated,
  PanResponder,
  ActivityIndicator,
  Linking,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect, Defs, RadialGradient, Stop } from 'react-native-svg';

import { Colors } from '../constants/colors';
import { Spacing, BorderRadius } from '../constants/spacing';
import { Typography } from '../constants/typography';

const MODAL_HEIGHT = 340;
const DISMISS_THRESHOLD = 80;

// Platform icon components
const XIcon = () => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Path
      d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
      fill={Colors.text.primary}
    />
  </Svg>
);

const InstagramIcon = () => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Defs>
      <RadialGradient
        id="instagramGradient"
        cx="30%"
        cy="107%"
        r="150%"
        fx="30%"
        fy="107%"
      >
        <Stop offset="0%" stopColor="#FFDC80" />
        <Stop offset="10%" stopColor="#FCAF45" />
        <Stop offset="25%" stopColor="#F77737" />
        <Stop offset="45%" stopColor="#F56040" />
        <Stop offset="65%" stopColor="#FD1D1D" />
        <Stop offset="80%" stopColor="#E1306C" />
        <Stop offset="90%" stopColor="#C13584" />
        <Stop offset="100%" stopColor="#833AB4" />
      </RadialGradient>
    </Defs>
    <Rect width={24} height={24} rx={6} fill="url(#instagramGradient)" />
    <Path
      d="M12 6.5c-1.5 0-1.69.006-2.28.033-.59.027-.99.12-1.34.258-.36.14-.67.33-.97.63-.3.3-.49.61-.63.97-.14.35-.23.75-.26 1.34C6.506 10.31 6.5 10.5 6.5 12s.006 1.69.033 2.28c.027.59.12.99.258 1.34.14.36.33.67.63.97.3.3.61.49.97.63.35.14.75.23 1.34.26.59.027.78.033 2.28.033s1.69-.006 2.28-.033c.59-.027.99-.12 1.34-.258.36-.14.67-.33.97-.63.3-.3.49-.61.63-.97.14-.35.23-.75.26-1.34.027-.59.033-.78.033-2.28s-.006-1.69-.033-2.28c-.027-.59-.12-.99-.258-1.34a2.72 2.72 0 00-.63-.97c-.3-.3-.61-.49-.97-.63-.35-.14-.75-.23-1.34-.26C13.69 6.506 13.5 6.5 12 6.5zm0 .99c1.47 0 1.65.006 2.23.032.54.025.83.115 1.02.19.26.1.44.22.63.41.19.19.31.37.41.63.08.19.17.48.19 1.02.026.58.032.76.032 2.23s-.006 1.65-.032 2.23c-.025.54-.115.83-.19 1.02-.1.26-.22.44-.41.63-.19.19-.37.31-.63.41-.19.08-.48.17-1.02.19-.58.026-.76.032-2.23.032s-1.65-.006-2.23-.032c-.54-.025-.83-.115-1.02-.19a1.7 1.7 0 01-.63-.41 1.7 1.7 0 01-.41-.63c-.08-.19-.17-.48-.19-1.02-.026-.58-.032-.76-.032-2.23s.006-1.65.032-2.23c.025-.54.115-.83.19-1.02.1-.26.22-.44.41-.63.19-.19.37-.31.63-.41.19-.08.48-.17 1.02-.19.58-.026.76-.032 2.23-.032zm0 1.68a2.83 2.83 0 100 5.66 2.83 2.83 0 000-5.66zm0 4.67a1.84 1.84 0 110-3.68 1.84 1.84 0 010 3.68zm3.6-4.78a.66.66 0 11-1.32 0 .66.66 0 011.32 0z"
      fill="#fff"
    />
  </Svg>
);

const LINEIcon = () => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Rect width={24} height={24} rx={6} fill="#06C755" />
    <Path
      d="M19.5 10.5c0-3.59-3.6-6.5-8-6.5s-8 2.91-8 6.5c0 3.21 2.85 5.9 6.7 6.41.26.06.62.17.71.4.08.2.05.52.03.72l-.11.69c-.04.2-.16.8.7.44.86-.36 4.64-2.73 6.33-4.68 1.17-1.28 1.73-2.58 1.73-3.98zm-10.98 2.2a.26.26 0 01-.26.26H5.91a.26.26 0 01-.26-.26V9.36c0-.15.12-.26.26-.26h.52c.15 0 .26.12.26.26v2.82h1.57c.15 0 .26.12.26.26v.52-.26zm1.55.26h-.52a.26.26 0 01-.26-.26V9.36c0-.15.12-.26.26-.26h.52c.15 0 .26.12.26.26v3.34c0 .15-.12.26-.26.26zm4.66 0h-.52a.26.26 0 01-.26-.26V10.9l-1.48 2.13a.26.26 0 01-.21.11h-.52a.26.26 0 01-.26-.26V9.36c0-.15.12-.26.26-.26h.52c.15 0 .26.12.26.26v1.8l1.48-2.13a.26.26 0 01.21-.11h.52c.15 0 .26.12.26.26v3.34c0 .15-.12.26-.26.26v-.52zm2.77-2.3a.26.26 0 01-.26.26h-1.57v.52h1.57c.15 0 .26.12.26.26v.52c0 .15-.12.26-.26.26h-2.35a.26.26 0 01-.26-.26V9.36c0-.15.12-.26.26-.26h2.35c.15 0 .26.12.26.26v.52c0 .15-.12.26-.26.26h-1.57v.52h1.57c.15 0 .26.12.26.26v.52-.52z"
      fill="#fff"
    />
  </Svg>
);

const MessagesIcon = () => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Rect width={24} height={24} rx={6} fill="#34C759" />
    <Path
      d="M12 4C7.03 4 3 7.36 3 11.5c0 2.05 1.02 3.9 2.67 5.24l-.85 3.1a.5.5 0 00.72.56l3.18-1.7c1.07.35 2.22.55 3.43.55 4.97 0 9-3.36 9-7.5S16.97 4 12 4z"
      fill="#fff"
    />
  </Svg>
);

export interface ShareModalProps {
  visible: boolean;
  onClose: () => void;
  onShare: () => void;
  onSaveToGallery: () => void;
  onInstagramShare?: () => void; // For Instagram image sharing
  isLoading?: boolean;
  title?: string;
  shareMessage?: string; // Text message for LINE/X sharing
}

const ShareModal: React.FC<ShareModalProps> = ({
  visible,
  onClose,
  onShare,
  onSaveToGallery,
  onInstagramShare,
  isLoading = false,
  title = 'シェア',
  shareMessage = '',
}) => {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(MODAL_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const dragY = useRef(new Animated.Value(0)).current;

  // Pan responder for swipe-to-dismiss
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dy > 5;
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          dragY.setValue(gestureState.dy);
          const newOpacity = Math.max(0, 1 - gestureState.dy / MODAL_HEIGHT);
          fadeAnim.setValue(newOpacity);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > DISMISS_THRESHOLD || gestureState.vy > 0.5) {
          dismissModal();
        } else {
          Animated.parallel([
            Animated.spring(dragY, {
              toValue: 0,
              useNativeDriver: true,
              tension: 65,
              friction: 11,
            }),
            Animated.timing(fadeAnim, {
              toValue: 1,
              duration: 200,
              useNativeDriver: true,
            }),
          ]).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (visible) {
      dragY.setValue(0);
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 65,
          friction: 11,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      slideAnim.setValue(MODAL_HEIGHT);
      fadeAnim.setValue(0);
      dragY.setValue(0);
    }
  }, [visible, slideAnim, fadeAnim, dragY]);

  const dismissModal = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: MODAL_HEIGHT,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(dragY, {
        toValue: MODAL_HEIGHT,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  };

  const handleClose = () => {
    dismissModal();
  };

  // Platform-specific share handlers
  const handlePlatformShare = async (platform: 'x' | 'instagram' | 'line' | 'messages') => {
    const encodedMessage = encodeURIComponent(shareMessage);

    switch (platform) {
      case 'line': {
        // LINE: Text-based sharing via URL scheme
        const lineUrl = `https://line.me/R/share?text=${encodedMessage}`;
        try {
          const canOpen = await Linking.canOpenURL(lineUrl);
          if (canOpen) {
            await Linking.openURL(lineUrl);
            dismissModal();
          } else {
            // Fallback: try LINE app URL scheme
            const lineAppUrl = `line://msg/text/${encodedMessage}`;
            const canOpenApp = await Linking.canOpenURL(lineAppUrl);
            if (canOpenApp) {
              await Linking.openURL(lineAppUrl);
              dismissModal();
            } else {
              Alert.alert('LINEが見つかりません', 'LINEアプリをインストールしてください');
            }
          }
        } catch (error) {
          console.error('LINE share error:', error);
          Alert.alert('エラー', 'LINEでのシェアに失敗しました');
        }
        break;
      }

      case 'x': {
        // X (Twitter): Text-based sharing via URL scheme
        const twitterUrl = `https://twitter.com/intent/tweet?text=${encodedMessage}`;
        try {
          const canOpen = await Linking.canOpenURL(twitterUrl);
          if (canOpen) {
            await Linking.openURL(twitterUrl);
            dismissModal();
          } else {
            // Fallback: try X app URL scheme
            const xAppUrl = `twitter://post?message=${encodedMessage}`;
            const canOpenApp = await Linking.canOpenURL(xAppUrl);
            if (canOpenApp) {
              await Linking.openURL(xAppUrl);
              dismissModal();
            } else {
              Alert.alert('Xが見つかりません', 'Xアプリをインストールしてください');
            }
          }
        } catch (error) {
          console.error('X share error:', error);
          Alert.alert('エラー', 'Xでのシェアに失敗しました');
        }
        break;
      }

      case 'instagram': {
        // Instagram: Image-based sharing (save to camera roll + open Instagram)
        if (onInstagramShare) {
          onInstagramShare();
          dismissModal();
        } else {
          // Fallback to native share sheet
          onShare();
        }
        break;
      }

      case 'messages': {
        // Messages: Text-based sharing via SMS URL scheme
        const smsUrl = Platform.OS === 'ios'
          ? `sms:&body=${encodedMessage}`
          : `sms:?body=${encodedMessage}`;
        try {
          const canOpen = await Linking.canOpenURL(smsUrl);
          if (canOpen) {
            await Linking.openURL(smsUrl);
            dismissModal();
          } else {
            Alert.alert('エラー', 'メッセージアプリを開けませんでした');
          }
        } catch (error) {
          console.error('Messages share error:', error);
          Alert.alert('エラー', 'メッセージでのシェアに失敗しました');
        }
        break;
      }

      default:
        onShare();
    }
  };

  const handleShare = () => {
    onShare();
  };

  const handleSave = () => {
    onSaveToGallery();
  };

  const translateY = Animated.add(slideAnim, dragY);

  // Platform buttons configuration
  const platforms = [
    { id: 'instagram' as const, name: 'Instagram', icon: InstagramIcon },
    { id: 'x' as const, name: 'X', icon: XIcon },
    { id: 'line' as const, name: 'LINE', icon: LINEIcon },
    { id: 'messages' as const, name: 'メッセージ', icon: MessagesIcon },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={styles.modalWrapper}>
        <TouchableWithoutFeedback onPress={handleClose}>
          <Animated.View style={[styles.overlay, { opacity: fadeAnim }]} />
        </TouchableWithoutFeedback>

        <Animated.View
          style={[
            styles.container,
            {
              paddingBottom: insets.bottom + Spacing.sm,
              transform: [{ translateY }],
            },
          ]}
          {...panResponder.panHandlers}
        >
          <View style={styles.handleContainer}>
            <View style={styles.handle} />
          </View>

          <Text style={styles.title}>{title}</Text>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>画像を生成中...</Text>
            </View>
          ) : (
            <>
              {/* Platform quick-access buttons */}
              <View style={styles.platformsContainer}>
                {platforms.map((platform) => (
                  <TouchableOpacity
                    key={platform.id}
                    style={styles.platformButton}
                    onPress={() => handlePlatformShare(platform.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.platformIconContainer}>
                      <platform.icon />
                    </View>
                    <Text style={styles.platformName} numberOfLines={1}>
                      {platform.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Divider */}
              <View style={styles.divider} />

              {/* Other options */}
              <TouchableOpacity
                style={styles.menuItem}
                onPress={handleShare}
                activeOpacity={0.7}
              >
                <View style={styles.iconContainer}>
                  <Ionicons name="apps-outline" size={22} color={Colors.primary} />
                </View>
                <Text style={styles.menuText}>その他のアプリ</Text>
                <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItem}
                onPress={handleSave}
                activeOpacity={0.7}
              >
                <View style={styles.iconContainer}>
                  <Ionicons name="download-outline" size={22} color={Colors.primary} />
                </View>
                <Text style={styles.menuText}>画像を保存</Text>
                <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.menuItem, styles.cancelItem]}
                onPress={handleClose}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelText}>キャンセル</Text>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  container: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingTop: Spacing.xs,
    paddingHorizontal: Spacing.md,
    marginHorizontal: Spacing.sm,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.xl,
  },
  handleContainer: {
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: Colors.gray[300],
    borderRadius: 2,
  },
  title: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: Typography.fontSize.base,
    color: Colors.text.secondary,
  },
  platformsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  platformButton: {
    alignItems: 'center',
    width: 70,
  },
  platformIconContainer: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: Colors.gray[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  platformName: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.text.secondary,
    textAlign: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.sm,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primaryLight + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  menuText: {
    flex: 1,
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.text.primary,
  },
  cancelItem: {
    justifyContent: 'center',
    marginTop: Spacing.sm,
    borderBottomWidth: 0,
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
  },
  cancelText: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.text.secondary,
    textAlign: 'center',
  },
});

export default ShareModal;
