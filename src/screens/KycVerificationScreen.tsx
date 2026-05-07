import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Colors } from '../constants/colors';
import { Spacing, BorderRadius, Shadows } from '../constants/spacing';
import { Typography } from '../constants/typography';
import { RootStackParamList } from '../types';
import { useAuth } from '../contexts/AuthContext';
import StandardHeader from '../components/StandardHeader';
import Button from '../components/Button';
import { kycService } from '../services/kycService';
import { supabase } from '../services/supabase';
import { KycStatus, KycSubmission, KycPhotoRejections, parseKycRejectionReasons } from '../types/dataModels';

type KycVerificationScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  'KycVerification'
>;

interface PhotoState {
  uri: string | null;
  uploading: boolean;
  uploaded: boolean;
  storageUrl: string | null;
}

// Step definitions
const STEPS = {
  WELCOME: 0,
  DOCUMENT: 1,
  SELFIE: 2,
  ID_SELFIE: 3,
  GOLF_PHOTO: 4,
  REVIEW: 5,
  COMPLETION: 6,
} as const;

const TOTAL_STEPS = 7;

// Document type options
type DocumentType = 'mynumber' | 'license' | 'passport' | 'insurance';

const DOCUMENT_TYPES: { value: DocumentType; label: string }[] = [
  { value: 'mynumber', label: 'マイナンバーカード' },
  { value: 'license', label: '運転免許証' },
  { value: 'passport', label: 'パスポート' },
  { value: 'insurance', label: '健康保険証' },
];

const KycVerificationScreen: React.FC = () => {
  const navigation = useNavigation<KycVerificationScreenNavigationProp>();
  const { profileId } = useAuth();

  // Step management
  const [currentStep, setCurrentStep] = useState<number>(STEPS.WELCOME);
  const [progressAnim] = useState(new Animated.Value(0));

  // Photo states
  const [idFrontPhoto, setIdFrontPhoto] = useState<PhotoState>({
    uri: null,
    uploading: false,
    uploaded: false,
    storageUrl: null,
  });

  const [idBackPhoto, setIdBackPhoto] = useState<PhotoState>({
    uri: null,
    uploading: false,
    uploaded: false,
    storageUrl: null,
  });

  const [selfiePhoto, setSelfiePhoto] = useState<PhotoState>({
    uri: null,
    uploading: false,
    uploaded: false,
    storageUrl: null,
  });

  const [idSelfiePhoto, setIdSelfiePhoto] = useState<PhotoState>({
    uri: null,
    uploading: false,
    uploaded: false,
    storageUrl: null,
  });

  const [golfPhoto, setGolfPhoto] = useState<PhotoState>({
    uri: null,
    uploading: false,
    uploaded: false,
    storageUrl: null,
  });

  const [kycStatus, setKycStatus] = useState<KycStatus>('not_started');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [submissionId, setSubmissionId] = useState(`submission_${Date.now()}`);
  const [documentType, setDocumentType] = useState<DocumentType>('mynumber');
  const [showDocumentPicker, setShowDocumentPicker] = useState(false);

  // Retry flow state
  const [isRetryMode, setIsRetryMode] = useState(false);
  const [latestSubmission, setLatestSubmission] = useState<KycSubmission | null>(null);
  const [rejectionReasons, setRejectionReasons] = useState<KycPhotoRejections>({});

  // Animate progress bar
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: (currentStep / (TOTAL_STEPS - 1)) * 100,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [currentStep]);

  useEffect(() => {
    loadKycStatus();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      loadKycStatus();
    }, [profileId])
  );

  useEffect(() => {
    if (!profileId) return;

    const profileSubscription = supabase
      .channel(`profile_kyc_${profileId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${profileId}`,
        },
        (payload) => {
          if (payload.new.kyc_status) {
            setKycStatus(payload.new.kyc_status as KycStatus);
          }
        }
      )
      .subscribe();

    const submissionSubscription = supabase
      .channel(`kyc_submission_${profileId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'kyc_submissions',
          filter: `user_id=eq.${profileId}`,
        },
        () => {
          loadKycStatus();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(profileSubscription);
      supabase.removeChannel(submissionSubscription);
    };
  }, [profileId]);

  const loadKycStatus = async () => {
    if (!profileId) return;

    setLoading(true);
    try {
      const status = await kycService.getKycStatus(profileId);
      setKycStatus(status);

      // If retry status, load the submission details for rejection reasons
      if (status === 'retry') {
        const submission = await kycService.getLatestSubmission(profileId);
        if (submission) {
          setLatestSubmission(submission);
          const reasons = parseKycRejectionReasons(submission.rejection_reason);
          setRejectionReasons(reasons);
          setIsRetryMode(true);
          // Use consistent retry submissionId based on original submission
          // This prevents orphaned files if user exits and returns
          setSubmissionId(`retry_${submission.id}`);
        }
      } else if (status === 'not_started') {
        // Reset to new submission ID for fresh submissions
        setSubmissionId(`submission_${Date.now()}`);
      }
    } catch (error) {
      console.error('Error loading KYC status:', error);
    } finally {
      setLoading(false);
    }
  };

  const nextStep = () => {
    if (currentStep < TOTAL_STEPS - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const goToStep = (step: number) => {
    setCurrentStep(step);
  };

  const requestCameraPermission = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'カメラ権限が必要です',
        'カメラへのアクセスが拒否されました。設定を確認してください。'
      );
      return false;
    }
    return true;
  };

  const requestMediaLibraryPermission = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'ライブラリ権限が必要です',
        'ファイルへのアクセスが拒否されました。設定を確認してください。'
      );
      return false;
    }
    return true;
  };

  const handleCameraCapture = async (
    photoType: 'idFront' | 'idBack' | 'selfie' | 'idSelfie' | 'golf'
  ) => {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1.0,
        cameraType: photoType === 'selfie' || photoType === 'idSelfie'
          ? ImagePicker.CameraType.front
          : ImagePicker.CameraType.back,
      });

      if (!result.canceled && result.assets[0]) {
        handleImageSelected(result.assets[0], photoType);
      }
    } catch (error) {
      console.error('Camera error:', error);
      Alert.alert('エラー', '写真の撮影に失敗しました。');
    }
  };

  const handleFileSelect = async (
    photoType: 'idFront' | 'idBack' | 'selfie' | 'idSelfie' | 'golf'
  ) => {
    const hasPermission = await requestMediaLibraryPermission();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1.0,
      });

      if (!result.canceled && result.assets[0]) {
        handleImageSelected(result.assets[0], photoType);
      }
    } catch (error) {
      console.error('File select error:', error);
      Alert.alert('エラー', 'ファイルの選択に失敗しました。');
    }
  };

  const handleImageSelected = (
    asset: ImagePicker.ImagePickerAsset,
    photoType: 'idFront' | 'idBack' | 'selfie' | 'idSelfie' | 'golf'
  ) => {
    const setPhotoState =
      photoType === 'idFront'
        ? setIdFrontPhoto
        : photoType === 'idBack'
        ? setIdBackPhoto
        : photoType === 'selfie'
        ? setSelfiePhoto
        : photoType === 'idSelfie'
        ? setIdSelfiePhoto
        : setGolfPhoto;

    setPhotoState({
      uri: asset.uri,
      uploading: false,
      uploaded: false,
      storageUrl: null,
    });
  };

  const handleDeletePhoto = (photoType: 'idFront' | 'idBack' | 'selfie' | 'idSelfie' | 'golf') => {
    const setPhotoState =
      photoType === 'idFront'
        ? setIdFrontPhoto
        : photoType === 'idBack'
        ? setIdBackPhoto
        : photoType === 'selfie'
        ? setSelfiePhoto
        : photoType === 'idSelfie'
        ? setIdSelfiePhoto
        : setGolfPhoto;

    setPhotoState({
      uri: null,
      uploading: false,
      uploaded: false,
      storageUrl: null,
    });
  };

  const handleSubmit = async () => {
    if (!profileId || !idFrontPhoto.uri || !idBackPhoto.uri || !selfiePhoto.uri || !idSelfiePhoto.uri || !golfPhoto.uri) {
      Alert.alert('エラー', '5点すべての写真を提出してください。');
      return;
    }

    if (!agreedToTerms) {
      Alert.alert('エラー', '利用規約に同意してください。');
      return;
    }

    setSubmitting(true);

    try {
      // Upload ID front photo
      setIdFrontPhoto(prev => ({ ...prev, uploading: true }));
      const idFrontUpload = await kycService.uploadKycImage(
        idFrontPhoto.uri,
        profileId,
        submissionId,
        'id_photo'
      );

      if (idFrontUpload.error) {
        Alert.alert('アップロードエラー', '身分証（表）の写真のアップロードに失敗しました。');
        setSubmitting(false);
        setIdFrontPhoto(prev => ({ ...prev, uploading: false }));
        return;
      }
      setIdFrontPhoto(prev => ({ ...prev, uploading: false, uploaded: true, storageUrl: idFrontUpload.url }));

      // Upload ID back photo
      setIdBackPhoto(prev => ({ ...prev, uploading: true }));
      const idBackUpload = await kycService.uploadKycImage(
        idBackPhoto.uri,
        profileId,
        submissionId,
        'id_back_photo'
      );

      if (idBackUpload.error) {
        Alert.alert('アップロードエラー', '身分証（裏）の写真のアップロードに失敗しました。');
        setSubmitting(false);
        setIdBackPhoto(prev => ({ ...prev, uploading: false }));
        return;
      }
      setIdBackPhoto(prev => ({ ...prev, uploading: false, uploaded: true, storageUrl: idBackUpload.url }));

      // Upload selfie photo
      setSelfiePhoto(prev => ({ ...prev, uploading: true }));
      const selfieUpload = await kycService.uploadKycImage(
        selfiePhoto.uri,
        profileId,
        submissionId,
        'selfie'
      );

      if (selfieUpload.error) {
        Alert.alert('アップロードエラー', 'セルフィーのアップロードに失敗しました。');
        setSubmitting(false);
        setSelfiePhoto(prev => ({ ...prev, uploading: false }));
        return;
      }
      setSelfiePhoto(prev => ({ ...prev, uploading: false, uploaded: true, storageUrl: selfieUpload.url }));

      // Upload ID with selfie photo
      setIdSelfiePhoto(prev => ({ ...prev, uploading: true }));
      const idSelfieUpload = await kycService.uploadKycImage(
        idSelfiePhoto.uri,
        profileId,
        submissionId,
        'id_selfie'
      );

      if (idSelfieUpload.error) {
        Alert.alert('アップロードエラー', '身分証と自撮りのアップロードに失敗しました。');
        setSubmitting(false);
        setIdSelfiePhoto(prev => ({ ...prev, uploading: false }));
        return;
      }
      setIdSelfiePhoto(prev => ({ ...prev, uploading: false, uploaded: true, storageUrl: idSelfieUpload.url }));

      // Upload golf photo
      setGolfPhoto(prev => ({ ...prev, uploading: true }));
      const golfUpload = await kycService.uploadKycImage(
        golfPhoto.uri,
        profileId,
        submissionId,
        'golf_photo'
      );

      if (golfUpload.error) {
        Alert.alert('アップロードエラー', 'ゴルフ写真のアップロードに失敗しました。');
        setSubmitting(false);
        setGolfPhoto(prev => ({ ...prev, uploading: false }));
        return;
      }
      setGolfPhoto(prev => ({ ...prev, uploading: false, uploaded: true, storageUrl: golfUpload.url }));

      // Create submission record
      const result = await kycService.createSubmission(
        profileId,
        idFrontUpload.url!,
        idBackUpload.url!,
        selfieUpload.url!,
        idSelfieUpload.url!,
        golfUpload.url!
      );

      if (result.success) {
        nextStep(); // Go to completion step
      } else {
        Alert.alert('エラー', result.error || '申請に失敗しました。');
      }
    } catch (error) {
      console.error('Submission error:', error);
      Alert.alert('エラー', '申請に失敗しました。もう一度お試しください。');
    } finally {
      setSubmitting(false);
    }
  };

  const canProceedFromStep = (step: number): boolean => {
    switch (step) {
      case STEPS.WELCOME:
        return true;
      case STEPS.DOCUMENT:
        return !!idFrontPhoto.uri && !!idBackPhoto.uri;
      case STEPS.SELFIE:
        return !!selfiePhoto.uri;
      case STEPS.ID_SELFIE:
        return !!idSelfiePhoto.uri;
      case STEPS.GOLF_PHOTO:
        return !!golfPhoto.uri;
      case STEPS.REVIEW:
        return agreedToTerms;
      default:
        return false;
    }
  };

  const getStepTitle = (step: number): string => {
    switch (step) {
      case STEPS.WELCOME:
        return '本人確認';
      case STEPS.DOCUMENT:
        return '身分証明書';
      case STEPS.SELFIE:
        return '顔写真';
      case STEPS.ID_SELFIE:
        return '身分証との自撮り';
      case STEPS.GOLF_PHOTO:
        return 'ゴルフ写真';
      case STEPS.REVIEW:
        return '確認';
      case STEPS.COMPLETION:
        return '完了';
      default:
        return '本人確認';
    }
  };

  const getDocumentTypeLabel = (): string => {
    const found = DOCUMENT_TYPES.find(dt => dt.value === documentType);
    return found ? found.label : 'マイナンバーカード';
  };

  // Check which photos need to be re-uploaded
  const getPhotosNeedingRetry = (): string[] => {
    const needsRetry: string[] = [];
    if (rejectionReasons.id_front) needsRetry.push('id_front');
    if (rejectionReasons.id_back) needsRetry.push('id_back');
    if (rejectionReasons.selfie) needsRetry.push('selfie');
    if (rejectionReasons.id_selfie) needsRetry.push('id_selfie');
    if (rejectionReasons.golf_photo) needsRetry.push('golf_photo');
    return needsRetry;
  };

  // Check if a specific photo needs retry
  const photoNeedsRetry = (type: string): boolean => {
    return getPhotosNeedingRetry().includes(type);
  };

  // Get rejection reason for a specific photo
  const getPhotoRejectionReason = (type: string): string | null => {
    switch (type) {
      case 'id_front': return rejectionReasons.id_front || null;
      case 'id_back': return rejectionReasons.id_back || null;
      case 'selfie': return rejectionReasons.selfie || null;
      case 'id_selfie': return rejectionReasons.id_selfie || null;
      case 'golf_photo': return rejectionReasons.golf_photo || null;
      default: return null;
    }
  };

  // Check if all retry photos have been re-uploaded
  const allRetryPhotosUploaded = (): boolean => {
    const needsRetry = getPhotosNeedingRetry();
    for (const type of needsRetry) {
      switch (type) {
        case 'id_front':
          if (!idFrontPhoto.uri) return false;
          break;
        case 'id_back':
          if (!idBackPhoto.uri) return false;
          break;
        case 'selfie':
          if (!selfiePhoto.uri) return false;
          break;
        case 'id_selfie':
          if (!idSelfiePhoto.uri) return false;
          break;
        case 'golf_photo':
          if (!golfPhoto.uri) return false;
          break;
      }
    }
    return true;
  };

  // Handle retry submission
  const handleRetrySubmit = async () => {
    if (!profileId) return;

    setSubmitting(true);
    try {
      const needsRetry = getPhotosNeedingRetry();

      // Use existing URLs from previous submission for photos that don't need retry
      let idFrontUrl = latestSubmission?.id_image_url || '';
      let idBackUrl = latestSubmission?.id_back_image_url || '';
      let selfieUrl = latestSubmission?.selfie_image_url || '';
      let idSelfieUrl = latestSubmission?.id_selfie_image_url || '';
      let golfUrl = latestSubmission?.golf_photo_url || '';

      // Upload only the photos that need retry (with upsert: true to allow re-uploads)
      for (const type of needsRetry) {
        let upload;
        switch (type) {
          case 'id_front':
            if (idFrontPhoto.uri) {
              setIdFrontPhoto(prev => ({ ...prev, uploading: true }));
              upload = await kycService.uploadKycImage(idFrontPhoto.uri, profileId, submissionId, 'id_photo', true);
              if (upload.error) throw new Error('身分証（表）のアップロードに失敗しました');
              idFrontUrl = upload.url!;
              setIdFrontPhoto(prev => ({ ...prev, uploading: false, uploaded: true }));
            }
            break;
          case 'id_back':
            if (idBackPhoto.uri) {
              setIdBackPhoto(prev => ({ ...prev, uploading: true }));
              upload = await kycService.uploadKycImage(idBackPhoto.uri, profileId, submissionId, 'id_back_photo', true);
              if (upload.error) throw new Error('身分証（裏）のアップロードに失敗しました');
              idBackUrl = upload.url!;
              setIdBackPhoto(prev => ({ ...prev, uploading: false, uploaded: true }));
            }
            break;
          case 'selfie':
            if (selfiePhoto.uri) {
              setSelfiePhoto(prev => ({ ...prev, uploading: true }));
              upload = await kycService.uploadKycImage(selfiePhoto.uri, profileId, submissionId, 'selfie', true);
              if (upload.error) throw new Error('セルフィーのアップロードに失敗しました');
              selfieUrl = upload.url!;
              setSelfiePhoto(prev => ({ ...prev, uploading: false, uploaded: true }));
            }
            break;
          case 'id_selfie':
            if (idSelfiePhoto.uri) {
              setIdSelfiePhoto(prev => ({ ...prev, uploading: true }));
              upload = await kycService.uploadKycImage(idSelfiePhoto.uri, profileId, submissionId, 'id_selfie', true);
              if (upload.error) throw new Error('身分証との自撮りのアップロードに失敗しました');
              idSelfieUrl = upload.url!;
              setIdSelfiePhoto(prev => ({ ...prev, uploading: false, uploaded: true }));
            }
            break;
          case 'golf_photo':
            if (golfPhoto.uri) {
              setGolfPhoto(prev => ({ ...prev, uploading: true }));
              upload = await kycService.uploadKycImage(golfPhoto.uri, profileId, submissionId, 'golf_photo', true);
              if (upload.error) throw new Error('ゴルフ写真のアップロードに失敗しました');
              golfUrl = upload.url!;
              setGolfPhoto(prev => ({ ...prev, uploading: false, uploaded: true }));
            }
            break;
        }
      }

      // Create new submission with updated photos
      const result = await kycService.createSubmission(
        profileId,
        idFrontUrl,
        idBackUrl,
        selfieUrl,
        idSelfieUrl,
        golfUrl
      );

      if (result.success) {
        setIsRetryMode(false);
        setCurrentStep(STEPS.COMPLETION);
      } else {
        Alert.alert('エラー', result.error || '再提出に失敗しました。');
      }
    } catch (error: any) {
      console.error('Retry submission error:', error);
      Alert.alert('エラー', error.message || '再提出に失敗しました。');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StandardHeader
          title="本人確認認証"
          showBackButton={true}
          onBackPress={() => navigation.goBack()}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // If already approved, show status
  if (kycStatus === 'approved') {
    return (
      <SafeAreaView style={styles.container}>
        <StandardHeader
          title="本人確認認証"
          showBackButton={true}
          onBackPress={() => navigation.goBack()}
        />
        <View style={styles.statusContainer}>
          <View style={styles.successIconContainer}>
            <Ionicons name="checkmark-circle" size={80} color={Colors.success} />
          </View>
          <Text style={styles.statusTitle}>本人確認済み</Text>
          <Text style={styles.statusDescription}>
            あなたの本人確認は完了しています。{'\n'}
            プロフィールに認証バッジが表示されています。
          </Text>
          <Button
            title="戻る"
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          />
        </View>
      </SafeAreaView>
    );
  }

  // If pending review, show waiting status
  if (kycStatus === 'pending_review') {
    return (
      <SafeAreaView style={styles.container}>
        <StandardHeader
          title="本人確認認証"
          showBackButton={true}
          onBackPress={() => navigation.goBack()}
        />
        <View style={styles.statusContainer}>
          <View style={styles.pendingIconContainer}>
            <Ionicons name="time" size={80} color={Colors.primary} />
          </View>
          <Text style={styles.statusTitle}>審査中</Text>
          <Text style={styles.statusDescription}>
            本人確認の審査を行っています。{'\n'}
            結果は1〜3営業日以内にお知らせします。
          </Text>
          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={20} color={Colors.info} />
            <Text style={styles.infoBoxText}>
              審査完了後、登録メールアドレスに結果をお知らせします。
            </Text>
          </View>
          <Button
            title="戻る"
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          />
        </View>
      </SafeAreaView>
    );
  }

  // If retry mode, show focused re-submission screen
  if (isRetryMode && kycStatus === 'retry') {
    const photosNeedingRetry = getPhotosNeedingRetry();
    const retryCount = photosNeedingRetry.length;

    return (
      <SafeAreaView style={styles.container}>
        <StandardHeader
          title="写真の再提出"
          showBackButton={true}
          onBackPress={() => navigation.goBack()}
        />
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Retry Header */}
          <View style={styles.retryHeader}>
            <View style={styles.retryIconContainer}>
              <Ionicons name="refresh-circle" size={48} color={Colors.warning} />
            </View>
            <Text style={styles.retryTitle}>再提出が必要です</Text>
            <Text style={styles.retrySubtitle}>
              以下の{retryCount}枚の写真を再度アップロードしてください
            </Text>
          </View>

          {/* Retry Photos List */}
          <View style={styles.retryPhotosContainer}>
            {photosNeedingRetry.map((photoType) => {
              const reason = getPhotoRejectionReason(photoType);
              const photoLabels: Record<string, string> = {
                id_front: '身分証明書（表面）',
                id_back: '身分証明書（裏面）',
                selfie: '顔写真（セルフィー）',
                id_selfie: '身分証との自撮り',
                golf_photo: 'ゴルフ写真',
              };
              const label = photoLabels[photoType] || photoType;

              // Get the photo state for this type
              let photoState: PhotoState;
              let handleCamera: () => void;
              let handleFile: () => void;
              let handleDelete: () => void;

              switch (photoType) {
                case 'id_front':
                  photoState = idFrontPhoto;
                  handleCamera = () => handleCameraCapture('idFront');
                  handleFile = () => handleFileSelect('idFront');
                  handleDelete = () => handleDeletePhoto('idFront');
                  break;
                case 'id_back':
                  photoState = idBackPhoto;
                  handleCamera = () => handleCameraCapture('idBack');
                  handleFile = () => handleFileSelect('idBack');
                  handleDelete = () => handleDeletePhoto('idBack');
                  break;
                case 'selfie':
                  photoState = selfiePhoto;
                  handleCamera = () => handleCameraCapture('selfie');
                  handleFile = () => handleFileSelect('selfie');
                  handleDelete = () => handleDeletePhoto('selfie');
                  break;
                case 'id_selfie':
                  photoState = idSelfiePhoto;
                  handleCamera = () => handleCameraCapture('idSelfie');
                  handleFile = () => handleFileSelect('idSelfie');
                  handleDelete = () => handleDeletePhoto('idSelfie');
                  break;
                case 'golf_photo':
                  photoState = golfPhoto;
                  handleCamera = () => handleCameraCapture('golf');
                  handleFile = () => handleFileSelect('golf');
                  handleDelete = () => handleDeletePhoto('golf');
                  break;
                default:
                  return null;
              }

              return (
                <View key={photoType} style={styles.retryPhotoCard}>
                  {/* Rejection Reason */}
                  <View style={styles.rejectionReasonBox}>
                    <Ionicons name="alert-circle" size={16} color={Colors.error} />
                    <Text style={styles.rejectionReasonText}>
                      {reason || '写真の品質が基準を満たしていません'}
                    </Text>
                  </View>

                  {/* Photo Label */}
                  <Text style={styles.retryPhotoLabel}>{label}</Text>

                  {/* Photo Upload Area */}
                  <View style={styles.retryPhotoRow}>
                    {photoState.uri ? (
                      <View style={styles.retryPhotoPreviewWrapper}>
                        <Image source={{ uri: photoState.uri }} style={styles.retryPhotoPreview} />
                        <TouchableOpacity
                          style={styles.retryPhotoDeleteButton}
                          onPress={handleDelete}
                        >
                          <Ionicons name="close-circle" size={24} color={Colors.error} />
                        </TouchableOpacity>
                        <View style={styles.retryPhotoSuccess}>
                          <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                          <Text style={styles.retryPhotoSuccessText}>新しい写真を選択済み</Text>
                        </View>
                      </View>
                    ) : (
                      <View style={styles.retryPhotoPlaceholder}>
                        <TouchableOpacity
                          style={styles.retryPhotoAddButton}
                          onPress={handleFile}
                        >
                          <Ionicons name="add" size={32} color={Colors.primary} />
                          <Text style={styles.retryPhotoAddText}>写真を選択</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* Action Buttons */}
                    <View style={styles.retryPhotoActions}>
                      <TouchableOpacity
                        style={styles.retryActionButton}
                        onPress={handleCamera}
                      >
                        <Ionicons name="camera" size={20} color={Colors.primary} />
                        <Text style={styles.retryActionText}>撮影</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.retryActionButton}
                        onPress={handleFile}
                      >
                        <Ionicons name="folder-open" size={20} color={Colors.primary} />
                        <Text style={styles.retryActionText}>選択</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>

          {/* Submit Button */}
          <Button
            title={submitting ? '送信中...' : allRetryPhotosUploaded() ? '再提出する' : `あと${retryCount - photosNeedingRetry.filter(t => {
              switch(t) {
                case 'id_front': return !!idFrontPhoto.uri;
                case 'id_back': return !!idBackPhoto.uri;
                case 'selfie': return !!selfiePhoto.uri;
                case 'id_selfie': return !!idSelfiePhoto.uri;
                case 'golf_photo': return !!golfPhoto.uri;
                default: return false;
              }
            }).length}枚必要です`}
            onPress={handleRetrySubmit}
            disabled={!allRetryPhotosUploaded() || submitting}
            style={styles.retrySubmitButton}
          />

          {submitting && (
            <View style={styles.retrySubmittingOverlay}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.retrySubmittingText}>写真をアップロード中...</Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StandardHeader
        title={getStepTitle(currentStep)}
        showBackButton={true}
        onBackPress={() => {
          if (currentStep === STEPS.WELCOME || currentStep === STEPS.COMPLETION) {
            navigation.goBack();
          } else {
            prevStep();
          }
        }}
      />

      {/* Progress Bar */}
      {currentStep !== STEPS.COMPLETION && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  width: progressAnim.interpolate({
                    inputRange: [0, 100],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {currentStep + 1} / {TOTAL_STEPS}
          </Text>
        </View>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Step Content */}
        {currentStep === STEPS.WELCOME && (
          <WelcomeStep
            kycStatus={kycStatus}
            onStart={nextStep}
          />
        )}

        {currentStep === STEPS.DOCUMENT && (
          <DocumentStep
            documentType={documentType}
            documentTypeLabel={getDocumentTypeLabel()}
            showDocumentPicker={showDocumentPicker}
            onTogglePicker={() => setShowDocumentPicker(!showDocumentPicker)}
            onSelectDocumentType={(type) => {
              setDocumentType(type);
              setShowDocumentPicker(false);
            }}
            idFrontPhoto={idFrontPhoto}
            idBackPhoto={idBackPhoto}
            onCameraCapture={handleCameraCapture}
            onFileSelect={handleFileSelect}
            onDeletePhoto={handleDeletePhoto}
            onNext={nextStep}
            canProceed={canProceedFromStep(STEPS.DOCUMENT)}
          />
        )}

        {currentStep === STEPS.SELFIE && (
          <PhotoStep
            title="顔写真（セルフィー）"
            subtitle="正面を向いて、明るい場所で撮影してください"
            icon="person"
            instructions={[]}
            photo={selfiePhoto}
            onCameraPress={() => handleCameraCapture('selfie')}
            onFilePress={() => handleFileSelect('selfie')}
            onDeletePress={() => handleDeletePhoto('selfie')}
            onNext={nextStep}
            canProceed={canProceedFromStep(STEPS.SELFIE)}
            isSelfie
            exampleType="selfie"
          />
        )}

        {currentStep === STEPS.ID_SELFIE && (
          <PhotoStep
            title="身分証との自撮り"
            subtitle="顔の横に身分証を持って撮影してください"
            icon="id-card"
            instructions={[]}
            photo={idSelfiePhoto}
            onCameraPress={() => handleCameraCapture('idSelfie')}
            onFilePress={() => handleFileSelect('idSelfie')}
            onDeletePress={() => handleDeletePhoto('idSelfie')}
            onNext={nextStep}
            canProceed={canProceedFromStep(STEPS.ID_SELFIE)}
            isSelfie
            exampleType="idSelfie"
          />
        )}

        {currentStep === STEPS.GOLF_PHOTO && (
          <PhotoStep
            title="ゴルフをしている写真"
            subtitle="ゴルフ場や練習場で顔が確認できる写真"
            icon="golf"
            instructions={[]}
            photo={golfPhoto}
            onCameraPress={() => handleCameraCapture('golf')}
            onFilePress={() => handleFileSelect('golf')}
            onDeletePress={() => handleDeletePhoto('golf')}
            onNext={nextStep}
            canProceed={canProceedFromStep(STEPS.GOLF_PHOTO)}
            isGolfPhoto
            exampleType="golf"
          />
        )}

        {currentStep === STEPS.REVIEW && (
          <ReviewStep
            idFrontPhoto={idFrontPhoto}
            idBackPhoto={idBackPhoto}
            selfiePhoto={selfiePhoto}
            idSelfiePhoto={idSelfiePhoto}
            golfPhoto={golfPhoto}
            agreedToTerms={agreedToTerms}
            onToggleTerms={() => setAgreedToTerms(!agreedToTerms)}
            onSubmit={handleSubmit}
            submitting={submitting}
            onEditStep={goToStep}
          />
        )}

        {currentStep === STEPS.COMPLETION && (
          <CompletionStep onGoHome={() => navigation.goBack()} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

// ============ STEP COMPONENTS ============

interface WelcomeStepProps {
  kycStatus: KycStatus;
  onStart: () => void;
}

const WelcomeStep: React.FC<WelcomeStepProps> = ({ kycStatus, onStart }) => {
  return (
    <View style={styles.stepContainer}>
      {/* Hero Section */}
      <View style={styles.heroSection}>
        <View style={styles.shieldIconContainer}>
          <Ionicons name="shield-checkmark" size={48} color={Colors.primary} />
        </View>
        <Text style={styles.heroTitle}>本人確認を始めます</Text>
        <Text style={styles.heroSubtitle}>
          安全にご利用いただくため、本人確認が必要です
        </Text>
      </View>

      {/* Retry Notice */}
      {kycStatus === 'retry' && (
        <View style={styles.retryNotice}>
          <Ionicons name="alert-circle" size={20} color={Colors.warning} />
          <Text style={styles.retryNoticeText}>
            前回の申請は再提出が必要です。より鮮明な写真をアップロードしてください。
          </Text>
        </View>
      )}

      {/* Info Cards */}
      <View style={styles.infoCards}>
        <View style={styles.infoCard}>
          <Ionicons name="time-outline" size={24} color={Colors.primary} />
          <View style={styles.infoCardContent}>
            <Text style={styles.infoCardTitle}>所要時間</Text>
            <Text style={styles.infoCardText}>約5分で完了します</Text>
          </View>
        </View>

        <View style={styles.infoCard}>
          <Ionicons name="document-text-outline" size={24} color={Colors.primary} />
          <View style={styles.infoCardContent}>
            <Text style={styles.infoCardTitle}>必要なもの</Text>
            <Text style={styles.infoCardText}>
              本人確認書類（運転免許証、パスポート、マイナンバーカード）
            </Text>
          </View>
        </View>
      </View>

      {/* Important Notice */}
      <View style={styles.warningBox}>
        <View style={styles.warningHeader}>
          <Ionicons name="alert-circle" size={20} color={Colors.warning} />
          <Text style={styles.warningTitle}>撮影時の注意事項</Text>
        </View>
        <Text style={styles.warningText}>
          • 鮮明で読みやすい画像をご提出ください{'\n'}
          • ぼやけた画像は再提出が必要になります{'\n'}
          • 反射や光の映り込みにご注意ください
        </Text>
      </View>

      {/* Start Button */}
      <Button
        title="本人確認を開始する"
        onPress={onStart}
        style={styles.primaryButton}
      />
    </View>
  );
};

// Document Step Component with dropdown and side-by-side photos
interface DocumentStepProps {
  documentType: DocumentType;
  documentTypeLabel: string;
  showDocumentPicker: boolean;
  onTogglePicker: () => void;
  onSelectDocumentType: (type: DocumentType) => void;
  idFrontPhoto: PhotoState;
  idBackPhoto: PhotoState;
  onCameraCapture: (type: 'idFront' | 'idBack') => void;
  onFileSelect: (type: 'idFront' | 'idBack') => void;
  onDeletePhoto: (type: 'idFront' | 'idBack') => void;
  onNext: () => void;
  canProceed: boolean;
}

const DocumentStep: React.FC<DocumentStepProps> = ({
  documentType,
  documentTypeLabel,
  showDocumentPicker,
  onTogglePicker,
  onSelectDocumentType,
  idFrontPhoto,
  idBackPhoto,
  onCameraCapture,
  onFileSelect,
  onDeletePhoto,
  onNext,
  canProceed,
}) => {
  const getMissingCount = () => {
    let count = 0;
    if (!idFrontPhoto.uri) count++;
    if (!idBackPhoto.uri) count++;
    return count;
  };

  return (
    <View style={styles.stepContainer}>
      {/* Document Type Selector */}
      <View style={styles.documentSelectorContainer}>
        <Text style={styles.documentSelectorLabel}>登録する書類</Text>
        <TouchableOpacity
          style={styles.documentSelector}
          onPress={onTogglePicker}
          activeOpacity={0.7}
        >
          <Text style={styles.documentSelectorText}>{documentTypeLabel}</Text>
          <Ionicons
            name={showDocumentPicker ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={Colors.primary}
          />
        </TouchableOpacity>

        {/* Dropdown Options */}
        {showDocumentPicker && (
          <View style={styles.documentPickerDropdown}>
            {DOCUMENT_TYPES.map((type) => (
              <TouchableOpacity
                key={type.value}
                style={[
                  styles.documentPickerOption,
                  documentType === type.value && styles.documentPickerOptionSelected,
                ]}
                onPress={() => onSelectDocumentType(type.value)}
              >
                <Text
                  style={[
                    styles.documentPickerOptionText,
                    documentType === type.value && styles.documentPickerOptionTextSelected,
                  ]}
                >
                  {type.label}
                </Text>
                {documentType === type.value && (
                  <Ionicons name="checkmark" size={20} color={Colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Side by Side Photo Uploads */}
      <Text style={styles.documentPhotosSectionLabel}>登録する写真</Text>
      <View style={styles.documentPhotosContainer}>
        {/* Front Photo */}
        <View style={styles.documentPhotoCard}>
          <Text style={styles.documentPhotoLabel}>表面</Text>
          {idFrontPhoto.uri ? (
            <View style={styles.documentPhotoPreviewWrapper}>
              <Image source={{ uri: idFrontPhoto.uri }} style={styles.documentPhotoPreview} />
              <TouchableOpacity
                style={styles.documentPhotoDeleteButton}
                onPress={() => onDeletePhoto('idFront')}
              >
                <Ionicons name="close-circle" size={24} color={Colors.error} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.documentPhotoPlaceholder}>
              <TouchableOpacity
                style={styles.documentPhotoAddButton}
                onPress={() => onFileSelect('idFront')}
              >
                <Ionicons name="add" size={32} color={Colors.gray[400]} />
              </TouchableOpacity>
            </View>
          )}
          {!idFrontPhoto.uri && (
            <View style={styles.documentPhotoActions}>
              <TouchableOpacity
                style={styles.documentPhotoActionBtn}
                onPress={() => onCameraCapture('idFront')}
              >
                <Ionicons name="camera" size={16} color={Colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.documentPhotoActionBtn}
                onPress={() => onFileSelect('idFront')}
              >
                <Ionicons name="folder-open" size={16} color={Colors.primary} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Back Photo */}
        <View style={styles.documentPhotoCard}>
          <Text style={styles.documentPhotoLabel}>裏面</Text>
          {idBackPhoto.uri ? (
            <View style={styles.documentPhotoPreviewWrapper}>
              <Image source={{ uri: idBackPhoto.uri }} style={styles.documentPhotoPreview} />
              <TouchableOpacity
                style={styles.documentPhotoDeleteButton}
                onPress={() => onDeletePhoto('idBack')}
              >
                <Ionicons name="close-circle" size={24} color={Colors.error} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.documentPhotoPlaceholder}>
              <TouchableOpacity
                style={styles.documentPhotoAddButton}
                onPress={() => onFileSelect('idBack')}
              >
                <Ionicons name="add" size={32} color={Colors.gray[400]} />
              </TouchableOpacity>
            </View>
          )}
          {!idBackPhoto.uri && (
            <View style={styles.documentPhotoActions}>
              <TouchableOpacity
                style={styles.documentPhotoActionBtn}
                onPress={() => onCameraCapture('idBack')}
              >
                <Ionicons name="camera" size={16} color={Colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.documentPhotoActionBtn}
                onPress={() => onFileSelect('idBack')}
              >
                <Ionicons name="folder-open" size={16} color={Colors.primary} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* Warning Text */}
      <Text style={styles.documentWarningText}>
        ※写真がぶれていたり、見切れていると認証できない可能性があります。印字されてる文字がはっきり読み取れる、正面から撮影した写真をご登録ください。
      </Text>

      {/* Next Button */}
      <Button
        title={canProceed ? '次へ進む' : `あと${getMissingCount()}枚必要です`}
        onPress={onNext}
        disabled={!canProceed}
        style={styles.nextButton}
      />
    </View>
  );
};

// Example Image Component for photo steps
interface ExampleImageProps {
  type: 'selfie' | 'idSelfie' | 'golf';
}

const ExampleImage: React.FC<ExampleImageProps> = ({ type }) => {
  const getExampleContent = () => {
    switch (type) {
      case 'selfie':
        return (
          <View style={styles.exampleImageContent}>
            <View style={styles.exampleFaceCircle}>
              <Ionicons name="person" size={24} color={Colors.gray[400]} />
            </View>
            <View style={styles.exampleCheckmarks}>
              <Text style={styles.exampleCheckText}>✓ 正面向き</Text>
              <Text style={styles.exampleCheckText}>✓ 明るい場所</Text>
            </View>
          </View>
        );
      case 'idSelfie':
        return (
          <View style={styles.exampleImageContent}>
            <View style={styles.exampleIdSelfieContainer}>
              <View style={styles.exampleFaceSmall}>
                <Ionicons name="person" size={18} color={Colors.gray[400]} />
              </View>
              <View style={styles.exampleIdCard}>
                <Ionicons name="card" size={16} color={Colors.gray[400]} />
              </View>
            </View>
            <Text style={styles.exampleHintText}>顔の横に身分証を持つ</Text>
          </View>
        );
      case 'golf':
        return (
          <View style={styles.exampleImageContent}>
            <View style={styles.exampleGolfContainer}>
              <Ionicons name="golf" size={24} color={Colors.success} />
              <Ionicons name="person" size={20} color={Colors.gray[400]} />
            </View>
            <Text style={styles.exampleHintText}>ゴルフ中の写真</Text>
          </View>
        );
    }
  };

  return (
    <View style={styles.exampleImageContainer}>
      <Text style={styles.exampleLabel}>例</Text>
      <View style={styles.exampleImageBox}>
        {getExampleContent()}
      </View>
    </View>
  );
};

interface PhotoStepProps {
  title: string;
  subtitle: string;
  icon: 'card' | 'person' | 'id-card' | 'golf';
  instructions: string[];
  photo: PhotoState;
  onCameraPress: () => void;
  onFilePress: () => void;
  onDeletePress: () => void;
  onNext: () => void;
  canProceed: boolean;
  isSelfie?: boolean;
  isGolfPhoto?: boolean;
  exampleType?: 'selfie' | 'idSelfie' | 'golf';
}

const PhotoStep: React.FC<PhotoStepProps> = ({
  title,
  subtitle,
  photo,
  onCameraPress,
  onFilePress,
  onDeletePress,
  onNext,
  canProceed,
  isSelfie,
  isGolfPhoto,
  exampleType,
}) => {
  return (
    <View style={styles.stepContainer}>
      {/* Compact Header */}
      <Text style={styles.compactStepTitle}>{title}</Text>
      <Text style={styles.compactStepSubtitle}>{subtitle}</Text>

      {/* Example and Upload Row */}
      <View style={styles.photoStepRow}>
        {/* Example Image */}
        {exampleType && <ExampleImage type={exampleType} />}

        {/* Upload Area */}
        <View style={styles.photoUploadArea}>
          <Text style={styles.photoUploadLabel}>あなたの写真</Text>
          {photo.uri ? (
            <View style={styles.compactPhotoPreviewWrapper}>
              <Image source={{ uri: photo.uri }} style={styles.compactPhotoPreview} />
              <TouchableOpacity
                style={styles.compactDeleteButton}
                onPress={onDeletePress}
              >
                <Ionicons name="close-circle" size={22} color={Colors.error} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.compactPhotoPlaceholder}>
              <TouchableOpacity
                style={styles.compactAddButton}
                onPress={onFilePress}
              >
                <Ionicons name="add" size={28} color={Colors.gray[400]} />
              </TouchableOpacity>
            </View>
          )}
          {!photo.uri && (
            <View style={styles.compactPhotoActions}>
              <TouchableOpacity
                style={styles.compactActionBtn}
                onPress={onCameraPress}
              >
                <Ionicons name="camera" size={16} color={Colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.compactActionBtn}
                onPress={onFilePress}
              >
                <Ionicons name="folder-open" size={16} color={Colors.primary} />
              </TouchableOpacity>
            </View>
          )}
          {photo.uri && (
            <TouchableOpacity
              style={styles.retakeButton}
              onPress={onCameraPress}
            >
              <Text style={styles.retakeButtonText}>撮り直す</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Next Button */}
      <Button
        title={canProceed ? '次へ進む' : '写真を追加してください'}
        onPress={onNext}
        disabled={!canProceed}
        style={styles.nextButton}
      />
    </View>
  );
};

interface ReviewStepProps {
  idFrontPhoto: PhotoState;
  idBackPhoto: PhotoState;
  selfiePhoto: PhotoState;
  idSelfiePhoto: PhotoState;
  golfPhoto: PhotoState;
  agreedToTerms: boolean;
  onToggleTerms: () => void;
  onSubmit: () => void;
  submitting: boolean;
  onEditStep: (step: number) => void;
}

const ReviewStep: React.FC<ReviewStepProps> = ({
  idFrontPhoto,
  idBackPhoto,
  selfiePhoto,
  idSelfiePhoto,
  golfPhoto,
  agreedToTerms,
  onToggleTerms,
  onSubmit,
  submitting,
  onEditStep,
}) => {
  const photos = [
    { label: '身分証（表）', photo: idFrontPhoto, step: STEPS.DOCUMENT },
    { label: '身分証（裏）', photo: idBackPhoto, step: STEPS.DOCUMENT },
    { label: '顔写真', photo: selfiePhoto, step: STEPS.SELFIE },
    { label: '身分証との自撮り', photo: idSelfiePhoto, step: STEPS.ID_SELFIE },
    { label: 'ゴルフ写真', photo: golfPhoto, step: STEPS.GOLF_PHOTO },
  ];

  return (
    <View style={styles.stepContainer}>
      {/* Header */}
      <View style={styles.reviewHeader}>
        <View style={styles.reviewIconContainer}>
          <Ionicons name="document-text" size={32} color={Colors.primary} />
        </View>
        <Text style={styles.reviewTitle}>提出内容の確認</Text>
        <Text style={styles.reviewSubtitle}>
          以下の内容で本人確認を申請します
        </Text>
      </View>

      {/* Photo List */}
      <View style={styles.reviewSection}>
        <Text style={styles.reviewSectionTitle}>アップロード済みの画像</Text>
        {photos.map((item, index) => (
          <TouchableOpacity
            key={index}
            style={styles.reviewPhotoItem}
            onPress={() => onEditStep(item.step)}
          >
            <View style={styles.reviewPhotoInfo}>
              <Ionicons
                name={item.photo.uri ? 'checkmark-circle' : 'close-circle'}
                size={20}
                color={item.photo.uri ? Colors.success : Colors.error}
              />
              <Text style={styles.reviewPhotoLabel}>{item.label}</Text>
            </View>
            {item.photo.uri && (
              <Image source={{ uri: item.photo.uri }} style={styles.reviewPhotoThumbnail} />
            )}
            <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
          </TouchableOpacity>
        ))}
      </View>

      {/* Checklist */}
      <View style={styles.checklistBox}>
        <Text style={styles.checklistTitle}>確認事項</Text>
        <Text style={styles.checklistItem}>• すべての画像が鮮明に撮影されていますか？</Text>
        <Text style={styles.checklistItem}>• 書類の文字が読み取れますか？</Text>
        <Text style={styles.checklistItem}>• 顔写真は正面を向いていますか？</Text>
      </View>

      {/* Terms Agreement */}
      <TouchableOpacity
        style={styles.termsContainer}
        onPress={onToggleTerms}
        activeOpacity={0.7}
      >
        <View style={[
          styles.checkbox,
          agreedToTerms && styles.checkboxChecked,
        ]}>
          {agreedToTerms && (
            <Ionicons name="checkmark" size={16} color={Colors.white} />
          )}
        </View>
        <Text style={styles.termsText}>
          <Text style={styles.termsLink}>利用規約</Text>
          と
          <Text style={styles.termsLink}>プライバシーポリシー</Text>
          に同意します
        </Text>
      </TouchableOpacity>

      {/* Submit Button */}
      <Button
        title={submitting ? '送信中...' : '提出する'}
        onPress={onSubmit}
        disabled={!agreedToTerms || submitting}
        style={styles.submitButton}
      />

      {submitting && (
        <View style={styles.submittingOverlay}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.submittingText}>写真をアップロード中...</Text>
        </View>
      )}
    </View>
  );
};

interface CompletionStepProps {
  onGoHome: () => void;
}

const CompletionStep: React.FC<CompletionStepProps> = ({ onGoHome }) => {
  return (
    <View style={styles.stepContainer}>
      {/* Success Icon */}
      <View style={styles.completionHero}>
        <View style={styles.completionIconContainer}>
          <Ionicons name="checkmark-circle" size={80} color={Colors.success} />
        </View>
        <Text style={styles.completionTitle}>本人確認を受け付けました</Text>
        <Text style={styles.completionSubtitle}>ご提出ありがとうございます</Text>
      </View>

      {/* Status Message */}
      <View style={styles.completionStatusBox}>
        <Ionicons name="hourglass" size={20} color={Colors.primary} />
        <Text style={styles.completionStatusText}>
          本人確認の審査を開始しました。{'\n'}
          結果は登録メールアドレスにお知らせいたします。
        </Text>
      </View>

      {/* Info Cards */}
      <View style={styles.completionInfoCards}>
        <View style={styles.completionInfoCard}>
          <Ionicons name="time-outline" size={24} color={Colors.primary} />
          <View style={styles.completionInfoContent}>
            <Text style={styles.completionInfoTitle}>審査期間</Text>
            <Text style={styles.completionInfoText}>通常1〜3営業日で完了します</Text>
          </View>
        </View>

        <View style={styles.completionInfoCard}>
          <Ionicons name="mail-outline" size={24} color={Colors.primary} />
          <View style={styles.completionInfoContent}>
            <Text style={styles.completionInfoTitle}>結果の通知</Text>
            <Text style={styles.completionInfoText}>審査完了後、メールでお知らせします</Text>
          </View>
        </View>
      </View>

      {/* Next Steps */}
      <View style={styles.nextStepsBox}>
        <Ionicons name="information-circle" size={20} color={Colors.info} />
        <Text style={styles.nextStepsText}>
          審査完了まで通常通りアプリをご利用いただけます。{'\n'}
          承認後、プロフィールに認証バッジが表示されます。
        </Text>
      </View>

      {/* Home Button */}
      <Button
        title="ホームに戻る"
        onPress={onGoHome}
        style={styles.homeButton}
      />
    </View>
  );
};

// ============ STYLES ============

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: 100,
  },

  // Progress Bar
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.gray[200],
    borderRadius: 3,
    overflow: 'hidden',
    marginRight: Spacing.md,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  progressText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text.secondary,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
  },

  // Step Container
  stepContainer: {
    flex: 1,
  },

  // Status Container (for approved/pending)
  statusContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  successIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.success + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  pendingIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  statusTitle: {
    fontSize: Typography.fontSize['2xl'],
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  statusDescription: {
    fontSize: Typography.fontSize.base,
    color: Colors.text.secondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: Spacing.lg,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: Colors.info + '10',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  infoBoxText: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    color: Colors.info,
    lineHeight: 20,
  },
  backButton: {
    marginTop: Spacing.md,
  },

  // Welcome Step
  heroSection: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  shieldIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  heroTitle: {
    fontSize: Typography.fontSize['2xl'],
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: Typography.fontSize.base,
    color: Colors.text.secondary,
    textAlign: 'center',
  },
  retryNotice: {
    flexDirection: 'row',
    backgroundColor: Colors.warning + '15',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  retryNoticeText: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    color: Colors.warning,
    lineHeight: 20,
  },
  infoCards: {
    marginBottom: Spacing.lg,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    alignItems: 'flex-start',
  },
  infoCardContent: {
    marginLeft: Spacing.md,
    flex: 1,
  },
  infoCardTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    marginBottom: 2,
  },
  infoCardText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text.secondary,
    lineHeight: 20,
  },
  warningBox: {
    backgroundColor: Colors.warning + '10',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.xl,
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  warningTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.warning,
    marginLeft: Spacing.xs,
  },
  warningText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text.secondary,
    lineHeight: 22,
  },
  primaryButton: {
    marginTop: Spacing.md,
  },

  // Photo Step
  photoStepHeader: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  photoStepIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  photoStepTitle: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  photoStepSubtitle: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text.secondary,
    textAlign: 'center',
  },
  instructionsBox: {
    backgroundColor: Colors.primary + '08',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  instructionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  instructionsTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.primary,
    marginLeft: Spacing.xs,
  },
  instructionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.xs,
  },
  instructionText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text.secondary,
    marginLeft: Spacing.sm,
    flex: 1,
    lineHeight: 20,
  },
  photoPreviewContainer: {
    marginBottom: Spacing.lg,
  },
  photoPreviewWrapper: {
    position: 'relative',
  },
  photoPreview: {
    width: '100%',
    height: 240,
    borderRadius: BorderRadius.lg,
    resizeMode: 'cover',
    backgroundColor: Colors.gray[100],
  },
  deletePhotoButton: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: Colors.white,
    borderRadius: 14,
  },
  photoSuccessIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  photoSuccessText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.success,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
  },
  photoPlaceholder: {
    width: '100%',
    height: 240,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.gray[50],
    borderWidth: 2,
    borderColor: Colors.gray[200],
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoPlaceholderCircle: {
    height: 200,
    borderRadius: 100,
    width: 200,
    alignSelf: 'center',
  },
  photoPlaceholderText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.gray[400],
    marginTop: Spacing.sm,
  },
  photoActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  photoActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary + '10',
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  photoActionButtonOutline: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  photoActionText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
  },
  nextButton: {
    marginTop: Spacing.md,
  },

  // Review Step
  reviewHeader: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  reviewIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  reviewTitle: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  reviewSubtitle: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text.secondary,
    textAlign: 'center',
  },
  reviewSection: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  reviewSectionTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    marginBottom: Spacing.md,
  },
  reviewPhotoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  reviewPhotoInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: Spacing.sm,
  },
  reviewPhotoLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text.primary,
  },
  reviewPhotoThumbnail: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    marginRight: Spacing.sm,
  },
  checklistBox: {
    backgroundColor: Colors.warning + '10',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  checklistTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    marginBottom: Spacing.sm,
  },
  checklistItem: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text.secondary,
    lineHeight: 22,
  },
  termsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    marginBottom: Spacing.lg,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: BorderRadius.sm,
    borderWidth: 2,
    borderColor: Colors.gray[300],
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  checkboxChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  termsText: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    color: Colors.text.secondary,
    lineHeight: 20,
  },
  termsLink: {
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
  },
  submitButton: {
    marginTop: Spacing.md,
  },
  submittingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: BorderRadius.md,
  },
  submittingText: {
    marginTop: Spacing.md,
    fontSize: Typography.fontSize.base,
    color: Colors.text.secondary,
  },

  // Completion Step
  completionHero: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  completionIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.success + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  completionTitle: {
    fontSize: Typography.fontSize['2xl'],
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  completionSubtitle: {
    fontSize: Typography.fontSize.base,
    color: Colors.text.secondary,
    textAlign: 'center',
  },
  completionStatusBox: {
    flexDirection: 'row',
    backgroundColor: Colors.success + '10',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  completionStatusText: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    color: Colors.success,
    lineHeight: 22,
  },
  completionInfoCards: {
    marginBottom: Spacing.lg,
  },
  completionInfoCard: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    alignItems: 'flex-start',
  },
  completionInfoContent: {
    marginLeft: Spacing.md,
    flex: 1,
  },
  completionInfoTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    marginBottom: 2,
  },
  completionInfoText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text.secondary,
  },
  nextStepsBox: {
    flexDirection: 'row',
    backgroundColor: Colors.info + '10',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.xl,
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  nextStepsText: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    color: Colors.info,
    lineHeight: 22,
  },
  homeButton: {
    marginTop: Spacing.md,
  },

  // Document Step Styles
  documentSelectorContainer: {
    marginBottom: Spacing.lg,
  },
  documentSelectorLabel: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
    color: Colors.text.primary,
    marginBottom: Spacing.sm,
  },
  documentSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  documentSelectorText: {
    fontSize: Typography.fontSize.base,
    color: Colors.text.primary,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
  },
  documentPickerDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.xs,
    zIndex: 1000,
    ...Shadows.medium,
  },
  documentPickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  documentPickerOptionSelected: {
    backgroundColor: Colors.primary + '10',
  },
  documentPickerOptionText: {
    fontSize: Typography.fontSize.base,
    color: Colors.text.primary,
  },
  documentPickerOptionTextSelected: {
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
  },
  documentPhotosSectionLabel: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
    color: Colors.text.primary,
    marginBottom: Spacing.sm,
  },
  documentPhotosContainer: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  documentPhotoCard: {
    flex: 1,
  },
  documentPhotoLabel: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
    color: Colors.text.secondary,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  documentPhotoPreviewWrapper: {
    position: 'relative',
    aspectRatio: 1,
  },
  documentPhotoPreview: {
    width: '100%',
    height: '100%',
    borderRadius: BorderRadius.md,
    resizeMode: 'cover',
    backgroundColor: Colors.gray[100],
  },
  documentPhotoDeleteButton: {
    position: 'absolute',
    top: Spacing.xs,
    right: Spacing.xs,
    backgroundColor: Colors.white,
    borderRadius: 12,
  },
  documentPhotoPlaceholder: {
    aspectRatio: 1,
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  documentPhotoAddButton: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  documentPhotoActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  documentPhotoActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  documentWarningText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.text.secondary,
    lineHeight: 18,
    marginBottom: Spacing.lg,
  },

  // Compact Photo Step Styles
  compactStepTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
    marginBottom: Spacing.xs,
  },
  compactStepSubtitle: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text.secondary,
    marginBottom: Spacing.lg,
  },
  photoStepRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  photoUploadArea: {
    flex: 1,
  },
  photoUploadLabel: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
    color: Colors.text.primary,
    marginBottom: Spacing.sm,
  },
  compactPhotoPreviewWrapper: {
    position: 'relative',
    aspectRatio: 1,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  compactPhotoPreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
    backgroundColor: Colors.gray[100],
  },
  compactDeleteButton: {
    position: 'absolute',
    top: Spacing.xs,
    right: Spacing.xs,
    backgroundColor: Colors.white,
    borderRadius: 11,
  },
  compactPhotoPlaceholder: {
    aspectRatio: 1,
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  compactAddButton: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  compactPhotoActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  compactActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  retakeButton: {
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  retakeButtonText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
  },

  // Example Image Styles
  exampleImageContainer: {
    flex: 1,
  },
  exampleLabel: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
    color: Colors.text.primary,
    marginBottom: Spacing.sm,
  },
  exampleImageBox: {
    aspectRatio: 1,
    backgroundColor: Colors.primary + '08',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.sm,
  },
  exampleImageContent: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  exampleFaceCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.gray[200],
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  exampleCheckmarks: {
    alignItems: 'center',
  },
  exampleCheckText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.success,
    lineHeight: 16,
  },
  exampleIdSelfieContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  exampleFaceSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.gray[200],
    justifyContent: 'center',
    alignItems: 'center',
  },
  exampleIdCard: {
    width: 32,
    height: 22,
    borderRadius: 4,
    backgroundColor: Colors.gray[200],
    justifyContent: 'center',
    alignItems: 'center',
  },
  exampleHintText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.text.secondary,
    textAlign: 'center',
  },
  exampleGolfContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },

  // Retry Flow Styles
  retryHeader: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  retryIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.warning + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  retryTitle: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
    marginBottom: Spacing.xs,
  },
  retrySubtitle: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text.secondary,
    textAlign: 'center',
  },
  retryPhotosContainer: {
    marginBottom: Spacing.lg,
  },
  retryPhotoCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  rejectionReasonBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.error + '10',
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  rejectionReasonText: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    color: Colors.error,
    lineHeight: 18,
  },
  retryPhotoLabel: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    marginBottom: Spacing.sm,
  },
  retryPhotoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  retryPhotoPreviewWrapper: {
    flex: 1,
  },
  retryPhotoPreview: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: BorderRadius.md,
    resizeMode: 'cover',
    backgroundColor: Colors.gray[100],
  },
  retryPhotoDeleteButton: {
    position: 'absolute',
    top: Spacing.xs,
    right: Spacing.xs,
    backgroundColor: Colors.white,
    borderRadius: 12,
  },
  retryPhotoSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  retryPhotoSuccessText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.success,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
  },
  retryPhotoPlaceholder: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: Colors.primary + '30',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryPhotoAddButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryPhotoAddText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
    marginTop: Spacing.xs,
  },
  retryPhotoActions: {
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  retryActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary + '10',
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
  },
  retryActionText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
  },
  retrySubmitButton: {
    marginTop: Spacing.md,
  },
  retrySubmittingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: BorderRadius.md,
  },
  retrySubmittingText: {
    marginTop: Spacing.md,
    fontSize: Typography.fontSize.base,
    color: Colors.text.secondary,
  },
});

export default KycVerificationScreen;
