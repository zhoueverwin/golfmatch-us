/**
 * RecruitmentEditScreen
 *
 * Form for editing an existing recruitment.
 * Pre-populated with existing data.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import DateTimePicker from '@react-native-community/datetimepicker';

import { Colors } from '../constants/colors';
import { Spacing, BorderRadius } from '../constants/spacing';
import { Typography } from '../constants/typography';
import { RootStackParamList, GolfCourse, CourseType, GenderPreference, SkillLevel } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useRecruitment, useUpdateRecruitment, useDeleteRecruitment } from '../hooks/queries/useRecruitments';
import StandardHeader from '../components/StandardHeader';
import CourseSelector from '../components/CourseSelector';
import CourseTypeSelector from '../components/CourseTypeSelector';
import FullScreenTextEditor from '../components/FullScreenTextEditor';

type NavigationProp = StackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, 'RecruitmentEdit'>;

const SKILL_LEVELS: SkillLevel[] = ['ビギナー', '中級者', '上級者', 'プロ'];
const SLOT_OPTIONS = [1, 2, 3, 4, 5, 6, 7];

const RecruitmentEditScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { recruitmentId } = route.params;
  const { profileId } = useAuth();

  // Fetch existing recruitment data
  const { data: recruitment, isLoading: isLoadingRecruitment } = useRecruitment(recruitmentId);

  const updateMutation = useUpdateRecruitment();
  const deleteMutation = useDeleteRecruitment();

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [playDate, setPlayDate] = useState(new Date());
  const [teeTime, setTeeTime] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<GolfCourse | null>(null);
  const [manualCourseName, setManualCourseName] = useState('');
  const [showCourseSelector, setShowCourseSelector] = useState(false);
  const [courseType, setCourseType] = useState<CourseType>('THROUGH');
  const [totalSlots, setTotalSlots] = useState(3);
  const [genderPreference, setGenderPreference] = useState<GenderPreference>('any');
  const [minSkillLevel, setMinSkillLevel] = useState<SkillLevel | undefined>();
  const [maxSkillLevel, setMaxSkillLevel] = useState<SkillLevel | undefined>();
  const [estimatedCost, setEstimatedCost] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);

  // Editor modal state
  const [editorModal, setEditorModal] = useState<'description' | 'notes' | null>(null);

  // Initialize form with existing data
  useEffect(() => {
    if (recruitment && !isInitialized) {
      setTitle(recruitment.title);
      setDescription(recruitment.description || '');
      setPlayDate(new Date(recruitment.play_date));

      if (recruitment.tee_time) {
        const [hours, minutes] = recruitment.tee_time.split(':');
        const timeDate = new Date();
        timeDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        setTeeTime(timeDate);
      }

      if (recruitment.golf_course) {
        setSelectedCourse(recruitment.golf_course);
      } else {
        setManualCourseName(recruitment.golf_course_name);
      }

      setCourseType(recruitment.course_type);
      setTotalSlots(recruitment.total_slots);
      setGenderPreference(recruitment.gender_preference);
      setMinSkillLevel(recruitment.min_skill_level);
      setMaxSkillLevel(recruitment.max_skill_level);
      setEstimatedCost(recruitment.estimated_cost || '');
      setAdditionalNotes(recruitment.additional_notes || '');
      setIsInitialized(true);
    }
  }, [recruitment, isInitialized]);

  // Validation
  const isValid = title.trim() && (selectedCourse || manualCourseName.trim());

  // Handle course selection
  const handleCourseSelect = useCallback((course: GolfCourse) => {
    setSelectedCourse(course);
    setManualCourseName('');
  }, []);

  // Handle manual course entry
  const handleManualCourseEntry = useCallback((name: string) => {
    setManualCourseName(name);
    setSelectedCourse(null);
  }, []);

  // Temporary date/time for picker (before confirmation)
  const [tempDate, setTempDate] = useState(new Date());
  const [tempTime, setTempTime] = useState(new Date());

  // Handle date change (just update temp, don't close)
  const handleDateChange = useCallback((event: any, date?: Date) => {
    if (date) {
      setTempDate(date);
    }
  }, []);

  // Handle time change (just update temp, don't close)
  const handleTimeChange = useCallback((event: any, date?: Date) => {
    if (date) {
      setTempTime(date);
    }
  }, []);

  // Confirm date selection
  const handleDateConfirm = useCallback(() => {
    setPlayDate(tempDate);
    setShowDatePicker(false);
  }, [tempDate]);

  // Confirm time selection
  const handleTimeConfirm = useCallback(() => {
    setTeeTime(tempTime);
    setShowTimePicker(false);
  }, [tempTime]);

  // Open date picker
  const openDatePicker = useCallback(() => {
    setTempDate(playDate);
    setShowDatePicker(true);
  }, [playDate]);

  // Open time picker
  const openTimePicker = useCallback(() => {
    setTempTime(teeTime || new Date());
    setShowTimePicker(true);
  }, [teeTime]);

  // Handle submit
  const handleSubmit = useCallback(async () => {
    if (!profileId || !recruitment) {
      Alert.alert('エラー', 'ログインが必要です');
      return;
    }

    if (!isValid) {
      Alert.alert('入力エラー', 'タイトルとゴルフ場を入力してください');
      return;
    }

    try {
      const courseName = selectedCourse?.name || manualCourseName;
      const courseLocation = selectedCourse?.address || '';
      const prefecture = selectedCourse?.prefecture || recruitment.prefecture || '';

      await updateMutation.mutateAsync({
        recruitmentId,
        updates: {
          title: title.trim(),
          description: description.trim() || null,
          play_date: playDate.toISOString().split('T')[0],
          tee_time: teeTime ? teeTime.toTimeString().split(' ')[0].substring(0, 5) : undefined,
          golf_course_id: selectedCourse?.id || undefined,
          golf_course_name: courseName,
          golf_course_location: courseLocation || undefined,
          prefecture: prefecture || undefined,
          course_type: courseType,
          total_slots: totalSlots,
          gender_preference: genderPreference,
          min_skill_level: minSkillLevel,
          max_skill_level: maxSkillLevel,
          estimated_cost: estimatedCost.trim() || null,
          additional_notes: additionalNotes.trim() || null,
        },
      });

      Alert.alert('更新完了', '募集を更新しました', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error: any) {
      Alert.alert('エラー', error.message || '募集の更新に失敗しました');
    }
  }, [
    profileId,
    recruitment,
    recruitmentId,
    isValid,
    title,
    description,
    playDate,
    teeTime,
    selectedCourse,
    manualCourseName,
    courseType,
    totalSlots,
    genderPreference,
    minSkillLevel,
    maxSkillLevel,
    estimatedCost,
    additionalNotes,
    updateMutation,
    navigation,
  ]);

  // Handle delete
  const handleDelete = useCallback(() => {
    Alert.alert(
      '募集を削除',
      'この募集を削除しますか？この操作は取り消せません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({
                recruitmentId,
                hostId: profileId || '',
              });
              Alert.alert('削除完了', '募集を削除しました', [
                { text: 'OK', onPress: () => navigation.navigate('Main', { screen: 'Recruitment' } as any) },
              ]);
            } catch (error: any) {
              Alert.alert('エラー', error.message || '削除に失敗しました');
            }
          },
        },
      ]
    );
  }, [recruitmentId, profileId, deleteMutation, navigation]);

  // Format date for display
  const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const weekday = weekdays[date.getDay()];
    return `${year}年${month}月${day}日(${weekday})`;
  };

  // Format time for display
  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  };

  if (isLoadingRecruitment) {
    return (
      <SafeAreaView style={styles.container}>
        <StandardHeader
          title="募集を編集"
          showBackButton={true}
          onBackPress={() => navigation.goBack()}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!recruitment) {
    return (
      <SafeAreaView style={styles.container}>
        <StandardHeader
          title="募集を編集"
          showBackButton={true}
          onBackPress={() => navigation.goBack()}
        />
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>募集が見つかりませんでした</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StandardHeader
        title="募集を編集"
        showBackButton={true}
        onBackPress={() => navigation.goBack()}
      />

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Title */}
          <View style={styles.section}>
            <Text style={styles.label}>タイトル <Text style={styles.requiredMark}>*</Text></Text>
            <TextInput
              style={styles.input}
              placeholder="例: 一緒にラウンドしませんか？"
              placeholderTextColor={Colors.gray[400]}
              value={title}
              onChangeText={setTitle}
              maxLength={100}
            />
          </View>

          {/* Date */}
          <View style={styles.section}>
            <Text style={styles.label}>プレー日 <Text style={styles.requiredMark}>*</Text></Text>
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={openDatePicker}
            >
              <Ionicons name="calendar" size={20} color={Colors.primary} />
              <Text style={styles.pickerButtonText}>{formatDate(playDate)}</Text>
              <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
            </TouchableOpacity>
          </View>

          {/* Time */}
          <View style={styles.section}>
            <Text style={styles.label}>ティータイム</Text>
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={openTimePicker}
            >
              <Ionicons name="time" size={20} color={Colors.gray[500]} />
              <Text style={[styles.pickerButtonText, !teeTime && styles.placeholderText]}>
                {teeTime ? formatTime(teeTime) : '未定'}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
            </TouchableOpacity>
          </View>

          {/* Course */}
          <View style={styles.section}>
            <Text style={styles.label}>ゴルフ場 <Text style={styles.requiredMark}>*</Text></Text>
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => setShowCourseSelector(true)}
            >
              <Ionicons name="golf" size={20} color={Colors.primary} />
              <Text style={[
                styles.pickerButtonText,
                !(selectedCourse || manualCourseName) && styles.placeholderText,
              ]}>
                {selectedCourse?.name || manualCourseName || 'ゴルフ場を選択'}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
            </TouchableOpacity>
          </View>

          {/* Course Type */}
          <View style={styles.section}>
            <Text style={styles.label}>コースタイプ</Text>
            <CourseTypeSelector value={courseType} onChange={setCourseType} />
          </View>

          {/* Slots */}
          <View style={styles.section}>
            <Text style={styles.label}>募集人数</Text>
            <View style={styles.slotsContainer}>
              {SLOT_OPTIONS.map((num) => (
                <TouchableOpacity
                  key={num}
                  style={[styles.slotOption, totalSlots === num && styles.slotOptionSelected]}
                  onPress={() => setTotalSlots(num)}
                >
                  <Text style={[
                    styles.slotOptionText,
                    totalSlots === num && styles.slotOptionTextSelected,
                  ]}>
                    {num}名
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {recruitment.filled_slots > 0 && (
              <Text style={styles.warningText}>
                ※ 現在{recruitment.filled_slots}名が参加確定しています
              </Text>
            )}
          </View>

          {/* Gender Preference */}
          <View style={styles.section}>
            <Text style={styles.label}>性別</Text>
            <View style={styles.genderContainer}>
              {([
                { value: 'any', label: '指定なし' },
                { value: 'male', label: '男性のみ' },
                { value: 'female', label: '女性のみ' },
              ] as { value: GenderPreference; label: string }[]).map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.genderOption,
                    genderPreference === option.value && styles.genderOptionSelected,
                  ]}
                  onPress={() => setGenderPreference(option.value)}
                >
                  <Text style={[
                    styles.genderOptionText,
                    genderPreference === option.value && styles.genderOptionTextSelected,
                  ]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Skill Level Range */}
          <View style={styles.section}>
            <Text style={styles.label}>レベル</Text>
            <View style={styles.skillContainer}>
              {SKILL_LEVELS.map((level) => {
                const levelIndex = SKILL_LEVELS.indexOf(level);
                const minIndex = minSkillLevel ? SKILL_LEVELS.indexOf(minSkillLevel) : -1;
                const maxIndex = maxSkillLevel ? SKILL_LEVELS.indexOf(maxSkillLevel) : -1;
                const isSelected = minIndex !== -1 && maxIndex !== -1 &&
                  levelIndex >= minIndex && levelIndex <= maxIndex;

                return (
                  <TouchableOpacity
                    key={level}
                    style={[
                      styles.skillOption,
                      isSelected && styles.skillOptionSelected,
                    ]}
                    onPress={() => {
                      if (isSelected) {
                        // Clicking a selected level deselects all
                        setMinSkillLevel(undefined);
                        setMaxSkillLevel(undefined);
                      } else if (!minSkillLevel) {
                        // Nothing selected, select this level
                        setMinSkillLevel(level);
                        setMaxSkillLevel(level);
                      } else {
                        // Expand range to include clicked level
                        if (levelIndex < minIndex) {
                          setMinSkillLevel(level);
                        } else if (levelIndex > maxIndex) {
                          setMaxSkillLevel(level);
                        }
                      }
                    }}
                  >
                    <Text style={[
                      styles.skillOptionText,
                      isSelected && styles.skillOptionTextSelected,
                    ]}>
                      {level}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Estimated Cost */}
          <View style={styles.section}>
            <Text style={styles.label}>費用目安</Text>
            <TextInput
              style={styles.input}
              placeholder="例: 約15,000円（プレー費・昼食込み）"
              placeholderTextColor={Colors.gray[400]}
              value={estimatedCost}
              onChangeText={setEstimatedCost}
              maxLength={100}
            />
          </View>

          {/* Description */}
          <View style={styles.section}>
            <Text style={styles.label}>詳細</Text>
            <TouchableOpacity
              style={[styles.input, styles.textAreaPreview]}
              onPress={() => setEditorModal('description')}
              activeOpacity={0.7}
            >
              <Text
                style={description ? styles.previewText : styles.previewPlaceholder}
                numberOfLines={3}
              >
                {description || '自己紹介やラウンドの詳細など'}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
            </TouchableOpacity>
          </View>

          {/* Additional Notes */}
          <View style={styles.section}>
            <Text style={styles.label}>備考</Text>
            <TouchableOpacity
              style={[styles.input, styles.textAreaPreview]}
              onPress={() => setEditorModal('notes')}
              activeOpacity={0.7}
            >
              <Text
                style={additionalNotes ? styles.previewText : styles.previewPlaceholder}
                numberOfLines={3}
              >
                {additionalNotes || 'その他の連絡事項'}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
            </TouchableOpacity>
          </View>

          {/* Delete button */}
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={handleDelete}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.error} />
            ) : (
              <>
                <Ionicons name="trash-outline" size={20} color={Colors.error} />
                <Text style={styles.deleteButtonText}>この募集を削除</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Spacer */}
          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Submit button */}
        <View style={styles.submitContainer}>
          <TouchableOpacity
            style={[styles.submitButton, !isValid && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={!isValid || updateMutation.isPending}
          >
            {updateMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <Text style={styles.submitButtonText}>変更を保存</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Course Selector Modal */}
      <CourseSelector
        visible={showCourseSelector}
        selectedCourse={selectedCourse}
        onClose={() => setShowCourseSelector(false)}
        onSelect={handleCourseSelect}
        allowManualEntry
        onManualEntry={handleManualCourseEntry}
      />

      {/* Full-Screen Text Editor Modals */}
      <FullScreenTextEditor
        visible={editorModal === 'description'}
        title="詳細"
        placeholder="自己紹介やラウンドの詳細など"
        value={description}
        maxLength={5000}
        onSave={setDescription}
        onClose={() => setEditorModal(null)}
      />
      <FullScreenTextEditor
        visible={editorModal === 'notes'}
        title="備考"
        placeholder="その他の連絡事項"
        value={additionalNotes}
        maxLength={3000}
        onSave={setAdditionalNotes}
        onClose={() => setEditorModal(null)}
      />

      {/* Date Picker Modal */}
      <Modal
        visible={showDatePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <View style={styles.pickerModalOverlay}>
          <View style={styles.pickerModalContent}>
            <View style={styles.pickerModalHeader}>
              <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                <Text style={styles.pickerModalCancel}>キャンセル</Text>
              </TouchableOpacity>
              <Text style={styles.pickerModalTitle}>プレー日</Text>
              <TouchableOpacity onPress={handleDateConfirm}>
                <Text style={styles.pickerModalDone}>完了</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={tempDate}
              mode="date"
              display="spinner"
              minimumDate={new Date()}
              onChange={handleDateChange}
              locale="ja-JP"
            />
          </View>
        </View>
      </Modal>

      {/* Time Picker Modal */}
      <Modal
        visible={showTimePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTimePicker(false)}
      >
        <View style={styles.pickerModalOverlay}>
          <View style={styles.pickerModalContent}>
            <View style={styles.pickerModalHeader}>
              <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                <Text style={styles.pickerModalCancel}>キャンセル</Text>
              </TouchableOpacity>
              <Text style={styles.pickerModalTitle}>ティータイム</Text>
              <TouchableOpacity onPress={handleTimeConfirm}>
                <Text style={styles.pickerModalDone}>完了</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={tempTime}
              mode="time"
              display="spinner"
              minuteInterval={5}
              onChange={handleTimeChange}
              locale="ja-JP"
            />
          </View>
        </View>
      </Modal>
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
  errorText: {
    fontSize: Typography.fontSize.base,
    color: Colors.gray[500],
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.md,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  label: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    marginBottom: Spacing.sm,
  },
  requiredMark: {
    color: Colors.error,
  },
  input: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: Typography.fontSize.base,
    color: Colors.text.primary,
  },
  textArea: {
    minHeight: 100,
    maxHeight: 200,
  },
  textAreaPreview: {
    minHeight: 80,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewText: {
    flex: 1,
    fontSize: Typography.fontSize.base,
    color: Colors.text.primary,
    lineHeight: 22,
  },
  previewPlaceholder: {
    flex: 1,
    fontSize: Typography.fontSize.base,
    color: Colors.gray[400],
    lineHeight: 22,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  pickerButtonText: {
    flex: 1,
    marginLeft: Spacing.sm,
    fontSize: Typography.fontSize.base,
    color: Colors.text.primary,
  },
  pickerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  pickerModalContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingBottom: Spacing.xl,
  },
  pickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
  },
  pickerModalTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text.primary,
  },
  pickerModalCancel: {
    fontSize: Typography.fontSize.base,
    color: Colors.gray[600],
  },
  pickerModalDone: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.primary,
  },
  placeholderText: {
    color: Colors.gray[400],
  },
  slotsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  slotOption: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  slotOptionSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  slotOptionText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.gray[600],
  },
  slotOptionTextSelected: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.semibold,
  },
  warningText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.warning,
    marginTop: Spacing.sm,
  },
  genderContainer: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  genderOption: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  genderOptionSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  genderOptionText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.gray[600],
  },
  genderOptionTextSelected: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.semibold,
  },
  skillContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  skillOption: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  skillOptionSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  skillOptionText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.gray[600],
  },
  skillOptionTextSelected: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.semibold,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  deleteButtonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.error,
  },
  submitContainer: {
    padding: Spacing.md,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  submitButton: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: Colors.gray[300],
  },
  submitButtonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.white,
  },
});

export default RecruitmentEditScreen;
