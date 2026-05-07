/**
 * CourseSelector Component
 *
 * Modal for searching and selecting golf courses.
 * Features:
 * - Search input with debouncing
 * - Prefecture filter
 * - Results from local DB first, then Rakuten GORA API
 * - Shows course name, prefecture, and rating
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Spacing, BorderRadius } from '../constants/spacing';
import { Typography } from '../constants/typography';
import { useSearchCourses } from '../hooks/queries/useGolfCourses';
import { GolfCourse, ALL_PREFECTURES } from '../types/recruitment';

interface CourseSelectorProps {
  visible: boolean;
  selectedCourse?: GolfCourse | null;
  onClose: () => void;
  onSelect: (course: GolfCourse) => void;
  /** Optional: Allow manual entry if course not found */
  allowManualEntry?: boolean;
  /** Optional: Called when user wants to enter course name manually */
  onManualEntry?: (courseName: string) => void;
}

const CourseSelector: React.FC<CourseSelectorProps> = ({
  visible,
  selectedCourse,
  onClose,
  onSelect,
  allowManualEntry = true,
  onManualEntry,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedPrefecture, setSelectedPrefecture] = useState<string | undefined>();
  const [showPrefectureFilter, setShowPrefectureFilter] = useState(false);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setSearchQuery('');
      setDebouncedQuery('');
      setSelectedPrefecture(undefined);
    }
  }, [visible]);

  // Search courses
  const { courses, isLoading, isFetching, isError, error } = useSearchCourses({
    query: debouncedQuery,
    prefecture: selectedPrefecture,
    limit: 30,
    enabled: visible && (debouncedQuery.length >= 2 || !!selectedPrefecture),
  });

  const handleSelect = useCallback((course: GolfCourse) => {
    onSelect(course);
    onClose();
  }, [onSelect, onClose]);

  const handleManualEntry = useCallback(() => {
    if (onManualEntry && searchQuery.trim()) {
      onManualEntry(searchQuery.trim());
      onClose();
    }
  }, [onManualEntry, searchQuery, onClose]);

  const renderCourseItem = ({ item }: { item: GolfCourse }) => (
    <TouchableOpacity
      style={styles.courseItem}
      onPress={() => handleSelect(item)}
      activeOpacity={0.7}
    >
      <View style={styles.courseInfo}>
        <Text style={styles.courseName} numberOfLines={1}>
          {item.name}
        </Text>
        <View style={styles.courseDetails}>
          <Text style={styles.courseAddress} numberOfLines={1}>
            {item.prefecture}{item.address ? ` - ${item.address}` : ''}
          </Text>
          {typeof item.evaluation === 'number' && item.evaluation > 0 && (
            <View style={styles.ratingContainer}>
              <Ionicons name="star" size={12} color={Colors.warning} />
              <Text style={styles.ratingText}>{item.evaluation.toFixed(1)}</Text>
            </View>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
    </TouchableOpacity>
  );

  const renderPrefectureFilter = () => (
    <Modal
      visible={showPrefectureFilter}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setShowPrefectureFilter(false)}
    >
      <SafeAreaView style={styles.prefectureModal}>
        <View style={styles.prefectureHeader}>
          <TouchableOpacity onPress={() => setShowPrefectureFilter(false)}>
            <Ionicons name="close" size={24} color={Colors.gray[600]} />
          </TouchableOpacity>
          <Text style={styles.prefectureTitle}>都道府県を選択</Text>
          <TouchableOpacity onPress={() => {
            setSelectedPrefecture(undefined);
            setShowPrefectureFilter(false);
          }}>
            <Text style={styles.clearButton}>クリア</Text>
          </TouchableOpacity>
        </View>
        <FlatList
          data={ALL_PREFECTURES}
          keyExtractor={(item) => item}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.prefectureItem,
                selectedPrefecture === item && styles.prefectureItemSelected,
              ]}
              onPress={() => {
                setSelectedPrefecture(item);
                setShowPrefectureFilter(false);
              }}
            >
              <Text style={[
                styles.prefectureItemText,
                selectedPrefecture === item && styles.prefectureItemTextSelected,
              ]}>
                {item}
              </Text>
              {selectedPrefecture === item && (
                <Ionicons name="checkmark" size={20} color={Colors.primary} />
              )}
            </TouchableOpacity>
          )}
        />
      </SafeAreaView>
    </Modal>
  );

  const showEmptyState = !isLoading && !isFetching && !isError &&
    (debouncedQuery.length >= 2 || selectedPrefecture) &&
    courses.length === 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={Colors.gray[600]} />
            </TouchableOpacity>
            <Text style={styles.title}>ゴルフ場を検索</Text>
            <View style={styles.closeButton} />
          </View>

          {/* Search bar */}
          <View style={styles.searchContainer}>
            <View style={styles.searchInputContainer}>
              <Ionicons name="search" size={20} color={Colors.gray[400]} />
              <TextInput
                style={styles.searchInput}
                placeholder="ゴルフ場名で検索"
                placeholderTextColor={Colors.gray[400]}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
                returnKeyType="search"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={20} color={Colors.gray[400]} />
                </TouchableOpacity>
              )}
            </View>

            {/* Prefecture filter button */}
            <TouchableOpacity
              style={[
                styles.filterButton,
                selectedPrefecture && styles.filterButtonActive,
              ]}
              onPress={() => setShowPrefectureFilter(true)}
            >
              <Ionicons
                name="location"
                size={18}
                color={selectedPrefecture ? Colors.primary : Colors.gray[500]}
              />
              <Text style={[
                styles.filterButtonText,
                selectedPrefecture && styles.filterButtonTextActive,
              ]}>
                {selectedPrefecture || '地域'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Results */}
          <View style={styles.resultsContainer}>
            {(isLoading || isFetching) && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.loadingText}>検索中...</Text>
              </View>
            )}

            {!isLoading && !isFetching && isError && (
              <View style={styles.emptyContainer}>
                <Ionicons name="alert-circle-outline" size={48} color={Colors.error} />
                <Text style={styles.emptyTitle}>検索エラー</Text>
                <Text style={styles.emptyText}>
                  ゴルフ場の検索に失敗しました。{'\n'}しばらく経ってからお試しください。
                </Text>
                {allowManualEntry && searchQuery.trim() && (
                  <TouchableOpacity
                    style={styles.manualEntryButton}
                    onPress={handleManualEntry}
                  >
                    <Text style={styles.manualEntryText}>
                      「{searchQuery}」を手入力で使用
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {!isLoading && !isFetching && !isError && courses.length > 0 && (
              <FlatList
                data={courses}
                keyExtractor={(item) => item.id || item.gora_course_id || item.name}
                renderItem={renderCourseItem}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.listContent}
              />
            )}

            {showEmptyState && (
              <View style={styles.emptyContainer}>
                <Ionicons name="golf-outline" size={48} color={Colors.gray[300]} />
                <Text style={styles.emptyTitle}>見つかりませんでした</Text>
                <Text style={styles.emptyText}>
                  検索条件を変更してお試しください
                </Text>
                {allowManualEntry && searchQuery.trim() && (
                  <TouchableOpacity
                    style={styles.manualEntryButton}
                    onPress={handleManualEntry}
                  >
                    <Text style={styles.manualEntryText}>
                      「{searchQuery}」を手入力で使用
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {!isLoading && !isFetching && debouncedQuery.length < 2 && !selectedPrefecture && (
              <View style={styles.promptContainer}>
                <Ionicons name="search" size={48} color={Colors.gray[300]} />
                <Text style={styles.promptText}>
                  ゴルフ場名を2文字以上入力するか、{'\n'}地域で絞り込んでください
                </Text>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Prefecture filter modal */}
      {renderPrefectureFilter()}
    </Modal>
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
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  closeButton: {
    width: 40,
    alignItems: 'center',
  },
  title: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: Typography.fontSize.base,
    color: Colors.text.primary,
    marginLeft: Spacing.sm,
    paddingVertical: 0,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray[100],
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    gap: Spacing.xs,
  },
  filterButtonActive: {
    backgroundColor: Colors.primaryLight,
  },
  filterButtonText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.gray[600],
  },
  filterButtonTextActive: {
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
  },
  resultsContainer: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 300, // Extra padding to ensure last items are visible above keyboard
  },
  courseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  courseInfo: {
    flex: 1,
  },
  courseName: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
    color: Colors.text.primary,
    marginBottom: Spacing.xs,
  },
  courseDetails: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  courseAddress: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    color: Colors.gray[500],
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: Spacing.sm,
  },
  ratingText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.gray[600],
    marginLeft: 2,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: Typography.fontSize.base,
    color: Colors.gray[500],
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.gray[500],
    marginTop: Spacing.md,
  },
  emptyText: {
    fontSize: Typography.fontSize.base,
    color: Colors.gray[400],
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  manualEntryButton: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  manualEntryText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.white,
  },
  promptContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  promptText: {
    fontSize: Typography.fontSize.base,
    color: Colors.gray[400],
    textAlign: 'center',
    marginTop: Spacing.md,
    lineHeight: Typography.fontSize.base * Typography.lineHeight.relaxed,
  },
  // Prefecture filter modal styles
  prefectureModal: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  prefectureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  prefectureTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
  },
  clearButton: {
    fontSize: Typography.fontSize.base,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
  },
  prefectureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  prefectureItemSelected: {
    backgroundColor: Colors.primaryLight,
  },
  prefectureItemText: {
    fontSize: Typography.fontSize.base,
    color: Colors.text.primary,
  },
  prefectureItemTextSelected: {
    color: Colors.primary,
    fontWeight: Typography.fontWeight.semibold,
  },
});

export default CourseSelector;
