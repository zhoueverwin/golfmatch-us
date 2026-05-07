/**
 * ShareablePostCard
 * A styled card component designed for sharing as an image.
 * This component is rendered off-screen and captured as an image.
 */

import React, { forwardRef } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Colors } from '../constants/colors';
import { Spacing, BorderRadius } from '../constants/spacing';
import { Typography } from '../constants/typography';
import { Post } from '../types/dataModels';

const logoImage = require('../../assets/images/Icons/logo.png');
const verifyBadge = require('../../assets/images/badges/Verify.png');
const goldBadge = require('../../assets/images/badges/Gold.png');
const appIcon = require('../../assets/images/Icons/golfmatch-icon.png');

interface ShareablePostCardProps {
  post: Post;
}

const ShareablePostCard = forwardRef<View, ShareablePostCardProps>(
  ({ post }, ref) => {
    const truncatedContent = post.content
      ? post.content.length > 150
        ? post.content.substring(0, 150) + '...'
        : post.content
      : '';

    const hasImage = post.images && post.images.length > 0;

    return (
      <View ref={ref} style={styles.container} collapsable={false}>
        {/* Header with logo */}
        <View style={styles.header}>
          <Image source={logoImage} style={styles.logo} resizeMode="contain" />
        </View>

        {/* User info */}
        <View style={styles.userSection}>
          <ExpoImage
            source={{ uri: post.user.profile_pictures[0] }}
            style={styles.profileImage}
            contentFit="cover"
          />
          <View style={styles.userInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.userName} numberOfLines={1}>
                {post.user.name}
              </Text>
              {post.user.is_verified && (
                <Image source={verifyBadge} style={styles.badge} resizeMode="contain" />
              )}
              {post.user.is_premium && (
                <Image source={goldBadge} style={styles.badge} resizeMode="contain" />
              )}
            </View>
            <Text style={styles.timestamp}>{post.timestamp}</Text>
          </View>
        </View>

        {/* Post content */}
        {truncatedContent ? (
          <View style={styles.contentSection}>
            <Text style={styles.content}>{truncatedContent}</Text>
          </View>
        ) : null}

        {/* Post image */}
        {hasImage && (
          <View style={styles.imageSection}>
            <ExpoImage
              source={{ uri: post.images[0] }}
              style={styles.postImage}
              contentFit="cover"
            />
            {post.images.length > 1 && (
              <View style={styles.imageCountBadge}>
                <Text style={styles.imageCountText}>+{post.images.length - 1}</Text>
              </View>
            )}
          </View>
        )}

        {/* CTA footer */}
        <View style={styles.footer}>
          <Image source={appIcon} style={styles.appIcon} resizeMode="contain" />
          <View style={styles.ctaTextContainer}>
            <Text style={styles.ctaText}>Golfmatchでもっと見る</Text>
            <Text style={styles.ctaSubtext}>ゴルフ仲間を見つけよう</Text>
          </View>
        </View>
      </View>
    );
  }
);

ShareablePostCard.displayName = 'ShareablePostCard';

const styles = StyleSheet.create({
  container: {
    width: 350,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    // Shadow for visual depth in the card
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  header: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
  },
  logo: {
    width: 120,
    height: 32,
    tintColor: Colors.white,
  },
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  profileImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: Spacing.sm,
  },
  userInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userName: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    marginRight: Spacing.xs,
    flexShrink: 1,
  },
  badge: {
    width: 16,
    height: 16,
    marginLeft: 2,
  },
  timestamp: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  contentSection: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  content: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.primary,
    lineHeight: Typography.lineHeight.normal * Typography.fontSize.base,
  },
  imageSection: {
    position: 'relative',
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  postImage: {
    width: '100%',
    height: 200,
    borderRadius: BorderRadius.md,
  },
  imageCountBadge: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  imageCountText: {
    color: Colors.white,
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray[50],
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  appIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    marginRight: Spacing.sm,
  },
  ctaTextContainer: {
    flex: 1,
  },
  ctaText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.primary,
  },
  ctaSubtext: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
  },
});

export default ShareablePostCard;
