/**
 * RecruitmentDetailScreen
 *
 * Displays detailed information about a recruitment.
 * Features:
 * - Course info, date, time, requirements
 * - Host profile card
 * - Participants list
 * - Apply button (for visitors)
 * - Manage applications (for host)
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  View as RNView,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  SafeAreaView,
  Alert,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';

import { Colors } from '../constants/colors';
import { Spacing, BorderRadius, Shadows } from '../constants/spacing';
import { Typography } from '../constants/typography';

// Badge images
const goldBadge = require('../../assets/images/badges/Gold.png');
import { RootStackParamList, CoursePricing } from '../types';
import { golfCourseService } from '../services/golfCourseService';
import {
  getCourseTypeLabel,
  getGenderPreferenceLabel,
  getSkillRangeLabel,
  formatTeeTime,
  getApplicationStatusLabel,
} from '../types/recruitment';
import { useAuth } from '../contexts/AuthContext';
import { UserActivityService } from '../services/userActivityService';
import {
  useRecruitment,
  useApprovedParticipants,
  useApplyToRecruitment,
} from '../hooks/queries/useRecruitments';
import StandardHeader from '../components/StandardHeader';
import ApplyModal from '../components/ApplyModal';
import ShareModal from '../components/ShareModal';
import ShareableRecruitmentCard from '../components/ShareableRecruitmentCard';
import PlanDetailsBottomSheet from '../components/PlanDetailsBottomSheet';
import { shareService } from '../services/shareService';
import { formatJapaneseText } from '../utils/formatters';

type NavigationProp = StackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, 'RecruitmentDetail'>;

const RecruitmentDetailScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { recruitmentId } = route.params;
  const { profileId } = useAuth();

  const [showApplyModal, setShowApplyModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showPlanDetails, setShowPlanDetails] = useState(false);
  const [showFullCaption, setShowFullCaption] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [coursePricing, setCoursePricing] = useState<CoursePricing | null>(null);
  const [isPricingLoading, setIsPricingLoading] = useState(false);
  const shareCardRef = useRef<RNView>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const courseCardYRef = useRef<number>(0);

  // Fetch recruitment data
  const { data: recruitment, isLoading, refetch } = useRecruitment(
    recruitmentId,
    profileId || undefined
  );

  // Debug logging for golf course data
  useEffect(() => {
    if (recruitment) {
      console.log('[RecruitmentDetailScreen] recruitment data:', {
        id: recruitment.id,
        golf_course_id: recruitment.golf_course_id,
        golf_course: recruitment.golf_course,
        has_image: !!recruitment.golf_course?.image_url,
        has_reserve: !!recruitment.golf_course?.reserve_url,
        image_url: recruitment.golf_course?.image_url,
      });
    }
  }, [recruitment]);

  // Fetch participants
  const { data: participants = [] } = useApprovedParticipants(recruitmentId);

  // Apply mutation
  const applyMutation = useApplyToRecruitment();

  // Check if current user is the host
  const isHost = recruitment?.host_id === profileId;
  const hasApplied = recruitment?.has_applied;
  const applicationStatus = recruitment?.application_status;
  const canApply = !isHost && !hasApplied && recruitment?.status === 'open';

  // Track recruitment view on mount
  useEffect(() => {
    if (profileId && recruitmentId) {
      UserActivityService.trackRecruitmentView(profileId, recruitmentId);
    }
  }, [profileId, recruitmentId]);

  // Fetch course pricing when recruitment data is available
  useEffect(() => {
    const fetchPricing = async () => {
      const goraCourseId = recruitment?.golf_course?.gora_course_id;
      const playDate = recruitment?.play_date;

      if (!goraCourseId || !playDate) {
        setCoursePricing(null);
        return;
      }

      setIsPricingLoading(true);
      try {
        const result = await golfCourseService.getCoursePricing(goraCourseId, playDate);
        if (result.success) {
          setCoursePricing(result.data ?? null);
        }
      } catch (error) {
        console.error('Failed to fetch pricing:', error);
      } finally {
        setIsPricingLoading(false);
      }
    };

    fetchPricing();
  }, [recruitment?.golf_course?.gora_course_id, recruitment?.play_date]);

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

  // Handle host profile press
  const handleHostPress = useCallback(() => {
    if (recruitment?.host_id) {
      navigation.navigate('Profile', { userId: recruitment.host_id });
    }
  }, [navigation, recruitment?.host_id]);

  // Handle participant press
  const handleParticipantPress = useCallback(
    (userId: string) => {
      navigation.navigate('Profile', { userId });
    },
    [navigation]
  );

  // Handle manage applications
  const handleManageApplications = useCallback(() => {
    navigation.navigate('RecruitmentApplications', { recruitmentId });
  }, [navigation, recruitmentId]);

  // Handle apply
  const handleApply = useCallback(
    async (message?: string) => {
      if (!profileId) return;

      try {
        await applyMutation.mutateAsync({
          recruitmentId,
          applicantId: profileId,
          message,
        });
        setShowApplyModal(false);
        Alert.alert('申請完了', '参加申請を送信しました。承認をお待ちください。');
        refetch();
      } catch (error: any) {
        Alert.alert('エラー', error.message || '申請に失敗しました');
      }
    },
    [profileId, recruitmentId, applyMutation, refetch]
  );

  // Handle reservation button - opens Rakuten GORA in browser
  const handleReserve = useCallback(async () => {
    const reserveUrl = recruitment?.golf_course?.reserve_url;
    if (!reserveUrl) return;

    try {
      await WebBrowser.openBrowserAsync(reserveUrl, {
        dismissButtonStyle: 'close',
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      });
    } catch (error) {
      console.error('Failed to open reservation URL:', error);
      Alert.alert('エラー', '予約ページを開けませんでした');
    }
  }, [recruitment?.golf_course?.reserve_url]);

  // Share handlers
  // Generate share message for text-based sharing (LINE, X)
  const getShareMessage = useCallback(() => {
    if (!recruitment) return '';
    const remainingSlots = recruitment.total_slots - recruitment.filled_slots;
    return shareService.generateRecruitmentShareMessage({
      date: formatPlayDate(recruitment.play_date) + (recruitment.tee_time ? ` ${formatTeeTime(recruitment.tee_time)}` : ''),
      courseName: recruitment.golf_course_name,
      location: recruitment.prefecture,
      hostName: recruitment.host?.name || '',
      remainingSlots,
      totalSlots: recruitment.total_slots,
    });
  }, [recruitment]);

  // Handle image-based sharing (Instagram, Messages, Other apps)
  const handleShare = useCallback(async () => {
    if (!shareCardRef.current || !recruitment) return;

    setIsCapturing(true);
    try {
      const uri = await shareService.captureView(shareCardRef);
      const message = getShareMessage();
      await shareService.shareImage(uri, message);
    } catch (error) {
      console.error('Share failed:', error);
    } finally {
      setIsCapturing(false);
    }
  }, [recruitment, getShareMessage]);

  // Handle Instagram sharing (save to camera roll + open Instagram)
  const handleInstagramShare = useCallback(async () => {
    if (!shareCardRef.current || !recruitment) return;

    setIsCapturing(true);
    try {
      const uri = await shareService.captureView(shareCardRef);
      await shareService.shareToInstagram(uri);
    } catch (error) {
      console.error('Instagram share failed:', error);
    } finally {
      setIsCapturing(false);
    }
  }, [recruitment]);

  const handleSaveToGallery = useCallback(async () => {
    if (!shareCardRef.current || !recruitment) return;

    setIsCapturing(true);
    try {
      const uri = await shareService.captureView(shareCardRef);
      await shareService.saveToGallery(uri);
    } catch (error) {
      console.error('Save to gallery failed:', error);
    } finally {
      setIsCapturing(false);
    }
  }, [recruitment]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StandardHeader title="募集詳細" showBackButton={true} onBackPress={() => navigation.goBack()} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!recruitment) {
    return (
      <SafeAreaView style={styles.container}>
        <StandardHeader title="募集詳細" showBackButton={true} onBackPress={() => navigation.goBack()} />
        <View style={styles.emptyContainer}>
          <Ionicons name="golf-outline" size={48} color={Colors.gray[300]} />
          <Text style={styles.emptyText}>募集が見つかりませんでした</Text>
        </View>
      </SafeAreaView>
    );
  }

  const hostAvatar = recruitment.host?.profile_pictures?.[0];
  const remainingSlots = recruitment.total_slots - recruitment.filled_slots;

  return (
    <SafeAreaView style={styles.container}>
      <StandardHeader
        title="募集詳細"
        showBackButton={true}
        onBackPress={() => navigation.goBack()}
        rightComponent={
          <View style={styles.headerButtons}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => setShowShareModal(true)}
            >
              <Ionicons name="share-outline" size={22} color={Colors.primary} />
            </TouchableOpacity>
            {isHost && (
              <TouchableOpacity
                style={styles.headerButton}
                onPress={() => navigation.navigate('RecruitmentEdit', { recruitmentId })}
              >
                <Image
                  source={require('../../assets/images/Icons/Edit.png')}
                  style={styles.editIcon}
                />
              </TouchableOpacity>
            )}
          </View>
        }
      />

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Status badges */}
        <View style={styles.badgeRow}>
          {recruitment.is_new && (
            <View style={styles.newBadge}>
              <Text style={styles.newBadgeText}>NEW</Text>
            </View>
          )}
          <View style={[
            styles.statusBadge,
            recruitment.status === 'full' && styles.fullBadge,
          ]}>
            <Text style={[
              styles.statusBadgeText,
              recruitment.status === 'full' && styles.fullBadgeText,
            ]}>
              {recruitment.status === 'full' ? '満員' : '募集中'}
            </Text>
          </View>
        </View>

        {/* Title */}
        <Text style={styles.title}>{recruitment.title}</Text>

        {/* Date and time card */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Ionicons name="calendar" size={20} color={Colors.primary} />
            <Text style={styles.dateText}>
              {formatPlayDate(recruitment.play_date)}
            </Text>
          </View>
          {recruitment.tee_time && (
            <View style={styles.cardRow}>
              <Ionicons name="time" size={20} color={Colors.gray[500]} />
              <Text style={styles.cardText}>
                ティータイム: {formatTeeTime(recruitment.tee_time)}
              </Text>
            </View>
          )}
        </View>

        {/* Course info card */}
        <View
          style={styles.courseCard}
          onLayout={(e) => {
            courseCardYRef.current = e.nativeEvent.layout.y;
          }}
        >
          {/* Course hero image */}
          {recruitment.golf_course?.image_url && (
            <ExpoImage
              source={{ uri: recruitment.golf_course.image_url }}
              style={styles.courseImage}
              contentFit="cover"
              transition={300}
            />
          )}
          <View style={styles.courseCardContent}>
            <View style={styles.cardHeader}>
              <Ionicons name="golf" size={20} color={Colors.primary} />
              <Text style={styles.cardTitle}>コース情報</Text>
            </View>
            <Text style={styles.courseName}>{recruitment.golf_course_name}</Text>
            {recruitment.golf_course_location && (
              <Text style={styles.courseLocation}>{recruitment.golf_course_location}</Text>
            )}
            <View style={styles.courseDetails}>
              {recruitment.prefecture && (
                <View style={styles.detailBadge}>
                  <Ionicons name="location" size={14} color={Colors.gray[600]} />
                  <Text style={styles.detailText}>{recruitment.prefecture}</Text>
                </View>
              )}
              <View style={styles.detailBadge}>
                <Ionicons name="flag" size={14} color={Colors.gray[600]} />
                <Text style={styles.detailText}>
                  {getCourseTypeLabel(recruitment.course_type)}
                </Text>
              </View>
              {recruitment.golf_course?.evaluation != null && recruitment.golf_course.evaluation > 0 && (
                <View style={styles.detailBadge}>
                  <Ionicons name="star" size={14} color="#F59E0B" />
                  <Text style={styles.detailText}>
                    {recruitment.golf_course.evaluation.toFixed(1)}
                  </Text>
                </View>
              )}
            </View>
            {/* Course pricing from Rakuten GORA */}
            {recruitment.golf_course?.gora_course_id && (isPricingLoading || coursePricing) && (
              <View style={styles.pricingSection}>
                {isPricingLoading ? (
                  <View style={styles.pricingRow}>
                    <ActivityIndicator size="small" color={Colors.gray[400]} />
                    <Text style={styles.pricingLoadingText}>料金を取得中...</Text>
                  </View>
                ) : coursePricing ? (
                  <>
                    <TouchableOpacity
                      style={styles.pricingTouchable}
                      onPress={() => setShowPlanDetails(true)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.pricingRow}>
                        <Ionicons name="pricetag" size={16} color={Colors.primary} />
                        <Text style={styles.pricingText}>
                          ¥{coursePricing.minPrice.toLocaleString()}〜
                        </Text>
                        <Text style={styles.pricingSubtext}>
                          ({coursePricing.planCount}プラン
                          {coursePricing.hasLunchIncluded && ' / 昼食付あり'})
                        </Text>
                      </View>
                      <View style={styles.pricingDetailButton}>
                        <Text style={styles.pricingDetailButtonText}>詳細</Text>
                        <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
                      </View>
                    </TouchableOpacity>
                    {coursePricing.caption && (
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => {
                            if (showFullCaption) {
                              // When collapsing, scroll to the course card so the view
                              // doesn't jump to a strange position at the bottom
                              scrollViewRef.current?.scrollTo({
                                y: courseCardYRef.current,
                                animated: true,
                              });
                            }
                            setShowFullCaption(!showFullCaption);
                          }}
                        >
                          <Text
                            style={styles.courseCaption}
                            numberOfLines={showFullCaption ? undefined : 3}
                          >
                            {formatJapaneseText(coursePricing.caption)}
                          </Text>
                          <Text style={styles.captionToggle}>
                            {showFullCaption ? '閉じる' : 'もっと見る'}
                          </Text>
                        </TouchableOpacity>
                    )}
                  </>
                ) : null}
              </View>
            )}
            {/* Reservation button */}
            {recruitment.golf_course?.reserve_url && (
              <TouchableOpacity
                style={styles.reserveButton}
                onPress={handleReserve}
              >
                <Ionicons name="calendar-outline" size={18} color={Colors.white} />
                <Text style={styles.reserveButtonText}>予約する</Text>
                <Ionicons name="open-outline" size={16} color={Colors.white} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Slots info */}
        <View style={styles.slotsCard}>
          <Ionicons name="people" size={20} color={Colors.primary} />
          <Text style={styles.slotsText}>
            残り{remainingSlots}枠 / {recruitment.total_slots}枠
          </Text>
          <View style={styles.slotsBar}>
            <View
              style={[
                styles.slotsBarFill,
                { width: `${(recruitment.filled_slots / recruitment.total_slots) * 100}%` },
              ]}
            />
          </View>
        </View>

        {/* Requirements card */}
        {(recruitment.gender_preference !== 'any' ||
          recruitment.min_skill_level ||
          recruitment.max_skill_level) && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="options" size={20} color={Colors.primary} />
              <Text style={styles.cardTitle}>参加条件</Text>
            </View>
            {recruitment.gender_preference !== 'any' && (
              <View style={styles.requirementRow}>
                <Text style={styles.requirementLabel}>性別:</Text>
                <Text style={styles.requirementValue}>
                  {getGenderPreferenceLabel(recruitment.gender_preference)}
                </Text>
              </View>
            )}
            {(recruitment.min_skill_level || recruitment.max_skill_level) && (
              <View style={styles.requirementRow}>
                <Text style={styles.requirementLabel}>レベル:</Text>
                <Text style={styles.requirementValue}>
                  {getSkillRangeLabel(recruitment.min_skill_level, recruitment.max_skill_level)}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Cost info */}
        {recruitment.estimated_cost && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="cash" size={20} color={Colors.primary} />
              <Text style={styles.cardTitle}>費用目安</Text>
            </View>
            <Text style={styles.costText}>{recruitment.estimated_cost}</Text>
          </View>
        )}

        {/* Description */}
        {recruitment.description && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="document-text" size={20} color={Colors.primary} />
              <Text style={styles.cardTitle}>詳細</Text>
            </View>
            <Text style={styles.descriptionText}>{recruitment.description}</Text>
          </View>
        )}

        {/* Additional notes */}
        {recruitment.additional_notes && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="information-circle" size={20} color={Colors.primary} />
              <Text style={styles.cardTitle}>備考</Text>
            </View>
            <Text style={styles.descriptionText}>{recruitment.additional_notes}</Text>
          </View>
        )}

        {/* Host card */}
        <TouchableOpacity style={styles.hostCard} onPress={handleHostPress}>
          <Text style={styles.hostLabel}>主催者</Text>
          <View style={styles.hostRow}>
            {hostAvatar ? (
              <Image source={{ uri: hostAvatar }} style={styles.hostAvatar} />
            ) : (
              <View style={styles.hostAvatarPlaceholder}>
                <Ionicons name="person" size={24} color={Colors.gray[400]} />
              </View>
            )}
            <View style={styles.hostInfo}>
              <View style={styles.hostNameRow}>
                <Text style={styles.hostName}>{recruitment.host?.name || '名前なし'}</Text>
                {recruitment.host?.is_verified && (
                  <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
                )}
                {recruitment.host?.is_premium && (
                  <Image source={goldBadge} style={styles.premiumBadge} resizeMode="contain" />
                )}
              </View>
              {recruitment.host?.golf_skill_level && (
                <Text style={styles.hostDetail}>{recruitment.host.golf_skill_level}</Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
          </View>
        </TouchableOpacity>

        {/* Participants */}
        {participants.length > 0 && (
          <View style={styles.participantsCard}>
            <Text style={styles.cardTitle}>参加者 ({participants.length}名)</Text>
            <View style={styles.participantsList}>
              {participants.map((participant: { id: string; name?: string; profile_pictures?: string[] }) => (
                <TouchableOpacity
                  key={participant.id}
                  style={styles.participantItem}
                  onPress={() => handleParticipantPress(participant.id)}
                >
                  {participant.profile_pictures?.[0] ? (
                    <Image
                      source={{ uri: participant.profile_pictures[0] }}
                      style={styles.participantAvatar}
                    />
                  ) : (
                    <View style={styles.participantAvatarPlaceholder}>
                      <Ionicons name="person" size={16} color={Colors.gray[400]} />
                    </View>
                  )}
                  <Text style={styles.participantName} numberOfLines={1}>
                    {participant.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Spacer for bottom button */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom action */}
      <View style={styles.bottomAction}>
        {isHost ? (
          <TouchableOpacity
            style={styles.manageButton}
            onPress={handleManageApplications}
          >
            <Ionicons name="people" size={20} color={Colors.white} />
            <Text style={styles.manageButtonText}>申請を管理</Text>
          </TouchableOpacity>
        ) : hasApplied ? (
          <View style={[
            styles.appliedBadge,
            applicationStatus === 'approved' && styles.approvedBadge,
            applicationStatus === 'rejected' && styles.rejectedBadge,
          ]}>
            <Ionicons
              name={
                applicationStatus === 'approved' ? 'checkmark-circle' :
                applicationStatus === 'pending' ? 'time' :
                'close-circle'
              }
              size={20}
              color={Colors.white}
            />
            <Text style={styles.appliedBadgeText}>
              {getApplicationStatusLabel(applicationStatus || 'pending')}
            </Text>
          </View>
        ) : canApply ? (
          <TouchableOpacity
            style={styles.applyButton}
            onPress={() => setShowApplyModal(true)}
          >
            <Ionicons name="paper-plane" size={20} color={Colors.white} />
            <Text style={styles.applyButtonText}>参加申請する</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Apply Modal */}
      <ApplyModal
        visible={showApplyModal}
        recruitment={recruitment}
        onClose={() => setShowApplyModal(false)}
        onSubmit={handleApply}
        isLoading={applyMutation.isPending}
      />

      {/* Share Modal */}
      <ShareModal
        visible={showShareModal}
        onClose={() => setShowShareModal(false)}
        onShare={handleShare}
        onSaveToGallery={handleSaveToGallery}
        onInstagramShare={handleInstagramShare}
        isLoading={isCapturing}
        title="募集をシェア"
        shareMessage={getShareMessage()}
      />

      {/* Plan Details Bottom Sheet */}
      {coursePricing?.plans && coursePricing.plans.length > 0 && (
        <PlanDetailsBottomSheet
          visible={showPlanDetails}
          onClose={() => setShowPlanDetails(false)}
          plans={coursePricing.plans}
          courseName={recruitment.golf_course_name}
          playDate={recruitment.play_date}
        />
      )}

      {/* Hidden shareable card for capture */}
      {recruitment && (
        <View style={styles.offscreenContainer}>
          <ShareableRecruitmentCard ref={shareCardRef} recruitment={recruitment} />
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    marginTop: Spacing.md,
    fontSize: Typography.fontSize.base,
    color: Colors.gray[500],
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  headerButton: {
    padding: Spacing.sm,
  },
  editIcon: {
    width: 22,
    height: 22,
    tintColor: Colors.primary,
  },
  editButton: {
    padding: Spacing.sm,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.md,
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
  title: {
    fontSize: Typography.fontSize['2xl'],
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
    marginBottom: Spacing.md,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.small,
  },
  courseCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    ...Shadows.small,
  },
  courseImage: {
    width: '100%',
    height: 180,
    backgroundColor: '#f0f0f0', // Fallback color if image fails to load
  },
  courseCardContent: {
    padding: Spacing.md,
  },
  pricingSection: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[100],
  },
  pricingTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pricingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flex: 1,
  },
  pricingDetailButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  pricingDetailButtonText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.primary,
  },
  pricingText: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.primary,
  },
  pricingSubtext: {
    fontSize: Typography.fontSize.xs,
    color: Colors.gray[500],
  },
  pricingLoadingText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.gray[400],
    marginLeft: Spacing.xs,
  },
  courseCaption: {
    fontSize: Typography.fontSize.sm,
    color: Colors.gray[600],
    marginTop: Spacing.sm,
    lineHeight: Typography.fontSize.sm * Typography.lineHeight.relaxed,
  },
  captionToggle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.primary,
    marginTop: Spacing.xs,
  },
  reserveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E60012', // Rakuten red
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
    gap: Spacing.xs,
  },
  reserveButtonText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.white,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  cardTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  dateText: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.primary,
  },
  cardText: {
    fontSize: Typography.fontSize.base,
    color: Colors.gray[600],
  },
  courseName: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    marginBottom: Spacing.xs,
  },
  courseLocation: {
    fontSize: Typography.fontSize.sm,
    color: Colors.gray[500],
    marginBottom: Spacing.sm,
  },
  courseDetails: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  detailBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray[100],
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    gap: 4,
  },
  detailText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.gray[600],
  },
  slotsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
    ...Shadows.small,
  },
  slotsText: {
    flex: 1,
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.primary,
  },
  slotsBar: {
    width: 100,
    height: 8,
    backgroundColor: Colors.gray[200],
    borderRadius: 4,
    overflow: 'hidden',
  },
  slotsBarFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 4,
  },
  requirementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  requirementLabel: {
    width: 60,
    fontSize: Typography.fontSize.sm,
    color: Colors.gray[500],
  },
  requirementValue: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text.primary,
  },
  costText: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text.primary,
  },
  descriptionText: {
    fontSize: Typography.fontSize.base,
    color: Colors.gray[600],
    lineHeight: Typography.fontSize.base * Typography.lineHeight.relaxed,
  },
  hostCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.small,
  },
  hostLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.gray[500],
    marginBottom: Spacing.sm,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  hostAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  hostAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  hostInfo: {
    flex: 1,
    marginLeft: Spacing.md,
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
  },
  premiumBadge: {
    width: 18,
    height: 18,
  },
  hostDetail: {
    fontSize: Typography.fontSize.sm,
    color: Colors.gray[500],
    marginTop: 2,
  },
  participantsCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.small,
  },
  participantsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  participantItem: {
    alignItems: 'center',
    width: 60,
  },
  participantAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginBottom: 4,
  },
  participantAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  participantName: {
    fontSize: Typography.fontSize.xs,
    color: Colors.gray[600],
    textAlign: 'center',
  },
  bottomAction: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.md,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  applyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  applyButtonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.white,
  },
  manageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  manageButtonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.white,
  },
  appliedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.warning,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  approvedBadge: {
    backgroundColor: Colors.success,
  },
  rejectedBadge: {
    backgroundColor: Colors.gray[400],
  },
  appliedBadgeText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.white,
  },
  offscreenContainer: {
    position: 'absolute',
    left: -9999,
    top: 0,
  },
});

export default RecruitmentDetailScreen;
