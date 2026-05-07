import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Colors } from '../constants/colors';
import { Spacing, BorderRadius, Shadows } from '../constants/spacing';
import { Typography } from '../constants/typography';
import { RootStackParamList } from '../types';
import { DataProvider } from '../services';
import { ContactInquiry } from '../types/dataModels';
import { useAuth } from '../contexts/AuthContext';
import StandardHeader from '../components/StandardHeader';
import EmptyState from '../components/EmptyState';

type ContactReplyScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  'ContactReply'
>;

// Inquiry types matching common support categories
const INQUIRY_TYPES = [
  { value: 'account', label: 'アカウントについて' },
  { value: 'payment', label: '料金・支払いについて' },
  { value: 'feature', label: '機能について' },
  { value: 'bug', label: '不具合・バグ報告' },
  { value: 'suggestion', label: 'ご意見・ご要望' },
  { value: 'other', label: 'その他' },
];

const ContactReplyScreen: React.FC = () => {
  const navigation = useNavigation<ContactReplyScreenNavigationProp>();
  const { profileId, user } = useAuth();
  const [activeTab, setActiveTab] = useState<'send' | 'replies'>('send');
  
  // Replies tab state
  const [inquiries, setInquiries] = useState<ContactInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedInquiry, setSelectedInquiry] = useState<ContactInquiry | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  // Send tab state
  const [inquiryType, setInquiryType] = useState<string>('');
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<{
    inquiryType?: string;
    message?: string;
  }>({});

  // Load user profile data for form
  useEffect(() => {
    const loadUserProfile = async () => {
      if (!profileId) return;
      
      try {
        const result = await DataProvider.getUser(profileId);
        if (result.success && result.data) {
          setUserName(result.data.name || '');
        }
        // Pre-fill email from auth user if available
        if (user?.email) {
          setUserEmail(user.email);
        }
      } catch (error) {
        console.error('[ContactReplyScreen] Error loading user profile:', error);
      }
    };

    if (activeTab === 'send') {
      loadUserProfile();
    }
  }, [profileId, activeTab, user]);

  useFocusEffect(
    useCallback(() => {
      if (activeTab === 'replies') {
        loadInquiries();
      }
    }, [profileId, activeTab])
  );

  const loadInquiries = async () => {
    if (!profileId) return;

    try {
      setLoading(true);
      const result = await DataProvider.getContactInquiries(profileId);
      if (result.success && result.data) {
        setInquiries(result.data);
      }
    } catch (error) {
      console.error('[ContactReplyScreen] Error loading inquiries:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadInquiries();
    setRefreshing(false);
  };

  const handleInquiryPress = async (inquiry: ContactInquiry) => {
    const result = await DataProvider.getContactInquiry(inquiry.id);
    if (result.success && result.data) {
      setSelectedInquiry(result.data);
      setDetailModalVisible(true);
      
      if (result.data.replies && result.data.replies.length > 0) {
        await DataProvider.markAllRepliesAsRead(inquiry.id);
        setInquiries((prev) =>
          prev.map((inq) =>
            inq.id === inquiry.id
              ? { ...inq, replies: result.data?.replies, unread_reply_count: 0 }
              : inq
          )
        );
      }
    }
  };

  const handleSubmit = async () => {
    if (!profileId) {
      Alert.alert('エラー', 'ログインが必要です');
      return;
    }

    if (!validateForm()) {
      return;
    }

    try {
      setSubmitting(true);
      
      // Use inquiry type label as subject if subject is empty
      const finalSubject = subject.trim() || 
        INQUIRY_TYPES.find((t) => t.value === inquiryType)?.label || 
        'お問い合わせ';

      const result = await DataProvider.createContactInquiry(
        profileId,
        finalSubject,
        message,
        inquiryType,
      );

      if (result.success) {
        Alert.alert(
          '送信完了',
          'お問い合わせを受け付けました。返信をお待ちください。',
          [
            {
              text: 'OK',
              onPress: () => {
                // Reset form
                setInquiryType('');
                setSubject('');
                setMessage('');
                setFormErrors({});
                // Switch to replies tab to see the new inquiry
                setActiveTab('replies');
                loadInquiries();
              },
            },
          ]
        );
      } else {
        Alert.alert('エラー', result.error || 'お問い合わせの送信に失敗しました');
      }
    } catch (error) {
      console.error('[ContactReplyScreen] Error submitting inquiry:', error);
      Alert.alert('エラー', 'お問い合わせの送信に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  const validateForm = (): boolean => {
    const errors: typeof formErrors = {};
    
    if (!inquiryType) {
      errors.inquiryType = 'お問い合わせ種別を選択してください';
    }
    if (!message.trim()) {
      errors.message = 'お問い合わせ内容を入力してください';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'replied':
        return { text: '返信あり', color: Colors.success };
      case 'pending':
        return { text: '未返信', color: Colors.warning };
      case 'closed':
        return { text: '閉じる', color: Colors.gray[500] };
      default:
        return { text: status, color: Colors.gray[500] };
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return '今日';
    } else if (diffDays === 1) {
      return '昨日';
    } else if (diffDays < 7) {
      return `${diffDays}日前`;
    } else {
      return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
    }
  };

  const renderInquiryItem = ({ item }: { item: ContactInquiry }) => {
    const statusBadge = getStatusBadge(item.status);
    const hasUnread = (item.unread_reply_count || 0) > 0;

    return (
      <TouchableOpacity
        style={styles.inquiryCard}
        onPress={() => handleInquiryPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.inquiryHeader}>
          <Text style={styles.inquirySubject} numberOfLines={1}>
            {item.subject}
          </Text>
          {hasUnread && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>
                {item.unread_reply_count}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.inquiryMeta}>
          <View style={[styles.statusBadge, { backgroundColor: statusBadge.color + '20' }]}>
            <Text style={[styles.statusBadgeText, { color: statusBadge.color }]}>
              {statusBadge.text}
            </Text>
          </View>
          <Text style={styles.inquiryDate}>{formatDate(item.created_at)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderSendTab = () => {
    const selectedTypeLabel = INQUIRY_TYPES.find((t) => t.value === inquiryType)?.label || '';

    return (
      <ScrollView
        style={styles.formContainer}
        contentContainerStyle={styles.formContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Inquiry Type */}
        <View style={styles.fieldContainer}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>お問い合わせ種別</Text>
            <Text style={styles.requiredTag}>必須</Text>
          </View>
          <TouchableOpacity
            style={[
              styles.selectField,
              formErrors.inquiryType && styles.selectFieldError,
            ]}
            onPress={() => setShowTypePicker(true)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.selectFieldText,
                !inquiryType && styles.selectFieldPlaceholder,
              ]}
            >
              {selectedTypeLabel || '選択してください'}
            </Text>
            <Ionicons name="chevron-down" size={20} color={Colors.primaryLight} />
          </TouchableOpacity>
          {formErrors.inquiryType && (
            <Text style={styles.errorText}>{formErrors.inquiryType}</Text>
          )}
        </View>

        {/* Name */}
        <View style={styles.fieldContainer}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>お名前</Text>
            <Text style={styles.requiredTag}>必須</Text>
          </View>
          <View style={styles.inputField}>
            <TextInput
              style={styles.input}
              placeholder="お名前を入力"
              placeholderTextColor={Colors.gray[400]}
              value={userName}
              onChangeText={setUserName}
              editable={true}
            />
          </View>
        </View>

        {/* Email */}
        <View style={styles.fieldContainer}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>メールアドレス</Text>
            <Text style={styles.requiredTag}>必須</Text>
          </View>
          <View style={styles.inputField}>
            <TextInput
              style={styles.input}
              placeholder="メールアドレスを入力"
              placeholderTextColor={Colors.gray[400]}
              value={userEmail}
              onChangeText={setUserEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={true}
            />
          </View>
        </View>

        {/* Subject - Optional, auto-filled from type */}
        {subject.trim() && (
          <View style={styles.fieldContainer}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>件名</Text>
            </View>
            <View style={styles.inputField}>
              <TextInput
                style={styles.input}
                placeholder="件名を入力（任意）"
                placeholderTextColor={Colors.gray[400]}
                value={subject}
                onChangeText={setSubject}
                maxLength={100}
              />
            </View>
          </View>
        )}

        {/* Message */}
        <View style={styles.fieldContainer}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>お問い合わせ内容</Text>
            <Text style={styles.requiredTag}>必須</Text>
          </View>
          <View style={styles.textAreaField}>
            <TextInput
              style={styles.textArea}
              placeholder="お問い合わせ内容を入力"
              placeholderTextColor={Colors.gray[400]}
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              maxLength={2000}
            />
          </View>
          {formErrors.message && (
            <Text style={styles.errorText}>{formErrors.message}</Text>
          )}
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[
            styles.submitButton,
            submitting && styles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <Text style={styles.submitButtonText}>送信</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    );
  };

  const renderRepliesTab = () => {
    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>読み込み中...</Text>
        </View>
      );
    }

    if (inquiries.length === 0) {
      return (
        <EmptyState
          icon="mail-outline"
          title="お問い合わせはまだありません"
          subtitle="「送信」タブからお問い合わせを送信できます"
        />
      );
    }

    return (
      <FlatList
        data={inquiries}
        renderItem={renderInquiryItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[Colors.primary]}
            tintColor={Colors.primary}
          />
        }
      />
    );
  };

  const renderDetailModal = () => {
    if (!selectedInquiry) return null;

    return (
      <Modal
        visible={detailModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedInquiry.subject}</Text>
              <TouchableOpacity
                onPress={() => setDetailModalVisible(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color={Colors.text.primary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Original Inquiry */}
              <View style={styles.messageBubble}>
                <View style={styles.messageHeader}>
                  <Text style={styles.messageSender}>あなた</Text>
                  <Text style={styles.messageDate}>
                    {formatDate(selectedInquiry.created_at)}
                  </Text>
                </View>
                <Text style={styles.messageText}>{selectedInquiry.message}</Text>
              </View>

              {/* Replies */}
              {selectedInquiry.replies && selectedInquiry.replies.length > 0 ? (
                selectedInquiry.replies.map((reply) => (
                  <View key={reply.id} style={[styles.messageBubble, styles.replyBubble]}>
                    <View style={styles.messageHeader}>
                      <Text style={styles.replySender}>管理者からの返信</Text>
                      <Text style={styles.messageDate}>
                        {formatDate(reply.created_at)}
                      </Text>
                    </View>
                    <Text style={styles.messageText}>{reply.reply_message}</Text>
                  </View>
                ))
              ) : (
                <View style={styles.noRepliesContainer}>
                  <Text style={styles.noRepliesText}>
                    まだ返信がありません。しばらくお待ちください。
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  const renderTypePickerModal = () => {
    return (
      <Modal
        visible={showTypePicker}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowTypePicker(false)}
      >
        <TouchableOpacity
          style={styles.pickerOverlay}
          activeOpacity={1}
          onPress={() => setShowTypePicker(false)}
        >
          <View style={styles.pickerContainer}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>お問い合わせ種別を選択</Text>
              <TouchableOpacity
                onPress={() => setShowTypePicker(false)}
                style={styles.pickerCloseButton}
              >
                <Ionicons name="close" size={24} color={Colors.text.primary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.pickerList}>
              {INQUIRY_TYPES.map((type) => (
                <TouchableOpacity
                  key={type.value}
                  style={[
                    styles.pickerItem,
                    inquiryType === type.value && styles.pickerItemSelected,
                  ]}
                  onPress={() => {
                    setInquiryType(type.value);
                    setShowTypePicker(false);
                    setFormErrors((prev) => ({ ...prev, inquiryType: undefined }));
                  }}
                >
                  <Text
                    style={[
                      styles.pickerItemText,
                      inquiryType === type.value && styles.pickerItemTextSelected,
                    ]}
                  >
                    {type.label}
                  </Text>
                  {inquiryType === type.value && (
                    <Ionicons name="checkmark" size={20} color={Colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StandardHeader
        title="お問い合わせと返信"
        showBackButton
        onBackPress={() => navigation.goBack()}
      />

      {/* Tab Selector */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'send' && styles.activeTab]}
          onPress={() => setActiveTab('send')}
          accessibilityRole="tab"
          accessibilityLabel="お問い合わせを送信"
          accessibilityState={{ selected: activeTab === 'send' }}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'send' && styles.activeTabText,
            ]}
          >
            送信
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'replies' && styles.activeTab]}
          onPress={() => {
            setActiveTab('replies');
            loadInquiries();
          }}
          accessibilityRole="tab"
          accessibilityLabel="返信を確認"
          accessibilityState={{ selected: activeTab === 'replies' }}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'replies' && styles.activeTabText,
            ]}
          >
            返信
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tab Content */}
      {activeTab === 'send' ? renderSendTab() : renderRepliesTab()}

      {/* Modals */}
      {renderDetailModal()}
      {renderTypePickerModal()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: Colors.primary,
  },
  tabText: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.gray[600],
  },
  activeTabText: {
    color: Colors.primary,
    fontWeight: '600',
  },
  formContainer: {
    flex: 1,
  },
  formContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing['4xl'],
  },
  fieldContainer: {
    marginBottom: Spacing.lg,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  label: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
    color: Colors.text.primary,
  },
  requiredTag: {
    fontSize: Typography.fontSize.xs,
    color: Colors.error,
    marginLeft: Spacing.xs,
    fontWeight: Typography.fontWeight.medium,
  },
  selectField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    minHeight: 48,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  selectFieldError: {
    borderColor: Colors.error,
  },
  selectFieldText: {
    flex: 1,
    fontSize: Typography.fontSize.base,
    color: Colors.text.primary,
  },
  selectFieldPlaceholder: {
    color: Colors.gray[400],
  },
  inputField: {
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    minHeight: 48,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  input: {
    fontSize: Typography.fontSize.base,
    color: Colors.text.primary,
    padding: 0,
  },
  textAreaField: {
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    minHeight: 120,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  textArea: {
    fontSize: Typography.fontSize.base,
    color: Colors.text.primary,
    padding: 0,
    minHeight: 100,
  },
  errorText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.error,
    marginTop: Spacing.xs,
  },
  submitButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xl,
    ...Shadows.small,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.white,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: Typography.fontSize.base,
    color: Colors.text.secondary,
  },
  listContent: {
    padding: Spacing.md,
  },
  inquiryCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.small,
  },
  inquiryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  inquirySubject: {
    flex: 1,
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    marginRight: Spacing.sm,
  },
  unreadBadge: {
    backgroundColor: Colors.badge,
    borderRadius: BorderRadius.full,
    minWidth: 20,
    height: 20,
    paddingHorizontal: Spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadBadgeText: {
    color: Colors.white,
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
  },
  inquiryMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  statusBadgeText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.medium,
  },
  inquiryDate: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text.secondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  modalTitle: {
    flex: 1,
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
    marginRight: Spacing.md,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  modalBody: {
    padding: Spacing.lg,
  },
  messageBubble: {
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  replyBubble: {
    backgroundColor: Colors.primaryLight + '20',
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  messageSender: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
  },
  replySender: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.primary,
  },
  messageDate: {
    fontSize: Typography.fontSize.xs,
    color: Colors.text.secondary,
  },
  messageText: {
    fontSize: Typography.fontSize.base,
    color: Colors.text.primary,
    lineHeight: 22,
  },
  noRepliesContainer: {
    padding: Spacing.xl,
    alignItems: 'center',
  },
  noRepliesText: {
    fontSize: Typography.fontSize.base,
    color: Colors.text.secondary,
    textAlign: 'center',
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  pickerContainer: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: '60%',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  pickerTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
  },
  pickerCloseButton: {
    padding: Spacing.xs,
  },
  pickerList: {
    maxHeight: 400,
  },
  pickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  pickerItemSelected: {
    backgroundColor: Colors.primaryLight + '10',
  },
  pickerItemText: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.primary,
  },
  pickerItemTextSelected: {
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
  },
});

export default ContactReplyScreen;
