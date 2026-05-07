import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { RootStackParamList } from "../types";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { useNotifications } from "../contexts/NotificationContext";

import { Colors } from "../constants/colors";
import { Spacing } from "../constants/spacing";
import { Typography } from "../constants/typography";
import { UserActivityService } from "../services/userActivityService";
import { UserListItem } from "../types/userActivity";
import StandardHeader from "../components/StandardHeader";

type FootprintsScreenNavigationProp = StackNavigationProp<RootStackParamList>;

const FootprintsScreen: React.FC = () => {
  const navigation = useNavigation<FootprintsScreenNavigationProp>();
  const { profileId } = useAuth();
  const { clearFootprintsSection } = useNotifications();
  const [footprintUsers, setFootprintUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Count of unviewed footprints for the "Mark all read" button
  const unviewedCount = footprintUsers.filter(item => item.isNew).length;

  const loadFootprints = async () => {
    try {
      setLoading(true);
      const currentUserId = profileId || process.env.EXPO_PUBLIC_TEST_USER_ID;
      if (!currentUserId) {
        console.log('No user ID available');
        setLoading(false);
        return;
      }

      const footprints = await UserActivityService.getFootprints(currentUserId);
      setFootprintUsers(footprints);
    } catch (error) {
      console.error("Error loading footprints:", error);
    } finally {
      setLoading(false);
    }
  };

  // Load footprints when entering the screen
  useFocusEffect(
    useCallback(() => {
      loadFootprints();
      // Clear the badge when user opens the footprints screen
      clearFootprintsSection();
    }, [profileId, clearFootprintsSection])
  );

  // Mark all footprints as viewed
  const handleMarkAllAsRead = async () => {
    const currentUserId = profileId || process.env.EXPO_PUBLIC_TEST_USER_ID;
    if (currentUserId) {
      // Mark all footprints as viewed in DB (single batch call)
      await UserActivityService.markFootprintsViewed(currentUserId);
      // Update local state to remove all green dots
      setFootprintUsers(prev => 
        prev.map(item => ({ ...item, isNew: false }))
      );
      // Clear the footprints section badge
      await clearFootprintsSection();
    }
  };

  const handleUserPress = async (user: UserListItem) => {
    const currentUserId = profileId || process.env.EXPO_PUBLIC_TEST_USER_ID;
    
    // Mark this specific footprint as viewed if it's new
    if (currentUserId && user.isNew) {
      await UserActivityService.markSingleFootprintViewed(currentUserId, user.id);
      // Update local state to remove the green dot
      setFootprintUsers(prev => 
        prev.map(item => 
          item.id === user.id ? { ...item, isNew: false } : item
        )
      );
      // Clear footprints badge if no more unviewed footprints
      const remainingNew = footprintUsers.filter(item => item.id !== user.id && item.isNew).length;
      if (remainingNew === 0) {
        await clearFootprintsSection();
      }
    }
    
    navigation.navigate("Profile", { userId: user.id });
  };

  const formatTimestamp = (timestamp: string): string => {
    if (!timestamp) return "";

    // Handle PostgreSQL timestamp format (replace space with T for ISO format)
    const isoTimestamp = timestamp.replace(' ', 'T');
    const date = new Date(isoTimestamp);

    // Check for invalid date
    if (isNaN(date.getTime())) {
      return "";
    }

    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInMinutes < 1) {
      return "Just now";
    } else if (diffInMinutes < 60) {
      return `${diffInMinutes}m ago`;
    } else if (diffInHours < 24) {
      return `${diffInHours}h ago`;
    } else {
      return `${diffInDays}d ago`;
    }
  };

  const renderUserItem = ({ item }: { item: UserListItem }) => (
    <TouchableOpacity
      style={[styles.userItem, item.isNew && styles.unreadItem]}
      onPress={() => handleUserPress(item)}
      activeOpacity={0.7}
    >
      <Image source={{ uri: item.profileImage }} style={styles.userImage} />
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{item.name}</Text>
        <View style={styles.userDetails}>
          {item.age && <Text style={styles.userDetail}>{item.age}</Text>}
          {item.location && (
            <Text style={styles.userDetail}>・{String(item.location)}</Text>
          )}
        </View>
      </View>
      <View style={styles.timestampContainer}>
        <Text style={styles.timestamp}>{formatTimestamp(item.timestamp)}</Text>
        {item.isNew && <View style={styles.unreadDot} />}
        <Ionicons name="chevron-forward" size={16} color={Colors.gray[400]} />
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons
        name="eye-off"
        size={48}
        color={Colors.gray[400]}
      />
      <Text style={styles.emptyTitle}>No profile views yet</Text>
      <Text style={styles.emptySubtitle}>
        People who viewed your profile will appear here
      </Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading profile views...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />

      {/* Header */}
      <StandardHeader
        title="Profile Views"
        showBackButton={true}
        onBackPress={() => navigation.goBack()}
        rightComponent={
          unviewedCount > 0 ? (
            <TouchableOpacity
              style={styles.markAllButton}
              onPress={handleMarkAllAsRead}
            >
              <Text style={styles.markAllText} numberOfLines={1}>Mark all read</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      {/* Content */}
      <View style={styles.content}>
        {footprintUsers.length > 0 ? (
          <FlatList
            data={footprintUsers}
            renderItem={renderUserItem}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContainer}
          />
        ) : (
          renderEmptyState()
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
  },
  content: {
    flex: 1,
  },
  listContainer: {
    paddingVertical: Spacing.sm,
  },
  userItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    backgroundColor: Colors.white,
  },
  unreadItem: {
    backgroundColor: Colors.primary + '05', // Light tint for unviewed items (same as notifications)
  },
  userImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: Spacing.md,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
    marginRight: Spacing.xs,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    marginBottom: Spacing.xs,
  },
  userDetails: {
    flexDirection: "row",
    alignItems: "center",
  },
  userDetail: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
  },
  timestampContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  timestamp: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    marginRight: Spacing.xs,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  emptySubtitle: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    textAlign: "center",
    lineHeight: 22,
  },
  markAllButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: Colors.primary + '10',
  },
  markAllText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: Typography.getFontFamily('600'),
    color: Colors.primary,
  },
});

export default FootprintsScreen;
