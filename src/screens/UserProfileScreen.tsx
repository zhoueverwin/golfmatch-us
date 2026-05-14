import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  TouchableOpacity,
  Image,
  Dimensions,
  FlatList,
  Alert,
  Animated,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useRoute,
  useNavigation,
  RouteProp,
  useFocusEffect,
} from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { RootStackParamList } from "../types";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";

import { Colors } from "../constants/colors";
import { Spacing, BorderRadius } from "../constants/spacing";
import { Typography } from "../constants/typography";
import { UserProfile, CalendarData, Post } from "../types/dataModels";
import Loading from "../components/Loading";
import EmptyState from "../components/EmptyState";
import GolfCalendar from "../components/GolfCalendar";
import ImageCarousel from "../components/ImageCarousel";
import VideoPlayer from "../components/VideoPlayer";
import PostMenuModal from "../components/PostMenuModal";
import FullscreenImageViewer from "../components/FullscreenImageViewer";
import { DataProvider } from "../services";
import { getProfilePicture, getValidProfilePictures } from "../constants/defaults";
import { UserActivityService } from "../services/userActivityService";
import { supabaseDataProvider } from "../services/supabaseDataProvider";
import { membershipService } from "../services/membershipService";
import { blocksService } from "../services/supabase/blocks.service";
import { hiddenPostsService } from "../services/hiddenPosts.service";
import { useProfile } from "../hooks/queries/useProfile";
import { useUserPosts, useReactToPost, useUnreactToPost } from "../hooks/queries/usePosts";

const verifyBadge = require("../../assets/images/badges/Verify.png");
const goldBadge = require("../../assets/images/badges/Gold.png");

const { width } = Dimensions.get("window");

// Cache calendar data to persist across component unmounts
const calendarCache: Record<string, CalendarData | null> = {};

// Gender display labels
const genderLabels: Record<string, string> = {
  male: "Male",
  female: "Female",
};

type ProfileScreenRouteProp = RouteProp<RootStackParamList, "Profile">;
type UserProfileScreenNavigationProp = StackNavigationProp<RootStackParamList>;

const UserProfileScreen: React.FC = () => {
  const route = useRoute<ProfileScreenRouteProp>();
  const navigation = useNavigation<UserProfileScreenNavigationProp>();
  const insets = useSafeAreaInsets();
  const { userId } = route.params;
  const { profileId } = useAuth(); // Get current user's profile ID

  // Use React Query hooks for data fetching
  const { profile, isLoading: profileLoading, refetch: refetchProfile } = useProfile(userId);
  const {
    posts,
    isLoading: postsLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch: refetchPosts,
  } = useUserPosts(userId);

  // Mutation hooks for reactions (with optimistic updates)
  const reactMutation = useReactToPost();
  const unreactMutation = useUnreactToPost();

  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);

  // Initialize calendar data from cache if available
  const cacheKey = `${userId}-${currentYear}-${currentMonth}`;
  const [calendarData, setCalendarDataInternal] = useState<CalendarData | null>(
    () => calendarCache[cacheKey] || null
  );

  // Wrapper to update both state and cache - use ref to avoid dependency issues
  const cacheKeyRef = React.useRef(cacheKey);
  cacheKeyRef.current = cacheKey;

  const setCalendarData = useCallback((data: CalendarData | null) => {
    calendarCache[cacheKeyRef.current] = data;
    setCalendarDataInternal(data);
  }, []);
  // null = not loaded yet, true/false = loaded
  const [isLiked, setIsLiked] = useState<boolean | null>(null);
  const [isLoadingLike, setIsLoadingLike] = useState(false);
  const [mutualLikesMap, setMutualLikesMap] = useState<Record<string, boolean>>({});
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [lastActiveAt, setLastActiveAt] = useState<string | null>(null);
  // Use Set for expandedPosts to avoid unbounded state growth
  const [expandedPostIds, setExpandedPostIds] = useState<Set<string>>(new Set());

  // User menu state (for profile-level block/report)
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Post menu state
  const [showPostMenu, setShowPostMenu] = useState(false);
  const [menuPost, setMenuPost] = useState<{ postId: string; userId: string; userName: string } | null>(null);

  // Hidden posts and blocked users state
  const [hiddenPostIds, setHiddenPostIds] = useState<Set<string>>(new Set());
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());

  // Photo gallery state
  const [photoIndex, setPhotoIndex] = useState(0);
  const [fullscreenVisible, setFullscreenVisible] = useState(false);
  const scrollX = useRef(new Animated.Value(0)).current;
  const heroScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    // Reset like status when navigating to a different profile (null = not loaded)
    setIsLiked(null);
    
    const loadAllData = async () => {
      await Promise.all([
        loadCalendarData(),
        checkIfLiked(),
        trackProfileView(),
        loadOnlineStatus(),
      ]);
    };

    loadAllData();
  }, [userId]);

  // Load online status for the profile user
  const loadOnlineStatus = async () => {
    try {
      const response = await supabaseDataProvider.getUserOnlineStatus(userId);
      if (response.success && response.data) {
        setIsOnline(response.data.isOnline);
        setLastActiveAt(response.data.lastActiveAt);
      }
    } catch (error) {
      console.error("[UserProfileScreen] Error loading online status:", error);
    }
  };

  // Format last active time for display
  const formatLastActive = (timestamp: string | null): string => {
    if (!timestamp) return "";
    
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

  // Track profile view when user views someone's profile
  const trackProfileView = async () => {
    try {
      const currentUserId = profileId || process.env.EXPO_PUBLIC_TEST_USER_ID;
      
      if (!currentUserId) {
        console.log('[UserProfileScreen] No current user ID, skipping tracking');
        return;
      }

      // Don't track if viewing own profile
      if (userId === currentUserId) {
        console.log('[UserProfileScreen] Viewing own profile, skipping tracking');
        return;
      }

      console.log(`[UserProfileScreen] Tracking profile view: ${currentUserId} -> ${userId}`);
      await UserActivityService.trackProfileView(currentUserId, userId);
    } catch (error) {
      console.error('[UserProfileScreen] Error tracking profile view:', error);
      // Don't block UI if tracking fails
    }
  };

  // Check mutual likes when posts change - use stable key to avoid infinite loop
  // Create a stable key based on post IDs that only changes when posts actually change
  const postsKey = posts.map(p => p.id).join(',');
  const postsRef = React.useRef(posts);
  postsRef.current = posts;

  useEffect(() => {
    if (postsRef.current.length > 0) {
      checkMutualLikesForPosts(postsRef.current);
    }
  }, [postsKey]);

  // Store refetchPosts in ref to avoid dependency issues
  const refetchPostsRef = React.useRef(refetchPosts);
  refetchPostsRef.current = refetchPosts;

  // Refresh posts and calendar when screen comes into focus (e.g., after creating a new post or editing calendar)
  useFocusEffect(
    useCallback(() => {
      // Check if viewing own profile
      const currentUserId = profileId || process.env.EXPO_PUBLIC_TEST_USER_ID;
      if (userId === currentUserId) {
        // Refresh posts for current user (My Page)
        refetchPostsRef.current();
      }

      // Always load calendar data when screen comes into focus
      const fetchCalendarData = async () => {
        try {
          const response = await DataProvider.getCalendarData(
            userId,
            currentYear,
            currentMonth,
          );
          if (!response.error) {
            setCalendarData(response.data || null);
          }
        } catch (error) {
          console.error("Error loading calendar on focus:", error);
        }
      };

      fetchCalendarData();
    }, [userId, profileId, currentYear, currentMonth]),
  );

  const loadCalendarData = async (year?: number, month?: number) => {
    try {
      const response = await DataProvider.getCalendarData(
        userId,
        year || currentYear,
        month || currentMonth,
      );
      if (response.error) {
        console.error("Failed to load calendar:", response.error);
      } else {
        setCalendarData(response.data || null);
      }
    } catch (_error) {
      console.error("Error loading calendar:", _error);
    }
  };

  // Use ref for loadCalendarData to avoid stale closure in handleMonthChange
  const loadCalendarDataRef = React.useRef(loadCalendarData);
  loadCalendarDataRef.current = loadCalendarData;

  const handleMonthChange = useCallback(async (year: number, month: number) => {
    setCurrentYear(year);
    setCurrentMonth(month);
    await loadCalendarDataRef.current(year, month);
  }, []);

  const handleCalendarDatePress = useCallback((date: string) => {
    console.log("Date pressed:", date);
  }, []);

  const handleLoadMorePosts = () => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  // Use batch API to check mutual likes for all users in posts
  // This is much more efficient than N individual API calls
  const checkMutualLikesForPosts = async (posts: Post[]) => {
    const currentUserId = profileId || process.env.EXPO_PUBLIC_TEST_USER_ID;
    if (!currentUserId) return;

    // Get unique user IDs excluding current user
    const userIds = [...new Set(
      posts
        .filter(post => post.user.id !== currentUserId)
        .map(post => post.user.id)
    )];

    if (userIds.length === 0) {
      setMutualLikesMap({});
      return;
    }

    try {
      // Single batch API call instead of N individual calls
      const response = await DataProvider.batchCheckMutualLikes(currentUserId, userIds);
      if (response.success && response.data) {
        setMutualLikesMap(response.data);
      } else {
        setMutualLikesMap({});
      }
    } catch (error) {
      console.error('Error checking mutual likes:', error);
      setMutualLikesMap({});
    }
  };

  const checkIfLiked = async () => {
    try {
      // Get current user ID from AuthContext
      const currentUserId = profileId || process.env.EXPO_PUBLIC_TEST_USER_ID;

      if (!currentUserId) {
        setIsLiked(false);
        return;
      }

      if (userId === currentUserId) {
        setIsLiked(false); // Can't like yourself
        return;
      }

      const response = await DataProvider.getUserInteractions(currentUserId);
      if (response.data) {
        const hasLiked = response.data.some(
          (interaction) =>
            interaction.liked_user_id === userId && interaction.type === "like",
        );
        setIsLiked(hasLiked);
      } else {
        setIsLiked(false);
      }
    } catch (_error) {
      console.error("Error checking like status:", _error);
      setIsLiked(false);
    }
  };

  const handleLike = async () => {
    if (isLoadingLike || isLiked) return;

    setIsLoadingLike(true);
    try {
      // Get current user ID from AuthContext
      const currentUserId = profileId || process.env.EXPO_PUBLIC_TEST_USER_ID;

      if (!currentUserId) {
        Alert.alert("Error", "Please sign in to like profiles");
        setIsLoadingLike(false);
        return;
      }

      if (userId === currentUserId) {
        console.log("Cannot like yourself");
        return;
      }

      const response = await DataProvider.likeUser(currentUserId, userId);
      if (response.error) {
        console.error("Failed to like user:", response.error);
      } else {
        setIsLiked(true);
        console.log("Successfully liked user:", userId);
      }
    } catch (_error) {
      console.error("Error liking user:", _error);
    } finally {
      setIsLoadingLike(false);
    }
  };

  const handleMessage = async (postUserId?: string, postUserName?: string, postUserImage?: string) => {
    const targetUserId = postUserId || userId;
    const targetUserName = postUserName || profile?.basic?.name || 'User';
    const targetUserImage = postUserImage || getProfilePicture(profile?.profile_pictures, 0);
    
    if (!targetUserName || !targetUserImage) return;
    
    const currentUserId = profileId || process.env.EXPO_PUBLIC_TEST_USER_ID;
    if (!currentUserId) return;

    try {
      // Check if users have mutual likes
      const mutualLikesResponse = await DataProvider.checkMutualLikes(currentUserId, targetUserId);
      
      if (!mutualLikesResponse.success || !mutualLikesResponse.data) {
        Alert.alert(
          "Can't Send Messages Yet",
          "You both need to like each other first. Try liking their profile.",
          [{ text: "OK" }]
        );
        return;
      }

      // Get or create chat between the two users
      const chatResponse = await DataProvider.getOrCreateChatBetweenUsers(
        currentUserId,
        targetUserId
      );
      
      if (chatResponse.success && chatResponse.data) {
        // Navigate directly to the specific chat
        navigation.navigate("Chat", {
          chatId: chatResponse.data,
          userId: targetUserId,
          userName: targetUserName,
          userImage: targetUserImage,
        });
      } else {
        Alert.alert("Error", "Couldn't start a chat.");
      }
    } catch (error) {
      console.error("Failed to handle message:", error);
      Alert.alert("Error", "Something went wrong with messaging.");
    }
  };

  const handleReaction = async (postId: string) => {
    const currentUserId = profileId || process.env.EXPO_PUBLIC_TEST_USER_ID;
    if (!currentUserId) return;

    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    try {
      // Toggle reaction with optimistic update (UI updates immediately)
      if (post.hasReacted) {
        await unreactMutation.mutateAsync({ postId, userId: currentUserId });
      } else {
        await reactMutation.mutateAsync({ postId, userId: currentUserId });
      }
    } catch (error) {
      console.error("Failed to toggle reaction:", error);
      // Error is automatically handled by mutation's onError (rollback)
    }
  };

  const handleViewProfile = (postUserId: string) => {
    if (postUserId !== userId) {
      navigation.navigate("Profile", { userId: postUserId });
    }
  };

  const handleToggleExpand = useCallback((postId: string) => {
    setExpandedPostIds((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
  }, []);

  // Load hidden posts and blocked users
  useEffect(() => {
    const loadFilterData = async () => {
      if (!profileId) return;

      try {
        // Load hidden posts
        const hiddenPosts = await hiddenPostsService.getHiddenPosts(profileId);
        setHiddenPostIds(new Set(hiddenPosts));

        // Load blocked users
        const blockedResult = await blocksService.getBlockedUserIds(profileId);
        if (blockedResult.success && blockedResult.data) {
          setBlockedUserIds(new Set(blockedResult.data));
        }
      } catch (error) {
        console.error("Error loading filter data:", error);
      }
    };

    loadFilterData();
  }, [profileId]);

  // Post menu handlers
  const handleOpenPostMenu = useCallback((post: Post) => {
    setMenuPost({
      postId: post.id,
      userId: post.user.id,
      userName: post.user.name,
    });
    setShowPostMenu(true);
  }, []);

  const handleHidePost = useCallback(async () => {
    if (!profileId || !menuPost) return;

    try {
      await hiddenPostsService.hidePost(profileId, menuPost.postId);
      setHiddenPostIds((prev) => new Set([...prev, menuPost.postId]));
      Alert.alert("Hidden", "This post has been hidden.");
    } catch (error) {
      console.error("Error hiding post:", error);
      Alert.alert("Error", "Failed to hide post.");
    }
  }, [profileId, menuPost]);

  const handleBlockUser = useCallback(async () => {
    if (!profileId || !menuPost) return;

    try {
      const result = await blocksService.blockUser(profileId, menuPost.userId);
      if (result.success) {
        setBlockedUserIds((prev) => new Set([...prev, menuPost.userId]));
        Alert.alert("Blocked", `You've blocked ${menuPost.userName}.`);
      } else {
        Alert.alert("Error", result.error || "Failed to block user.");
      }
    } catch (error) {
      console.error("Error blocking user:", error);
      Alert.alert("Error", "Failed to block user.");
    }
  }, [profileId, menuPost]);

  const handleReportPost = useCallback(() => {
    if (!menuPost) return;

    navigation.navigate("Report", {
      reportedUserId: menuPost.userId,
      reportedPostId: menuPost.postId,
      reportedUserName: menuPost.userName,
    });
  }, [navigation, menuPost]);

  // Profile-level block/report handlers
  const handleBlockProfile = useCallback(async () => {
    if (!profileId || !profile) return;

    try {
      const result = await blocksService.blockUser(profileId, userId);
      if (result.success) {
        Alert.alert(
          "Blocked",
          `You've blocked ${profile.basic?.name || "this user"}.`,
          [{ text: "OK", onPress: () => navigation.goBack() }]
        );
      } else {
        Alert.alert("Error", result.error || "Failed to block user.");
      }
    } catch (error) {
      console.error("Error blocking user:", error);
      Alert.alert("Error", "Failed to block user.");
    }
  }, [profileId, profile, userId, navigation]);

  const handleReportProfile = useCallback(() => {
    if (!profile) return;

    navigation.navigate("Report", {
      reportedUserId: userId,
      reportedUserName: profile.basic?.name || "User",
    });
  }, [navigation, userId, profile]);

  // Handle own post menu (delete)
  const handleOwnPostMenu = useCallback((post: Post) => {
    Alert.alert(
      "Manage Post",
      "Choose an action",
      [
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Delete Post",
              "Are you sure you want to delete this post? This can't be undone.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      const currentUserId = profileId || process.env.EXPO_PUBLIC_TEST_USER_ID;
                      if (!currentUserId) return;

                      const response = await DataProvider.deletePost(post.id, currentUserId);
                      if (response.success) {
                        Alert.alert("Done", "Post deleted.");
                        refetchPostsRef.current();
                      } else {
                        Alert.alert("Error", response.error || "Failed to delete.");
                      }
                    } catch (error) {
                      console.error("Error deleting post:", error);
                      Alert.alert("Error", "Failed to delete.");
                    }
                  },
                },
              ]
            );
          },
        },
        {
          text: "Cancel",
          style: "cancel",
        },
      ]
    );
  }, [profileId]);

  const renderPost = ({ item }: { item: Post }) => {
    // Safety check: Ensure post has user data
    if (!item || !item.user) {
      console.warn('[UserProfileScreen] Post missing user data:', item?.id);
      return null;
    }

    // Skip hidden posts and posts from blocked users
    if (hiddenPostIds.has(item.id) || blockedUserIds.has(item.user.id)) {
      return null;
    }

    const isExpanded = expandedPostIds.has(item.id);
    // Simple heuristic: content > 90 chars likely exceeds 3 lines
    const exceedsLines = !!(item.content && item.content.length > 90);
    const showMoreButton = exceedsLines && !isExpanded && item.content;
    const isOwnPost = item.user.id === (profileId || process.env.EXPO_PUBLIC_TEST_USER_ID);

    return (
      <View style={styles.postCard}>
        {/* Content and header section with padding */}
        <View style={styles.postContentSection}>
          {/* Profile Header - Show for all posts */}
          <View style={styles.postHeader}>
            <TouchableOpacity
              style={styles.userInfo}
              onPress={() => handleViewProfile(item.user.id)}
            >
              <ExpoImage
                source={{ uri: getProfilePicture(item.user.profile_pictures, 0) }}
                style={styles.profileImage}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={200}
                accessibilityLabel={`${item.user.name}'s profile photo`}
              />
              <View style={styles.userDetails}>
                <View style={styles.postUserName}>
                  <Text style={styles.postUsername}>{item.user.name}</Text>
                  {item.user.is_premium && (
                    <View style={styles.premiumPill}>
                      <Image source={goldBadge} style={styles.badgeIcon} resizeMode="contain" />
                    </View>
                  )}
                </View>
                <Text style={styles.timestamp}>{item.timestamp}</Text>
              </View>
            </TouchableOpacity>

            {/* Three-dot menu for post management */}
            {isOwnPost ? (
              <TouchableOpacity
                style={styles.moreButton}
                onPress={() => handleOwnPostMenu(item)}
                accessibilityRole="button"
                accessibilityLabel="Open post menu"
                accessibilityHint="Edit, delete, and more actions"
              >
                <Ionicons
                  name="ellipsis-horizontal"
                  size={20}
                  color={Colors.gray[600]}
                />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.moreButton}
                onPress={() => handleOpenPostMenu(item)}
                accessibilityRole="button"
                accessibilityLabel="Open post menu"
                accessibilityHint="Hide, block, report, and more"
              >
                <Ionicons
                  name="ellipsis-horizontal"
                  size={20}
                  color={Colors.gray[600]}
                />
              </TouchableOpacity>
            )}
          </View>

          {/* Post Content - Show for all posts */}
          {item.content && (
            <View style={styles.postContentContainer}>
              <Text
                style={styles.postContent}
                numberOfLines={isExpanded ? undefined : 3}
              >
                {item.content}
              </Text>
              {showMoreButton && (
                <TouchableOpacity
                  onPress={() => handleToggleExpand(item.id)}
                  activeOpacity={0.7}
                  style={styles.expandButton}
                >
                  <Text style={styles.moreLink}>Show more</Text>
                </TouchableOpacity>
              )}
              {isExpanded && exceedsLines && (
                <TouchableOpacity
                  onPress={() => handleToggleExpand(item.id)}
                  activeOpacity={0.7}
                  style={styles.expandButton}
                >
                  <Text style={styles.moreLink}>Show less</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Post Images - Full width */}
        {item.images.length > 0 && (
          <ImageCarousel
            images={item.images}
            fullWidth={true}
            style={styles.imageCarouselFullWidth}
            aspectRatio={item.aspect_ratio}
          />
        )}

        {/* Post Videos - Full width */}
        {item.videos && item.videos.length > 0 && (() => {
          const validVideos = item.videos.filter((video) => {
            if (!video || typeof video !== "string" || video.trim() === "") return false;
            if (video.startsWith("file://")) return false;
            return true;
          });
          if (validVideos.length === 0) return null;

          // Calculate height based on aspect ratio using full screen width
          const aspectRatio = item.aspect_ratio || (9 / 16); // Default to portrait
          const videoHeight = width / aspectRatio;

          return (
            <View style={styles.videoContainer}>
              {validVideos.map((video, index) => (
                <View
                  key={index}
                  style={[
                    styles.videoItem,
                    { height: videoHeight, backgroundColor: Colors.black }
                  ]}
                >
                  <VideoPlayer
                    videoUri={video}
                    style={styles.videoPlayer}
                    aspectRatio={item.aspect_ratio}
                  />
                </View>
              ))}
            </View>
          );
        })()}

        {/* Post Actions - With padding */}
        <View style={styles.postActionsSection}>
          <View style={styles.postActions}>
            {/* Reaction button */}
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleReaction(item.id)}
              accessibilityRole="button"
              accessibilityLabel={item.hasReacted ? "Remove reaction" : "React"}
            >
              <View style={styles.heartIconContainer}>
                <Ionicons
                  name={item.hasReacted ? "heart" : "heart-outline"}
                  size={20}
                  color={item.hasReacted ? "#EF4444" : Colors.gray[600]}
                />
              </View>
              <Text style={styles.actionText}>{item.reactions_count || item.likes || 0}</Text>
            </TouchableOpacity>

            {/* Message button - only show for other users' posts */}
            {item.user.id !== (profileId || process.env.EXPO_PUBLIC_TEST_USER_ID) && (
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  !mutualLikesMap[item.user.id] && styles.disabledActionButton
                ]}
                onPress={() => {
                  if (mutualLikesMap[item.user.id]) {
                    handleMessage(
                      item.user.id,
                      item.user.name,
                      getProfilePicture(item.user.profile_pictures, 0),
                    );
                  } else {
                    Alert.alert(
                      "Can't Send Messages Yet",
                      "You both need to like each other first. Try liking their profile.",
                      [{ text: "OK" }]
                    );
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel={
                  mutualLikesMap[item.user.id]
                    ? "Message"
                    : "Message (mutual like required)"
                }
              >
                <Image
                  source={require('../../assets/images/Icons/message.png')}
                  style={[
                    styles.messageIcon,
                    !mutualLikesMap[item.user.id] && styles.disabledMessageIcon
                  ]}
                  resizeMode="contain"
                />
                <Text style={[
                  styles.actionText,
                  !mutualLikesMap[item.user.id] && styles.disabledActionText
                ]}>
                  Message
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  };

  const renderProfileSection = (title: string, children: React.ReactNode, useCardStyle: boolean = true) => (
    <View style={[styles.section, useCardStyle && styles.sectionCard]}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionContent}>
        {children}
      </View>
    </View>
  );

  const renderProfileItem = (label: string, value: string) => (
    <View style={styles.profileItem}>
      <Text style={styles.profileLabel}>{label}</Text>
      <Text style={styles.profileValue}>{value}</Text>
    </View>
  );

  if (profileLoading && !profile) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />
        <Loading />
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />
        <EmptyState
          title="Profile Not Found"
          subtitle="We couldn't load this user's profile."
        />
      </SafeAreaView>
    );
  }

  // Validate profile structure - ensure we have at least a name or basic info
  const profileName = profile.basic?.name;
  if (!profileName && !profile.basic) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />
        <EmptyState
          title="Profile Data Incomplete"
          subtitle="We couldn't load the data for this profile."
        />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Image
            source={require("../../assets/images/Icons/Arrow-LeftGrey.png")}
            style={styles.backIconImage}
            resizeMode="contain"
          />
          <Text style={styles.backLabel}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        {profileId !== userId ? (
          <TouchableOpacity
            style={styles.headerMenuButton}
            onPress={() => setShowUserMenu(true)}
            accessibilityRole="button"
            accessibilityLabel="User menu"
          >
            <Ionicons name="ellipsis-horizontal" size={22} color={Colors.gray[600]} />
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Top Section - Profile Image Gallery with Gradient Overlay */}
        {(() => {
          const photos = getValidProfilePictures(profile.profile_pictures);
          const hasMultiplePhotos = photos.length > 1;
          return (
            <>
              <View style={styles.profileImageContainer}>
                {hasMultiplePhotos ? (
                  <Animated.ScrollView
                    ref={heroScrollRef}
                    horizontal
                    pagingEnabled
                    decelerationRate="fast"
                    showsHorizontalScrollIndicator={false}
                    onScroll={Animated.event(
                      [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                      { useNativeDriver: true }
                    )}
                    scrollEventThrottle={16}
                    onMomentumScrollEnd={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
                      const newIndex = Math.round(e.nativeEvent.contentOffset.x / width);
                      setPhotoIndex(newIndex);
                    }}
                    style={styles.heroScrollView}
                  >
                    {photos.map((photo, idx) => (
                      <TouchableOpacity
                        key={idx}
                        activeOpacity={0.9}
                        onPress={() => setFullscreenVisible(true)}
                      >
                        <ExpoImage
                          source={{ uri: photo }}
                          style={{ width, height: width * 1.1 }}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                          priority={idx === 0 ? "high" : "normal"}
                          transition={idx === 0 ? 200 : 0}
                          recyclingKey={`profile-hero-${idx}`}
                        />
                      </TouchableOpacity>
                    ))}
                  </Animated.ScrollView>
                ) : (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => {
                      if (photos[0] && !photos[0].startsWith('data:')) {
                        setFullscreenVisible(true);
                      }
                    }}
                  >
                    <ExpoImage
                      source={{ uri: getProfilePicture(profile.profile_pictures, 0) }}
                      style={styles.mainProfileImage}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      priority="high"
                      transition={200}
                    />
                  </TouchableOpacity>
                )}

                {/* Photo indicator bars */}
                {hasMultiplePhotos && (
                  <View style={styles.photoIndicatorContainer} pointerEvents="none">
                    {photos.map((_, idx) => {
                      const inputRange = [
                        (idx - 1) * width,
                        idx * width,
                        (idx + 1) * width,
                      ];
                      const barOpacity = scrollX.interpolate({
                        inputRange,
                        outputRange: [0.35, 0.95, 0.35],
                        extrapolate: "clamp",
                      });
                      return (
                        <Animated.View
                          key={idx}
                          style={[
                            styles.photoIndicatorBar,
                            { opacity: barOpacity },
                          ]}
                        />
                      );
                    })}
                  </View>
                )}

                {/* Gradient Overlay at bottom - fades to white with smooth easing */}
                <LinearGradient
                  colors={[
                    'rgba(255,255,255,0)',
                    'rgba(255,255,255,0.05)',
                    'rgba(255,255,255,0.15)',
                    'rgba(255,255,255,0.3)',
                    'rgba(255,255,255,0.5)',
                    'rgba(255,255,255,0.75)',
                    'rgba(255,255,255,0.9)',
                    'rgba(255,255,255,1)',
                  ]}
                  locations={[0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.88, 1]}
                  style={styles.imageGradient}
                  pointerEvents="none"
                />
              </View>

              {/* Thumbnail strip below hero */}
              {hasMultiplePhotos && (
                <View style={styles.profileThumbnailStrip}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.profileThumbnailContent}>
                    {photos.map((photo, idx) => (
                      <TouchableOpacity
                        key={idx}
                        activeOpacity={0.7}
                        onPress={() => {
                          setPhotoIndex(idx);
                          heroScrollRef.current?.scrollTo({ x: idx * width, animated: true });
                        }}
                      >
                        <ExpoImage
                          source={{ uri: photo }}
                          style={[
                            styles.profileThumbnailImage,
                            idx === photoIndex && styles.profileThumbnailImageActive,
                          ]}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                        />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </>
          );
        })()}

        {/* Basic Info Section */}
        <View style={styles.basicInfoSection}>
          <View style={styles.userNameRow}>
            <Text style={styles.userName}>{profile.basic?.name || 'User'}</Text>
            {profile.status?.is_premium && (
              <View style={styles.premiumPill}>
                <Image source={goldBadge} style={styles.badgeIcon} resizeMode="contain" />
              </View>
            )}
          </View>

          {/* Online Status / Last Active */}
          {profileId !== userId && (
            <View style={styles.statusRow}>
              {isOnline === true && (
                <View style={styles.onlineStatusContainer}>
                  <View style={styles.onlineStatusDot} />
                  <Text style={styles.onlineStatusText}>Online</Text>
                </View>
              )}
              {isOnline === false && lastActiveAt && (
                <Text style={styles.lastActiveText}>
                  Last active: <Text style={styles.lastActiveHighlight}>{formatLastActive(lastActiveAt)}</Text>
                </Text>
              )}
            </View>
          )}

          <View style={styles.locationRow}>
            <Ionicons
              name="location-outline"
              size={16}
              color={Colors.gray[500]}
            />
            <Text style={styles.locationText}>
              {profile.location?.prefecture || profile.basic?.prefecture || 'Not set'}
            </Text>
          </View>
          {/* Show prefecture again if different from location */}
          {profile.basic?.prefecture && profile.basic.prefecture !== profile.location?.prefecture && (
            <Text style={styles.subLocationText}>{profile.basic.prefecture}</Text>
          )}
        </View>

        {/* Self Introduction Section */}
        {profile.bio && profile.bio.trim() && renderProfileSection(
          "About",
          <Text style={styles.bioText}>{profile.bio}</Text>,
        )}

        {/* Basic Profile Section */}
        {profile.basic && renderProfileSection(
          "Basic Profile",
          <View style={styles.profileGrid}>
            {profile.basic.age && profile.basic.age !== "0" && profile.basic.age !== "" && renderProfileItem("Age", profile.basic.age)}
            {profile.basic.gender && profile.basic.gender !== "" && renderProfileItem("Gender", genderLabels[profile.basic.gender] || profile.basic.gender)}
            {profile.basic.prefecture && profile.basic.prefecture !== "" && renderProfileItem("Location", profile.basic.prefecture)}
            {profile.basic.blood_type && profile.basic.blood_type !== "" && renderProfileItem("Blood Type", profile.basic.blood_type)}
            {profile.basic.favorite_club && profile.basic.favorite_club !== "" && renderProfileItem("Favorite Club", profile.basic.favorite_club)}
            {profile.basic.height && profile.basic.height !== "" && renderProfileItem("Height", profile.basic.height + " cm")}
            {profile.basic.body_type && profile.basic.body_type !== "" && renderProfileItem("Body Type", profile.basic.body_type)}
            {profile.basic.smoking && profile.basic.smoking !== "" && renderProfileItem("Smoking", profile.basic.smoking)}
            {profile.basic.personality_type && profile.basic.personality_type !== "" &&
              renderProfileItem(
                "16 Personalities",
                profile.basic.personality_type,
              )}
          </View>,
        )}

        {/* Golf Profile Section */}
        {profile.golf && renderProfileSection(
          "Golf Profile",
          <View style={styles.profileGrid}>
            {profile.golf.skill_level && profile.golf.skill_level !== "" && renderProfileItem("Skill Level", profile.golf.skill_level)}
            {profile.golf.experience && profile.golf.experience !== "" && renderProfileItem("Years Playing", profile.golf.experience)}
            {profile.golf.average_score && profile.golf.average_score !== "0" && profile.golf.average_score !== "" && renderProfileItem("Average Score", profile.golf.average_score)}
            {profile.golf.best_score && profile.golf.best_score !== "" && renderProfileItem("Best Score", profile.golf.best_score)}
            {profile.golf.transportation && profile.golf.transportation !== "" && renderProfileItem("Transportation", profile.golf.transportation)}
            {profile.golf.available_days && profile.golf.available_days !== "" && renderProfileItem("Available Days", profile.golf.available_days)}
            {profile.play_prefecture && profile.play_prefecture.length > 0 && renderProfileItem("Where I Play", Array.isArray(profile.play_prefecture) ? profile.play_prefecture.join("\n") : profile.play_prefecture)}
          </View>,
        )}

        {/* Golf Availability Calendar */}
        {calendarData &&
          renderProfileSection(
            "Golf Availability",
            <GolfCalendar
              calendarData={calendarData}
              onDatePress={handleCalendarDatePress}
              onMonthChange={handleMonthChange}
              currentYear={currentYear}
              currentMonth={currentMonth}
            />,
          )}

        {/* Posts Section */}
        <View style={styles.postsSection}>
          <Text style={styles.sectionTitle}>Posts</Text>
          {posts.length > 0 ? (
            <View>
              <FlatList
                data={posts.slice(0, 3)}
                renderItem={renderPost}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                showsVerticalScrollIndicator={false}
              />
              {posts.length > 3 && (
                <TouchableOpacity
                  style={styles.viewAllPostsButton}
                  onPress={() => navigation.navigate("UserPosts", { userId })}
                >
                  <Text style={styles.viewAllPostsText}>
                    See all posts
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={styles.emptyPostsContainer}>
              <EmptyState
                title="No Posts Yet"
                subtitle="This user hasn't posted anything yet."
              />
            </View>
          )}
        </View>

        {/* Bottom Spacing for Like Button */}
        <View style={styles.bottomSpacing} />
      </ScrollView>

      {/* Like Button - Fixed at Bottom (only for other users, after like status is loaded) */}
      {profileId !== userId && isLiked !== null && (
        <View style={styles.likeButtonContainer}>
          <TouchableOpacity
            style={[
              styles.likeButton,
              isLiked && styles.likeButtonLiked,
              isLoadingLike && styles.likeButtonLoading,
            ]}
            onPress={handleLike}
            disabled={isLoadingLike || isLiked}
            accessibilityRole="button"
            accessibilityLabel={isLiked ? "Liked" : "Like"}
          >
            {isLoadingLike ? (
              <Text style={styles.likeButtonText}>Loading...</Text>
            ) : (
              <Text
                style={[
                  styles.likeButtonText,
                  isLiked && styles.likeButtonTextLiked,
                ]}
              >
                {isLiked ? "Liked" : "Like"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Post Menu Modal */}
      {menuPost && (
        <PostMenuModal
          visible={showPostMenu}
          onClose={() => setShowPostMenu(false)}
          postId={menuPost.postId}
          postUserId={menuPost.userId}
          postUserName={menuPost.userName}
          currentUserId={profileId || ""}
          onHide={handleHidePost}
          onBlock={handleBlockUser}
          onReport={handleReportPost}
        />
      )}

      {/* User Menu Modal (profile-level block/report) */}
      {showUserMenu && profile && (
        <PostMenuModal
          visible={showUserMenu}
          onClose={() => setShowUserMenu(false)}
          postId=""
          postUserId={userId}
          postUserName={profile.basic?.name || "User"}
          currentUserId={profileId || ""}
          onBlock={handleBlockProfile}
          onReport={handleReportProfile}
          showHideOption={false}
        />
      )}

      {/* Fullscreen Image Viewer for profile photos */}
      {profile && (
        <FullscreenImageViewer
          images={getValidProfilePictures(profile.profile_pictures)}
          initialIndex={photoIndex}
          visible={fullscreenVisible}
          onClose={() => setFullscreenVisible(false)}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.xs,
    gap: 4,
  },
  backIconImage: {
    width: 18,
    height: 18,
  },
  backLabel: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.primary,
  },
  headerTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
  },
  headerSpacer: {
    width: 32,
  },
  headerMenuButton: {
    padding: Spacing.xs,
    width: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollView: {
    flex: 1,
  },
  profileImageContainer: {
    width: "100%",
    height: width * 1.1,
    position: "relative",
  },
  mainProfileImage: {
    width: "100%",
    height: "100%",
  },
  imageGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 100,
    zIndex: 1,
  },
  heroScrollView: {
    width: "100%",
    height: "100%",
  },
  photoIndicatorContainer: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    flexDirection: "row",
    zIndex: 10,
    gap: 4,
  },
  photoIndicatorBar: {
    flex: 1,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "rgba(255,255,255,0.95)",
  },
  profileThumbnailStrip: {
    backgroundColor: Colors.white,
    paddingVertical: Spacing.sm,
  },
  profileThumbnailContent: {
    paddingHorizontal: Spacing.md,
    gap: 8,
  },
  profileThumbnailImage: {
    width: 60,
    height: 60,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: "transparent",
    opacity: 0.5,
  },
  profileThumbnailImageActive: {
    opacity: 1,
    borderColor: Colors.primary,
  },
  basicInfoSection: {
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  userNameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: Spacing.xs,
  },
  userName: {
    fontSize: 28,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
  },
  statusRow: {
    marginBottom: Spacing.sm,
  },
  onlineStatusContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  onlineStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
    marginRight: Spacing.xs,
  },
  onlineStatusText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
    color: Colors.success,
    fontWeight: Typography.fontWeight.medium,
  },
  lastActiveText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
  },
  lastActiveHighlight: {
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  locationText: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.gray[500],
    marginLeft: Spacing.xs,
  },
  subLocationText: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.gray[500],
    marginLeft: 20,
    marginBottom: Spacing.xs,
  },
  section: {
    marginTop: Spacing.md,
    marginHorizontal: Spacing.md,
  },
  sectionCard: {
    backgroundColor: Colors.lightGreen + "40",
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  sectionTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
  },
  sectionContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  bioText: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.primary,
    lineHeight: Typography.lineHeight.normal * Typography.fontSize.base,
  },
  profileGrid: {
    gap: 0,
  },
  profileItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.5)",
  },
  profileLabel: {
    width: "45%",
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.gray[500],
    flexShrink: 0,
  },
  profileValue: {
    flex: 1,
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    flexWrap: "wrap",
  },
  postCard: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
    backgroundColor: Colors.white,
  },
  postContentSection: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  postHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  profileImage: {
    width: 39,
    height: 39,
    borderRadius: 19.5,
    marginRight: 10,
  },
  userDetails: {
    flex: 1,
  },
  postUserName: {
    flexDirection: "row",
    alignItems: "center",
  },
  postUsername: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    marginRight: Spacing.xs,
  },
  verificationPill: {
    marginLeft: Spacing.xs,
  },
  premiumPill: {
    marginLeft: Spacing.xs,
  },
  badgeIcon: {
    width: 16,
    height: 16,
  },
  timestamp: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
  },
  moreButton: {
    padding: Spacing.sm,
  },
  postContentContainer: {
    marginBottom: Spacing.sm,
  },
  postContent: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.black,
    lineHeight: Typography.lineHeight.normal * Typography.fontSize.base,
    flex: 0,
  },
  expandButton: {
    marginTop: Spacing.xs,
    alignSelf: "flex-start",
  },
  moreLink: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.gray[500],
  },
  imageCarousel: {
    marginTop: Spacing.sm,
  },
  imageCarouselFullWidth: {
    marginTop: 0,
    marginHorizontal: 0,
  },
  videoContainer: {
    marginTop: Spacing.sm,
  },
  videoItem: {
    width: "100%",
    marginBottom: Spacing.sm,
  },
  videoPlayer: {
    borderRadius: 0, // No border radius for full-width
    overflow: "hidden",
  },
  postActionsSection: {
    paddingHorizontal: Spacing.md,
    paddingTop: 10,
    paddingBottom: Spacing.md,
  },
  postActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 32,
  },
  heartIconContainer: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  messageIcon: {
    width: 20,
    height: 20,
  },
  disabledMessageIcon: {
    opacity: 0.5,
  },
  actionText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.gray[500],
    marginLeft: 4,
  },
  disabledActionButton: {
    opacity: 0.5,
  },
  disabledActionText: {
    color: Colors.gray[400],
  },
  shareButton: {
    padding: Spacing.xs,
  },
  loadMoreButton: {
    backgroundColor: Colors.gray[100],
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    marginTop: Spacing.md,
  },
  loadMoreText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
    color: Colors.primary,
  },
  postsSection: {
    marginTop: Spacing.md,
    // No horizontal margins - allow media to be full-width like home page
    backgroundColor: Colors.lightGreen + "40",
    overflow: "hidden",
  },
  emptyPostsContainer: {
    padding: Spacing.lg,
    alignItems: "center",
  },
  viewAllPostsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  viewAllPostsText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.white,
    marginRight: Spacing.xs,
  },
  bottomSpacing: {
    height: 100, // Space for fixed like button
  },
  likeButtonContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  likeButton: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  likeButtonLiked: {
    backgroundColor: Colors.gray[300],
  },
  likeButtonLoading: {
    backgroundColor: Colors.gray[400],
  },
  likeButtonText: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.white,
  },
  likeButtonTextLiked: {
    color: Colors.gray[600],
  },
});

export default UserProfileScreen;
