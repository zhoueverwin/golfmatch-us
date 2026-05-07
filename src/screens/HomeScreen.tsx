import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  Image,
  Alert,
  Animated,
  Dimensions,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { RootStackParamList } from "../types";
import { Ionicons } from "@expo/vector-icons";
import { useBackHandler } from "../hooks/useBackHandler";

import { Colors } from "../constants/colors";
import { Spacing, BorderRadius } from "../constants/spacing";
import { Typography } from "../constants/typography";
import { Post } from "../types/dataModels";
import EmptyState from "../components/EmptyState";
import Loading from "../components/Loading";
import PostCreationModal from "../components/PostCreationModal";
import PostMenuModal from "../components/PostMenuModal";
import { DataProvider } from "../services";
import { useAuth } from "../contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { usePosts, useReactToPost, useUnreactToPost } from "../hooks/queries/usePosts";
import { useBatchMutualLikes } from "../hooks/queries/useMutualLikes";
import { blocksService } from "../services/supabase/blocks.service";
import { hiddenPostsService } from "../services/hiddenPosts.service";
import PostItem from "../components/PostItem";
import { visibilityManager } from "../utils/VisibilityManager";
import { containsYouTubeUrl } from "../utils/youtubeUtils";
import { UserActivityService } from "../services/userActivityService";
 

const AnimatedFlashList = Animated.createAnimatedComponent(FlashList) as React.ComponentType<any>;

const { width: screenWidth } = Dimensions.get('window');

type HomeScreenNavigationProp = StackNavigationProp<RootStackParamList>;

const HomeScreen: React.FC = () => {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const insets = useSafeAreaInsets();
  const { user, profileId } = useAuth(); // Get profileId from AuthContext
  const queryClient = useQueryClient(); // For cache invalidation

  const [activeTab, setActiveTab] = useState<"recommended" | "following">(
    "recommended",
  );
  const [showPostModal, setShowPostModal] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);

  // In-memory dedup set for post view tracking (avoids repeated fire-and-forget calls)
  const trackedPostIds = useRef(new Set<string>()).current;

  // Viewability callbacks - update VisibilityManager directly (no React state = no re-renders)
  const onViewableItemsChangedRecommended = useRef(({ viewableItems }: { viewableItems: any[] }) => {
    const visibleIds = viewableItems.map((v) => v.item.id);
    visibilityManager.setVisiblePosts(visibleIds);
    // Track post views for newly visible posts
    if (profileId) {
      for (const id of visibleIds) {
        if (!trackedPostIds.has(id)) {
          trackedPostIds.add(id);
          UserActivityService.trackPostView(profileId, id);
        }
      }
    }
  }).current;

  const onViewableItemsChangedFollowing = useRef(({ viewableItems }: { viewableItems: any[] }) => {
    const visibleIds = viewableItems.map((v) => v.item.id);
    visibilityManager.setVisiblePosts(visibleIds);
    if (profileId) {
      for (const id of visibleIds) {
        if (!trackedPostIds.has(id)) {
          trackedPostIds.add(id);
          UserActivityService.trackPostView(profileId, id);
        }
      }
    }
  }).current;
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 20, // Lower threshold to keep videos loaded longer during scroll
    minimumViewTime: 100, // Minimum time item must be visible before being marked as viewable
  }).current;
  // Use refs for expandedPosts to avoid unbounded state growth
  // Only store IDs of posts that ARE expanded (not all posts ever seen)
  const [expandedPostIds, setExpandedPostIds] = useState<Set<string>>(new Set());

  // Post menu state
  const [showPostMenu, setShowPostMenu] = useState(false);
  const [menuPost, setMenuPost] = useState<{ postId: string; userId: string; userName: string } | null>(null);

  // Hidden posts and blocked users state
  const [hiddenPostIds, setHiddenPostIds] = useState<Set<string>>(new Set());
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());

  // Use React Query for posts data fetching - fetch both tabs to keep them mounted
  const {
    posts: recommendedPosts,
    isLoading: isLoadingRecommended,
    isFetching: isFetchingRecommended,
    fetchNextPage: fetchNextPageRecommended,
    hasNextPage: hasNextPageRecommended,
    isFetchingNextPage: isFetchingNextPageRecommended,
    refetch: refetchRecommended,
  } = usePosts({ type: "recommended", userId: profileId || undefined });

  const {
    posts: followingPosts,
    isLoading: isLoadingFollowing,
    isFetching: isFetchingFollowing,
    fetchNextPage: fetchNextPageFollowing,
    hasNextPage: hasNextPageFollowing,
    isFetchingNextPage: isFetchingNextPageFollowing,
    refetch: refetchFollowing,
  } = usePosts({ type: "following", userId: profileId || undefined, enabled: activeTab === "following" });

  // Filter out hidden posts and blocked users before passing to FlashList
  // This is critical because FlashList crashes if renderItem returns null
  const filteredRecommendedPosts = useMemo(() => {
    return recommendedPosts.filter(
      (post) => !hiddenPostIds.has(post.id) && !blockedUserIds.has(post.user.id)
    );
  }, [recommendedPosts, hiddenPostIds, blockedUserIds]);

  const filteredFollowingPosts = useMemo(() => {
    return followingPosts.filter(
      (post) => !hiddenPostIds.has(post.id) && !blockedUserIds.has(post.user.id)
    );
  }, [followingPosts, hiddenPostIds, blockedUserIds]);

  // Get current tab's data
  const posts = activeTab === "recommended" ? filteredRecommendedPosts : filteredFollowingPosts;
  const isLoading = activeTab === "recommended" ? isLoadingRecommended : isLoadingFollowing;
  const isFetching = activeTab === "recommended" ? isFetchingRecommended : isFetchingFollowing;
  const fetchNextPage = activeTab === "recommended" ? fetchNextPageRecommended : fetchNextPageFollowing;
  const hasNextPage = activeTab === "recommended" ? hasNextPageRecommended : hasNextPageFollowing;
  const isFetchingNextPage = activeTab === "recommended" ? isFetchingNextPageRecommended : isFetchingNextPageFollowing;
  const refetch = activeTab === "recommended" ? refetchRecommended : refetchFollowing;

  // Extract unique user IDs from both tabs for batch mutual likes check
  // Memoize to prevent triggering re-fetches on every render
  const userIds = useMemo(() => {
    const ids = new Set<string>();
    const testUserId = process.env.EXPO_PUBLIC_TEST_USER_ID;

    // Add user IDs from recommended posts
    for (const post of recommendedPosts) {
      if (post.user.id !== profileId && post.user.id !== testUserId) {
        ids.add(post.user.id);
      }
    }

    // Add user IDs from following posts
    for (const post of followingPosts) {
      if (post.user.id !== profileId && post.user.id !== testUserId) {
        ids.add(post.user.id);
      }
    }

    return Array.from(ids);
  }, [recommendedPosts, followingPosts, profileId]);

  const { mutualLikesMap } = useBatchMutualLikes(profileId || undefined, userIds);

  // Stabilize mutualLikesMap reference to prevent unnecessary FlashList re-renders
  // FlashList uses extraData reference equality — new object = full re-render of all items
  const stableMutualLikesMap = useMemo(() => {
    return mutualLikesMap;
  }, [JSON.stringify(mutualLikesMap)]);

  // Optimistic mutation hooks
  const reactMutation = useReactToPost();
  const unreactMutation = useUnreactToPost();
  
  
  // Scroll animation values - using native driver for smooth 60fps animation
  const scrollY = useRef(new Animated.Value(0)).current;

  // Fixed heights for header components
  const headerBaseHeight = 47;
  const tabHeight = 56;
  const totalHeaderHeight = headerBaseHeight + insets.top + tabHeight;

  // Header opacity and transform - using only native-driver compatible properties
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 30, 80],
    outputRange: [1, 1, 0],
    extrapolate: "clamp",
  });

  const headerTranslateY = scrollY.interpolate({
    inputRange: [0, 80],
    outputRange: [0, -(headerBaseHeight + insets.top)],
    extrapolate: "clamp",
  });

  const tabTranslateY = scrollY.interpolate({
    inputRange: [0, 80],
    outputRange: [0, -tabHeight],
    extrapolate: "clamp",
  });

  // Handle scroll events - Using Animated.event with Native Driver for smooth performance
  // No longer needs scroll tracking for viewability - handled by VisibilityManager
  const handleScroll = useMemo(
    () =>
      Animated.event(
        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
        { useNativeDriver: true }
      ),
    [scrollY]
  );

  // Handle Android back button
  useBackHandler(() => {
    if (showPostModal) {
      setShowPostModal(false);
      return true;
    }
    return false;
  });

  // Note: Removed useFocusEffect refetch to reduce egress
  // Data is already cached with React Query and will refresh based on staleTime
  // Users can still pull-to-refresh manually when needed

  // Clear visibility manager when switching tabs to prevent stale visibility state
  useEffect(() => {
    visibilityManager.clear();
  }, [activeTab]);

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

  // Note: Removed AppState background sync to reduce egress
  // React Query's staleTime handles data freshness
  // Users can pull-to-refresh for immediate updates

  // Note: Disabled image preloading to reduce egress/bandwidth
  // expo-image's memory-disk caching handles this efficiently on-demand

  // Handle reaction with optimistic updates
  const handleReaction = useCallback(async (postId: string) => {
    const currentUserId = profileId || process.env.EXPO_PUBLIC_TEST_USER_ID;
    if (!currentUserId) return;

    // Search in both tabs' posts to avoid stale closure issues
    // Since both FlashLists are always mounted, we need to check both arrays
    const post = filteredRecommendedPosts.find((p) => p.id === postId) ||
                 filteredFollowingPosts.find((p) => p.id === postId);

    if (!post) return;

    try {
      // Toggle reaction with optimistic update (UI updates immediately)
      if (post.hasReacted) {
        await unreactMutation.mutateAsync({ postId, userId: currentUserId });
      } else {
        await reactMutation.mutateAsync({ postId, userId: currentUserId });
      }
    } catch (error) {
      console.error("Failed to react to post:", error);
      // Error is automatically handled by mutation's onError (rollback)
    }
  }, [profileId, filteredRecommendedPosts, filteredFollowingPosts, reactMutation, unreactMutation]);

  // const handleComment = (postId: string) => {
  //   console.log('Comment on post:', postId);
  //   // TODO: Navigate to comments
  // };

  const handleViewProfile = useCallback((userId: string) => {
    console.log("View profile:", userId);
    navigation.navigate("Profile", { userId });
  }, [navigation]);

  const handleMessage = useCallback(async (
    userId: string,
    userName: string,
    userImage: string,
  ) => {
    console.log("Message user:", userId);

    const currentUserId = profileId || process.env.EXPO_PUBLIC_TEST_USER_ID;
    if (!currentUserId) return;

    try {
      // OPTIMIZED: Removed redundant checkMutualLikes API call
      // Mutual likes are already verified by handleMessagePress using mutualLikesMap
      // This eliminates N unnecessary API calls per message attempt

      // Get or create chat between the two users
      const chatResponse = await DataProvider.getOrCreateChatBetweenUsers(
        currentUserId,
        userId
      );

      if (chatResponse.success && chatResponse.data) {
        // Navigate directly to the specific chat
        navigation.navigate("Chat", {
          chatId: chatResponse.data,
          userId,
          userName,
          userImage,
        });
      } else {
        Alert.alert("エラー", "チャットの作成に失敗しました");
      }
    } catch (error) {
      console.error("Failed to handle message:", error);
      Alert.alert("エラー", "メッセージ機能でエラーが発生しました");
    }
  }, [profileId, navigation]);

  // Memoized handler for message button press - handles mutual likes check
  const handleMessagePress = useCallback((
    userId: string,
    userName: string,
    userImage: string,
    hasMutualLikes: boolean
  ) => {
    if (hasMutualLikes) {
      handleMessage(userId, userName, userImage);
    } else {
      Alert.alert(
        "メッセージを送信できません",
        "お互いにいいねを送る必要があります。まず相手のプロフィールをいいねしてください。",
        [{ text: "OK" }]
      );
    }
  }, [handleMessage]);

  const handleRefreshRecommended = useCallback(async () => {
    await refetchRecommended();
  }, [refetchRecommended]);

  const handleRefreshFollowing = useCallback(async () => {
    await refetchFollowing();
  }, [refetchFollowing]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Prefetch next page when user reaches 80% of current content
  const handlePrefetch = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      // Prefetch silently in background
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);


  const handlePostMenu = (post: Post) => {
    Alert.alert("投稿の管理", "操作を選択してください", [
      {
        text: "編集",
        onPress: () => handleEditPost(post),
      },
      {
        text: "削除",
        style: "destructive",
        onPress: () => handleDeletePost(post.id),
      },
      {
        text: "キャンセル",
        style: "cancel",
      },
    ]);
  };

  const handleEditPost = (post: Post) => {
    setSelectedPost(post);
    setShowPostModal(true);
  };

  const handleCreatePost = async (postData: {
    text: string;
    images: string[];
    videos: string[];
    aspectRatio?: number;
  }) => {
    try {
      // Get actual user ID from AuthContext profileId
      const currentUserId = profileId || process.env.EXPO_PUBLIC_TEST_USER_ID;
      
      if (!currentUserId) {
        console.error("No authenticated user found");
        throw new Error("Please sign in to create posts");
      }

      console.log('Creating post with user ID:', currentUserId);

      if (selectedPost) {
        // Update existing post using DataProvider
        const response = await DataProvider.updatePost(selectedPost.id, {
          content: postData.text,
          images: postData.images,
          videos: postData.videos,
        });

        if (response.error) {
          console.error("Failed to update post:", response.error);
          throw new Error(response.error);
        }

        if (response.data) {
          // Refetch posts to update with new data
          await refetch();
          // Invalidate userPosts cache so profile page shows updated data
          queryClient.invalidateQueries({ queryKey: ['userPosts'] });
        }
        setSelectedPost(null);
      } else {
        // Create new post with actual user ID
        const response = await DataProvider.createPostWithData({
          text: postData.text,
          images: postData.images,
          videos: postData.videos,
          userId: currentUserId,
          aspectRatio: postData.aspectRatio,
        });

        if (response.error) {
          console.error("Failed to create post:", response.error);
          throw new Error(response.error);
        }

        if (response.data) {
          // Refetch posts to show new post
          await refetch();
          // Invalidate userPosts cache so profile page shows updated data with correct aspect_ratio
          queryClient.invalidateQueries({ queryKey: ['userPosts'] });
          console.log('Post created successfully:', response.data.id);
        }
      }
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      console.error("Error creating/updating post:", error);
      throw error;
    }
  };

  const handleDeletePost = (postId: string) => {
    Alert.alert(
      "投稿を削除",
      "この投稿を削除してもよろしいですか？この操作は元に戻せません。",
      [
        {
          text: "キャンセル",
          style: "cancel",
        },
        {
          text: "削除",
          style: "destructive",
          onPress: () => confirmDeletePost(postId),
        },
      ],
    );
  };

  const confirmDeletePost = async (postId: string) => {
    try {
      if (!profileId) {
        Alert.alert("エラー", "ユーザー情報が見つかりません");
        return;
      }

      // Call the API to delete from database
      const result = await DataProvider.deletePost(postId, profileId);
      
      if (result.success) {
        // Refetch posts to remove deleted post
        await refetch();
        console.log("Post deleted successfully:", postId);
      } else {
        Alert.alert("エラー", result.error || "投稿の削除に失敗しました");
      }
    } catch (error) {
      console.error("Error deleting post:", error);
      Alert.alert("エラー", "投稿の削除中にエラーが発生しました");
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
      Alert.alert("非表示", "この投稿を非表示にしました。");
    } catch (error) {
      console.error("Error hiding post:", error);
      Alert.alert("エラー", "投稿の非表示に失敗しました。");
    }
  }, [profileId, menuPost]);

  const handleBlockUser = useCallback(async () => {
    if (!profileId || !menuPost) return;

    try {
      const result = await blocksService.blockUser(profileId, menuPost.userId);
      if (result.success) {
        setBlockedUserIds((prev) => new Set([...prev, menuPost.userId]));
        Alert.alert("ブロック完了", `${menuPost.userName}さんをブロックしました。`);
      } else {
        Alert.alert("エラー", result.error || "ブロックに失敗しました。");
      }
    } catch (error) {
      console.error("Error blocking user:", error);
      Alert.alert("エラー", "ブロックに失敗しました。");
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

  // Helper function to categorize posts by type for efficient FlashList recycling
  // This prevents "jumping" by helping FlashList recycle similar-sized items together
  // Posts of similar types will be recycled into each other, reducing layout recalculations
  //
  // App uses 3 fixed aspect ratios for both images and videos:
  // - 4:5 = 0.8 (portrait)
  // - 1:1 = 1.0 (square)
  // - 1.91:1 = 1.91 (wide/landscape)
  //
  // Also considers:
  // - Image count (1 vs 2+) - affects indicator row height (+16px)
  // - Text content presence - affects content section height
  const getItemType = useCallback((item: Post): string => {
    const hasImages = item.images && item.images.length > 0;
    const hasVideos = item.videos && item.videos.length > 0;
    const hasMultipleImages = item.images && item.images.length > 1;
    const hasText = !!item.content;
    const hasYouTube = containsYouTubeUrl(item.content);

    // YouTube embeds add a fixed 16:9 block — separate recycling type
    if (hasYouTube && !hasImages && !hasVideos) {
      return hasText ? "youtube_text" : "youtube";
    }

    // Text-only posts (no media) - shortest type
    if (!hasImages && !hasVideos && !hasYouTube) {
      return hasText ? "text_only_with_content" : "text_only";
    }

    // Get aspect ratio (same field used for both images and videos)
    const ratio = item.aspect_ratio || 1;
    
    // Determine ratio category
    let ratioType: string;
    if (ratio < 0.9) {
      ratioType = "portrait";   // 4:5 ratio (0.8)
    } else if (ratio > 1.45) {
      ratioType = "wide";       // 1.91:1 ratio (1.91)
    } else {
      ratioType = "square";     // 1:1 ratio (1.0)
    }

    // Separate video and image types for better recycling
    // Videos have different rendering overhead than images
    if (hasVideos) {
      return `video_${ratioType}${hasText ? "_text" : ""}`;
    }

    // Image posts - also differentiate by single vs multiple images (indicator row)
    const imgCount = hasMultipleImages ? "multi" : "single";
    const ytSuffix = hasYouTube ? "_yt" : "";
    return `image_${ratioType}_${imgCount}${hasText ? "_text" : ""}${ytSuffix}`;
  }, []);

  // NOTE: overrideItemLayout removed to fix scroll jitter.
  // FlashList now measures items dynamically and caches the actual heights.
  // The previous calculation was missing image carousel indicators (~16px when 2+ images)
  // which caused FlashList to reposition items during scroll when actual height differed.
  // Keeping estimatedItemSize={400} as a rough hint is sufficient.

  // Render function for posts - no longer depends on viewability state
  // Visibility is handled by VisibilityManager -> VideoPlayer subscription (no re-renders)
  const renderPost = useCallback(
    ({ item, index }: { item: Post; index: number }) => {
      const isExpanded = expandedPostIds.has(item.id);
      // Lower threshold for Japanese text (wider chars) + account for line breaks
      // ~30 chars per line × 3 lines = 90 chars, but Japanese needs ~20 chars/line
      // Also check for explicit line breaks that could push to 4+ lines
      const hasLineBreaks = item.content?.includes('\n');
      const exceedsLines = !!(item.content && (item.content.length > 50 || (hasLineBreaks && item.content.length > 30)));
      const isOwnPost = item.user.id === (profileId || process.env.EXPO_PUBLIC_TEST_USER_ID);

      return (
        <PostItem
          item={item}
          index={index}
          isExpanded={isExpanded}
          exceedsLines={exceedsLines}
          isOwnPost={isOwnPost}
          hasMutualLikes={!!stableMutualLikesMap[item.user.id]}
          onViewProfile={handleViewProfile}
          onReaction={handleReaction}
          onMessage={handleMessagePress}
          onToggleExpand={handleToggleExpand}
          onPostMenu={handlePostMenu}
          onOpenPostMenu={handleOpenPostMenu}
        />
      );
    },
    [expandedPostIds, stableMutualLikesMap, profileId, handleViewProfile, handleReaction, handleMessagePress, handleToggleExpand, handleOpenPostMenu]
  );

  if (isLoading && posts.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
        <Loading text="フィードを読み込み中..." fullScreen />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.statusBarOverlay,
          {
            height: insets.top,
            opacity: headerOpacity,
          },
        ]}
      />

      {/* Header - Fixed height with transform animation */}
      <Animated.View
        style={[
          styles.header,
          {
            height: headerBaseHeight + insets.top,
            paddingTop: insets.top,
            opacity: headerOpacity,
            transform: [{ translateY: headerTranslateY }],
          },
        ]}
      >
        <View style={styles.headerCenter}>
          <Image
            source={require('../../assets/images/Icons/logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </View>

        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => setShowPostModal(true)}
          accessibilityRole="button"
          accessibilityLabel="新しい投稿を作成"
          accessibilityHint="投稿作成画面を開きます"
        >
          <View style={styles.addButtonCircle}>
            <Image
              source={require('../../assets/images/Icons/Add-Outline.png')}
              style={styles.addIcon}
              resizeMode="contain"
            />
          </View>
        </TouchableOpacity>
      </Animated.View>

      {/* Tab Selector - Fixed height with transform animation */}
      <Animated.View
        style={[
          styles.tabContainer,
          {
            top: headerBaseHeight + insets.top,
            height: tabHeight,
            opacity: headerOpacity,
            transform: [{ translateY: tabTranslateY }],
          }
        ]}
      >
        <View style={styles.tabPillContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === "recommended" && styles.activeTab]}
            onPress={() => setActiveTab("recommended")}
            accessibilityRole="tab"
            accessibilityLabel="おすすめの投稿を表示"
            accessibilityState={{ selected: activeTab === "recommended" }}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "recommended" && styles.activeTabText,
              ]}
            >
              おすすめ
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === "following" && styles.activeTab]}
            onPress={() => setActiveTab("following")}
            accessibilityRole="tab"
            accessibilityLabel="フォロー中の投稿を表示"
            accessibilityState={{ selected: activeTab === "following" }}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "following" && styles.activeTabText,
              ]}
            >
              フォロー中
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Feed - Two separate lists to prevent video re-renders on tab switch */}
      {/* Recommended Tab */}
      <View style={[styles.flashListWrapper, activeTab !== "recommended" && styles.hiddenFeed]}>
        <AnimatedFlashList
          data={filteredRecommendedPosts}
          estimatedItemSize={400}
          renderItem={renderPost}
          keyExtractor={(item: Post) => item.id}
          extraData={stableMutualLikesMap}
          contentContainerStyle={styles.feedContainerFlash}
          showsVerticalScrollIndicator={false}
          refreshing={isFetchingRecommended && !isFetchingNextPageRecommended}
          onRefresh={handleRefreshRecommended}
          onScroll={activeTab === "recommended" ? handleScroll : undefined}
          scrollEventThrottle={16}
          onEndReached={() => {
            if (hasNextPageRecommended && !isFetchingNextPageRecommended) {
              fetchNextPageRecommended();
            }
          }}
          onEndReachedThreshold={0.3}
          drawDistance={screenWidth * 2}
          getItemType={getItemType}
          onViewableItemsChanged={onViewableItemsChangedRecommended}
          viewabilityConfig={viewabilityConfig}
          ListHeaderComponent={<View style={{ height: totalHeaderHeight }} />}
          ListEmptyComponent={
            isLoadingRecommended ? (
              <Loading />
            ) : (
              <EmptyState
                icon="home-outline"
                title="まだ投稿がありません"
                subtitle="新しい投稿を待っています"
                buttonTitle="プロフィールを探す"
                onButtonPress={() => navigation.navigate("Search" as any)}
              />
            )
          }
          ListFooterComponent={
            isFetchingNextPageRecommended ? (
              <View style={{ padding: Spacing.md }}>
                <Loading />
              </View>
            ) : null
          }
        />
      </View>

      {/* Following Tab */}
      <View style={[styles.flashListWrapper, activeTab !== "following" && styles.hiddenFeed]}>
        <AnimatedFlashList
          data={filteredFollowingPosts}
          estimatedItemSize={400}
          renderItem={renderPost}
          keyExtractor={(item: Post) => item.id}
          extraData={stableMutualLikesMap}
          contentContainerStyle={styles.feedContainerFlash}
          showsVerticalScrollIndicator={false}
          refreshing={isFetchingFollowing && !isFetchingNextPageFollowing}
          onRefresh={handleRefreshFollowing}
          onScroll={activeTab === "following" ? handleScroll : undefined}
          scrollEventThrottle={16}
          onEndReached={() => {
            if (hasNextPageFollowing && !isFetchingNextPageFollowing) {
              fetchNextPageFollowing();
            }
          }}
          onEndReachedThreshold={0.3}
          drawDistance={screenWidth * 2}
          getItemType={getItemType}
          onViewableItemsChanged={onViewableItemsChangedFollowing}
          viewabilityConfig={viewabilityConfig}
          ListHeaderComponent={<View style={{ height: totalHeaderHeight }} />}
          ListEmptyComponent={
            isLoadingFollowing ? (
              <Loading />
            ) : (
              <EmptyState
                icon="home-outline"
                title="まだ投稿がありません"
                subtitle="新しい投稿を待っています"
                buttonTitle="プロフィールを探す"
                onButtonPress={() => navigation.navigate("Search" as any)}
              />
            )
          }
          ListFooterComponent={
            isFetchingNextPageFollowing ? (
              <View style={{ padding: Spacing.md }}>
                <Loading />
              </View>
            ) : null
          }
        />
      </View>

      {/* Post Creation Modal */}
      <PostCreationModal
        visible={showPostModal}
        onClose={() => {
          setShowPostModal(false);
          setSelectedPost(null);
        }}
        onPublish={handleCreatePost}
        editingPost={
          selectedPost
            ? {
                text: selectedPost.content,
                images: selectedPost.images,
                videos: selectedPost.videos || [],
              }
            : null
        }
      />

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

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  feedWrapper: {
    ...StyleSheet.absoluteFillObject,
  },
  // FlashList requires explicit dimensions - flex: 1 with absolute positioning
  flashListWrapper: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: screenWidth,
    height: "100%",
  },
  hiddenFeed: {
    // Use transform instead of opacity - opacity:0 still causes expensive offscreen rendering
    transform: [{ translateX: 9999 }],
    pointerEvents: "none",
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    backgroundColor: Colors.white,
    zIndex: 10,
  },
  tabContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: Colors.white,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    zIndex: 9,
  },
  statusBarOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.white,
    zIndex: 20,
  },
  tabPillContainer: {
    flexDirection: "row",
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.full,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BorderRadius.full,
  },
  activeTab: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    fontSize: 16,
    fontWeight: "500",
    fontFamily: Typography.getFontFamily("500"),
    color: Colors.gray[500],
    textAlign: "center",
    lineHeight: 20,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  activeTabText: {
    color: Colors.white,
    fontWeight: "600",
    fontFamily: Typography.getFontFamily("600"),
    textAlign: "center",
    lineHeight: 20,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  headerButton: {
    padding: 0,
  },
  addButtonCircle: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  addIcon: {
    width: 20,
    height: 20,
  },
  headerCenter: {
    flexDirection: "row",
    alignItems: "center",
  },
  logoImage: {
    width: 102,
    height: 27.728,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.black,
    marginLeft: 4,
  },
  feedContainer: {
    paddingTop: 0,
    paddingBottom: Spacing.xl * 3,
    flexGrow: 1,
  },
  feedContainerFlash: {
    paddingBottom: Spacing.xl * 3,
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
  textOnlyPostCard: {
    minHeight: "auto",
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
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  username: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    marginRight: Spacing.xs,
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
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  videoItem: {
    width: "100%",
    marginBottom: Spacing.sm,
  },
  videoPlayer: {
    borderRadius: BorderRadius.md,
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
  femaleBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.success + "15",
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    marginLeft: Spacing.xs,
  },
  femaleBadgeText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.success,
    marginLeft: 2,
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
  shareButton: {
    padding: Spacing.xs,
  },
  statusBarBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: 49,
    zIndex: 0,
  },
  statusBarBackgroundImage: {
    width: "100%",
    height: "100%",
  },
});

export default HomeScreen;

