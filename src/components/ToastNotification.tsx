import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Image,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { NotificationData, NotificationType } from '../types/notifications';
import { Typography } from "../constants/typography";

const { width } = Dimensions.get('window');

interface ToastNotificationProps {
  notification: NotificationData;
  onPress: () => void;
  onDismiss: () => void;
  visible: boolean;
}

const ToastNotification: React.FC<ToastNotificationProps> = ({
  notification,
  onPress,
  onDismiss,
  visible,
}) => {
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Slide in
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 50,
          friction: 8,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto-dismiss after 4 seconds
      const timer = setTimeout(() => {
        dismissToast();
      }, 4000);

      return () => clearTimeout(timer);
    }
  }, [visible]);

  const dismissToast = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -100,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss();
    });
  };

  const getIconName = (): keyof typeof Ionicons.glyphMap => {
    switch (notification.type) {
      case 'message':
        return 'chatbubble';
      case 'like':
        return 'heart';
      case 'match':
        return 'people';
      case 'post_reaction':
        return 'thumbs-up';
      default:
        return 'notifications';
    }
  };

  const getIconColor = () => {
    switch (notification.type) {
      case 'message':
        return Colors.primary;
      case 'like':
        return '#FF6B6B';
      case 'match':
        return '#4ECDC4';
      case 'post_reaction':
        return '#FFD93D';
      default:
        return Colors.primary;
    }
  };

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <TouchableOpacity
        style={styles.toast}
        onPress={onPress}
        activeOpacity={0.9}
      >
        <View style={styles.content}>
          {/* User avatar or icon */}
          {notification.from_user_image ? (
            <Image
              source={{ uri: notification.from_user_image }}
              style={styles.avatar}
            />
          ) : (
            <View style={[styles.iconContainer, { backgroundColor: getIconColor() + '20' }]}>
              <Ionicons name={getIconName()} size={24} color={getIconColor()} />
            </View>
          )}

          {/* Notification text */}
          <View style={styles.textContainer}>
            <Text style={styles.title} numberOfLines={1}>
              {notification.title}
            </Text>
            <Text style={styles.body} numberOfLines={2}>
              {notification.body}
            </Text>
          </View>

          {/* Close button */}
          <TouchableOpacity
            onPress={dismissToast}
            style={styles.closeButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={20} color={Colors.gray[400]} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 10,
    left: 16,
    right: 16,
    zIndex: 9999,
    elevation: 999,
  },
  toast: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: Typography.getFontFamily('600'),
    color: Colors.text.primary,
    marginBottom: 2,
  },
  body: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    lineHeight: 18,
  },
  closeButton: {
    padding: 4,
  },
});

export default ToastNotification;







