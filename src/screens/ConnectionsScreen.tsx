import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  FlatList,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { RootStackParamList } from "../types";
import { Ionicons } from "@expo/vector-icons";

import { Colors } from "../constants/colors";
import { Spacing, BorderRadius } from "../constants/spacing";
import { Typography } from "../constants/typography";
import { User } from "../types/dataModels";
import { calculateAge } from "../utils/formatters";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import Button from "../components/Button";
import { DataProvider, matchesService, messagesService } from "../services";
import { userInteractionService } from "../services/userInteractionService";
import { UserActivityService } from "../services/userActivityService";
import { useAuth } from "../contexts/AuthContext";
import { useNotifications } from "../contexts/NotificationContext";


interface ConnectionItem {
  id: string;
  type: "like" | "match";
  profile: User;
  timestamp: string;
  isNew?: boolean;
  hasLikedBack?: boolean;
}

type ConnectionsScreenNavigationProp = StackNavigationProp<RootStackParamList>;

const ConnectionsScreen: React.FC = () => {
  const navigation = useNavigation<ConnectionsScreenNavigationProp>();
  const { user } = useAuth();
  const { clearConnectionNotification } = useNotifications();
  const [activeTab, setActiveTab] = useState<"like" | "match">("like");
  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [likesCount, setLikesCount] = useState(0);
  const [matchesCount, setMatchesCount] = useState(0);
  const [likedBackUsers, setLikedBackUsers] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const { userProfile } = useAuth();
  const userGender = userProfile?.gender || null;
  const skipNextReload = useRef(false);

  // Load received likes - OPTIMIZED: Single API call instead of N+1
  // Previous: 2 + N calls (getReceivedLikes + getUserLikes + N getUserById)
  // Now: 1 call (getLikesReceivedWithProfilesV2 with joined data + has_liked_back)
  const loadReceivedLikes = async () => {
    try {
      const currentUserId = user?.id || process.env.EXPO_PUBLIC_TEST_USER_ID;
      if (!currentUserId) return [];

      // SINGLE API CALL - gets likes + profiles + has_liked_back in one query
      const response = await matchesService.getLikesReceivedWithProfilesV2(currentUserId);

      if (!response.success || !response.data) return [];

      // Map the joined data directly - NO additional API calls needed
      const likes = response.data.map((item: any) => {
        const likeCreatedAt = new Date(item.liked_at);
        const now = new Date();
        const hoursSinceLike = (now.getTime() - likeCreatedAt.getTime()) / (1000 * 60 * 60);

        return {
          id: item.like_id,
          type: "like" as const,
          profile: {
            id: item.liker_id,
            name: item.liker_name,
            age: item.liker_age,
            prefecture: item.liker_prefecture,
            profile_pictures: item.liker_profile_pictures || [],
            is_verified: item.liker_is_verified,
            is_premium: item.liker_is_premium,
          },
          timestamp: likeCreatedAt.toLocaleDateString('ja-JP'),
          isNew: hoursSinceLike <= 24,
          hasLikedBack: item.has_liked_back, // Now from single query!
        } as ConnectionItem;
      });

      return likes;
    } catch (error) {
      console.error('[ConnectionsScreen] Error loading likes:', error);
      return [];
    }
  };

  // Load matches
  const loadMatches = async (): Promise<ConnectionItem[]> => {
    try {
      const currentUserId = user?.id || process.env.EXPO_PUBLIC_TEST_USER_ID;
      if (!currentUserId) return [];

      const response = await matchesService.getMatches(currentUserId);
      
      if (response.success && response.data) {
        const matchesData = response.data.map((match: any) => {
          const otherUserId = match.user1_id === currentUserId ? match.user2_id : match.user1_id;
          const otherUserData = match.user1_id === currentUserId ? match.user2 : match.user1;
          
          return {
            id: match.id,
            type: "match" as const,
            profile: { ...otherUserData, id: otherUserId }, // Force UUID
            timestamp: new Date(match.matched_at).toLocaleDateString('ja-JP'),
            isNew: false,
          };
        });
        
        return matchesData;
      }
      return [];
    } catch (error) {
      console.error('[ConnectionsScreen] Error loading matches:', error);
      return [];
    }
  };

  // Load all data. Shows spinner only on initial load (no existing data);
  // subsequent refetches update silently so the list doesn't flash.
  const loadData = async () => {
    if (connections.length === 0) setLoading(true);
    const [likes, matches] = await Promise.all([loadReceivedLikes(), loadMatches()]);
    const allConnections: ConnectionItem[] = [...(likes as ConnectionItem[] || []), ...(matches || [])];
    setConnections(allConnections);
    setLikesCount((likes || []).length);
    setMatchesCount((matches || []).length);
    setLoading(false);
  };

  // Always reload on focus — matches/likes can change from swipe actions
  // on other screens. No spinner flash because loadData only shows the
  // spinner when there's no existing data (initial load).
  useFocusEffect(
    React.useCallback(() => {
      clearConnectionNotification();
      const userId = user?.id || process.env.EXPO_PUBLIC_TEST_USER_ID;
      if (userId) {
        UserActivityService.markLikesViewed(userId);
      }
      // Skip reload when returning from Profile/Chat push navigation
      // to preserve FlatList scroll position
      if (skipNextReload.current) {
        skipNextReload.current = false;
        return;
      }
      loadData();
    }, [clearConnectionNotification, user?.id])
  );

  const getAgeRange = (age: number): string => {
    if (age < 30) return "20s";
    if (age < 40) return "30s";
    if (age < 50) return "40s";
    return "50s";
  };

  const getSkillLevelText = (level: string | null | undefined): string => {
    if (!level) return "Not set";

    switch (level) {
      case "Beginner":
      case "Intermediate":
      case "Advanced":
      case "Pro":
        return level;
      // Lowercase variants from older clients
      case "beginner":
        return "Beginner";
      case "intermediate":
        return "Intermediate";
      case "advanced":
        return "Advanced";
      case "professional":
        return "Pro";
      default:
        return "Not set";
    }
  };

  const handleLikeBack = async (profileId: string) => {
    try {
      const currentUserId = user?.id || process.env.EXPO_PUBLIC_TEST_USER_ID;
      if (!currentUserId) return;

      // Check if user has already liked back
      const connectionItem = connections.find(item => item.profile.id === profileId);
      if (connectionItem?.hasLikedBack) {
        return;
      }
      
      // Add to liked back users for UI state
      setLikedBackUsers((prev) => new Set(prev).add(profileId));

      // Send like to the database - returns boolean, not object
      const success = await userInteractionService.likeUser(currentUserId, profileId);
      
      if (success) {
        // Reload data to reflect the match
        setTimeout(async () => {
          await loadData();
          // Remove from liked back users after reload
          setLikedBackUsers((prev) => {
            const newSet = new Set(prev);
            newSet.delete(profileId);
            return newSet;
          });
        }, 1000);
      } else {
        Alert.alert("Error", "Failed to send Like.");
        setLikedBackUsers((prev) => {
          const newSet = new Set(prev);
          newSet.delete(profileId);
          return newSet;
        });
      }
    } catch (error) {
      console.error('[ConnectionsScreen] Error liking back:', error);
      Alert.alert("Error", "Failed to send Like.");
      setLikedBackUsers((prev) => {
        const newSet = new Set(prev);
        newSet.delete(profileId);
        return newSet;
      });
    }
  };


  const handleStartChat = async (profileId: string) => {
    try {
      const currentUserId = user?.id || process.env.EXPO_PUBLIC_TEST_USER_ID;
      if (!currentUserId) {
        Alert.alert("Error", "Please sign in first.");
        return;
      }

      // Find the user profile from connections
      const userProfile = connections.find(
        (item) => item.profile.id === profileId,
      )?.profile;

      if (!userProfile) {
        Alert.alert("Error", "We couldn't find that user's info.");
        return;
      }

      // Get or create chat between the two users
      const chatResponse = await messagesService.getOrCreateChatBetweenUsers(
        currentUserId,
        profileId
      );

      if (chatResponse.success && chatResponse.data) {
        skipNextReload.current = true;
        navigation.navigate("Chat", {
          chatId: chatResponse.data,
          userId: profileId,
          userName: userProfile.name,
          userImage: userProfile.profile_pictures?.[0] || "https://images.unsplash.com/photo-1494790108755-2616b612b786?w=400&h=400&fit=crop&crop=face",
        });
      } else {
        Alert.alert("Error", "Failed to start chat: " + (chatResponse.error || "Unknown error"));
      }
    } catch (error) {
      console.error("[ConnectionsScreen] Error starting chat:", error);
      Alert.alert("Error", "Failed to start chat.");
    }
  };

  const handleViewProfile = (profileId: string) => {
    skipNextReload.current = true;
    navigation.navigate("Profile", { userId: profileId });
  };

  const filteredConnections = connections.filter(
    (item) => item.type === activeTab,
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />
        <View style={styles.header}>
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tab, activeTab === "like" && styles.activeTab]}
              onPress={() => setActiveTab("like")}
            >
              <Text
                style={[styles.tabText, activeTab === "like" && styles.activeTabText]}
              >
                {`Likes${likesCount > 0 ? ` (${likesCount})` : ""}`}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === "match" && styles.activeTab]}
              onPress={() => setActiveTab("match")}
            >
              <Text
                style={[styles.tabText, activeTab === "match" && styles.activeTabText]}
              >
                {`Matches${matchesCount > 0 ? ` (${matchesCount})` : ""}`}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const renderConnectionItem = ({ item }: { item: ConnectionItem }) => (
    <Card style={styles.connectionItem} shadow="small">
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.profileSection}
          onPress={() => handleViewProfile(item.profile.id)}
          activeOpacity={0.7}
        >
          <Image
            source={{ uri: item.profile.profile_pictures[0] }}
            style={styles.profileImage}
            accessibilityLabel={`${item.profile.name}'s profile photo`}
          />
          <View style={styles.profileInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.profileName} numberOfLines={1} ellipsizeMode="tail">
                {item.profile.name}
              </Text>
              {item.isNew && (
                <View style={styles.newBadge}>
                  <Text style={styles.newBadgeText}>NEW</Text>
                </View>
              )}
            </View>
            <Text style={styles.ageLocation} numberOfLines={2}>
              {item.profile.prefecture} · {getAgeRange(item.profile.birth_date ? calculateAge(item.profile.birth_date) : item.profile.age)} {item.timestamp}
            </Text>
          </View>
        </TouchableOpacity>

        {item.type === "like" ? (
          <Button
            title={
              item.hasLikedBack || likedBackUsers.has(item.profile.id)
                ? "Liked"
                : "Like Back"
            }
            onPress={() => handleLikeBack(item.profile.id)}
            variant={
              item.hasLikedBack || likedBackUsers.has(item.profile.id) ? "secondary" : "primary"
            }
            size="small"
            style={styles.actionPill}
            disabled={item.hasLikedBack || likedBackUsers.has(item.profile.id)}
            loading={likedBackUsers.has(item.profile.id)}
          />
        ) : (
          <Button
            title="Send Message"
            onPress={() => handleStartChat(item.profile.id)}
            variant="primary"
            size="small"
            style={styles.actionPill}
          />
        )}
      </View>
    </Card>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />

      <View style={styles.header}>
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === "like" && styles.activeTab]}
            onPress={() => setActiveTab("like")}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "like" && styles.activeTabText,
              ]}
            >
              {`Likes${likesCount > 0 ? ` (${likesCount})` : ""}`}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === "match" && styles.activeTab]}
            onPress={() => setActiveTab("match")}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "match" && styles.activeTabText,
              ]}
            >
              {`Matches${matchesCount > 0 ? ` (${matchesCount})` : ""}`}
            </Text>
          </TouchableOpacity>
          </View>
        </View>

      {/* Female encouragement banner on match tab */}
      {activeTab === "match" && userGender === "female" && filteredConnections.length > 0 && (
        <View style={styles.femaleBanner}>
          <Ionicons name="chatbubble-ellipses" size={20} color={Colors.primary} />
          <View style={styles.femaleBannerTextContainer}>
            <Text style={styles.femaleBannerTitle}>Send the first message!</Text>
            <Text style={styles.femaleBannerSubtitle}>Start the conversation with a quick hello.</Text>
          </View>
        </View>
      )}

      {/* Connections List */}
      <FlatList
        data={filteredConnections}
        renderItem={renderConnectionItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.connectionsList}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            icon={activeTab === "like" ? "heart-outline" : "people-outline"}
            title={
              activeTab === "like" ? "No Likes yet" : "No matches yet"
            }
            subtitle={
              activeTab === "like"
                ? "Complete your profile to start receiving Likes."
                : "Send Likes to find your matches."
            }
            buttonTitle="Discover Profiles"
            onButtonPress={() => navigation.navigate("Search" as any)}
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tabContainer: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.full,
    padding: Spacing.xs,
    marginRight: 0,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BorderRadius.full,
  },
  activeTab: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
    color: Colors.gray[500],
  },
  activeTabText: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
  },
  connectionsList: {
    padding: Spacing.sm,
    flexGrow: 1,
  },
  connectionItem: {
    marginBottom: Spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  profileSection: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  profileImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: Spacing.md,
  },
  profileInfo: {
    flex: 1,
    justifyContent: "center",
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  profileName: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    marginRight: Spacing.xs,
    flex: 1,
    flexShrink: 1,
  },
  verificationPill: {
    marginRight: Spacing.xs,
  },
  badgeIcon: {
    width: 16,
    height: 16,
  },
  newBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    marginLeft: Spacing.xs,
  },
  newBadgeText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.white,
  },
  ageLocation: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    lineHeight: 14,
    marginTop: 2,
  },
  actionPill: {
    width: 168,
    minWidth: 168,
    maxWidth: 168,
    marginLeft: Spacing.sm,
  },
  // Female encouragement banner
  femaleBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: `${Colors.primary}14`,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    marginHorizontal: Spacing.sm,
    marginTop: Spacing.sm,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  femaleBannerTextContainer: {
    flex: 1,
  },
  femaleBannerTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    marginBottom: 2,
  },
  femaleBannerSubtitle: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: Typography.fontSize.base,
    color: Colors.text.secondary,
  },
});

export default ConnectionsScreen;
