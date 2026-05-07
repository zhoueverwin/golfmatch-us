/**
 * CourseSearchScreen
 *
 * Course discovery screen for the 募集 tab.
 * Features:
 * - おすすめ personalized carousel (region-based)
 * - Search by keyword
 * - Filter by date, prefecture, budget
 * - Sort by rating or price
 * - Course cards with lazy-loaded pricing
 * - Plan details bottom sheet (reused)
 * - "この場所で募集する" CTA → RecruitmentCreate prefill
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  FlatList,
  Image,
  ActivityIndicator,
  SafeAreaView,
  RefreshControl,
  Platform,
  Modal,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as WebBrowser from 'expo-web-browser';

import { Colors } from '../constants/colors';
import { Spacing, BorderRadius, Shadows } from '../constants/spacing';
import { Typography } from '../constants/typography';
import {
  RootStackParamList,
  GolfCourse,
  CoursePricing,
  PREFECTURE_REGIONS,
  ALL_PREFECTURES,
} from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useProfile } from '../hooks/queries/useProfile';
import {
  useSearchCourses,
  useRecommendedCourses,
} from '../hooks/queries/useGolfCourses';
import { golfCourseService } from '../services/golfCourseService';
import PlanDetailsBottomSheet from '../components/PlanDetailsBottomSheet';
import StandardHeader from '../components/StandardHeader';

type NavigationProp = StackNavigationProp<RootStackParamList>;

type SortOption = 'rating' | 'price';

const BUDGET_OPTIONS = [
  { label: 'すべて', value: undefined },
  { label: '〜¥8,000', value: 8000 },
  { label: '〜¥10,000', value: 10000 },
  { label: '〜¥12,000', value: 12000 },
  { label: '〜¥15,000', value: 15000 },
  { label: '¥15,000〜', value: -15000 }, // Negative = "above" threshold
] as const;

const CourseSearchScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { profileId } = useAuth();
  const { profile } = useProfile(profileId || undefined);

  // Core state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedPrefecture, setSelectedPrefecture] = useState<string | undefined>();
  const [playDate, setPlayDate] = useState<string | undefined>();
  const [budgetMax, setBudgetMax] = useState<number | undefined>();
  const [sortBy, setSortBy] = useState<SortOption>('rating');

  // Modal/picker state
  const [showPrefecturePicker, setShowPrefecturePicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showBudgetPicker, setShowBudgetPicker] = useState(false);
  const [showSortPicker, setShowSortPicker] = useState(false);

  // Plan details bottom sheet
  const [selectedCourseForPlans, setSelectedCourseForPlans] = useState<{
    course: GolfCourse;
    pricing: CoursePricing;
  } | null>(null);

  // Pricing state
  const [pricingMap, setPricingMap] = useState<Record<string, CoursePricing | null>>({});
  const [pricingLoading, setPricingLoading] = useState<Set<string>>(new Set());

  // Expanded cards state
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // User's prefecture for おすすめ
  const userPrefecture = profile?.basic?.prefecture;

  // Track if user is filtering/searching (hides おすすめ)
  const isFiltering = !!selectedPrefecture || !!debouncedQuery || !!playDate;

  // おすすめ courses
  const {
    courses: recommendedCourses,
    regionName,
    isLoading: isLoadingRecommended,
  } = useRecommendedCourses(userPrefecture, 10, !isFiltering);

  // Search results
  const {
    courses: searchResults,
    isLoading: isLoadingSearch,
    refetch: refetchSearch,
  } = useSearchCourses({
    query: debouncedQuery,
    prefecture: selectedPrefecture,
    limit: 30,
    enabled: isFiltering,
  });

  // Fetch pricing when date is set + courses change
  // Uses a ref to track the current playDate to avoid race conditions
  const pricingFetchRef = React.useRef(0);

  // Stable key derived from search results to avoid re-triggering on new array references
  const searchResultKey = useMemo(
    () => searchResults.map(c => c.id || c.gora_course_id).join(','),
    [searchResults]
  );

  useEffect(() => {
    if (!playDate || searchResults.length === 0) {
      setPricingMap(prev => Object.keys(prev).length === 0 ? prev : {});
      setPricingLoading(prev => prev.size === 0 ? prev : new Set());
      return;
    }

    // Increment fetch ID to cancel stale fetches
    const fetchId = ++pricingFetchRef.current;

    // Reset pricing for new date/search
    setPricingMap({});
    setPricingLoading(new Set());

    const fetchPricing = async () => {
      const coursesWithGoraId = searchResults.filter(c => c.gora_course_id);

      if (coursesWithGoraId.length === 0) return;

      // Track loading state
      setPricingLoading(new Set(coursesWithGoraId.map(c => c.gora_course_id!)));

      // Fetch in batches of 5
      const BATCH_SIZE = 5;
      for (let i = 0; i < coursesWithGoraId.length; i += BATCH_SIZE) {
        // Abort if a newer fetch has started
        if (pricingFetchRef.current !== fetchId) return;

        const batch = coursesWithGoraId.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(c => golfCourseService.getCoursePricing(c.gora_course_id!, playDate))
        );

        // Abort if a newer fetch has started
        if (pricingFetchRef.current !== fetchId) return;

        const newPricing: Record<string, CoursePricing | null> = {};
        const doneLoading = new Set<string>();
        batch.forEach((course, idx) => {
          const result = results[idx];
          if (result.status === 'fulfilled' && result.value.success && result.value.data) {
            newPricing[course.gora_course_id!] = result.value.data;
          } else {
            // null = no plans available for this date (not an error)
            newPricing[course.gora_course_id!] = null;
          }
          doneLoading.add(course.gora_course_id!);
        });

        setPricingMap(prev => ({ ...prev, ...newPricing }));
        setPricingLoading(prev => {
          const next = new Set(prev);
          doneLoading.forEach(id => next.delete(id));
          return next;
        });
      }
    };

    fetchPricing();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playDate, searchResultKey]);

  // Sorted + filtered courses
  const displayCourses = useMemo(() => {
    let filtered = [...searchResults];

    // Budget filter
    if (budgetMax && playDate) {
      filtered = filtered.filter(c => {
        const pricing = pricingMap[c.gora_course_id || ''];
        if (!pricing) return true; // Keep courses with no pricing yet
        if (budgetMax < 0) {
          // "Above" threshold (e.g., ¥15,000〜)
          return pricing.minPrice >= Math.abs(budgetMax);
        }
        return pricing.minPrice <= budgetMax;
      });
    }

    // Sort
    if (sortBy === 'price' && playDate) {
      filtered.sort((a, b) => {
        const pa = pricingMap[a.gora_course_id || '']?.minPrice ?? Infinity;
        const pb = pricingMap[b.gora_course_id || '']?.minPrice ?? Infinity;
        return pa - pb;
      });
    } else {
      filtered.sort((a, b) => (b.evaluation || 0) - (a.evaluation || 0));
    }

    return filtered;
  }, [searchResults, budgetMax, playDate, pricingMap, sortBy]);

  // Format date for display
  const formatDateChip = (dateStr: string): string => {
    const date = new Date(dateStr);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const weekday = weekdays[date.getDay()];
    return `${month}/${day}(${weekday})`;
  };

  // Handle date selection
  const handleDateChange = (_event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (selectedDate) {
      const yyyy = selectedDate.getFullYear();
      const mm = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const dd = String(selectedDate.getDate()).padStart(2, '0');
      setPlayDate(`${yyyy}-${mm}-${dd}`);
    }
  };

  const handleDateConfirm = () => {
    setShowDatePicker(false);
  };

  // Handle course card actions
  const handleShowPlans = useCallback((course: GolfCourse) => {
    const pricing = pricingMap[course.gora_course_id || ''];
    if (pricing?.plans && pricing.plans.length > 0) {
      setSelectedCourseForPlans({ course, pricing });
    }
  }, [pricingMap]);

  const handleCreateRecruitment = useCallback((course: GolfCourse) => {
    navigation.navigate('RecruitmentCreate', { prefillCourse: course });
  }, [navigation]);

  const handleReserveSolo = useCallback(async (course: GolfCourse) => {
    const url = course.reserve_url;
    if (!url) return;
    await WebBrowser.openBrowserAsync(url, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
    });
  }, []);

  const handleCardPress = useCallback(async (course: GolfCourse) => {
    if (course.reserve_url) {
      await WebBrowser.openBrowserAsync(course.reserve_url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      });
    }
  }, []);

  const toggleExpanded = useCallback((courseId: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(courseId)) {
        next.delete(courseId);
      } else {
        next.add(courseId);
      }
      return next;
    });
  }, []);

  // ─── Render Functions ─────────────────────────────────────────

  const renderRecommendedCard = ({ item }: { item: GolfCourse }) => (
    <TouchableOpacity
      style={styles.recommendedCard}
      onPress={() => {
        // If pricing loaded, show plans. Otherwise open reserve URL or create recruitment.
        const pricing = pricingMap[item.gora_course_id || ''];
        if (playDate && pricing?.plans?.length) {
          handleShowPlans(item);
        } else if (item.reserve_url) {
          handleReserveSolo(item);
        } else {
          handleCreateRecruitment(item);
        }
      }}
      activeOpacity={0.7}
    >
      {item.image_url ? (
        <Image source={{ uri: item.image_url }} style={styles.recommendedImage} />
      ) : (
        <View style={[styles.recommendedImage, styles.imagePlaceholder]}>
          <Ionicons name="golf-outline" size={32} color={Colors.gray[300]} />
        </View>
      )}
      <View style={styles.recommendedInfo}>
        <Text style={styles.recommendedName} numberOfLines={1}>{item.name}</Text>
        <View style={styles.recommendedMeta}>
          {(item.evaluation ?? 0) > 0 && (
            <Text style={styles.ratingText}>★{item.evaluation!.toFixed(1)}</Text>
          )}
          {item.prefecture && (
            <View style={styles.prefecturePill}>
              <Text style={styles.prefecturePillText}>{item.prefecture}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderShimmerCard = () => (
    <View style={styles.recommendedCard}>
      <View style={[styles.recommendedImage, styles.shimmer]} />
      <View style={styles.recommendedInfo}>
        <View style={[styles.shimmer, { width: 120, height: 14, borderRadius: 4 }]} />
        <View style={[styles.shimmer, { width: 80, height: 12, borderRadius: 4, marginTop: 6 }]} />
      </View>
    </View>
  );

  const renderCourseCard = ({ item }: { item: GolfCourse }) => {
    const cardId = item.id || item.gora_course_id || item.name;
    const pricing = pricingMap[item.gora_course_id || ''];
    const isLoadingPrice = pricingLoading.has(item.gora_course_id || '');
    const hasPricing = pricing && pricing.planCount > 0;
    const isExpanded = expandedCards.has(cardId);

    return (
      <TouchableOpacity
        style={styles.courseCard}
        onPress={() => handleCardPress(item)}
        activeOpacity={0.85}
      >
        {/* Course Image */}
        {item.image_url ? (
          <Image source={{ uri: item.image_url }} style={styles.courseImage} />
        ) : (
          <View style={[styles.courseImage, styles.imagePlaceholder]}>
            <Ionicons name="golf-outline" size={40} color={Colors.gray[300]} />
          </View>
        )}

        <View style={styles.courseCardContent}>
          {/* Name + Rating row */}
          <View style={styles.courseNameRow}>
            <Text style={styles.courseName} numberOfLines={2}>{item.name}</Text>
            {(item.evaluation ?? 0) > 0 && (
              <Text style={styles.courseRating}>★{item.evaluation!.toFixed(1)}</Text>
            )}
          </View>

          {/* Location */}
          <View style={styles.courseLocationRow}>
            <Ionicons name="location-outline" size={14} color={Colors.gray[500]} />
            <Text style={styles.courseLocation} numberOfLines={1}>
              {item.address || item.prefecture || ''}
            </Text>
          </View>

          {/* Feature tags (from pricing data) */}
          {hasPricing && (
            <View style={styles.featureTagsRow}>
              {pricing.hasLunchIncluded && (
                <View style={styles.featureTag}>
                  <Text style={styles.featureTagText}>ランチ付</Text>
                </View>
              )}
              {pricing.plans && pricing.plans.some(p => p.hasCart) && (
                <View style={styles.featureTag}>
                  <Text style={styles.featureTagText}>カート付</Text>
                </View>
              )}
              {pricing.plans && pricing.plans.some(p => p.hasCaddie) && (
                <View style={styles.featureTag}>
                  <Text style={styles.featureTagText}>キャディ付</Text>
                </View>
              )}
            </View>
          )}

          {/* Price row */}
          <View style={styles.priceRow}>
            {playDate ? (
              isLoadingPrice ? (
                <View style={[styles.shimmer, { width: 120, height: 16, borderRadius: 4 }]} />
              ) : hasPricing ? (
                <View style={styles.priceInfo}>
                  <Text style={styles.priceText}>
                    ¥{pricing.minPrice.toLocaleString()}
                    {pricing.maxPrice !== pricing.minPrice && `〜¥${pricing.maxPrice.toLocaleString()}`}
                  </Text>
                  <TouchableOpacity
                    style={styles.planDetailButton}
                    onPress={() => handleShowPlans(item)}
                  >
                    <Text style={styles.planDetailButtonText}>プラン詳細</Text>
                    <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
              ) : pricing === null ? (
                <Text style={styles.priceHint}>この日のプランはありません</Text>
              ) : (
                <View style={[styles.shimmer, { width: 120, height: 16, borderRadius: 4 }]} />
              )
            ) : (
              <Text style={styles.priceHint}>日付を選択すると料金を表示</Text>
            )}
          </View>

          {/* Expand/Collapse toggle */}
          <TouchableOpacity
            style={styles.expandToggle}
            onPress={() => toggleExpanded(cardId)}
            activeOpacity={0.6}
          >
            <Text style={styles.expandToggleText}>
              {isExpanded ? '閉じる' : '詳細を見る'}
            </Text>
            <Ionicons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={Colors.gray[500]}
            />
          </TouchableOpacity>

          {/* Expanded Details */}
          {isExpanded && (
            <View style={styles.expandedSection}>
              {/* Caption from GORA Plan API */}
              {pricing?.caption ? (
                <Text style={styles.expandedCaption}>{pricing.caption}</Text>
              ) : null}

              {/* Full address */}
              {item.address && (
                <View style={styles.expandedRow}>
                  <Ionicons name="map-outline" size={14} color={Colors.gray[500]} />
                  <Text style={styles.expandedRowText}>{item.address}</Text>
                </View>
              )}

              {/* Plan count summary */}
              {hasPricing && pricing.plans && (
                <View style={styles.expandedRow}>
                  <Ionicons name="document-text-outline" size={14} color={Colors.gray[500]} />
                  <Text style={styles.expandedRowText}>
                    {pricing.planCount}件のプランあり
                  </Text>
                </View>
              )}

              {/* Rakuten link hint */}
              {item.reserve_url && (
                <View style={styles.expandedRow}>
                  <Ionicons name="open-outline" size={14} color={Colors.primary} />
                  <Text style={[styles.expandedRowText, { color: Colors.primary }]}>
                    楽天GORAで詳細を見る
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* CTA Buttons */}
          <View style={styles.ctaButtonRow}>
            <TouchableOpacity
              style={styles.recruitButton}
              onPress={() => handleCreateRecruitment(item)}
              activeOpacity={0.7}
            >
              <Ionicons name="people-outline" size={15} color={Colors.primary} />
              <Text style={styles.recruitButtonText}>募集する</Text>
            </TouchableOpacity>
            {item.reserve_url && (
              <TouchableOpacity
                style={styles.reserveButton}
                onPress={() => handleReserveSolo(item)}
                activeOpacity={0.7}
              >
                <Ionicons name="calendar-outline" size={15} color={Colors.white} />
                <Text style={styles.reserveButtonText}>一人で予約</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => {
    if (isLoadingSearch) return null;
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="golf-outline" size={48} color={Colors.gray[300]} />
        <Text style={styles.emptyTitle}>
          {debouncedQuery || selectedPrefecture
            ? 'この条件のゴルフ場は見つかりませんでした'
            : 'エリアやキーワードで検索してください'}
        </Text>
        {(debouncedQuery || selectedPrefecture) && (
          <Text style={styles.emptySubtitle}>検索条件を変更してお試しください</Text>
        )}
      </View>
    );
  };

  const renderFilterChip = (
    label: string,
    isActive: boolean,
    onPress: () => void,
    disabled = false
  ) => (
    <TouchableOpacity
      style={[
        styles.filterChip,
        isActive && styles.filterChipActive,
        disabled && styles.filterChipDisabled,
      ]}
      onPress={disabled ? undefined : onPress}
      activeOpacity={disabled ? 1 : 0.7}
    >
      <Text style={[
        styles.filterChipText,
        isActive && styles.filterChipTextActive,
        disabled && styles.filterChipTextDisabled,
      ]}>
        {label}
      </Text>
      <Ionicons
        name="chevron-down"
        size={14}
        color={isActive ? Colors.white : disabled ? Colors.gray[300] : Colors.gray[500]}
      />
    </TouchableOpacity>
  );

  // Date chip label
  const dateLabel = playDate ? formatDateChip(playDate) : '日付';
  // Prefecture chip label
  const prefectureLabel = selectedPrefecture || '地域';
  // Budget chip label
  const budgetLabel = budgetMax
    ? BUDGET_OPTIONS.find(o => o.value === budgetMax)?.label || '予算'
    : '予算';
  // Sort chip label
  const sortLabel = sortBy === 'price' ? '料金順' : '評価順';

  // ─── Main Render ──────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <StandardHeader
        title=""
        showBackButton
        onBackPress={() => navigation.goBack()}
      />

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={Colors.gray[400]} />
          <TextInput
            style={styles.searchInput}
            placeholder="ゴルフ場名で検索"
            placeholderTextColor={Colors.gray[400]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={Colors.gray[400]} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter Chips */}
      <View style={styles.filterChipsWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterChipsContent}
        >
        {renderFilterChip(dateLabel, !!playDate, () => setShowDatePicker(true))}
        {renderFilterChip(prefectureLabel, !!selectedPrefecture, () => setShowPrefecturePicker(true))}
        {renderFilterChip(budgetLabel, !!budgetMax, () => setShowBudgetPicker(true), !playDate)}
        {renderFilterChip(sortLabel, sortBy !== 'rating', () => setShowSortPicker(true))}
        </ScrollView>
      </View>

      {/* Content: おすすめ when idle, FlatList when filtering */}
      {!isFiltering ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.idleContent}
        >
          {/* おすすめ Section */}
          <View style={styles.recommendedSection}>
            <View style={styles.recommendedHeader}>
              <Text style={styles.recommendedSectionTitle}>
                {userPrefecture ? 'あなたのエリアのおすすめ' : 'おすすめ'}
              </Text>
              {regionName ? (
                <View style={styles.regionBadge}>
                  <Text style={styles.regionBadgeText}>{regionName}</Text>
                </View>
              ) : null}
            </View>

            {isLoadingRecommended ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recommendedList}>
                {renderShimmerCard()}
                {renderShimmerCard()}
                {renderShimmerCard()}
              </ScrollView>
            ) : recommendedCourses.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.recommendedList}
              >
                {recommendedCourses.map((course) => (
                  <React.Fragment key={course.id || course.gora_course_id || course.name}>
                    {renderRecommendedCard({ item: course })}
                  </React.Fragment>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.recommendedEmpty}>
                <Text style={styles.recommendedEmptyText}>おすすめを読み込めませんでした</Text>
              </View>
            )}
          </View>

          {/* Prompt */}
          <View style={styles.promptContainer}>
            <Text style={styles.promptText}>エリアやキーワードで検索してゴルフ場を探しましょう</Text>
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={displayCourses}
          renderItem={renderCourseCard}
          keyExtractor={(item) => item.id || item.gora_course_id || item.name}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={() => refetchSearch()}
              tintColor={Colors.primary}
            />
          }
          ListHeaderComponent={
            isLoadingSearch ? (
              <View style={styles.searchLoading}>
                <ActivityIndicator size="large" color={Colors.primary} />
              </View>
            ) : null
          }
          ListEmptyComponent={renderEmpty}
        />
      )}

      {/* ─── Modals / Pickers ─────────────────────────────────── */}

      {/* Date Picker */}
      {showDatePicker && (
        <Modal transparent animationType="slide">
          <View style={styles.pickerOverlay}>
            <View style={styles.pickerContainer}>
              <View style={styles.pickerHeader}>
                <TouchableOpacity onPress={() => { setPlayDate(undefined); setShowDatePicker(false); }}>
                  <Text style={styles.pickerClearText}>クリア</Text>
                </TouchableOpacity>
                <Text style={styles.pickerTitle}>日付を選択</Text>
                <TouchableOpacity onPress={handleDateConfirm}>
                  <Text style={styles.pickerDoneText}>完了</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={playDate ? new Date(playDate) : new Date()}
                mode="date"
                display="spinner"
                minimumDate={new Date()}
                onChange={handleDateChange}
                locale="ja"
                style={{ height: 200 }}
              />
            </View>
          </View>
        </Modal>
      )}

      {/* Prefecture Picker */}
      <Modal visible={showPrefecturePicker} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.pickerHeader}>
            <TouchableOpacity onPress={() => { setSelectedPrefecture(undefined); setShowPrefecturePicker(false); }}>
              <Text style={styles.pickerClearText}>クリア</Text>
            </TouchableOpacity>
            <Text style={styles.pickerTitle}>地域を選択</Text>
            <TouchableOpacity onPress={() => setShowPrefecturePicker(false)}>
              <Text style={styles.pickerDoneText}>閉じる</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.prefectureListContent}>
            {PREFECTURE_REGIONS.map((region) => (
              <View key={region.region} style={styles.prefectureRegionSection}>
                <Text style={styles.prefectureRegionTitle}>{region.region}</Text>
                <View style={styles.prefectureGrid}>
                  {region.prefectures.map((pref) => (
                    <TouchableOpacity
                      key={pref}
                      style={[
                        styles.prefectureItem,
                        selectedPrefecture === pref && styles.prefectureItemActive,
                      ]}
                      onPress={() => {
                        setSelectedPrefecture(pref);
                        setShowPrefecturePicker(false);
                      }}
                    >
                      <Text style={[
                        styles.prefectureItemText,
                        selectedPrefecture === pref && styles.prefectureItemTextActive,
                      ]}>
                        {pref}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Budget Picker */}
      <Modal visible={showBudgetPicker} transparent animationType="fade">
        <TouchableOpacity
          style={styles.pickerOverlay}
          activeOpacity={1}
          onPress={() => setShowBudgetPicker(false)}
        >
          <View style={styles.optionPickerContainer}>
            <Text style={styles.optionPickerTitle}>予算</Text>
            {BUDGET_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.label}
                style={[
                  styles.optionItem,
                  budgetMax === option.value && styles.optionItemActive,
                ]}
                onPress={() => {
                  setBudgetMax(option.value);
                  setShowBudgetPicker(false);
                }}
              >
                <Text style={[
                  styles.optionItemText,
                  budgetMax === option.value && styles.optionItemTextActive,
                ]}>
                  {option.label}
                </Text>
                {budgetMax === option.value && (
                  <Ionicons name="checkmark" size={18} color={Colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Sort Picker */}
      <Modal visible={showSortPicker} transparent animationType="fade">
        <TouchableOpacity
          style={styles.pickerOverlay}
          activeOpacity={1}
          onPress={() => setShowSortPicker(false)}
        >
          <View style={styles.optionPickerContainer}>
            <Text style={styles.optionPickerTitle}>並び替え</Text>
            <TouchableOpacity
              style={[styles.optionItem, sortBy === 'rating' && styles.optionItemActive]}
              onPress={() => { setSortBy('rating'); setShowSortPicker(false); }}
            >
              <Text style={[styles.optionItemText, sortBy === 'rating' && styles.optionItemTextActive]}>
                評価が高い順
              </Text>
              {sortBy === 'rating' && <Ionicons name="checkmark" size={18} color={Colors.primary} />}
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.optionItem,
                sortBy === 'price' && styles.optionItemActive,
                !playDate && styles.optionItemDisabled,
              ]}
              onPress={() => {
                if (playDate) {
                  setSortBy('price');
                  setShowSortPicker(false);
                }
              }}
            >
              <Text style={[
                styles.optionItemText,
                sortBy === 'price' && styles.optionItemTextActive,
                !playDate && styles.optionItemTextDisabled,
              ]}>
                料金が安い順
              </Text>
              {!playDate && <Text style={styles.optionDisabledHint}>日付を選択してください</Text>}
              {sortBy === 'price' && playDate && <Ionicons name="checkmark" size={18} color={Colors.primary} />}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Plan Details Bottom Sheet */}
      {selectedCourseForPlans?.pricing.plans && selectedCourseForPlans.pricing.plans.length > 0 && (
        <PlanDetailsBottomSheet
          visible={!!selectedCourseForPlans}
          onClose={() => setSelectedCourseForPlans(null)}
          plans={selectedCourseForPlans.pricing.plans}
          courseName={selectedCourseForPlans.course.name}
          playDate={playDate || ''}
        />
      )}
    </SafeAreaView>
  );
};

// ─── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Search Bar
  searchContainer: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.white,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.primary,
    paddingVertical: 0,
  },

  // Filter Chips
  filterChipsWrapper: {
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  filterChipsContent: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: Colors.gray[300],
    backgroundColor: Colors.white,
    gap: 4,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipDisabled: {
    opacity: 0.4,
  },
  filterChipText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.medium,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.gray[600],
  },
  filterChipTextActive: {
    color: Colors.white,
  },
  filterChipTextDisabled: {
    color: Colors.gray[400],
  },

  // おすすめ Section
  recommendedSection: {
    paddingVertical: Spacing.md,
  },
  recommendedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  recommendedSectionTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
  },
  regionBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  regionBadgeText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.white,
  },
  recommendedList: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  recommendedCard: {
    width: 200,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    ...Shadows.small,
  },
  recommendedImage: {
    width: 200,
    height: 120,
    backgroundColor: Colors.gray[100],
  },
  recommendedInfo: {
    padding: Spacing.sm,
  },
  recommendedName: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
  },
  recommendedMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xs,
    gap: Spacing.sm,
  },
  recommendedEmpty: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  recommendedEmptyText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.gray[400],
  },

  // Shared
  ratingText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.primary,
  },
  prefecturePill: {
    backgroundColor: Colors.gray[100],
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  prefecturePillText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.gray[600],
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.gray[100],
  },
  shimmer: {
    backgroundColor: Colors.gray[200],
  },

  // Course Cards
  courseCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    ...Shadows.medium,
  },
  courseImage: {
    width: '100%',
    height: 160,
    backgroundColor: Colors.gray[100],
  },
  courseCardContent: {
    padding: Spacing.md,
  },
  courseNameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.xs,
  },
  courseName: {
    flex: 1,
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    marginRight: Spacing.sm,
  },
  courseRating: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
  },
  courseLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  courseLocation: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    color: Colors.gray[500],
  },
  featureTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  featureTag: {
    backgroundColor: Colors.gray[100],
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  featureTagText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.gray[600],
  },
  priceRow: {
    marginBottom: Spacing.xs,
    minHeight: 20,
  },
  priceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
  },
  planDetailButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  planDetailButtonText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
  },
  priceHint: {
    fontSize: Typography.fontSize.sm,
    color: Colors.gray[400],
    fontStyle: 'italic',
  },
  expandToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.xs,
    gap: 4,
  },
  expandToggleText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.gray[500],
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
  },
  expandedSection: {
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  expandedCaption: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text.secondary,
    lineHeight: Typography.fontSize.sm * Typography.lineHeight.relaxed,
  },
  expandedRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  expandedRowText: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    color: Colors.gray[600],
    lineHeight: Typography.fontSize.sm * Typography.lineHeight.normal,
  },
  ctaButtonRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  recruitButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.white,
    gap: Spacing.xs,
  },
  recruitButtonText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.primary,
  },
  reserveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
    gap: Spacing.xs,
  },
  reserveButtonText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.white,
  },

  // List
  idleContent: {
    paddingBottom: Spacing.xl,
  },
  listContent: {
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  searchLoading: {
    paddingVertical: Spacing.xl,
    alignItems: 'center',
  },

  // Empty State
  emptyContainer: {
    paddingVertical: Spacing['2xl'],
    alignItems: 'center',
    gap: Spacing.sm,
  },
  emptyTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
    color: Colors.gray[500],
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: Typography.fontSize.sm,
    color: Colors.gray[400],
    textAlign: 'center',
  },

  // Prompt (when not filtering)
  promptContainer: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  promptText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.gray[400],
    textAlign: 'center',
  },

  // Modal / Picker shared
  pickerOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  pickerContainer: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingBottom: 34, // Safe area
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  pickerTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
  },
  pickerClearText: {
    fontSize: Typography.fontSize.base,
    color: Colors.gray[500],
  },
  pickerDoneText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.primary,
  },

  // Prefecture Picker
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  prefectureListContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  prefectureRegionSection: {
    marginBottom: Spacing.lg,
  },
  prefectureRegionTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.secondary,
    marginBottom: Spacing.sm,
  },
  prefectureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  prefectureItem: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.white,
  },
  prefectureItemActive: {
    borderColor: Colors.primary,
    backgroundColor: `${Colors.primary}15`,
  },
  prefectureItemText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text.primary,
  },
  prefectureItemTextActive: {
    color: Colors.primary,
    fontWeight: Typography.fontWeight.semibold,
  },

  // Option Picker (Budget / Sort)
  optionPickerContainer: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    margin: Spacing.md,
    padding: Spacing.md,
    ...Shadows.large,
  },
  optionPickerTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  optionItemActive: {
    backgroundColor: `${Colors.primary}08`,
  },
  optionItemDisabled: {
    opacity: 0.4,
  },
  optionItemText: {
    fontSize: Typography.fontSize.base,
    color: Colors.text.primary,
  },
  optionItemTextActive: {
    color: Colors.primary,
    fontWeight: Typography.fontWeight.semibold,
  },
  optionItemTextDisabled: {
    color: Colors.gray[400],
  },
  optionDisabledHint: {
    fontSize: Typography.fontSize.xs,
    color: Colors.gray[400],
  },
});

export default CourseSearchScreen;
