import React, { useState, useCallback, useRef, useMemo, memo } from "react";
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  Image,
  Dimensions,
  Platform,
} from "react-native";
import { FlashList, ListRenderItemInfo } from "@shopify/flash-list";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  useRoute,
  useNavigation,
  RouteProp,
} from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { RootStackParamList } from "../types";
import { Ionicons } from "@expo/vector-icons";

import { Colors } from "../constants/colors";
import { Spacing, BorderRadius } from "../constants/spacing";
import { Typography } from "../constants/typography";
import { Post } from "../types/dataModels";
import Loading from "../components/Loading";
import EmptyState from "../components/EmptyState";
import ImageCarousel from "../components/ImageCarousel";
import VideoPlayer from "../components/VideoPlayer";
import { getProfilePicture } from "../constants/defaults";
import { useUserPosts, useReactToPost, useUnreactToPost } from "../hooks/queries/usePosts";
import { useAuth } from "../contexts/AuthContext";

const verifyBadge = require("../../assets/images/badges/Verify.png");

const { width } = Dimensions.get("window");

type UserPostsScreenRouteProp = RouteProp<RootStackParamList, "UserPosts">;
type UserPostsScreenNavigationProp = StackNavigationProp<RootStackParamList>;

// Memoized Post Item Component to prevent unnecessary re-renders
interface PostItemProps {
  item: Post;
  isExpanded: boolean;
  exceedsLines: boolean;
  isVisible: boolean;
  onToggleExpand: (postId: string) => void;
  onTextLayout: (postId: string, event: any) => void;
  onReaction: (postId: string) => void;
}

const PostItem = memo(({
  item,
  isExpanded,
  exceedsLines,
  isVisible,
  onToggleExpand,
  onTextLayout,
  onReaction,
}: PostItemProps) => {
  const contentLen = item.content ? item.content.length : 0;
  const shouldMeasureText = contentLen >= 80 && contentLen <= 140;
  const showMoreButton = exceedsLines && !isExpanded && item.content;

  return (
    <View style={styles.postCard}>
      {/* Content and header section with padding */}
      <View style={styles.postContentSection}>
        {/* Profile Header - Show for all posts */}
        <View style={styles.postHeader}>
          <View style={styles.userInfo}>
            <Image
              source={{ uri: getProfilePicture(item.user.profile_pictures, 0) }}
              style={styles.profileImage}
              accessibilityLabel={`${item.user.name}のプロフィール写真`}
            />
            <View style={styles.userDetails}>
              <View style={styles.nameRow}>
                <Text style={styles.username}>{item.user.name}</Text>
                {item.user.is_verified && (
                  <View style={styles.verificationPill}>
                    <Image source={verifyBadge} style={styles.badgeIcon} resizeMode="contain" />
                  </View>
                )}
              </View>
              <Text style={styles.timestamp}>{item.timestamp}</Text>
            </View>
          </View>
        </View>

        {/* Post Content - Show for all posts */}
        {item.content && (
          <View style={styles.postContentContainer}>
            <Text
              style={styles.postContent}
              numberOfLines={isExpanded ? undefined : 3}
              onTextLayout={!isExpanded && shouldMeasureText ? (event) => onTextLayout(item.id, event) : undefined}
            >
              {item.content}
            </Text>
            {showMoreButton && (
              <TouchableOpacity
                onPress={() => onToggleExpand(item.id)}
                activeOpacity={0.7}
                style={styles.expandButton}
              >
                <Text style={styles.moreLink}>もっと見る</Text>
              </TouchableOpacity>
            )}
            {isExpanded && exceedsLines && (
              <TouchableOpacity
                onPress={() => onToggleExpand(item.id)}
                activeOpacity={0.7}
                style={styles.expandButton}
              >
                <Text style={styles.moreLink}>折りたたむ</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Post Images - Full width, no padding */}
      {item.images.length > 0 && (
        <ImageCarousel
          images={item.images}
          fullWidth={true}
          style={styles.imageCarouselFullWidth}
          aspectRatio={item.aspect_ratio}
        />
      )}

      {/* Post Videos - Always render container for layout stability */}
      {item.videos && item.videos.length > 0 && (() => {
        const validVideos = item.videos.filter((video) => {
          if (!video || typeof video !== "string" || video.trim() === "") return false;
          if (video.startsWith("file://")) return false;
          return true;
        });
        if (validVideos.length === 0) return null;

        // Calculate height based on aspect ratio for stable layout
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
                  isActive={isVisible}
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
            onPress={() => onReaction(item.id)}
            accessibilityRole="button"
            accessibilityLabel="リアクション"
          >
            <View style={styles.heartIconContainer}>
              <Ionicons
                name={item.hasReacted ? "heart" : "heart-outline"}
                size={20}
                color={item.hasReacted ? Colors.error : Colors.gray[600]}
              />
            </View>
            <Text style={[styles.actionText, item.hasReacted && styles.actionTextActive]}>
              {item.reactions_count || item.likes || 0}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}, (prevProps, nextProps) => {
  // Custom comparison - only re-render if these specific props change
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.item.content === nextProps.item.content &&
    prevProps.item.reactions_count === nextProps.item.reactions_count &&
    prevProps.item.hasReacted === nextProps.item.hasReacted &&
    prevProps.item.likes === nextProps.item.likes &&
    prevProps.isExpanded === nextProps.isExpanded &&
    prevProps.exceedsLines === nextProps.exceedsLines &&
    prevProps.isVisible === nextProps.isVisible
  );
});

const UserPostsScreen: React.FC = () => {
  const route = useRoute<UserPostsScreenRouteProp>();
  const navigation = useNavigation<UserPostsScreenNavigationProp>();
  const { userId } = route.params;
  const { profileId } = useAuth();

  // Use React Query hook for posts
  const {
    posts,
    isLoading: loading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage: postsLoading,
  } = useUserPosts(userId);

  // Mutation hooks for reactions (with optimistic updates)
  const reactMutation = useReactToPost();
  const unreactMutation = useUnreactToPost();

  const [expandedPosts, setExpandedPosts] = useState<Record<string, boolean>>({});
  const [textExceedsLines, setTextExceedsLines] = useState<Record<string, boolean>>({});
  const [viewablePostIds, setViewablePostIds] = useState<Set<string>>(new Set());

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: any[] }) => {
    const newIds = new Set(viewableItems.map((v) => v.item.id));
    setViewablePostIds(newIds);
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 20,
    minimumViewTime: 100,
  }).current;

  const handleTextLayout = useCallback((postId: string, event: any) => {
    const { lines } = event.nativeEvent;
    if (lines && lines.length > 3) {
      setTextExceedsLines((prev) => {
        if (prev[postId]) return prev; // No update if already set
        return { ...prev, [postId]: true };
      });
    }
  }, []);

  const handleToggleExpand = useCallback((postId: string) => {
    setExpandedPosts((prev) => ({
      ...prev,
      [postId]: !prev[postId],
    }));
  }, []);

  const handleReaction = useCallback(async (postId: string) => {
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
    }
  }, [profileId, posts, reactMutation, unreactMutation]);

  const renderPost = useCallback(({ item }: ListRenderItemInfo<Post>) => {
    const isExpanded = expandedPosts[item.id] || false;
    const likelyExceedsLines = item.content && item.content.length > 90;
    const exceedsLines = textExceedsLines[item.id] || likelyExceedsLines || false;
    const isVisible = viewablePostIds.has(item.id);

    return (
      <PostItem
        item={item}
        isExpanded={isExpanded}
        exceedsLines={exceedsLines}
        isVisible={isVisible}
        onToggleExpand={handleToggleExpand}
        onTextLayout={handleTextLayout}
        onReaction={handleReaction}
      />
    );
  }, [expandedPosts, textExceedsLines, viewablePostIds, handleToggleExpand, handleTextLayout, handleReaction]);

  const keyExtractor = useCallback((item: Post) => item.id, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />
        <Loading />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Image
            source={require("../../assets/images/Icons/Arrow-LeftGrey.png")}
            style={styles.backIconImage}
            resizeMode="contain"
            fadeDuration={0}
          />
          <Text style={styles.backLabel}>戻る</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>投稿</Text>
        <View style={styles.headerSpacer} />
      </View>

      {posts.length > 0 ? (
        <FlashList
          data={posts}
          renderItem={renderPost}
          keyExtractor={keyExtractor}
          extraData={viewablePostIds}
          showsVerticalScrollIndicator={false}
          // FlashList performance props
          drawDistance={width * 2}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          ListFooterComponent={
            hasNextPage ? (
              <TouchableOpacity
                style={styles.loadMoreButton}
                onPress={() => fetchNextPage()}
                disabled={postsLoading}
              >
                <Text style={styles.loadMoreText}>
                  {postsLoading ? "読み込み中..." : "次のページ"}
                </Text>
              </TouchableOpacity>
            ) : null
          }
        />
      ) : (
        <EmptyState
          title="投稿がありません"
          subtitle="このユーザーはまだ投稿していません。"
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginLeft: -Spacing.md,
    gap: 8,
    minHeight: 44,
    zIndex: 10,
  },
  backIconImage: {
    width: 18,
    height: 18,
  },
  backLabel: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.primary,
    marginLeft: Spacing.xs,
  },
  headerTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
  },
  headerSpacer: {
    width: 80,
  },
  scrollView: {
    flex: 1,
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
  verificationPill: {
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
  actionText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.gray[500],
    marginLeft: 4,
  },
  actionTextActive: {
    color: Colors.error,
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
    fontFamily: Typography.fontFamily.regular,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
  },
});

export default UserPostsScreen;
