/**
 * ApplyModal Component
 *
 * Modal for applying to join a recruitment.
 * Features:
 * - Optional message input
 * - Recruitment summary
 * - Loading state during submission
 */

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Spacing, BorderRadius } from '../constants/spacing';
import { Typography } from '../constants/typography';
import {
  Recruitment,
  getCourseTypeLabel,
  formatTeeTime,
} from '../types/recruitment';

interface ApplyModalProps {
  visible: boolean;
  recruitment: Recruitment | null;
  onClose: () => void;
  onSubmit: (message?: string) => Promise<void>;
  isLoading?: boolean;
}

const ApplyModal: React.FC<ApplyModalProps> = ({
  visible,
  recruitment,
  onClose,
  onSubmit,
  isLoading = false,
}) => {
  const [message, setMessage] = useState('');
  const inputRef = useRef<TextInput>(null);

  // Reset message when modal opens
  React.useEffect(() => {
    if (visible) {
      setMessage('');
    } else {
      // Dismiss keyboard when modal closes
      Keyboard.dismiss();
    }
  }, [visible]);

  // Dismiss keyboard helper
  const dismissKeyboard = () => {
    Keyboard.dismiss();
    inputRef.current?.blur();
  };

  const handleClose = () => {
    dismissKeyboard();
    onClose();
  };

  const handleSubmit = async () => {
    dismissKeyboard();
    await onSubmit(message.trim() || undefined);
  };

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

  if (!recruitment) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose} disabled={isLoading}>
              <Ionicons
                name="close"
                size={24}
                color={isLoading ? Colors.gray[300] : Colors.gray[600]}
              />
            </TouchableOpacity>
            <Text style={styles.title}>参加申請</Text>
            <View style={{ width: 24 }} />
          </View>

          {/* Content - Scrollable and dismisses keyboard on tap */}
          <TouchableWithoutFeedback onPress={dismissKeyboard}>
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Recruitment summary */}
              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>{recruitment.title}</Text>

                <View style={styles.summaryRow}>
                  <Ionicons name="calendar" size={16} color={Colors.primary} />
                  <Text style={styles.summaryText}>
                    {formatPlayDate(recruitment.play_date)}
                    {recruitment.tee_time && ` ${formatTeeTime(recruitment.tee_time)}`}
                  </Text>
                </View>

                <View style={styles.summaryRow}>
                  <Ionicons name="golf" size={16} color={Colors.gray[500]} />
                  <Text style={styles.summaryText}>
                    {recruitment.golf_course_name}
                  </Text>
                  <View style={styles.courseTypeBadge}>
                    <Text style={styles.courseTypeText}>
                      {getCourseTypeLabel(recruitment.course_type)}
                    </Text>
                  </View>
                </View>

                <View style={styles.summaryRow}>
                  <Ionicons name="person" size={16} color={Colors.gray[500]} />
                  <Text style={styles.summaryText}>
                    主催: {recruitment.host?.name || '名前なし'}
                  </Text>
                </View>

                <View style={styles.summaryRow}>
                  <Ionicons name="people" size={16} color={Colors.gray[500]} />
                  <Text style={styles.summaryText}>
                    残り{recruitment.total_slots - recruitment.filled_slots}枠 / {recruitment.total_slots}枠
                  </Text>
                </View>
              </View>

              {/* Message input */}
              <View style={styles.messageSection}>
                <Text style={styles.messageLabel}>メッセージ（任意）</Text>
                <Text style={styles.messageHint}>
                  主催者への自己紹介や意気込みを伝えましょう
                </Text>
                <TextInput
                  ref={inputRef}
                  style={styles.messageInput}
                  placeholder="例：初めまして！ゴルフ歴3年です。ぜひ一緒にラウンドしたいです。"
                  placeholderTextColor={Colors.gray[400]}
                  value={message}
                  onChangeText={setMessage}
                  multiline
                  numberOfLines={4}
                  maxLength={500}
                  textAlignVertical="top"
                  editable={!isLoading}
                  returnKeyType="done"
                  blurOnSubmit={true}
                  onSubmitEditing={dismissKeyboard}
                />
                <Text style={styles.charCount}>{message.length}/500</Text>
              </View>

              {/* Info note */}
              <View style={styles.infoNote}>
                <Ionicons name="information-circle" size={16} color={Colors.info} />
                <Text style={styles.infoText}>
                  申請後、主催者が承認すると参加確定となります。承認結果は通知でお知らせします。
                </Text>
              </View>

              {/* Spacer for keyboard */}
              <View style={{ height: 20 }} />
            </ScrollView>
          </TouchableWithoutFeedback>

          {/* Action buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.cancelButton, isLoading && styles.buttonDisabled]}
              onPress={handleClose}
              disabled={isLoading}
            >
              <Text style={styles.cancelButtonText}>キャンセル</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitButton, isLoading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <>
                  <Ionicons name="paper-plane" size={18} color={Colors.white} />
                  <Text style={styles.submitButtonText}>申請する</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
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
  title: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
  },
  content: {
    padding: Spacing.md,
    flexGrow: 1,
  },
  summaryCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.lg,
  },
  summaryTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    marginBottom: Spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  summaryText: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    color: Colors.gray[600],
    marginLeft: Spacing.sm,
  },
  courseTypeBadge: {
    backgroundColor: Colors.gray[100],
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    marginLeft: Spacing.sm,
  },
  courseTypeText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.gray[600],
    fontWeight: Typography.fontWeight.medium,
  },
  messageSection: {
    marginBottom: Spacing.lg,
  },
  messageLabel: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    marginBottom: Spacing.xs,
  },
  messageHint: {
    fontSize: Typography.fontSize.sm,
    color: Colors.gray[500],
    marginBottom: Spacing.sm,
  },
  messageInput: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    fontSize: Typography.fontSize.base,
    color: Colors.text.primary,
    minHeight: 120,
  },
  charCount: {
    fontSize: Typography.fontSize.xs,
    color: Colors.gray[400],
    textAlign: 'right',
    marginTop: Spacing.xs,
  },
  infoNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.info + '10',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  infoText: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    color: Colors.info,
    marginLeft: Spacing.sm,
    lineHeight: Typography.fontSize.sm * Typography.lineHeight.relaxed,
  },
  actionButtons: {
    flexDirection: 'row',
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing.md,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: Colors.gray[200],
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.gray[600],
  },
  submitButton: {
    flex: 2,
    flexDirection: 'row',
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  submitButtonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.white,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});

export default ApplyModal;
