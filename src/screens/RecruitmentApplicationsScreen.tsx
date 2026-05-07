/**
 * RecruitmentApplicationsScreen
 *
 * Host's view of applications to their recruitment.
 * Features:
 * - Tabs: 保留中 | 承認済 | 不承認
 * - Applicant profile with message
 * - Approve/Reject buttons with optional response message
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
  TextInput,
  Modal,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';

import { Colors } from '../constants/colors';
import { Spacing, BorderRadius } from '../constants/spacing';
import { Typography } from '../constants/typography';
import { RootStackParamList, RecruitmentApplication } from '../types';
import {
  useRecruitment,
  useRecruitmentApplications,
  useApproveApplication,
  useRejectApplication,
} from '../hooks/queries/useRecruitments';
import ApplicationCard from '../components/ApplicationCard';
import EmptyState from '../components/EmptyState';

type NavigationProp = StackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, 'RecruitmentApplications'>;

type TabType = 'pending' | 'approved' | 'rejected';

const RecruitmentApplicationsScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { recruitmentId } = route.params;

  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [responseModalVisible, setResponseModalVisible] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState<RecruitmentApplication | null>(null);
  const [responseAction, setResponseAction] = useState<'approve' | 'reject'>('approve');
  const [responseMessage, setResponseMessage] = useState('');

  // Fetch recruitment details
  const { data: recruitment } = useRecruitment(recruitmentId);

  // Fetch applications
  const {
    data: applications = [],
    isLoading,
    refetch,
    isFetching,
  } = useRecruitmentApplications(recruitmentId);

  // Mutations
  const approveMutation = useApproveApplication();
  const rejectMutation = useRejectApplication();

  // Filter applications by status
  const filteredApplications = applications.filter((app: RecruitmentApplication) => app.status === activeTab);

  // Count by status
  const pendingCount = applications.filter((app: RecruitmentApplication) => app.status === 'pending').length;
  const approvedCount = applications.filter((app: RecruitmentApplication) => app.status === 'approved').length;
  const rejectedCount = applications.filter((app: RecruitmentApplication) => app.status === 'rejected').length;

  // Handle approve
  const handleApprove = useCallback((application: RecruitmentApplication) => {
    // Check if recruitment is full
    if (recruitment && recruitment.filled_slots >= recruitment.total_slots) {
      Alert.alert('定員に達しています', 'これ以上参加者を承認できません。');
      return;
    }

    setSelectedApplication(application);
    setResponseAction('approve');
    setResponseMessage('');
    setResponseModalVisible(true);
  }, [recruitment]);

  // Handle reject
  const handleReject = useCallback((application: RecruitmentApplication) => {
    setSelectedApplication(application);
    setResponseAction('reject');
    setResponseMessage('');
    setResponseModalVisible(true);
  }, []);

  // Submit response
  const handleSubmitResponse = useCallback(() => {
    if (!selectedApplication || !recruitment) return;

    const mutationParams = {
      applicationId: selectedApplication.id,
      recruitmentId,
      hostId: recruitment.host_id,
      responseMessage: responseMessage || undefined,
    };

    if (responseAction === 'approve') {
      approveMutation.mutate(mutationParams, {
        onSuccess: () => {
          setResponseModalVisible(false);
          setSelectedApplication(null);
        },
      });
    } else {
      rejectMutation.mutate(mutationParams, {
        onSuccess: () => {
          setResponseModalVisible(false);
          setSelectedApplication(null);
        },
      });
    }
  }, [selectedApplication, recruitment, recruitmentId, responseAction, responseMessage, approveMutation, rejectMutation]);

  // Handle view profile
  const handleViewProfile = useCallback(
    (applicantId: string) => {
      navigation.navigate('Profile', { userId: applicantId });
    },
    [navigation]
  );

  // Render application item
  const renderItem = useCallback(
    ({ item }: { item: RecruitmentApplication }) => (
      <ApplicationCard
        application={item}
        onApprove={() => handleApprove(item)}
        onReject={() => handleReject(item)}
        onViewProfile={() => item.applicant?.id && handleViewProfile(item.applicant.id)}
        isApproving={approveMutation.isPending && selectedApplication?.id === item.id}
        isRejecting={rejectMutation.isPending && selectedApplication?.id === item.id}
        showActions={item.status === 'pending'}
      />
    ),
    [handleApprove, handleReject, handleViewProfile, approveMutation.isPending, rejectMutation.isPending, selectedApplication]
  );

  // Render empty state
  const renderEmpty = useCallback(() => {
    if (isLoading) return null;

    const messages: Record<TabType, { title: string; subtitle: string }> = {
      pending: {
        title: '保留中の申請がありません',
        subtitle: '新しい申請があるとここに表示されます',
      },
      approved: {
        title: '承認済みの申請がありません',
        subtitle: 'まだ参加者を承認していません',
      },
      rejected: {
        title: '不承認の申請がありません',
        subtitle: '見送った申請はありません',
      },
    };

    return (
      <EmptyState
        icon="document-text-outline"
        title={messages[activeTab].title}
        subtitle={messages[activeTab].subtitle}
      />
    );
  }, [isLoading, activeTab]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.gray[700]} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.title}>参加申請</Text>
          {recruitment && (
            <Text style={styles.subtitle} numberOfLines={1}>
              {recruitment.title}
            </Text>
          )}
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {/* Slots info */}
      {recruitment && (
        <View style={styles.slotsInfo}>
          <Text style={styles.slotsText}>
            参加枠: {recruitment.filled_slots}/{recruitment.total_slots}名
          </Text>
          <View style={styles.slotsBar}>
            <View
              style={[
                styles.slotsBarFilled,
                { width: `${(recruitment.filled_slots / recruitment.total_slots) * 100}%` },
              ]}
            />
          </View>
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        {(['pending', 'approved', 'rejected'] as TabType[]).map((tab) => {
          const count = tab === 'pending' ? pendingCount : tab === 'approved' ? approvedCount : rejectedCount;
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab === 'pending' ? '保留中' : tab === 'approved' ? '承認済' : '不承認'}
              </Text>
              {count > 0 && (
                <View style={[styles.countBadge, activeTab === tab && styles.countBadgeActive]}>
                  <Text style={[styles.countBadgeText, activeTab === tab && styles.countBadgeTextActive]}>
                    {count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlashList
          data={filteredApplications}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={refetch}
              tintColor={Colors.primary}
            />
          }
          ListEmptyComponent={renderEmpty}
        />
      )}

      {/* Response Modal */}
      <Modal
        visible={responseModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setResponseModalVisible(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setResponseModalVisible(false)}>
              <Ionicons name="close" size={24} color={Colors.gray[600]} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {responseAction === 'approve' ? '参加を承認' : '参加を見送る'}
            </Text>
            <View style={{ width: 24 }} />
          </View>

          <View style={styles.modalContent}>
            <Text style={styles.modalLabel}>
              {selectedApplication?.applicant?.name || '申請者'}さんへのメッセージ（任意）
            </Text>
            <TextInput
              style={styles.messageInput}
              placeholder={
                responseAction === 'approve'
                  ? '例: 参加承認ありがとうございます！当日よろしくお願いします。'
                  : '例: 申し訳ありませんが、今回は別の方をお待ちしております。'
              }
              placeholderTextColor={Colors.gray[400]}
              value={responseMessage}
              onChangeText={setResponseMessage}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[
                styles.submitButton,
                responseAction === 'reject' && styles.rejectButton,
                (approveMutation.isPending || rejectMutation.isPending) && styles.buttonDisabled,
              ]}
              onPress={handleSubmitResponse}
              disabled={approveMutation.isPending || rejectMutation.isPending}
            >
              {approveMutation.isPending || rejectMutation.isPending ? (
                <ActivityIndicator
                  size="small"
                  color={responseAction === 'approve' ? Colors.white : Colors.error}
                />
              ) : (
                <Text
                  style={[
                    styles.submitButtonText,
                    responseAction === 'reject' && styles.rejectButtonText,
                  ]}
                >
                  {responseAction === 'approve' ? '承認する' : '見送る'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
  },
  subtitle: {
    fontSize: Typography.fontSize.sm,
    color: Colors.gray[500],
    marginTop: 2,
  },
  headerSpacer: {
    width: 32,
  },
  slotsInfo: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  slotsText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.gray[600],
    marginBottom: Spacing.xs,
  },
  slotsBar: {
    height: 6,
    backgroundColor: Colors.gray[200],
    borderRadius: 3,
    overflow: 'hidden',
  },
  slotsBarFilled: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.xs,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.gray[100],
    gap: Spacing.xs,
  },
  tabActive: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.gray[600],
  },
  tabTextActive: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.semibold,
  },
  countBadge: {
    backgroundColor: Colors.gray[300],
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  countBadgeActive: {
    backgroundColor: Colors.white,
  },
  countBadgeText: {
    fontSize: 10,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.gray[600],
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
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
  },
  modalContent: {
    flex: 1,
    padding: Spacing.md,
  },
  modalLabel: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text.primary,
    marginBottom: Spacing.sm,
  },
  messageInput: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: Typography.fontSize.base,
    color: Colors.text.primary,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 120,
  },
  submitButton: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  rejectButton: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.error,
  },
  submitButtonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.white,
  },
  rejectButtonText: {
    color: Colors.error,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});

export default RecruitmentApplicationsScreen;
