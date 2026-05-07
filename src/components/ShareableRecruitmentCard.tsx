/**
 * ShareableRecruitmentCard
 * A styled card component for sharing recruitment info as an image.
 * This component is rendered off-screen and captured as an image.
 */

import React, { forwardRef } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Spacing, BorderRadius } from '../constants/spacing';
import { Typography } from '../constants/typography';
import { Recruitment, getCourseTypeLabel, formatTeeTime } from '../types/recruitment';

const logoImage = require('../../assets/images/Icons/logo.png');
const appIcon = require('../../assets/images/Icons/golfmatch-icon.png');
const goldBadge = require('../../assets/images/badges/Gold.png');

interface ShareableRecruitmentCardProps {
  recruitment: Recruitment;
}

const ShareableRecruitmentCard = forwardRef<View, ShareableRecruitmentCardProps>(
  ({ recruitment }, ref) => {
    const remainingSlots = recruitment.total_slots - recruitment.filled_slots;
    const hostAvatar = recruitment.host?.profile_pictures?.[0];

    // Format play date
    const formatPlayDate = (dateString: string): string => {
      const date = new Date(dateString);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const day = date.getDate();
      const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
      const weekday = weekdays[date.getDay()];
      return `${year}年${month}月${day}日(${weekday})`;
    };

    return (
      <View ref={ref} style={styles.container} collapsable={false}>
        {/* Header with logo */}
        <View style={styles.header}>
          <Image source={logoImage} style={styles.logo} resizeMode="contain" />
          <Text style={styles.headerSubtitle}>ゴルフ仲間募集中！</Text>
        </View>

        {/* Main content */}
        <View style={styles.mainContent}>
          {/* Date section */}
          <View style={styles.dateSection}>
            <Ionicons name="calendar" size={24} color={Colors.primary} />
            <Text style={styles.dateText}>{formatPlayDate(recruitment.play_date)}</Text>
            {recruitment.tee_time && (
              <Text style={styles.timeText}>{formatTeeTime(recruitment.tee_time)}</Text>
            )}
          </View>

          {/* Course info */}
          <View style={styles.courseSection}>
            <View style={styles.courseHeader}>
              <Ionicons name="golf" size={20} color={Colors.primary} />
              <Text style={styles.courseName} numberOfLines={2}>
                {recruitment.golf_course_name}
              </Text>
            </View>
            <View style={styles.courseDetails}>
              {recruitment.prefecture && (
                <View style={styles.locationBadge}>
                  <Ionicons name="location" size={14} color={Colors.gray[600]} />
                  <Text style={styles.locationText}>{recruitment.prefecture}</Text>
                </View>
              )}
              <View style={styles.courseTypeBadge}>
                <Text style={styles.courseTypeText}>
                  {getCourseTypeLabel(recruitment.course_type)}
                </Text>
              </View>
            </View>
          </View>

          {/* Slots info */}
          <View style={styles.slotsSection}>
            <View style={styles.slotsBadge}>
              <Ionicons name="people" size={18} color={Colors.white} />
              <Text style={styles.slotsText}>
                残り{remainingSlots}枠 / {recruitment.total_slots}枠
              </Text>
            </View>
          </View>

          {/* Host info */}
          <View style={styles.hostSection}>
            {hostAvatar ? (
              <ExpoImage
                source={{ uri: hostAvatar }}
                style={styles.hostAvatar}
                contentFit="cover"
              />
            ) : (
              <View style={styles.hostAvatarPlaceholder}>
                <Ionicons name="person" size={20} color={Colors.gray[400]} />
              </View>
            )}
            <View style={styles.hostInfo}>
              <Text style={styles.hostLabel}>主催者</Text>
              <View style={styles.hostNameRow}>
                <Text style={styles.hostName} numberOfLines={1}>
                  {recruitment.host?.name || '名前なし'}
                </Text>
                {recruitment.host?.is_verified && (
                  <Ionicons name="checkmark-circle" size={14} color={Colors.primary} />
                )}
                {recruitment.host?.is_premium && (
                  <Image source={goldBadge} style={styles.badge} resizeMode="contain" />
                )}
              </View>
            </View>
          </View>
        </View>

        {/* CTA footer */}
        <View style={styles.footer}>
          <Image source={appIcon} style={styles.appIcon} resizeMode="contain" />
          <View style={styles.ctaTextContainer}>
            <Text style={styles.ctaText}>Golfmatchで参加申請</Text>
            <Text style={styles.ctaSubtext}>アプリをダウンロードして申請しよう</Text>
          </View>
        </View>
      </View>
    );
  }
);

ShareableRecruitmentCard.displayName = 'ShareableRecruitmentCard';

const styles = StyleSheet.create({
  container: {
    width: 350,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
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
    marginBottom: Spacing.xs,
  },
  headerSubtitle: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.white,
    opacity: 0.9,
  },
  mainContent: {
    padding: Spacing.md,
  },
  dateSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  dateText: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.primary,
    marginLeft: Spacing.sm,
    flex: 1,
  },
  timeText: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.gray[600],
  },
  courseSection: {
    marginBottom: Spacing.md,
  },
  courseHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  courseName: {
    flex: 1,
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    marginLeft: Spacing.sm,
    lineHeight: Typography.fontSize.lg * Typography.lineHeight.normal,
  },
  courseDetails: {
    flexDirection: 'row',
    marginLeft: 28, // Align with course name
    gap: Spacing.sm,
  },
  locationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray[100],
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  locationText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.gray[600],
    marginLeft: 4,
  },
  courseTypeBadge: {
    backgroundColor: Colors.gray[100],
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  courseTypeText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.gray[600],
  },
  slotsSection: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  slotsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    gap: Spacing.sm,
  },
  slotsText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.white,
  },
  hostSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray[50],
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  hostAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  hostAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  hostInfo: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  hostLabel: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.gray[500],
  },
  hostNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  hostName: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    flexShrink: 1,
  },
  badge: {
    width: 16,
    height: 16,
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

export default ShareableRecruitmentCard;
