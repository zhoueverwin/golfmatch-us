import React, { useState, useEffect, useCallback, memo, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  ScrollView,
  Platform,
  Dimensions,
} from "react-native";
import { FlashList, ListRenderItemInfo } from "@shopify/flash-list";
import { Image as ExpoImage } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { RootStackParamList } from "../types";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { useNotifications } from "../contexts/NotificationContext";
import { useRevenueCat } from "../contexts/RevenueCatContext";
import { useCurrentUserProfile } from "../hooks/queries/useProfile";

import { Colors } from "../constants/colors";
import { Spacing, BorderRadius, Shadows } from "../constants/spacing";
import { Typography } from "../constants/typography";
import EmptyState from "../components/EmptyState";
import Loading from "../components/Loading";
import { messagesService, ChatPreview, UnmessagedMatch } from "../services/supabase/messages.service";
import { shouldLockMessaging } from "../utils/premiumGates";

interface MessagePreview {
  id: string;
  userId: string;
  name: string;
  profileImage: string;
  lastMessage: string;
  timestamp: string;
  isUnread: boolean;
  unreadCount: number;
  isOnline: boolean;
  needsReply: boolean;
}

type MessagesScreenNavigationProp = StackNavigationProp<RootStackParamList>;

const { width: screenWidth } = Dimensions.get("window");
const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=400&h=400&fit=crop&crop=face';

// Memoized message item component for scroll performance
interface MessageItemProps {
  item: MessagePreview;
  onPress: (item: MessagePreview) => void;
  onProfilePress: (userId: string) => void;
  isLocked: boolean;
}

const MessageItem = memo(({ item, onPress, onProfilePress, isLocked }: MessageItemProps) => {
  const showLocked = isLocked && item.needsReply;

  return (
    <TouchableOpacity
      style={[
        styles.messageItem,
        item.isUnread && styles.unrepliedMessageItem,
      ]}
      onPress={() => onPress(item)}
      activeOpacity={0.7}
    >
      <TouchableOpacity
        style={styles.profileImageContainer}
        onPress={() => onProfilePress(item.userId)}
        accessibilityRole="button"
        accessibilityLabel={`View ${item.name}'s profile`}
      >
        <ExpoImage
          source={{ uri: item.profileImage }}
          style={styles.profileImage}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={0}
          accessibilityLabel={`${item.name}'s profile photo`}
        />
      </TouchableOpacity>
      <View style={styles.messageContent}>
        <View style={styles.messageHeader}>
          <TouchableOpacity
            onPress={() => onProfilePress(item.userId)}
            accessibilityRole="button"
            accessibilityLabel={`View ${item.name}'s profile`}
          >
            <Text style={styles.name}>{item.name}</Text>
          </TouchableOpacity>
          <View style={styles.statusContainer}>
            {item.isOnline && <View style={styles.onlineIndicator} />}
            <Text style={styles.timestamp}>{item.timestamp}</Text>
          </View>
        </View>
        <View style={styles.messageFooter}>
          {showLocked ? (
            <View style={styles.lockedPreviewRow}>
              <Ionicons name="lock-closed" size={12} color={Colors.primary} />
              <Text style={styles.lockedPreviewText} numberOfLines={1}>
                You have a new message
              </Text>
            </View>
          ) : (
            <Text style={styles.lastMessage} numberOfLines={1}>
              {item.lastMessage}
            </Text>
          )}
          {item.isUnread && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>Unreplied</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.item.lastMessage === nextProps.item.lastMessage &&
    prevProps.item.isUnread === nextProps.item.isUnread &&
    prevProps.item.timestamp === nextProps.item.timestamp &&
    prevProps.item.isOnline === nextProps.item.isOnline &&
    prevProps.isLocked === nextProps.isLocked
  );
});

// Memoized unmessaged match item component
interface UnmessagedMatchItemProps {
  match: UnmessagedMatch;
  onPress: (match: UnmessagedMatch) => void;
}

const UnmessagedMatchItem = memo(({ match, onPress }: UnmessagedMatchItemProps) => (
  <TouchableOpacity
    style={styles.unmessagedMatchItem}
    onPress={() => onPress(match)}
    activeOpacity={0.7}
    accessibilityRole="button"
    accessibilityLabel={`Start a message with ${match.other_user_name}`}
  >
    <View style={styles.profileImageWrapper}>
      <ExpoImage
        source={{ uri: match.other_user_image || DEFAULT_IMAGE }}
        style={styles.unmessagedProfileImage}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={0}
        accessibilityLabel={`${match.other_user_name}'s profile photo`}
      />
      <View style={styles.newBadge}>
        <Text style={styles.newBadgeText}>NEW</Text>
      </View>
    </View>
    <View style={styles.matchInfoContainer}>
      <Text style={styles.matchInfoText} numberOfLines={1}>
        {match.other_user_age}
      </Text>
      <Text style={styles.matchInfoText} numberOfLines={1}>
        {match.other_user_location || match.other_user_prefecture}
      </Text>
    </View>
  </TouchableOpacity>
), (prevProps, nextProps) => {
  return prevProps.match.match_id === nextProps.match.match_id;
});

const MessagesScreen: React.FC = () => {
  const navigation = useNavigation<MessagesScreenNavigationProp>();
  const { user } = useAuth();
  const { clearMessagesNotification } = useNotifications();
  const { isProMember } = useRevenueCat();
  const [messages, setMessages] = useState<MessagePreview[]>([]);
  const [unmessagedMatches, setUnmessagedMatches] = useState<UnmessagedMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Use cached profile instead of redundant Supabase query
  const { profile: currentProfile } = useCurrentUserProfile();
  const userGender = currentProfile?.gender || null;
  const userIsVerified = currentProfile?.is_verified || false;
  const userIsPremiumDb = currentProfile?.is_premium || false;

  const shouldLockPreviews = useMemo(() => {
    return shouldLockMessaging(userIsVerified);
  }, [userIsVerified]);

  const isCurrentUserFemale = userGender === 'female';

  // Load chats from Supabase. Shows spinner only on initial load;
  // subsequent refetches update silently so the list doesn't flash.
  const loadChats = async (unmessagedMatchesList: UnmessagedMatch[] = []) => {
    try {
      if (messages.length === 0) setLoading(true);

      const userId = user?.id || process.env.EXPO_PUBLIC_TEST_USER_ID;

      if (!userId) {
        setMessages([]);
        return;
      }

      const response = await messagesService.getUserChats(userId);

      if (response.success && response.data) {
        // Transform ChatPreview to MessagePreview format
        const previews: MessagePreview[] = response.data.map((chat: ChatPreview) => ({
          id: chat.chat_id,
          userId: chat.other_user_id,
          name: chat.other_user_name,
          profileImage: chat.other_user_image || 'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=400&h=400&fit=crop&crop=face',
          lastMessage: chat.last_message || 'New conversation',
          timestamp: chat.last_message_at ? formatTimestamp(chat.last_message_at) : 'Just now',
          isUnread: chat.unread_count > 0,
          unreadCount: chat.unread_count,
          isOnline: chat.is_online || false,
          needsReply: chat.needs_reply || false,
        }));

        // Filter out users that are in unmessaged matches to avoid duplicates
        const unmessagedUserIds = new Set(unmessagedMatchesList.map(m => m.other_user_id));
        const filteredPreviews = previews.filter(
          (preview) => !unmessagedUserIds.has(preview.userId)
        );

        setMessages(filteredPreviews);
      } else {
        setMessages([]);
      }
    } catch (error) {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  // Load unmessaged matches
  const loadUnmessagedMatches = async () => {
    try {
      const userId = user?.id || process.env.EXPO_PUBLIC_TEST_USER_ID;
      if (!userId) {
        setUnmessagedMatches([]);
        return;
      }

      const response = await messagesService.getUnmessagedMatches(userId);
      if (response.success && response.data) {
        setUnmessagedMatches(response.data);
      } else {
        setUnmessagedMatches([]);
      }
    } catch (error) {
      console.error("[MessagesScreen] Failed to load unmessaged matches:", error);
      setUnmessagedMatches([]);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    // Load unmessaged matches first, then load chats with the list to filter
    const unmessagedResponse = await messagesService.getUnmessagedMatches(
      user?.id || process.env.EXPO_PUBLIC_TEST_USER_ID || ''
    );
    const unmessagedList = unmessagedResponse.success ? unmessagedResponse.data || [] : [];
    setUnmessagedMatches(unmessagedList);
    await loadChats(unmessagedList);
    setRefreshing(false);
  };

  // Format timestamp to display format
  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 60) {
      return `${minutes}m ago`;
    } else if (hours < 24) {
      return `${hours}h ago`;
    } else if (days < 7) {
      return `${days}d ago`;
    } else {
      return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
    }
  };

  useEffect(() => {
    const loadData = async () => {
      const userId = user?.id || process.env.EXPO_PUBLIC_TEST_USER_ID;
      if (!userId) return;

      // Load unmessaged matches first, then load chats with the list to filter
      const unmessagedResponse = await messagesService.getUnmessagedMatches(userId);
      const unmessagedList = unmessagedResponse.success ? unmessagedResponse.data || [] : [];
      setUnmessagedMatches(unmessagedList);
      await loadChats(unmessagedList);
    };

    loadData();
  }, [user?.id]);

  // Always reload on focus — new matches and messages can arrive from other
  // screens. No spinner flash because loadChats only shows the spinner when
  // there's no existing data (initial load).
  useFocusEffect(
    useCallback(() => {
      clearMessagesNotification();

      const loadData = async () => {
        const userId = user?.id || process.env.EXPO_PUBLIC_TEST_USER_ID;
        if (!userId) return;

        // Load unmessaged matches first, then load chats with the list to filter
        const unmessagedResponse = await messagesService.getUnmessagedMatches(userId);
        const unmessagedList = unmessagedResponse.success ? unmessagedResponse.data || [] : [];
        setUnmessagedMatches(unmessagedList);
        await loadChats(unmessagedList);
      };

      loadData();
    }, [user?.id, clearMessagesNotification])
  );

  // Memoized handler for unmessaged match press - MUST be before conditional returns
  const handleUnmessagedMatchPress = useCallback(async (match: UnmessagedMatch) => {
    try {
      const userId = user?.id || process.env.EXPO_PUBLIC_TEST_USER_ID;
      if (!userId) return;

      // Get or create chat for this match
      const chatResponse = await messagesService.getOrCreateChatBetweenUsers(
        userId,
        match.other_user_id,
        match.match_id
      );

      if (chatResponse.success && chatResponse.data) {
        navigation.navigate("Chat", {
          chatId: chatResponse.data,
          userId: match.other_user_id,
          userName: match.other_user_name,
          userImage: match.other_user_image || DEFAULT_IMAGE,
        });
      }
    } catch (error) {
      console.error("[MessagesScreen] Failed to open chat:", error);
    }
  }, [user?.id, navigation]);

  // Memoized handler for message item press
  const handleMessagePress = useCallback((item: MessagePreview) => {
    navigation.navigate("Chat", {
      chatId: item.id,
      userId: item.userId,
      userName: item.name,
      userImage: item.profileImage,
    });
  }, [navigation]);

  // Memoized handler for profile press
  const handleProfilePress = useCallback((userId: string) => {
    navigation.navigate("Profile", { userId });
  }, [navigation]);

  // Memoized renderItem for FlashList
  const renderMessageItem = useCallback(({ item }: ListRenderItemInfo<MessagePreview>) => (
    <MessageItem
      item={item}
      onPress={handleMessagePress}
      onProfilePress={handleProfilePress}
      isLocked={shouldLockPreviews}
    />
  ), [handleMessagePress, handleProfilePress, shouldLockPreviews]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />
        <Loading text="Loading chats..." fullScreen />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />

      {/* Fixed Banner Section - Always visible */}
      <View style={styles.matchingSection}>
        <View style={styles.matchingSectionHeader}>
          <Text style={styles.matchingSectionTitle}>Matches</Text>
          <Text style={styles.matchingSectionInstruction}>
            {isCurrentUserFemale
              ? "Send the first message for a much higher reply rate!"
              : "Message within 24 hours to boost your reply rate!"}
          </Text>
        </View>

        {/* Horizontal scroll for unmessaged matches - only show when there are matches */}
        {unmessagedMatches.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.unmessagedMatchesContainer}
          >
            {unmessagedMatches.map((match) => (
              <UnmessagedMatchItem
                key={match.match_id}
                match={match}
                onPress={handleUnmessagedMatchPress}
              />
            ))}
          </ScrollView>
        )}
      </View>

      {/* Messages List - Optimized for scroll performance */}
      <FlashList
        data={messages}
        renderItem={renderMessageItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesList}
        showsVerticalScrollIndicator={false}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        // FlashList performance props
        drawDistance={screenWidth * 2}
        ListEmptyComponent={
          <EmptyState
            icon="chatbubbles-outline"
            title="No messages yet"
            subtitle="Start a conversation with someone you've matched with."
          />
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  // Banner Section - Always visible, fixed at top
  // Height: 56px (header only) or ~140px (with matches)
  // Background: White
  // Bottom border for visual separation
  matchingSection: {
    backgroundColor: Colors.white,
    paddingTop: Spacing.md,        // 16px top padding
    paddingBottom: Spacing.md,     // 16px bottom padding
    paddingHorizontal: Spacing.md, // 16px horizontal padding
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
    // Ensures consistent spacing below banner
    marginBottom: 0,
  },
  // Banner Header - Contains title and instruction text
  matchingSectionHeader: {
    marginBottom: Spacing.sm,      // 12px gap before matches scroll
  },
  // "Matches" title
  // Font: 16px, Bold, Primary color
  matchingSectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
    marginBottom: 4,               // 4px gap between title and instruction
  },
  // "Message within 24 hours..." instruction text
  // Font: 12px, Regular, Secondary color
  matchingSectionInstruction: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    lineHeight: 16,
  },
  // Horizontal scroll container for unmessaged matches
  unmessagedMatchesContainer: {
    paddingLeft: 0,
    paddingRight: Spacing.md,
    paddingTop: Spacing.xs,        // 8px top padding for matches area
  },
  unmessagedMatchItem: {
    alignItems: "center",
    marginRight: Spacing.md,
    width: 80,
  },
  profileImageWrapper: {
    position: "relative",
    marginBottom: Spacing.xs,
  },
  unmessagedProfileImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2.5,
    borderColor: Colors.primary,
  },
  newBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xs,
    borderRadius: BorderRadius.full,
    minWidth: 32,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    ...Shadows.small,
  },
  newBadgeText: {
    fontSize: 10,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.white,
    textAlign: "center",
    lineHeight: 12,
    includeFontPadding: false,
  },
  matchInfoContainer: {
    width: "100%",
    alignItems: "center",
    marginTop: Spacing.xs / 3,
  },
  matchInfoText: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    textAlign: "center",
    width: "100%",
    lineHeight: 12,
  },
  // Messages list container
  // Gap between banner and first chat row: 0px (direct connection)
  // Bottom padding for safe scrolling
  messagesList: {
    flexGrow: 1,
    paddingTop: 0,               // No top padding - banner handles spacing
    paddingBottom: 100,          // Safe bottom padding for tab bar
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: Spacing["4xl"],
  },
  emptyStateTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  emptyStateSubtitle: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    textAlign: "center",
  },
  messageItem: {
    flexDirection: "row",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.white,
    borderRadius: 0,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.gray[200],
  },
  unrepliedMessageItem: {
    backgroundColor: "rgba(34, 197, 94, 0.05)",
  },
  profileImageContainer: {
    marginRight: Spacing.md,
  },
  profileImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  messageContent: {
    flex: 1,
  },
  messageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  name: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  onlineIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
    marginRight: Spacing.xs,
  },
  timestamp: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
  },
  messageFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  lastMessage: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    flex: 1,
    marginRight: Spacing.sm,
  },
  unreadBadge: {
    backgroundColor: Colors.gray[200],
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  unreadText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
  },
  // Locked preview styles
  lockedPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: Spacing.sm,
    gap: 4,
  },
  lockedPreviewText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.primary,
    flex: 1,
  },
});

export default MessagesScreen;
