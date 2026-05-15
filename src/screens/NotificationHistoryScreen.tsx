import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { Typography } from '../constants/typography';
import { RootStackParamList } from '../types';
import { notificationService } from '../services/notificationService';
import { NotificationData } from '../types/notifications';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import StandardHeader from '../components/StandardHeader';

type NotificationHistoryScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  'NotificationHistory'
>;

const NotificationHistoryScreen: React.FC = () => {
  const navigation = useNavigation<NotificationHistoryScreenNavigationProp>();
  const { profileId } = useAuth();
  const { refreshNotifications, markAsRead, markAllAsRead, clearNotificationsSection } = useNotifications();
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadNotifications();
      // Clear the section badge when user opens the notification screen
      clearNotificationsSection();
    }, [profileId, clearNotificationsSection])
  );

  const loadNotifications = async () => {
    if (!profileId) return;

    try {
      setLoading(true);
      const result = await notificationService.getNotifications(profileId);
      if (result.success && result.data) {
        setNotifications(result.data);
      }
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadNotifications();
    await refreshNotifications();
    setRefreshing(false);
  };

  const handleNotificationPress = (notification: NotificationData) => {
    // Navigate FIRST for instant response, then mark-as-read in the background.
    // Previously, awaiting mark-as-read before navigation caused message notifications
    // to appear unresponsive (3 sequential network calls blocked navigation).
    const { data } = notification;

    // For system notifications (e.g. identity verification request) — show alert with body, optional screen navigation
    if (data.screen) {
      const tabScreens = ['Home', 'Search', 'Connections', 'Messages', 'MyPage'];
      Alert.alert(
        notification.title,
        notification.body,
        [
          { text: 'Close', style: 'cancel' },
          { text: 'View', onPress: () => {
            if (tabScreens.includes(data.screen!)) {
              navigation.navigate('Main', { screen: data.screen } as any);
            } else {
              navigation.navigate(data.screen as any);
            }
          }},
        ]
      );
    }
    // For messages, go to the chat
    else if (data.chatId) {
      navigation.navigate('Chat', {
        chatId: data.chatId,
        userId: data.fromUserId || '',
        userName: notification.from_user_name || 'User',
        userImage: notification.from_user_image || ''
      });
    }
    // For all other notifications (likes, matches, post reactions), go to the user's profile
    else if (data.fromUserId || notification.from_user_id) {
      navigation.navigate('Profile', {
        userId: data.fromUserId || notification.from_user_id || ''
      });
    }

    // Mark as read in background (fire-and-forget)
    if (!notification.is_read) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n))
      );
      markAsRead(notification.id).then(() => refreshNotifications());
    }
  };

  const handleMarkAllAsRead = async () => {
    await markAllAsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await refreshNotifications();
    // Clear the notifications section badge (for My Page tab)
    await clearNotificationsSection();
  };

  const getIconName = (type: string): keyof typeof Ionicons.glyphMap => {
    switch (type) {
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

  const getIconColor = (type: string) => {
    switch (type) {
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

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const renderNotificationItem = ({ item }: { item: NotificationData }) => {
    const iconColor = getIconColor(item.type);

    return (
      <TouchableOpacity
        style={[styles.notificationItem, !item.is_read && styles.unreadItem]}
        onPress={() => handleNotificationPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.notificationContent}>
          {/* Avatar or icon */}
          {item.from_user_image ? (
            <Image
              source={{ uri: item.from_user_image }}
              style={styles.avatar}
            />
          ) : (
            <View style={[styles.iconContainer, { backgroundColor: iconColor + '20' }]}>
              <Ionicons name={getIconName(item.type)} size={24} color={iconColor} />
            </View>
          )}

          {/* Text content */}
          <View style={styles.textContainer}>
            <Text style={styles.title} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.body} numberOfLines={2}>
              {item.body}
            </Text>
          </View>

          {/* Right side: timestamp and unread indicator */}
          <View style={styles.rightContainer}>
            <Text style={styles.timestamp}>{formatTimestamp(item.created_at)}</Text>
            {!item.is_read && <View style={styles.unreadDot} />}
            <Ionicons name="chevron-forward" size={16} color={Colors.gray[400]} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="notifications-off" size={64} color={Colors.gray[300]} />
      <Text style={styles.emptyTitle}>No notifications</Text>
      <Text style={styles.emptySubtitle}>
        New notifications will appear here
      </Text>
    </View>
  );

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const rightComponent = unreadCount > 0 ? (
    <TouchableOpacity
      style={styles.markAllButton}
      onPress={handleMarkAllAsRead}
      accessibilityRole="button"
      accessibilityLabel="Mark all notifications as read"
    >
      <Ionicons
        name="checkmark-done-outline"
        size={14}
        color={Colors.primary}
        style={styles.markAllIcon}
      />
      <Text style={styles.markAllText} numberOfLines={1}>Read all</Text>
    </TouchableOpacity>
  ) : undefined;

  return (
    <SafeAreaView style={styles.container}>
      <StandardHeader
        title="Notifications"
        showBackButton={true}
        onBackPress={() => navigation.goBack()}
        rightComponent={rightComponent}
      />

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderNotificationItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={
            notifications.length === 0 ? styles.emptyList : styles.list
          }
          ListEmptyComponent={renderEmptyState}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.primary}
            />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  markAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: Colors.primary + '10',
  },
  markAllIcon: {
    marginRight: 4,
  },
  markAllText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: Typography.getFontFamily('600'),
    color: Colors.primary,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingVertical: 8,
  },
  emptyList: {
    flex: 1,
  },
  notificationItem: {
    backgroundColor: Colors.white,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  unreadItem: {
    backgroundColor: Colors.primary + '05',
  },
  notificationContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: Typography.getFontFamily('600'),
    color: Colors.text.primary,
    marginBottom: 4,
  },
  body: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    lineHeight: 20,
  },
  rightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timestamp: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.tertiary,
    marginRight: Spacing.xs,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
    marginRight: Spacing.xs,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: 80,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 48,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    fontFamily: Typography.getFontFamily('600'),
    color: Colors.text.primary,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default NotificationHistoryScreen;

