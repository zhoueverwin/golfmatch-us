/**
 * MyRecruitmentsScreen
 *
 * Shows user's own recruitments and applications.
 * Features:
 * - Tabs: 主催中 (hosting) | 申請中 (applied)
 * - Hosting: List with application count badges
 * - Applied: Status badges, withdraw option
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  SafeAreaView,
  Alert,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';

import { Colors } from '../constants/colors';
import { Spacing, BorderRadius, Shadows } from '../constants/spacing';
import { Typography } from '../constants/typography';
import { RootStackParamList, Recruitment, RecruitmentApplication } from '../types';
import { useAuth } from '../contexts/AuthContext';
import {
  useMyRecruitments,
  useMyApplications,
  useWithdrawApplication,
} from '../hooks/queries/useRecruitments';
import RecruitmentCard from '../components/RecruitmentCard';
import EmptyState from '../components/EmptyState';
import StandardHeader from '../components/StandardHeader';
import {
  getApplicationStatusLabel,
  getApplicationStatusColor,
} from '../types/recruitment';

type NavigationProp = StackNavigationProp<RootStackParamList>;

type TabType = 'hosting' | 'applied';

const MyRecruitmentsScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { profileId } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('hosting');

  // Fetch my recruitments (as host)
  const {
    data: myRecruitments = [],
    isLoading: isLoadingRecruitments,
    refetch: refetchRecruitments,
    isFetching: isFetchingRecruitments,
  } = useMyRecruitments(profileId || '');

  // Fetch my applications
  const {
    data: myApplications = [],
    isLoading: isLoadingApplications,
    refetch: refetchApplications,
    isFetching: isFetchingApplications,
  } = useMyApplications(profileId || '');

  // Withdraw mutation
  const withdrawMutation = useWithdrawApplication();

  // Handle refresh
  const handleRefresh = useCallback(() => {
    if (activeTab === 'hosting') {
      refetchRecruitments();
    } else {
      refetchApplications();
    }
  }, [activeTab, refetchRecruitments, refetchApplications]);

  // Handle recruitment press
  const handleRecruitmentPress = useCallback(
    (recruitmentId: string) => {
      navigation.navigate('RecruitmentDetail', { recruitmentId });
    },
    [navigation]
  );

  // Handle view applications
  const handleViewApplications = useCallback(
    (recruitmentId: string) => {
      navigation.navigate('RecruitmentApplications', { recruitmentId });
    },
    [navigation]
  );

  // Handle withdraw application
  const handleWithdraw = useCallback(
    (applicationId: string, recruitmentId: string, recruitmentTitle: string) => {
      Alert.alert(
        '申請を取り下げ',
        `「${recruitmentTitle}」への参加申請を取り下げますか？`,
        [
          { text: 'キャンセル', style: 'cancel' },
          {
            text: '取り下げる',
            style: 'destructive',
            onPress: () => {
              withdrawMutation.mutate({
                applicationId,
                applicantId: profileId || '',
                recruitmentId,
              });
            },
          },
        ]
      );
    },
    [withdrawMutation, profileId]
  );

  // Render hosting recruitment item
  const renderHostingItem = useCallback(
    ({ item }: { item: Recruitment }) => {
      // Count pending applications
      const pendingCount = 0; // This would come from a separate query in real implementation

      return (
        <View style={styles.hostingCard}>
          <RecruitmentCard
            recruitment={item}
            onPress={() => handleRecruitmentPress(item.id)}
          />
          <TouchableOpacity
            style={styles.applicationsButton}
            onPress={() => handleViewApplications(item.id)}
          >
            <Ionicons name="people-outline" size={18} color={Colors.primary} />
            <Text style={styles.applicationsButtonText}>申請者を見る</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.gray[400]} />
          </TouchableOpacity>
        </View>
      );
    },
    [handleRecruitmentPress, handleViewApplications]
  );

  // Render applied item
  const renderAppliedItem = useCallback(
    ({ item }: { item: RecruitmentApplication }) => {
      const recruitment = item.recruitment;
      if (!recruitment) return null;

      const statusColor = getApplicationStatusColor(item.status);
      const isPending = item.status === 'pending';

      return (
        <View style={styles.appliedCard}>
          <TouchableOpacity
            style={styles.appliedContent}
            onPress={() => handleRecruitmentPress(recruitment.id)}
          >
            {/* Status badge */}
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>
                {getApplicationStatusLabel(item.status)}
              </Text>
            </View>

            {/* Recruitment info */}
            <Text style={styles.appliedTitle} numberOfLines={1}>
              {recruitment.title}
            </Text>
            <View style={styles.appliedMeta}>
              <Ionicons name="calendar-outline" size={14} color={Colors.gray[500]} />
              <Text style={styles.appliedMetaText}>
                {new Date(recruitment.play_date).toLocaleDateString('ja-JP', {
                  month: 'long',
                  day: 'numeric',
                  weekday: 'short',
                })}
              </Text>
              <Text style={styles.appliedMetaSeparator}>|</Text>
              <Ionicons name="golf-outline" size={14} color={Colors.gray[500]} />
              <Text style={styles.appliedMetaText}>{recruitment.golf_course_name}</Text>
            </View>

            {/* Message preview */}
            {item.message && (
              <Text style={styles.messagePreview} numberOfLines={2}>
                {item.message}
              </Text>
            )}

            {/* Host response */}
            {item.host_response_message && (
              <View style={styles.responseContainer}>
                <Text style={styles.responseLabel}>主催者からの返信:</Text>
                <Text style={styles.responseText}>{item.host_response_message}</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Withdraw button for pending applications */}
          {isPending && (
            <TouchableOpacity
              style={styles.withdrawButton}
              onPress={() => handleWithdraw(item.id, recruitment.id, recruitment.title)}
              disabled={withdrawMutation.isPending}
            >
              {withdrawMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.error} />
              ) : (
                <>
                  <Ionicons name="close-circle-outline" size={18} color={Colors.error} />
                  <Text style={styles.withdrawButtonText}>取り下げる</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      );
    },
    [handleRecruitmentPress, handleWithdraw, withdrawMutation.isPending]
  );

  // Render empty state
  const renderEmpty = useCallback(() => {
    if (activeTab === 'hosting' && isLoadingRecruitments) return null;
    if (activeTab === 'applied' && isLoadingApplications) return null;

    return (
      <EmptyState
        icon={activeTab === 'hosting' ? 'golf-outline' : 'document-text-outline'}
        title={activeTab === 'hosting' ? '主催中の募集がありません' : '申請中の募集がありません'}
        subtitle={
          activeTab === 'hosting'
            ? '新しい募集を作成して\nゴルフ仲間を見つけましょう'
            : '募集一覧から参加したいラウンドを\n探してみましょう'
        }
      />
    );
  }, [activeTab, isLoadingRecruitments, isLoadingApplications]);

  const isLoading = activeTab === 'hosting' ? isLoadingRecruitments : isLoadingApplications;
  const isFetching = activeTab === 'hosting' ? isFetchingRecruitments : isFetchingApplications;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <StandardHeader
        title="マイ募集"
        showBackButton={true}
        onBackPress={() => navigation.goBack()}
      />

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        {(['hosting', 'applied'] as TabType[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'hosting' ? '主催中' : '申請中'}
            </Text>
            {tab === 'hosting' && myRecruitments.length > 0 && (
              <View style={[styles.countBadge, activeTab === tab && styles.countBadgeActive]}>
                <Text style={[styles.countBadgeText, activeTab === tab && styles.countBadgeTextActive]}>
                  {myRecruitments.length}
                </Text>
              </View>
            )}
            {tab === 'applied' && myApplications.length > 0 && (
              <View style={[styles.countBadge, activeTab === tab && styles.countBadgeActive]}>
                <Text style={[styles.countBadgeText, activeTab === tab && styles.countBadgeTextActive]}>
                  {myApplications.length}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : activeTab === 'hosting' ? (
        <FlashList
          data={myRecruitments}
          renderItem={renderHostingItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isFetching}
              onRefresh={handleRefresh}
              tintColor={Colors.primary}
            />
          }
          ListEmptyComponent={renderEmpty}
        />
      ) : (
        <FlashList
          data={myApplications}
          renderItem={renderAppliedItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isFetching}
              onRefresh={handleRefresh}
              tintColor={Colors.primary}
            />
          }
          ListEmptyComponent={renderEmpty}
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
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  tabActive: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.gray[600],
  },
  tabTextActive: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.semibold,
  },
  countBadge: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  countBadgeActive: {
    backgroundColor: Colors.white,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.white,
  },
  countBadgeTextActive: {
    color: Colors.primary,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingVertical: Spacing.sm,
  },
  hostingCard: {
    marginBottom: Spacing.sm,
  },
  applicationsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
    marginHorizontal: Spacing.md,
    marginTop: -Spacing.xs,
    paddingVertical: Spacing.md,
    borderBottomLeftRadius: BorderRadius.lg,
    borderBottomRightRadius: BorderRadius.lg,
    gap: Spacing.xs,
    ...Shadows.small,
  },
  applicationsButtonText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.primary,
    flex: 1,
  },
  appliedCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.sm,
    ...Shadows.small,
    overflow: 'hidden',
  },
  appliedContent: {
    padding: Spacing.md,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
  },
  statusText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.semibold,
  },
  appliedTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    marginBottom: Spacing.xs,
  },
  appliedMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  appliedMetaText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.gray[500],
  },
  appliedMetaSeparator: {
    color: Colors.gray[300],
    marginHorizontal: Spacing.xs,
  },
  messagePreview: {
    fontSize: Typography.fontSize.sm,
    color: Colors.gray[600],
    marginTop: Spacing.sm,
    backgroundColor: Colors.gray[50],
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  responseContainer: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.primaryLight,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  responseLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.gray[500],
    marginBottom: Spacing.xs,
  },
  responseText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
  },
  withdrawButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    gap: Spacing.xs,
  },
  withdrawButtonText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.error,
  },
});

export default MyRecruitmentsScreen;
