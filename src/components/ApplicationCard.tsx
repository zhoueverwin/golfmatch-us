/**
 * ApplicationCard Component
 *
 * Displays an application in the host's application management view.
 * Features:
 * - Applicant profile info
 * - Application message
 * - Approve/Reject buttons
 * - Status indicator
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Spacing, BorderRadius, Shadows } from '../constants/spacing';
import { Typography } from '../constants/typography';

// Badge images
const goldBadge = require('../../assets/images/badges/Gold.png');
import {
  RecruitmentApplication,
  getApplicationStatusLabel,
} from '../types/recruitment';

interface ApplicationCardProps {
  application: RecruitmentApplication;
  onApprove?: () => void;
  onReject?: () => void;
  onViewProfile?: () => void;
  isApproving?: boolean;
  isRejecting?: boolean;
  showActions?: boolean;
}

const ApplicationCard: React.FC<ApplicationCardProps> = ({
  application,
  onApprove,
  onReject,
  onViewProfile,
  isApproving = false,
  isRejecting = false,
  showActions = true,
}) => {
  const applicant = application.applicant;
  const avatarUrl = applicant?.profile_pictures?.[0];
  const isPending = application.status === 'pending';
  const isProcessing = isApproving || isRejecting;

  // Format timestamp
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'たった今';
    if (diffMins < 60) return `${diffMins}分前`;
    if (diffHours < 24) return `${diffHours}時間前`;
    if (diffDays < 7) return `${diffDays}日前`;
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  return (
    <View style={styles.container}>
      {/* Applicant info row */}
      <TouchableOpacity
        style={styles.applicantRow}
        onPress={onViewProfile}
        activeOpacity={onViewProfile ? 0.7 : 1}
        disabled={!onViewProfile}
      >
        {/* Avatar */}
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Ionicons name="person" size={20} color={Colors.gray[400]} />
          </View>
        )}

        {/* Info */}
        <View style={styles.applicantInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {applicant?.name || '名前なし'}
            </Text>
            {applicant?.is_verified && (
              <Ionicons name="checkmark-circle" size={14} color={Colors.primary} />
            )}
            {applicant?.is_premium && (
              <Image source={goldBadge} style={styles.premiumBadge} resizeMode="contain" />
            )}
          </View>
          <View style={styles.detailsRow}>
            {applicant?.golf_skill_level && (
              <Text style={styles.detailText}>{applicant.golf_skill_level}</Text>
            )}
            {applicant?.prefecture && (
              <Text style={styles.detailText}> | {applicant.prefecture}</Text>
            )}
          </View>
        </View>

        {/* Timestamp & Status */}
        <View style={styles.statusColumn}>
          <Text style={styles.timestamp}>{formatDate(application.created_at)}</Text>
          {!isPending && (
            <View style={[
              styles.statusBadge,
              application.status === 'approved' && styles.approvedBadge,
              application.status === 'rejected' && styles.rejectedBadge,
            ]}>
              <Text style={[
                styles.statusText,
                application.status === 'approved' && styles.approvedText,
                application.status === 'rejected' && styles.rejectedText,
              ]}>
                {getApplicationStatusLabel(application.status)}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      {/* Message (if any) */}
      {application.message && (
        <View style={styles.messageContainer}>
          <Text style={styles.message} numberOfLines={3}>
            {application.message}
          </Text>
        </View>
      )}

      {/* Host response (if any) */}
      {application.host_response_message && !isPending && (
        <View style={styles.responseContainer}>
          <Text style={styles.responseLabel}>あなたの返信:</Text>
          <Text style={styles.responseText}>{application.host_response_message}</Text>
        </View>
      )}

      {/* Action buttons (for pending applications) */}
      {isPending && showActions && (
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.rejectButton, isProcessing && styles.buttonDisabled]}
            onPress={onReject}
            disabled={isProcessing}
          >
            {isRejecting ? (
              <ActivityIndicator size="small" color={Colors.error} />
            ) : (
              <>
                <Ionicons name="close" size={18} color={Colors.error} />
                <Text style={styles.rejectButtonText}>見送る</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.approveButton, isProcessing && styles.buttonDisabled]}
            onPress={onApprove}
            disabled={isProcessing}
          >
            {isApproving ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <>
                <Ionicons name="checkmark" size={18} color={Colors.white} />
                <Text style={styles.approveButtonText}>承認する</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.sm,
    ...Shadows.small,
    overflow: 'hidden',
  },
  applicantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  applicantInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  premiumBadge: {
    width: 16,
    height: 16,
  },
  name: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    maxWidth: 150,
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  detailText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.gray[500],
  },
  statusColumn: {
    alignItems: 'flex-end',
  },
  timestamp: {
    fontSize: Typography.fontSize.xs,
    color: Colors.gray[400],
    marginBottom: Spacing.xs,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.gray[200],
  },
  approvedBadge: {
    backgroundColor: Colors.success + '20',
  },
  rejectedBadge: {
    backgroundColor: Colors.gray[200],
  },
  statusText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.gray[600],
  },
  approvedText: {
    color: Colors.success,
  },
  rejectedText: {
    color: Colors.gray[500],
  },
  messageContainer: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    marginTop: -Spacing.sm,
  },
  message: {
    fontSize: Typography.fontSize.sm,
    color: Colors.gray[600],
    lineHeight: Typography.fontSize.sm * Typography.lineHeight.relaxed,
    backgroundColor: Colors.gray[50],
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  responseContainer: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  responseLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.gray[500],
    marginBottom: Spacing.xs,
  },
  responseText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.gray[600],
    backgroundColor: Colors.primaryLight,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  actionButtons: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  rejectButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    gap: Spacing.xs,
    borderRightWidth: 1,
    borderRightColor: Colors.borderLight,
  },
  rejectButtonText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.error,
  },
  approveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    gap: Spacing.xs,
    backgroundColor: Colors.primary,
  },
  approveButtonText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.white,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});

export default ApplicationCard;
