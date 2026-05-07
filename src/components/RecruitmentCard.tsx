/**
 * RecruitmentCard Component
 *
 * Displays a recruitment listing card with:
 * - Play date, tee time, and course type
 * - Course name and prefecture
 * - Host info with avatar
 * - Remaining slots badge
 * - Status badge (NEW, 募集中, 満員)
 * - Gender/skill requirement icons
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Badge images
const goldBadge = require('../../assets/images/badges/Gold.png');
import { Colors } from '../constants/colors';
import { Spacing, BorderRadius, Shadows } from '../constants/spacing';
import { Typography } from '../constants/typography';
import {
  Recruitment,
  getGenderPreferenceLabel,
  formatTeeTime,
} from '../types/recruitment';

interface RecruitmentCardProps {
  recruitment: Recruitment;
  onPress: () => void;
  testID?: string;
}

const RecruitmentCard: React.FC<RecruitmentCardProps> = ({
  recruitment,
  onPress,
  testID,
}) => {
  const remainingSlots = recruitment.total_slots - recruitment.filled_slots;
  const isFull = recruitment.status === 'full';
  const isNew = recruitment.is_new;

  // Format play date
  const formatPlayDate = (dateString: string): string => {
    const date = new Date(dateString);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const weekday = weekdays[date.getDay()];
    return `${month}/${day}(${weekday})`;
  };

  // Get host avatar
  const hostAvatar = recruitment.host?.profile_pictures?.[0];

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
      testID={testID}
    >
      {/* Status badges row */}
      <View style={styles.badgeRow}>
        {isNew && (
          <View style={styles.newBadge}>
            <Text style={styles.newBadgeText}>NEW</Text>
          </View>
        )}
        <View style={[styles.statusBadge, isFull && styles.fullBadge]}>
          <Text style={[styles.statusBadgeText, isFull && styles.fullBadgeText]}>
            {isFull ? '満員' : '募集中'}
          </Text>
        </View>
      </View>

      {/* Date and time */}
      <View style={styles.dateRow}>
        <Ionicons name="calendar-outline" size={16} color={Colors.primary} />
        <Text style={styles.dateText}>
          {formatPlayDate(recruitment.play_date)}
        </Text>
        {recruitment.tee_time && (
          <>
            <Ionicons name="time-outline" size={16} color={Colors.gray[500]} style={styles.timeIcon} />
            <Text style={styles.timeText}>{formatTeeTime(recruitment.tee_time)}</Text>
          </>
        )}
      </View>

      {/* Title */}
      <Text style={styles.title} numberOfLines={2}>
        {recruitment.title}
      </Text>

      {/* Course info */}
      <View style={styles.courseRow}>
        <Ionicons name="golf-outline" size={16} color={Colors.gray[500]} />
        <Text style={styles.courseName} numberOfLines={1}>
          {recruitment.golf_course_name}
        </Text>
        {recruitment.prefecture && (
          <View style={styles.prefectureBadge}>
            <Text style={styles.prefectureText}>{recruitment.prefecture}</Text>
          </View>
        )}
      </View>

      {/* Bottom row: Host info + Slots */}
      <View style={styles.bottomRow}>
        {/* Host info */}
        <View style={styles.hostInfo}>
          {hostAvatar ? (
            <Image source={{ uri: hostAvatar }} style={styles.hostAvatar} />
          ) : (
            <View style={styles.hostAvatarPlaceholder}>
              <Ionicons name="person" size={14} color={Colors.gray[400]} />
            </View>
          )}
          <Text style={styles.hostName} numberOfLines={1}>
            {recruitment.host?.name || '名前なし'}
          </Text>
          {recruitment.host?.is_verified && (
            <Ionicons name="checkmark-circle" size={14} color={Colors.primary} />
          )}
          {recruitment.host?.is_premium && (
            <Image source={goldBadge} style={styles.premiumBadge} resizeMode="contain" />
          )}
        </View>

        {/* Slots info */}
        <View style={[styles.slotsContainer, isFull && styles.slotsContainerFull]}>
          <Ionicons
            name="people"
            size={14}
            color={isFull ? Colors.gray[500] : Colors.white}
          />
          <Text style={[styles.slotsText, isFull && styles.slotsTextFull]}>
            {isFull ? '満員' : `残り${remainingSlots}枠`}
          </Text>
        </View>
      </View>

      {/* Requirements row (if any) */}
      {(recruitment.gender_preference !== 'any' || recruitment.min_skill_level || recruitment.max_skill_level) && (
        <View style={styles.requirementsRow}>
          {recruitment.gender_preference !== 'any' && (
            <View style={styles.requirementBadge}>
              <Ionicons
                name={recruitment.gender_preference === 'male' ? 'male' : 'female'}
                size={12}
                color={Colors.gray[600]}
              />
              <Text style={styles.requirementText}>
                {getGenderPreferenceLabel(recruitment.gender_preference)}
              </Text>
            </View>
          )}
          {(recruitment.min_skill_level || recruitment.max_skill_level) && (
            <View style={styles.requirementBadge}>
              <Ionicons name="trophy-outline" size={12} color={Colors.gray[600]} />
              <Text style={styles.requirementText}>
                {recruitment.min_skill_level || recruitment.max_skill_level}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Application status indicator (if user has applied) */}
      {recruitment.has_applied && recruitment.application_status && (
        <View style={[
          styles.applicationStatusBar,
          recruitment.application_status === 'approved' && styles.applicationApproved,
          recruitment.application_status === 'pending' && styles.applicationPending,
          recruitment.application_status === 'rejected' && styles.applicationRejected,
        ]}>
          <Ionicons
            name={
              recruitment.application_status === 'approved' ? 'checkmark-circle' :
              recruitment.application_status === 'pending' ? 'time' :
              'close-circle'
            }
            size={14}
            color={Colors.white}
          />
          <Text style={styles.applicationStatusText}>
            {recruitment.application_status === 'approved' ? '承認済み' :
             recruitment.application_status === 'pending' ? '審査中' :
             '不承認'}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.sm,
    ...Shadows.medium,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  newBadge: {
    backgroundColor: Colors.error,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  newBadgeText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.white,
  },
  statusBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  fullBadge: {
    backgroundColor: Colors.gray[200],
  },
  statusBadgeText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.white,
  },
  fullBadgeText: {
    color: Colors.gray[600],
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  dateText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.primary,
    marginLeft: Spacing.xs,
  },
  timeIcon: {
    marginLeft: Spacing.md,
  },
  timeText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.gray[600],
    marginLeft: Spacing.xs,
  },
  title: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    marginBottom: Spacing.sm,
    lineHeight: Typography.fontSize.base * Typography.lineHeight.normal,
  },
  courseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  courseName: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    color: Colors.gray[600],
    marginLeft: Spacing.xs,
  },
  prefectureBadge: {
    backgroundColor: Colors.gray[100],
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    marginLeft: Spacing.sm,
  },
  prefectureText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.gray[600],
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hostInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  hostAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: Spacing.xs,
  },
  hostAvatarPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.xs,
  },
  hostName: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text.secondary,
    marginRight: Spacing.xs,
    maxWidth: 120,
  },
  premiumBadge: {
    width: 16,
    height: 16,
    marginLeft: 2,
  },
  slotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
  },
  slotsContainerFull: {
    backgroundColor: Colors.gray[200],
  },
  slotsText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.white,
    marginLeft: Spacing.xs,
  },
  slotsTextFull: {
    color: Colors.gray[600],
  },
  requirementsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  requirementBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray[100],
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  requirementText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.gray[600],
    marginLeft: 4,
  },
  applicationStatusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  applicationApproved: {
    backgroundColor: Colors.success,
  },
  applicationPending: {
    backgroundColor: Colors.warning,
  },
  applicationRejected: {
    backgroundColor: Colors.gray[400],
  },
  applicationStatusText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.white,
  },
});

export default RecruitmentCard;
