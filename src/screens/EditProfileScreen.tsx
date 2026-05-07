import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  Alert,
  ActionSheetIOS,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
  ActivityIndicator,
  Modal,
  FlatList,
  KeyboardAvoidingView,
  InteractionManager,
  BackHandler,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { RootStackParamList } from "../types";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "../contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";

import { Colors } from "../constants/colors";
import { Spacing, BorderRadius } from "../constants/spacing";
import { Typography } from "../constants/typography";
import { User } from "../types/dataModels";
import Card from "../components/Card";
import Button from "../components/Button";
import Loading from "../components/Loading";
import BirthDatePicker from "../components/BirthDatePicker";
import FullScreenTextEditor from "../components/FullScreenTextEditor";
import { DataProvider } from "../services";
import { storageService } from "../services/storageService";
import { calculateAge, formatBirthDateJapanese } from "../utils/formatters";

interface ProfileFormData {
  name: string;
  age: string;
  birth_date: string; // ISO date string (YYYY-MM-DD)
  gender: string;
  prefecture: string;
  play_prefecture: string[]; // Prefectures where user typically plays golf (max 3)
  golf_skill_level: string;
  average_score: string;
  bio: string;
  golf_experience: string;
  best_score: string;
  transportation: string;
  available_days: string;
  blood_type: string;
  height: string;
  body_type: string;
  smoking: string;
  favorite_club: string;
  personality_type: string;
  profile_pictures: string[];
}

type EditProfileNavigationProp = StackNavigationProp<RootStackParamList, "EditProfile">;

const EditProfileScreen: React.FC = () => {
  const navigation = useNavigation<EditProfileNavigationProp>();
  const { profileId } = useAuth(); // Get current user's profile ID
  const queryClient = useQueryClient(); // For invalidating React Query cache after save
  const [loading, setLoading] = useState(true);
  const [formReady, setFormReady] = useState(false); // Tracks when form is ready for input (prevents IME crashes)
  const [saving, setSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalOptions, setModalOptions] = useState<string[]>([]);
  const [modalField, setModalField] = useState<keyof ProfileFormData | null>(null);
  // Multi-select modal state (for play_prefecture)
  const [multiSelectModalVisible, setMultiSelectModalVisible] = useState(false);
  const [multiSelectField, setMultiSelectField] = useState<keyof ProfileFormData | null>(null);
  const [multiSelectOptions, setMultiSelectOptions] = useState<string[]>([]);
  const [multiSelectTitle, setMultiSelectTitle] = useState("");
  const [multiSelectMax, setMultiSelectMax] = useState(3);
  const formLoadedRef = useRef(false); // Track if initial load completed to prevent re-render race conditions
  const [isNewUser, setIsNewUser] = useState(false); // Track if this is initial profile setup
  const [birthDatePickerVisible, setBirthDatePickerVisible] = useState(false);
  const [isVerified, setIsVerified] = useState(false); // Track if user is verified (本人確認済み)
  const [bioEditorVisible, setBioEditorVisible] = useState(false);
  const [formData, setFormData] = useState<ProfileFormData>({
    name: "",
    age: "",
    birth_date: "",
    gender: "",
    prefecture: "",
    play_prefecture: [],
    golf_skill_level: "",
    average_score: "",
    bio: "",
    golf_experience: "",
    best_score: "",
    transportation: "",
    available_days: "",
    blood_type: "",
    height: "",
    body_type: "",
    smoking: "",
    favorite_club: "",
    personality_type: "",
    profile_pictures: [],
  });

  useEffect(() => {
    loadCurrentProfile();
  }, []);

  // Block Android back button for new users
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (isNewUser) {
          Alert.alert(
            "プロフィールを完成させてください",
            "アプリを使用するには、基本情報の入力が必要です。",
            [{ text: "OK" }]
          );
          return true; // Prevent default back behavior
        }
        return false; // Allow default back behavior
      };

      const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);

      return () => subscription.remove();
    }, [isNewUser])
  );

  const loadCurrentProfile = async () => {
    try {
      // Get current user ID from AuthContext
      const currentUserId = profileId || process.env.EXPO_PUBLIC_TEST_USER_ID;
      
      if (!currentUserId) {
        console.error("No authenticated user found");
        Alert.alert("Error", "Please sign in to edit your profile");
        navigation.goBack();
        return;
      }

      // Load current user profile from centralized data provider
      const response = await DataProvider.getUserProfile(currentUserId);

      if (response.error || !response.data) {
        console.error("Failed to load profile:", response.error);
        Alert.alert("Error", "Failed to load profile");
        setLoading(false);
        return;
      }

      const profile = response.data;

      // Convert profile data to form data format
      // Handle existing users who may not have filled required fields intelligently
      const currentProfile: ProfileFormData = {
        name: profile.basic?.name?.trim() || "",
        age: profile.basic?.age?.toString().trim() || "",
        birth_date: profile.basic?.birth_date || "",
        // For existing users without gender, leave empty so they must select
        gender: profile.basic?.gender?.trim() || "",
        prefecture: profile.basic?.prefecture?.trim() || "",
        play_prefecture: (profile as any).play_prefecture || [], // プレー地域 (max 3)
        golf_skill_level: profile.golf?.skill_level || "",
        average_score: profile.golf?.average_score || "",
        bio: profile.bio || "",
        golf_experience: profile.golf?.experience || "",
        best_score: profile.golf?.best_score || "",
        transportation: profile.golf?.transportation || "",
        available_days: profile.golf?.available_days || "",
        blood_type: profile.basic?.blood_type || "",
        height: profile.basic?.height || "",
        body_type: profile.basic?.body_type || "",
        smoking: profile.basic?.smoking || "",
        favorite_club: profile.basic?.favorite_club || "",
        personality_type: profile.basic?.personality_type || "",
        profile_pictures: profile.profile_pictures || [],
      };

      setFormData(currentProfile);
      formLoadedRef.current = true;

      // Check if user is verified (本人確認済み)
      setIsVerified(profile.status?.is_verified === true);

      // Check if this is a new user (essential fields not filled)
      const hasName = !!currentProfile.name.trim();
      // Check for birth_date (preferred) or fall back to old age field for backward compatibility
      const hasBirthDate = !!currentProfile.birth_date;
      const hasAge = hasBirthDate || (!!currentProfile.age.trim() && parseInt(currentProfile.age) > 0);
      const hasGender = !!currentProfile.gender.trim();
      const hasPrefecture = !!currentProfile.prefecture.trim() && currentProfile.prefecture !== '未設定';

      const isNewUserSetup = !hasName || !hasAge || !hasGender || !hasPrefecture;
      setIsNewUser(isNewUserSetup);
    } catch (_error) {
      console.error("Error loading profile:", _error);
      formLoadedRef.current = true; // Still mark as loaded even on error
      setIsNewUser(true); // Treat as new user on error
    } finally {
      setLoading(false);
      // Wait for UI to settle before allowing input - prevents Japanese IME crashes
      // This ensures the form is fully rendered before user can interact
      InteractionManager.runAfterInteractions(() => {
        setFormReady(true);
      });
    }
  };

  // Gender mapping for display
  const genderLabels: Record<string, string> = {
    male: "男性",
    female: "女性",
  };

  const getGenderDisplayLabel = (value: string): string => {
    return genderLabels[value] || value;
  };

  // Use useCallback to prevent recreation of handler on each render
  // This helps prevent Japanese IME crashes by keeping stable references
  const handleInputChange = useCallback((
    field: keyof ProfileFormData,
    value: string | string[],
  ) => {
    // Only update if form has been initially loaded to prevent race conditions
    if (!formLoadedRef.current) return;

    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  }, []);

  // Photo slot labels (golf-themed)
  const PHOTO_SLOT_LABELS = [
    "メイン",
    "ゴルフ場",
    "スイング",
    "パッティング",
    "ゴルフウェア",
    "趣味",
  ];

  const setPhotoAtSlot = (slotIndex: number, uri: string) => {
    const newPictures = [...formData.profile_pictures];
    // Pad array with empty strings if needed
    while (newPictures.length <= slotIndex) {
      newPictures.push("");
    }
    newPictures[slotIndex] = uri;
    handleInputChange("profile_pictures", newPictures);
  };

  const removePhotoAtSlot = (slotIndex: number) => {
    const newPictures = [...formData.profile_pictures];
    if (slotIndex < newPictures.length) {
      newPictures[slotIndex] = "";
    }
    handleInputChange("profile_pictures", newPictures);
  };

  const openCameraForSlot = async (slotIndex: number) => {
    try {
      const permissionResult =
        await ImagePicker.requestCameraPermissionsAsync();

      if (permissionResult.granted === false) {
        Alert.alert("エラー", "カメラの使用許可が必要です");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setPhotoAtSlot(slotIndex, result.assets[0].uri);
      }
    } catch (_error) {
      Alert.alert("エラー", "写真の撮影に失敗しました");
    }
  };

  const openImageLibraryForSlot = async (slotIndex: number) => {
    try {
      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (permissionResult.granted === false) {
        Alert.alert("エラー", "ライブラリの使用許可が必要です");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setPhotoAtSlot(slotIndex, result.assets[0].uri);
      }
    } catch (_error) {
      Alert.alert("エラー", "写真の選択に失敗しました");
    }
  };

  const showPickerForSlot = (slotIndex: number) => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["キャンセル", "カメラで撮影", "ライブラリから選択"],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            openCameraForSlot(slotIndex);
          } else if (buttonIndex === 2) {
            openImageLibraryForSlot(slotIndex);
          }
        },
      );
    } else {
      Alert.alert("写真を選択", "写真の選択方法を選んでください", [
        { text: "キャンセル", style: "cancel" },
        { text: "カメラで撮影", onPress: () => openCameraForSlot(slotIndex) },
        { text: "ライブラリから選択", onPress: () => openImageLibraryForSlot(slotIndex) },
      ]);
    }
  };

  const handlePhotoSlotPress = (slotIndex: number) => {
    const photo = formData.profile_pictures[slotIndex];
    if (photo && photo !== "") {
      // Filled slot — show change/delete options
      if (Platform.OS === "ios") {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: ["キャンセル", "写真を変更", "写真を削除"],
            cancelButtonIndex: 0,
            destructiveButtonIndex: 2,
          },
          (buttonIndex) => {
            if (buttonIndex === 1) {
              showPickerForSlot(slotIndex);
            } else if (buttonIndex === 2) {
              removePhotoAtSlot(slotIndex);
            }
          },
        );
      } else {
        Alert.alert("写真の操作", "操作を選んでください", [
          { text: "キャンセル", style: "cancel" },
          { text: "写真を変更", onPress: () => showPickerForSlot(slotIndex) },
          { text: "写真を削除", style: "destructive", onPress: () => removePhotoAtSlot(slotIndex) },
        ]);
      }
    } else {
      // Empty slot — pick a new photo
      showPickerForSlot(slotIndex);
    }
  };

  const handleSave = async () => {
    setSaving(true);

    // Validate required fields
    const missingFields: string[] = [];

    // Profile picture is required for new users (slot 0 must be filled)
    const hasMainPhoto = formData.profile_pictures.length > 0 && formData.profile_pictures[0] !== "";
    if (isNewUser && !hasMainPhoto) {
      missingFields.push("プロフィール写真（メイン）");
    }

    if (!formData.name.trim()) {
      missingFields.push("名前");
    }

    // Require birth_date for all users
    if (!formData.birth_date) {
      missingFields.push("生年月日");
    }

    if (!formData.gender.trim()) {
      missingFields.push("性別");
    }

    if (!formData.prefecture.trim()) {
      missingFields.push("居住地");
    }

    if (missingFields.length > 0) {
      Alert.alert(
        "必須項目が未入力です",
        `以下の項目を入力してください：\n${missingFields.join("、")}`,
        [{ text: "OK" }]
      );
      setSaving(false);
      return;
    }

    try {
      // Get the actual authenticated user ID
      const currentUserId = profileId || process.env.EXPO_PUBLIC_TEST_USER_ID;
      
      if (!currentUserId) {
        throw new Error("No authenticated user ID available");
      }

      // Upload local images to Supabase Storage before saving
      // Filter out empty strings from the photo grid slots
      let uploadedProfilePictures = [...formData.profile_pictures].filter(uri => uri !== "");
      const localImages = uploadedProfilePictures.filter(uri => uri.startsWith('file://'));
      
      if (localImages.length > 0) {
        console.log(`Uploading ${localImages.length} profile images to Supabase Storage...`);
        
        for (let i = 0; i < localImages.length; i++) {
          const localUri = localImages[i];
          const index = uploadedProfilePictures.indexOf(localUri);
          
          try {
            const { url, error } = await storageService.uploadFile(
              localUri,
              currentUserId,
              'image'
            );

            if (error) {
              console.error(`Failed to upload image ${i + 1}:`, error);
              Alert.alert("エラー", `画像${i + 1}のアップロードに失敗しました: ${error}`);
              setSaving(false);
              return;
            }

            if (url) {
              // Replace local URI with uploaded URL
              uploadedProfilePictures[index] = url;
              console.log(`Image ${i + 1} uploaded successfully:`, url);
            }
          } catch (error: any) {
            console.error(`Error uploading image ${i + 1}:`, error);
            Alert.alert("エラー", `画像のアップロード中にエラーが発生しました`);
            setSaving(false);
            return;
          }
        }
      }

      // Save profile data to centralized data provider
      // Calculate age from birth_date for display and backward compatibility
      const calculatedAge = formData.birth_date ? calculateAge(formData.birth_date).toString() : formData.age;

      const updateData = {
        basic: {
          name: formData.name,
          age: calculatedAge,
          birth_date: formData.birth_date,
          gender: formData.gender,
          prefecture: formData.prefecture,
          blood_type: formData.blood_type,
          height: formData.height,
          body_type: formData.body_type,
          smoking: formData.smoking,
          favorite_club: formData.favorite_club,
          personality_type: formData.personality_type,
        },
        golf: {
          experience: formData.golf_experience,
          skill_level: formData.golf_skill_level, // Save Japanese value directly to DB
          average_score: formData.average_score,
          best_score: formData.best_score,
          transportation: formData.transportation,
          available_days: formData.available_days,
        },
        bio: formData.bio,
        profile_pictures: uploadedProfilePictures, // Use uploaded URLs instead of local paths
        status: "アクティブ",
        location: `${formData.prefecture} ${calculatedAge}`,
        play_prefecture: formData.play_prefecture, // プレー地域
      };

      console.log("Updating profile for user ID:", currentUserId);
      
      const response = await DataProvider.updateUserProfile(
        currentUserId,
        updateData,
      );

      if (response.error) {
        console.error("Profile update error:", response.error);
        throw new Error(response.error);
      }

      // Invalidate React Query cache to ensure fresh data is fetched
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      await queryClient.invalidateQueries({ queryKey: ['currentUserProfile'] });
      console.log("✅ React Query cache invalidated for profile");

      Alert.alert("保存完了", "プロフィールが正常に更新されました", [
        {
          text: "OK",
          onPress: () => {
            if (isNewUser) {
              // New users: navigate to Main stack (resets navigation)
              navigation.reset({
                index: 0,
                routes: [{ name: "Main" }],
              });
            } else {
              navigation.goBack();
            }
          },
        },
      ]);
    } catch (_error) {
      console.error("Save error:", _error);
      Alert.alert("エラー", "保存に失敗しました。もう一度お試しください。");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (isNewUser) {
      Alert.alert(
        "プロフィールを完成させてください",
        "アプリを使用するには、基本情報の入力が必要です。",
        [{ text: "OK" }]
      );
      return;
    }
    Alert.alert("変更を破棄", "変更内容が失われます。よろしいですか？", [
      { text: "キャンセル", style: "cancel" },
      {
        text: "破棄",
        style: "destructive",
        onPress: () => navigation.goBack(),
      },
    ]);
  };

  const handleBack = () => {
    if (isNewUser) {
      Alert.alert(
        "プロフィールを完成させてください",
        "アプリを使用するには、基本情報の入力が必要です。",
        [{ text: "OK" }]
      );
      return;
    }
    navigation.goBack();
  };

  const renderInputField = (
    label: string,
    field: keyof ProfileFormData,
    placeholder: string,
    multiline = false,
    required = false,
  ) => (
    <View style={styles.inputField}>
      <View style={styles.labelRow}>
        <Text style={styles.inputLabel}>{label}</Text>
        {required && <Text style={styles.requiredIndicator}>*</Text>}
      </View>
      <TextInput
        key={`${field}-${formReady ? 'ready' : 'loading'}`}
        style={[
          styles.textInput,
          multiline && styles.multilineInput,
          required && !formData[field] && styles.requiredInput,
          !formReady && styles.disabledInput,
        ]}
        value={typeof formData[field] === "string" ? formData[field] : ""}
        onChangeText={(value) => handleInputChange(field, value)}
        placeholder={placeholder}
        placeholderTextColor={Colors.gray[400]}
        multiline={multiline}
        numberOfLines={multiline ? 4 : 1}
        textAlignVertical={multiline ? "top" : "center"}
        editable={formReady}
        // IME-friendly settings for Japanese input
        autoCorrect={false}
        spellCheck={false}
      />
    </View>
  );

  const renderInputFieldWithSuffix = (
    label: string,
    field: keyof ProfileFormData,
    placeholder: string,
    suffix: string,
    required = false,
  ) => (
    <View style={styles.inputField}>
      <View style={styles.labelRow}>
        <Text style={styles.inputLabel}>{label}</Text>
        {required && <Text style={styles.requiredIndicator}>*</Text>}
      </View>
      <View style={styles.inputWithSuffixContainer}>
        <TextInput
          key={`${field}-${formReady ? 'ready' : 'loading'}`}
          style={[
            styles.textInputWithSuffix,
            required && !formData[field] && styles.requiredInput,
            !formReady && styles.disabledInput,
          ]}
          value={typeof formData[field] === "string" ? formData[field] : ""}
          onChangeText={(value) => handleInputChange(field, value.replace(/[^0-9]/g, ''))}
          placeholder={placeholder}
          placeholderTextColor={Colors.gray[400]}
          editable={formReady}
          keyboardType="number-pad"
          maxLength={2}
        />
        <Text style={styles.inputSuffix}>{suffix}</Text>
      </View>
    </View>
  );

  const renderSelectField = (
    label: string,
    field: keyof ProfileFormData,
    options: string[],
    required = false,
    displayLabels?: Record<string, string>,
    disabled = false,
  ) => (
    <View style={styles.inputField}>
      <View style={styles.labelRow}>
        <Text style={styles.inputLabel}>{label}</Text>
        {required && <Text style={styles.requiredIndicator}>*</Text>}
        {disabled && (
          <Ionicons name="lock-closed" size={14} color={Colors.gray[400]} style={{ marginLeft: 4 }} />
        )}
      </View>
      <View style={styles.selectContainer}>
        {options.map((option) => {
          const displayText = displayLabels ? (displayLabels[option] || option) : option;
          return (
            <TouchableOpacity
              key={option}
              style={[
                styles.selectOption,
                formData[field] === option && styles.selectedOption,
                required && !formData[field] && styles.requiredSelectOption,
                disabled && styles.disabledOption,
              ]}
              onPress={() => {
                if (disabled) return; // Prevent changes when disabled
                // Double-tap to unselect: if already selected, clear it
                if (formData[field] === option) {
                  handleInputChange(field, "");
                } else {
                  handleInputChange(field, option);
                }
              }}
              activeOpacity={disabled ? 1 : 0.7}
            >
              <Text
                style={[
                  styles.selectOptionText,
                  formData[field] === option && styles.selectedOptionText,
                  disabled && styles.disabledOptionText,
                ]}
              >
                {displayText}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {disabled && (
        <Text style={styles.lockedFieldHint}>本人確認済みのため変更できません</Text>
      )}
      {required && !formData[field] && (
        <Text style={styles.requiredHint}>この項目は必須です</Text>
      )}
    </View>
  );

  // New: Modal picker for long lists (prefecture, personality type)
  const renderModalSelectField = (
    label: string,
    field: keyof ProfileFormData,
    options: string[],
    required = false,
  ) => {
    // For gender modal, show Japanese labels
    const displayValue = field === "gender" && formData[field] 
      ? getGenderDisplayLabel(formData[field])
      : formData[field];
    
    return (
      <View style={styles.inputField}>
        <View style={styles.labelRow}>
          <Text style={styles.inputLabel}>{label}</Text>
          {required && <Text style={styles.requiredIndicator}>*</Text>}
        </View>
        <TouchableOpacity
          style={[
            styles.modalSelectButton,
            required && !formData[field] && styles.requiredSelectButton,
          ]}
          onPress={() => {
            setModalTitle(label);
            setModalOptions(options);
            setModalField(field);
            setModalVisible(true);
          }}
        >
          <Text style={[
            styles.modalSelectText,
            !formData[field] && styles.modalSelectPlaceholder
          ]}>
            {displayValue || `${label}を選択してください`}
          </Text>
          <Ionicons name="chevron-down" size={20} color={Colors.gray[500]} />
        </TouchableOpacity>
        {required && !formData[field] && (
          <Text style={styles.requiredHint}>この項目は必須です</Text>
        )}
      </View>
    );
  };

  const handleModalSelect = (value: string) => {
    if (modalField) {
      // Double-tap to unselect: if already selected, clear it
      if (formData[modalField] === value) {
        handleInputChange(modalField, "");
      } else {
        handleInputChange(modalField, value);
      }
    }
    setModalVisible(false);
  };

  // Multi-select modal field (for play_prefecture - max 3 selections)
  const renderMultiSelectModalField = (
    label: string,
    field: keyof ProfileFormData,
    options: string[],
    maxSelections: number = 3,
  ) => {
    // Ensure selectedValues is always an array (handle null, undefined, or string from old data)
    const rawValue = formData[field];
    const selectedValues: string[] = Array.isArray(rawValue)
      ? rawValue
      : (rawValue ? [rawValue as string] : []);
    const displayText = selectedValues.length > 0
      ? selectedValues.join("、")
      : `${label}を選択してください（最大${maxSelections}つ）`;

    return (
      <View style={styles.inputField}>
        <View style={styles.labelRow}>
          <Text style={styles.inputLabel}>{label}</Text>
          <Text style={styles.optionalHint}>（最大{maxSelections}つ）</Text>
        </View>
        <TouchableOpacity
          style={styles.modalSelectButton}
          onPress={() => {
            setMultiSelectTitle(label);
            setMultiSelectOptions(options);
            setMultiSelectField(field);
            setMultiSelectMax(maxSelections);
            setMultiSelectModalVisible(true);
          }}
        >
          <Text style={[
            styles.modalSelectText,
            selectedValues.length === 0 && styles.modalSelectPlaceholder
          ]}>
            {displayText}
          </Text>
          <Ionicons name="chevron-down" size={20} color={Colors.gray[500]} />
        </TouchableOpacity>
        {selectedValues.length > 0 && (
          <View style={styles.selectedChipsContainer}>
            {selectedValues.map((value) => (
              <View key={value} style={styles.selectedChip}>
                <Text style={styles.selectedChipText}>{value}</Text>
                <TouchableOpacity
                  onPress={() => {
                    const newValues = selectedValues.filter(v => v !== value);
                    handleInputChange(field, newValues);
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close-circle" size={18} color={Colors.gray[500]} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  const handleMultiSelect = (value: string) => {
    if (!multiSelectField) return;

    // Ensure currentValues is always an array (handle null, undefined, or string from old data)
    const rawValue = formData[multiSelectField];
    const currentValues: string[] = Array.isArray(rawValue)
      ? rawValue
      : (rawValue ? [rawValue as string] : []);
    const isSelected = currentValues.includes(value);

    if (isSelected) {
      // Remove from selection
      const newValues = currentValues.filter(v => v !== value);
      handleInputChange(multiSelectField, newValues);
    } else {
      // Add to selection (if under max)
      if (currentValues.length < multiSelectMax) {
        const newValues = [...currentValues, value];
        handleInputChange(multiSelectField, newValues);
      }
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />
        <Loading text="プロフィールを読み込み中..." fullScreen />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} testID="EDIT_PROFILE_SCREEN.ROOT">
      <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />

      {/* Header */}
      <View style={styles.header}>
        {isNewUser ? (
          <View style={styles.backButton}>
            {/* Empty placeholder to maintain header layout */}
          </View>
        ) : (
          <TouchableOpacity
            testID="EDIT_PROFILE_SCREEN.BACK_BTN"
            style={styles.backButton}
            onPress={handleBack}
            accessible
            accessibilityRole="button"
            accessibilityLabel="戻る"
          >
            <Image
              source={require("../../assets/images/Icons/Arrow-LeftGrey.png")}
              style={styles.backIconImage}
              resizeMode="contain"
              fadeDuration={0}
            />
            <Text style={styles.backLabel}>戻る</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.headerTitle}>
          {isNewUser ? "プロフィール設定" : "プロフィール編集"}
        </Text>

        <TouchableOpacity
          testID="EDIT_PROFILE_SCREEN.HEADER_SAVE_BTN"
          style={styles.headerButton}
          onPress={handleSave}
        >
          <Text style={[styles.saveText, saving && styles.savingText]}>
            {saving ? "保存中..." : "保存"}
          </Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
      >
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
          {/* Welcome Message for New Users */}
          {isNewUser && (
            <View>
              <Text style={styles.welcomeText}>
                プロフィールを設定してください。
              </Text>
              <Text style={styles.requiredNote}>* 印は必須項目です</Text>
            </View>
          )}

          {/* Profile Photo Grid (Pairs-style 6-slot) */}
          <View style={styles.photoGridSection}>
            <View style={styles.photoGridHeader}>
              <View style={styles.photoLabelRow}>
                <Text style={styles.photoGridTitle}>プロフィール写真</Text>
                {isNewUser && <Text style={styles.requiredIndicator}>*</Text>}
              </View>
            </View>
            <View style={styles.photoGrid}>
              {/* Top row: Main (large) + 2 side slots */}
              <View style={styles.photoGridTopRow}>
                {/* Main photo slot (slot 0) */}
                <TouchableOpacity
                  style={styles.mainPhotoSlot}
                  onPress={() => handlePhotoSlotPress(0)}
                  activeOpacity={0.7}
                >
                  {formData.profile_pictures[0] && formData.profile_pictures[0] !== "" ? (
                    <>
                      <Image
                        source={{ uri: formData.profile_pictures[0] }}
                        style={styles.photoSlotImage}
                      />
                      <View style={styles.photoSlotEditBadge}>
                        <Ionicons name="pencil" size={14} color={Colors.text.primary} />
                      </View>
                    </>
                  ) : (
                    <View style={[styles.emptyMainPhotoSlot, isNewUser && styles.requiredPhoto]}>
                      <Ionicons name="add-circle" size={36} color={Colors.primary} />
                      <Text style={styles.photoSlotLabel}>{PHOTO_SLOT_LABELS[0]}</Text>
                    </View>
                  )}
                </TouchableOpacity>

                {/* Right column: slots 1 and 2 */}
                <View style={styles.sidePhotoColumn}>
                  {[1, 2].map((slotIndex) => (
                    <TouchableOpacity
                      key={slotIndex}
                      style={styles.sidePhotoSlot}
                      onPress={() => handlePhotoSlotPress(slotIndex)}
                      activeOpacity={0.7}
                    >
                      {formData.profile_pictures[slotIndex] && formData.profile_pictures[slotIndex] !== "" ? (
                        <>
                          <Image
                            source={{ uri: formData.profile_pictures[slotIndex] }}
                            style={styles.photoSlotImage}
                          />
                          <View style={styles.photoSlotEditBadge}>
                            <Ionicons name="pencil" size={12} color={Colors.text.primary} />
                          </View>
                        </>
                      ) : (
                        <View style={styles.emptyPhotoSlot}>
                          <Text style={styles.photoSlotLabel}>{PHOTO_SLOT_LABELS[slotIndex]}</Text>
                          <Ionicons name="add-circle" size={28} color={Colors.primary} />
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Bottom row: slots 3, 4, 5 */}
              <View style={styles.photoGridBottomRow}>
                {[3, 4, 5].map((slotIndex) => (
                  <TouchableOpacity
                    key={slotIndex}
                    style={styles.bottomPhotoSlot}
                    onPress={() => handlePhotoSlotPress(slotIndex)}
                    activeOpacity={0.7}
                  >
                    {formData.profile_pictures[slotIndex] && formData.profile_pictures[slotIndex] !== "" ? (
                      <>
                        <Image
                          source={{ uri: formData.profile_pictures[slotIndex] }}
                          style={styles.photoSlotImage}
                        />
                        <View style={styles.photoSlotEditBadge}>
                          <Ionicons name="pencil" size={12} color={Colors.text.primary} />
                        </View>
                      </>
                    ) : (
                      <View style={styles.emptyPhotoSlot}>
                        <Text style={styles.photoSlotLabel}>{PHOTO_SLOT_LABELS[slotIndex]}</Text>
                        <Ionicons name="add-circle" size={28} color={Colors.primary} />
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          {/* Basic Information */}
          <Card style={styles.sectionCard} shadow="small">
            <Text style={styles.sectionTitle}>基本情報</Text>

            {renderInputField("名前", "name", "名前を入力してください", false, true)}

            {/* Birth Date Picker Field */}
            <View style={styles.inputField}>
              <View style={styles.labelRow}>
                <Text style={styles.inputLabel}>生年月日</Text>
                <Text style={styles.requiredIndicator}>*</Text>
                {isVerified && (
                  <Ionicons name="lock-closed" size={14} color={Colors.gray[400]} style={{ marginLeft: 4 }} />
                )}
              </View>
              <TouchableOpacity
                style={[
                  styles.modalSelectButton,
                  !formData.birth_date && styles.requiredSelectButton,
                  isVerified && styles.disabledModalSelectButton,
                ]}
                onPress={() => {
                  if (!isVerified) {
                    setBirthDatePickerVisible(true);
                  }
                }}
                activeOpacity={isVerified ? 1 : 0.7}
              >
                <Text style={[
                  styles.modalSelectText,
                  !formData.birth_date && styles.modalSelectPlaceholder,
                  isVerified && styles.disabledOptionText,
                ]}>
                  {formData.birth_date
                    ? formatBirthDateJapanese(formData.birth_date)
                    : "生年月日を選択してください"}
                </Text>
                <Ionicons name="calendar-outline" size={20} color={isVerified ? Colors.gray[300] : Colors.gray[500]} />
              </TouchableOpacity>
              {isVerified && (
                <Text style={styles.lockedFieldHint}>本人確認済みのため変更できません</Text>
              )}
              {!isVerified && !formData.birth_date && (
                <Text style={styles.requiredHint}>この項目は必須です</Text>
              )}
            </View>

            {/* Calculated Age Display (read-only) */}
            {formData.birth_date && (
              <View style={styles.inputField}>
                <Text style={styles.inputLabel}>年齢</Text>
                <View style={styles.readOnlyField}>
                  <Text style={styles.readOnlyText}>
                    {calculateAge(formData.birth_date)}歳
                  </Text>
                </View>
              </View>
            )}
            
            {renderSelectField("性別", "gender", [
              "male",
              "female",
            ], true, genderLabels, isVerified)}

            {renderModalSelectField("居住地", "prefecture", [
              "北海道",
              "青森県",
              "岩手県",
              "宮城県",
              "秋田県",
              "山形県",
              "福島県",
              "茨城県",
              "栃木県",
              "群馬県",
              "埼玉県",
              "千葉県",
              "東京都",
              "神奈川県",
              "新潟県",
              "富山県",
              "石川県",
              "福井県",
              "山梨県",
              "長野県",
              "岐阜県",
              "静岡県",
              "愛知県",
              "三重県",
              "滋賀県",
              "京都府",
              "大阪府",
              "兵庫県",
              "奈良県",
              "和歌山県",
              "鳥取県",
              "島根県",
              "岡山県",
              "広島県",
              "山口県",
              "徳島県",
              "香川県",
              "愛媛県",
              "高知県",
              "福岡県",
              "佐賀県",
              "長崎県",
              "熊本県",
              "大分県",
              "宮崎県",
              "鹿児島県",
              "沖縄県",
            ], true)}

            {renderSelectField("血液型", "blood_type", [
              "A型",
              "B型",
              "O型",
              "AB型",
            ])}
            {renderInputField("身長 (cm)", "height", "身長を入力してください")}

            {renderSelectField("体型", "body_type", [
              "やせ型",
              "普通",
              "ぽっちゃり",
              "筋肉質",
            ])}
            {renderSelectField("タバコ", "smoking", [
              "吸わない",
              "吸う",
              "時々吸う",
            ])}
            
            {renderSelectField("好きなクラブ", "favorite_club", [
              "ドライバー",
              "フェアウェイウッド",
              "ユーティリティ",
              "アイアン",
              "ウェッジ",
              "パター",
            ])}
            
            {renderModalSelectField("16 パーソナリティ", "personality_type", [
              "INTJ - 建築家",
              "INTP - 論理学者",
              "ENTJ - 指揮官",
              "ENTP - 討論者",
              "INFJ - 提唱者",
              "INFP - 仲介者",
              "ENFJ - 主人公",
              "ENFP - 広報運動家",
              "ISTJ - 管理者",
              "ISFJ - 擁護者",
              "ESTJ - 幹部",
              "ESFJ - 領事官",
              "ISTP - 職人",
              "ISFP - 冒険家",
              "ESTP - 起業家",
              "ESFP - エンターテイナー",
            ])}
          </Card>

          {/* Golf Profile */}
          <Card style={styles.sectionCard} shadow="small">
            <Text style={styles.sectionTitle}>ゴルフプロフィール</Text>

            {renderInputFieldWithSuffix("ゴルフ歴", "golf_experience", "例: 2", "年")}

            {renderSelectField("ゴルフレベル", "golf_skill_level", [
              "ビギナー",
              "中級者",
              "上級者",
              "プロ",
            ])}
            {/* Note: Values match database constraint (Japanese) */}

            {renderInputField("平均スコア", "average_score", "例: 120-130台")}
            {renderInputField("ベストスコア", "best_score", "例: 88")}

            {renderSelectField("移動手段", "transportation", [
              "送迎不要",
              "送迎希望",
              "どちらでも可",
            ])}

            {renderSelectField("ラウンド可能日", "available_days", [
              "平日",
              "週末",
              "不定期",
              "いつでも",
            ])}

            {renderMultiSelectModalField("プレー地域", "play_prefecture", [
              "北海道",
              "青森県",
              "岩手県",
              "宮城県",
              "秋田県",
              "山形県",
              "福島県",
              "茨城県",
              "栃木県",
              "群馬県",
              "埼玉県",
              "千葉県",
              "東京都",
              "神奈川県",
              "新潟県",
              "富山県",
              "石川県",
              "福井県",
              "山梨県",
              "長野県",
              "岐阜県",
              "静岡県",
              "愛知県",
              "三重県",
              "滋賀県",
              "京都府",
              "大阪府",
              "兵庫県",
              "奈良県",
              "和歌山県",
              "鳥取県",
              "島根県",
              "岡山県",
              "広島県",
              "山口県",
              "徳島県",
              "香川県",
              "愛媛県",
              "高知県",
              "福岡県",
              "佐賀県",
              "長崎県",
              "熊本県",
              "大分県",
              "宮崎県",
              "鹿児島県",
              "沖縄県",
            ], 3)}
          </Card>

          {/* Bio Section */}
          <Card style={styles.sectionCard} shadow="small">
            <Text style={styles.sectionTitle}>自己紹介</Text>
            <TouchableOpacity
              style={styles.bioPreview}
              onPress={() => setBioEditorVisible(true)}
              activeOpacity={0.7}
            >
              <Text
                style={formData.bio ? styles.bioPreviewText : styles.bioPreviewPlaceholder}
                numberOfLines={4}
              >
                {formData.bio || 'あなたについて教えてください...'}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
            </TouchableOpacity>
          </Card>

          <View style={styles.actionButtons}>
            <Button
              testID="EDIT_PROFILE_SCREEN.SAVE_BTN"
              title={isNewUser ? "プロフィールを保存して始める" : "保存"}
              onPress={handleSave}
              variant="primary"
              size="large"
              loading={saving}
              fullWidth
            />

            {!isNewUser && (
              <Button
                testID="EDIT_PROFILE_SCREEN.CANCEL_BOTTOM_BTN"
                title="キャンセル"
                onPress={handleCancel}
                variant="outline"
                size="large"
                fullWidth
                style={styles.cancelButton}
              />
            )}
          </View>
          <View style={{ height: 300 }} />
      </ScrollView>
      </KeyboardAvoidingView>

        {/* Modal Picker for Long Lists */}
        <Modal
          visible={modalVisible}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{modalTitle}</Text>
                <TouchableOpacity
                  onPress={() => setModalVisible(false)}
                  style={styles.modalCloseButton}
                >
                  <Ionicons name="close" size={24} color={Colors.text.primary} />
                </TouchableOpacity>
              </View>
              
              <FlatList
                data={modalOptions}
                keyExtractor={(item) => item}
                renderItem={({ item }) => {
                  // Show Japanese labels for gender options in modal
                  const displayText = modalField === "gender" 
                    ? getGenderDisplayLabel(item)
                    : item;
                  
                  return (
                    <TouchableOpacity
                      style={[
                        styles.modalOption,
                        modalField && formData[modalField] === item && styles.modalOptionSelected,
                      ]}
                      onPress={() => handleModalSelect(item)}
                    >
                      <Text
                        style={[
                          styles.modalOptionText,
                          modalField && formData[modalField] === item && styles.modalOptionTextSelected,
                        ]}
                      >
                        {displayText}
                      </Text>
                      {modalField && formData[modalField] === item && (
                        <Ionicons name="checkmark" size={20} color={Colors.primary} />
                      )}
                    </TouchableOpacity>
                  );
                }}
                showsVerticalScrollIndicator={true}
              />
            </View>
          </View>
        </Modal>

        {/* Multi-Select Modal (for play_prefecture) */}
        <Modal
          visible={multiSelectModalVisible}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setMultiSelectModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{multiSelectTitle}</Text>
                <TouchableOpacity
                  onPress={() => setMultiSelectModalVisible(false)}
                  style={styles.modalCloseButton}
                >
                  <Ionicons name="close" size={24} color={Colors.text.primary} />
                </TouchableOpacity>
              </View>

              {/* Selection count indicator */}
              <View style={styles.multiSelectHeader}>
                <Text style={styles.multiSelectCount}>
                  {(() => {
                    const raw = formData[multiSelectField as keyof ProfileFormData];
                    return Array.isArray(raw) ? raw.length : (raw ? 1 : 0);
                  })()} / {multiSelectMax} 選択中
                </Text>
              </View>

              <FlatList
                data={multiSelectOptions}
                keyExtractor={(item) => item}
                renderItem={({ item }) => {
                  // Ensure selectedValues is always an array
                  const rawValue = formData[multiSelectField as keyof ProfileFormData];
                  const selectedValues: string[] = Array.isArray(rawValue)
                    ? rawValue
                    : (rawValue ? [rawValue as string] : []);
                  const isSelected = selectedValues.includes(item);
                  const isDisabled = !isSelected && selectedValues.length >= multiSelectMax;

                  return (
                    <TouchableOpacity
                      style={[
                        styles.modalOption,
                        isSelected && styles.modalOptionSelected,
                        isDisabled && styles.modalOptionDisabled,
                      ]}
                      onPress={() => !isDisabled && handleMultiSelect(item)}
                      activeOpacity={isDisabled ? 1 : 0.7}
                    >
                      <Text
                        style={[
                          styles.modalOptionText,
                          isSelected && styles.modalOptionTextSelected,
                          isDisabled && styles.modalOptionTextDisabled,
                        ]}
                      >
                        {item}
                      </Text>
                      {isSelected && (
                        <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />
                      )}
                      {!isSelected && !isDisabled && (
                        <Ionicons name="ellipse-outline" size={22} color={Colors.gray[300]} />
                      )}
                    </TouchableOpacity>
                  );
                }}
                showsVerticalScrollIndicator={true}
              />

              {/* Done button */}
              <View style={styles.multiSelectFooter}>
                <TouchableOpacity
                  style={styles.multiSelectDoneButton}
                  onPress={() => setMultiSelectModalVisible(false)}
                >
                  <Text style={styles.multiSelectDoneText}>完了</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Birth Date Picker Modal */}
        <BirthDatePicker
          visible={birthDatePickerVisible}
          selectedDate={formData.birth_date || undefined}
          onClose={() => setBirthDatePickerVisible(false)}
          onApply={(date) => handleInputChange("birth_date", date)}
        />

        {/* Bio Full-Screen Editor */}
        <FullScreenTextEditor
          visible={bioEditorVisible}
          title="自己紹介"
          placeholder="あなたについて教えてください..."
          value={formData.bio}
          maxLength={1000}
          onSave={(text) => handleInputChange("bio", text)}
          onClose={() => setBioEditorVisible(false)}
        />
      </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    minHeight: 44,
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    textAlign: "center",
  },
  saveText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.primary,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginLeft: -Spacing.sm,
    minHeight: 44,
  },
  backIconImage: {
    width: 18,
    height: 18,
  },
  backLabel: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.primary,
    marginLeft: Spacing.xs,
  },
  savingText: {
    color: Colors.gray[500],
  },
  scrollView: {
    flex: 1,
  },
  photoGridSection: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  photoGridHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  photoGridTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
  },
  photoGrid: {
    gap: Spacing.sm,
  },
  photoGridTopRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    height: (Dimensions.get("window").width - Spacing.md * 2 - Spacing.sm) * 0.6 * (4 / 3),
  },
  photoGridBottomRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    height: (Dimensions.get("window").width - Spacing.md * 2 - Spacing.sm * 2) / 3 * (4 / 3),
  },
  mainPhotoSlot: {
    flex: 6,
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
  },
  sidePhotoColumn: {
    flex: 4,
    gap: Spacing.sm,
  },
  sidePhotoSlot: {
    flex: 1,
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
  },
  bottomPhotoSlot: {
    flex: 1,
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
  },
  photoSlotImage: {
    width: "100%",
    height: "100%",
    borderRadius: BorderRadius.xl,
  },
  emptyMainPhotoSlot: {
    flex: 1,
    borderRadius: BorderRadius.xl,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8F5F4",
    gap: Spacing.xs,
  },
  emptyPhotoSlot: {
    flex: 1,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: Colors.gray[300],
    borderRadius: BorderRadius.xl,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.white,
    gap: Spacing.sm,
  },
  photoSlotLabel: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.gray[500],
    textAlign: "center",
  },
  photoSlotEditBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.full,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  requiredPhoto: {
    borderColor: Colors.primary,
    borderWidth: 2,
  },
  photoLabelRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  sectionCard: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    marginBottom: Spacing.lg,
  },
  inputField: {
    marginBottom: Spacing.lg,
  },
  inputLabel: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
    color: Colors.text.primary,
    marginBottom: Spacing.sm,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  requiredIndicator: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.error,
    marginLeft: Spacing.xs,
  },
  requiredHint: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.error,
    marginTop: Spacing.xs,
  },
  lockedFieldHint: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.gray[500],
    marginTop: Spacing.xs,
  },
  disabledOption: {
    backgroundColor: Colors.gray[100],
    borderColor: Colors.gray[200],
    opacity: 0.7,
  },
  disabledOptionText: {
    color: Colors.gray[400],
  },
  disabledModalSelectButton: {
    backgroundColor: Colors.gray[100],
    borderColor: Colors.gray[200],
  },
  requiredInput: {
    borderColor: Colors.error,
  },
  requiredSelectOption: {
    borderColor: Colors.error,
  },
  requiredSelectButton: {
    borderColor: Colors.error,
  },
  textInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.primary,
    backgroundColor: Colors.white,
  },
  inputWithSuffixContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  textInputWithSuffix: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.primary,
    backgroundColor: Colors.white,
    maxWidth: 100,
  },
  inputSuffix: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.primary,
    marginLeft: Spacing.sm,
  },
  disabledInput: {
    backgroundColor: Colors.gray[50],
    color: Colors.gray[400],
  },
  multilineInput: {
    height: 100,
    paddingTop: Spacing.sm,
  },
  bioPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    minHeight: 100,
  },
  bioPreviewText: {
    flex: 1,
    fontSize: Typography.fontSize.base,
    color: Colors.text.primary,
    lineHeight: 22,
  },
  bioPreviewPlaceholder: {
    flex: 1,
    fontSize: Typography.fontSize.base,
    color: Colors.gray[400],
    lineHeight: 22,
  },
  selectContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  selectOption: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  selectedOption: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  selectOptionText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.primary,
  },
  selectedOptionText: {
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
    color: Colors.white,
  },
  actionButtons: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  cancelButton: {
    marginTop: Spacing.md,
  },
  // Welcome text for new users
  welcomeText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  requiredNote: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.error,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  // Modal select field styles
  modalSelectButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.white,
  },
  modalSelectText: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.primary,
    flex: 1,
  },
  modalSelectPlaceholder: {
    color: Colors.gray[400],
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
  },
  modalCloseButton: {
    padding: Spacing.xs,
  },
  modalOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalOptionSelected: {
    backgroundColor: Colors.primary + "10", // 10% opacity
  },
  modalOptionText: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.primary,
    flex: 1,
  },
  modalOptionTextSelected: {
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
    color: Colors.primary,
  },
  // Read-only field styles for calculated age
  readOnlyField: {
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  readOnlyText: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
  },
  // Multi-select styles
  optionalHint: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.gray[500],
    marginLeft: Spacing.xs,
  },
  selectedChipsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  selectedChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    gap: Spacing.xs,
  },
  selectedChipText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.primary,
  },
  multiSelectHeader: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.gray[50],
  },
  multiSelectCount: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.gray[600],
  },
  multiSelectFooter: {
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  multiSelectDoneButton: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  multiSelectDoneText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.white,
  },
  modalOptionDisabled: {
    backgroundColor: Colors.gray[50],
    opacity: 0.6,
  },
  modalOptionTextDisabled: {
    color: Colors.gray[400],
  },
});

export default EditProfileScreen;
