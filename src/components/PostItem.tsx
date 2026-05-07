import React, { memo, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Image,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../constants/colors";
import { Spacing, BorderRadius } from "../constants/spacing";
import { Typography } from "../constants/typography";
import { Post } from "../types/dataModels";
import ImageCarousel from "./ImageCarousel";
import VideoPlayer from "./VideoPlayer";
import YouTubeEmbed from "./YouTubeEmbed";
import { extractYouTubeVideos } from "../utils/youtubeUtils";

const verifyBadge = require("../../assets/images/badges/Verify.png");
const goldBadge = require("../../assets/images/badges/Gold.png");
const messageIcon = require("../../assets/images/Icons/message.png");

const { width: screenWidth } = Dimensions.get("window");

// Memoized sub-components
const ProfileImage = memo(({ uri, name }: { uri: string; name: string }) => (
  <ExpoImage
    source={{ uri }}
    style={styles.profileImage}
    contentFit="cover"
    cachePolicy="memory-disk"
    transition={0}
    accessibilityLabel={`${name}のプロフィール写真`}
  />
));

const VerificationBadge = memo(() => (
  <View style={styles.verificationPill}>
    <Image source={verifyBadge} style={styles.badgeIcon} resizeMode="contain" />
  </View>
));

const PremiumBadge = memo(() => (
  <View style={styles.premiumPill}>
    <Image source={goldBadge} style={styles.badgeIcon} resizeMode="contain" />
  </View>
));

interface PostItemProps {
  item: Post;
  index: number;
  isExpanded: boolean;
  exceedsLines: boolean;
  isOwnPost: boolean;
  hasMutualLikes: boolean;
  onViewProfile: (userId: string) => void;
  onReaction: (postId: string) => void;
  onMessage: (userId: string, userName: string, userImage: string, hasMutualLikes: boolean) => void;
  onToggleExpand: (postId: string) => void;
  onPostMenu: (post: Post) => void;
  onOpenPostMenu: (post: Post) => void;
  onShare?: (post: Post) => void;
}

const PostItem: React.FC<PostItemProps> = ({
  item,
  index,
  isExpanded,
  exceedsLines,
  isOwnPost,
  hasMutualLikes,
  onViewProfile,
  onReaction,
  onMessage,
  onToggleExpand,
  onPostMenu,
  onOpenPostMenu,
  onShare,
}) => {
  const showMoreButton = exceedsLines && !isExpanded && item.content;

  const handleViewProfile = useCallback(() => {
    onViewProfile(item.user.id);
  }, [onViewProfile, item.user.id]);

  const handleReaction = useCallback(() => {
    onReaction(item.id);
  }, [onReaction, item.id]);

  const handleMessage = useCallback(() => {
    onMessage(item.user.id, item.user.name, item.user.profile_pictures[0], hasMutualLikes);
  }, [onMessage, item.user.id, item.user.name, item.user.profile_pictures, hasMutualLikes]);

  const handleToggleExpand = useCallback(() => {
    onToggleExpand(item.id);
  }, [onToggleExpand, item.id]);

  const handlePostMenu = useCallback(() => {
    onPostMenu(item);
  }, [onPostMenu, item]);

  const handleOpenPostMenu = useCallback(() => {
    onOpenPostMenu(item);
  }, [onOpenPostMenu, item]);

  const handleShare = useCallback(() => {
    onShare?.(item);
  }, [onShare, item]);

  // Extract YouTube videos from post content
  const youtubeVideos = useMemo(
    () => extractYouTubeVideos(item.content),
    [item.content],
  );

  // Filter valid videos
  const validVideos = useMemo(() => {
    return item.videos?.filter((video) => {
      if (!video || typeof video !== "string" || video.trim() === "") return false;
      if (video.startsWith("file://")) return false;
      return true;
    }) || [];
  }, [item.videos]);

  // Calculate video height based on aspect ratio for stable layout
  const videoHeight = useMemo(() => {
    const ratio = item.aspect_ratio || (9 / 16); // Default to portrait
    return screenWidth / ratio;
  }, [item.aspect_ratio]);

  // Memoize video item style for stable layout - prevents FlashList layout shifts
  const videoItemStyle = useMemo(() => ({
    width: "100%" as const,
    height: videoHeight,
    marginBottom: Spacing.sm,
  }), [videoHeight]);

  return (
    <View style={styles.postCard}>
      {/* Content and header section with padding */}
      <View style={styles.postContentSection}>
        {/* Profile Header */}
        <View style={styles.postHeader}>
          <TouchableOpacity style={styles.userInfo} onPress={handleViewProfile}>
            <ProfileImage uri={item.user.profile_pictures[0]} name={item.user.name} />
            <View style={styles.userDetails}>
              <View style={styles.nameRow}>
                <Text style={styles.username}>{item.user.name}</Text>
                {item.user.is_verified && <VerificationBadge />}
                {item.user.is_premium && <PremiumBadge />}
              </View>
              <Text style={styles.timestamp}>{item.timestamp}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.moreButton}
            onPress={isOwnPost ? handlePostMenu : handleOpenPostMenu}
            accessibilityRole="button"
            accessibilityLabel="投稿のメニューを開く"
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={Colors.gray[600]} />
          </TouchableOpacity>
        </View>

        {/* Post Content - render container even if empty to maintain consistent layout */}
        {item.content ? (
          <View style={styles.postContentContainer}>
            <Text
              style={styles.postContent}
              numberOfLines={isExpanded ? undefined : 3}
            >
              {item.content}
            </Text>
            {showMoreButton && (
              <TouchableOpacity onPress={handleToggleExpand} activeOpacity={0.7} style={styles.expandButton}>
                <Text style={styles.moreLink}>もっと見る</Text>
              </TouchableOpacity>
            )}
            {isExpanded && exceedsLines && (
              <TouchableOpacity onPress={handleToggleExpand} activeOpacity={0.7} style={styles.expandButton}>
                <Text style={styles.moreLink}>折りたたむ</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null}
      </View>

      {/* YouTube Embeds */}
      {youtubeVideos.length > 0 && (
        <View style={styles.youtubeContainer}>
          {youtubeVideos.map((video) => (
            <YouTubeEmbed key={video.videoId} video={video} postId={item.id} />
          ))}
        </View>
      )}

      {/* Post Images */}
      {item.images.length > 0 && (
        <ImageCarousel
          images={item.images}
          fullWidth={true}
          style={styles.imageCarouselFullWidth}
          aspectRatio={item.aspect_ratio}
        />
      )}

      {/* Post Videos */}
      {validVideos.length > 0 && (
        <View style={styles.videoContainer}>
          {validVideos.map((video) => (
            <View key={video} style={videoItemStyle}>
              <VideoPlayer
                videoUri={video}
                style={styles.videoPlayer}
                aspectRatio={item.aspect_ratio}
                postId={item.id}
              />
            </View>
          ))}
        </View>
      )}

      {/* Post Actions */}
      <View style={styles.postActionsSection}>
        <View style={styles.postActions}>
          {/* Reaction button */}
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleReaction}
            accessibilityRole="button"
            accessibilityLabel={item.hasReacted ? "リアクションを取り消し" : "リアクション"}
          >
            <View style={styles.heartIconContainer}>
              <Ionicons
                name={item.hasReacted ? "heart" : "heart-outline"}
                size={24}
                color={item.hasReacted ? "#EF4444" : Colors.gray[600]}
              />
            </View>
            <Text style={styles.actionText}>{item.reactions_count || item.likes || 0}</Text>
          </TouchableOpacity>

          {/* Message button */}
          {!isOwnPost && (
            <TouchableOpacity
              style={[styles.actionButton, !hasMutualLikes && styles.disabledActionButton]}
              onPress={handleMessage}
              accessibilityRole="button"
              accessibilityLabel={hasMutualLikes ? "メッセージ" : "メッセージ（お互いにいいねが必要）"}
            >
              <Image
                source={messageIcon}
                style={[styles.messageIcon, !hasMutualLikes && styles.disabledMessageIcon]}
                resizeMode="contain"
              />
              <Text style={[styles.actionText, !hasMutualLikes && styles.disabledActionText]}>
                メッセージ
              </Text>
            </TouchableOpacity>
          )}

          {/* Share button */}
          {onShare && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleShare}
              accessibilityRole="button"
              accessibilityLabel="シェア"
            >
              <Ionicons name="share-outline" size={20} color={Colors.gray[600]} />
              <Text style={styles.actionText}>シェア</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

// Custom comparison function for memo
// Note: isVisible removed - visibility is now handled by VisibilityManager without re-renders
const areEqual = (prevProps: PostItemProps, nextProps: PostItemProps) => {
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.item.content === nextProps.item.content &&
    prevProps.item.hasReacted === nextProps.item.hasReacted &&
    prevProps.item.reactions_count === nextProps.item.reactions_count &&
    prevProps.isExpanded === nextProps.isExpanded &&
    prevProps.exceedsLines === nextProps.exceedsLines &&
    prevProps.hasMutualLikes === nextProps.hasMutualLikes
  );
};

export default memo(PostItem, areEqual);

const styles = StyleSheet.create({
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
  imageCarouselFullWidth: {
    marginTop: 0,
    marginHorizontal: 0,
  },
  youtubeContainer: {
    paddingHorizontal: Spacing.md,
  },
  videoContainer: {
    marginTop: Spacing.sm,
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
    width: 24,
    height: 24,
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
});
