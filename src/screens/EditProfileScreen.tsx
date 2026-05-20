import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  TouchableOpacity,
  Image,
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
import EditableRow from "../components/EditableRow";
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

// Centralized option lists. Used to be inline literals scattered through
// the JSX of renderSelectField / renderModalSelectField calls; pulled up
// here so the row-based pattern reads cleanly and the lists are reusable.
const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
  "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho",
  "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana",
  "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
  "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
  "New Hampshire", "New Jersey", "New Mexico", "New York",
  "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon",
  "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
  "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
  "West Virginia", "Wisconsin", "Wyoming", "Washington, D.C.",
];
const BLOOD_TYPES = ["A", "B", "O", "AB"];
const BODY_TYPES = ["Slim", "Average", "Curvy", "Athletic"];
const SMOKING_OPTIONS = ["Non-smoker", "Smoker", "Occasionally"];
const FAVORITE_CLUBS = ["Driver", "Fairway Wood", "Hybrid", "Iron", "Wedge", "Putter"];
const PERSONALITY_TYPES = [
  "INTJ - Architect", "INTP - Logician", "ENTJ - Commander", "ENTP - Debater",
  "INFJ - Advocate", "INFP - Mediator", "ENFJ - Protagonist", "ENFP - Campaigner",
  "ISTJ - Logistician", "ISFJ - Defender", "ESTJ - Executive", "ESFJ - Consul",
  "ISTP - Virtuoso", "ISFP - Adventurer", "ESTP - Entrepreneur", "ESFP - Entertainer",
];
const SKILL_LEVELS = ["Beginner", "Intermediate", "Advanced", "Pro"];
const TRANSPORTATION_OPTIONS = ["I'll drive myself", "Need a ride", "Either works"];
const AVAILABLE_DAYS_OPTIONS = ["Weekdays", "Weekends", "Flexible", "Anytime"];
const GENDER_OPTIONS = ["male", "female"];

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
  const [isVerified, setIsVerified] = useState(false); // Track if user is verified
  const [bioEditorVisible, setBioEditorVisible] = useState(false);
  // Text-editor modal state. Powers the row-based pattern for short text /
  // numeric fields (Name, Height, Average Score, Years Playing, Best Score).
  // Bio still uses its dedicated full-screen editor because the Bio
  // surface area is much larger and benefits from a longer-form layout.
  const [textEditorField, setTextEditorField] = useState<keyof ProfileFormData | null>(null);
  const [textEditorConfig, setTextEditorConfig] = useState<{
    title: string;
    placeholder: string;
    multiline?: boolean;
    keyboardType?: "default" | "number-pad" | "decimal-pad";
    maxLength?: number;
  }>({ title: "", placeholder: "" });
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
            "Finish Your Profile",
            "Please fill in the basic info before using the app.",
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
        play_prefecture: (profile as any).play_prefecture || [], // Where the user typically plays (max 3)
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

      // Check if user is verified
      setIsVerified(profile.status?.is_verified === true);

      // Check if this is a new user (essential fields not filled)
      const hasName = !!currentProfile.name.trim();
      // Check for birth_date (preferred) or fall back to old age field for backward compatibility
      const hasBirthDate = !!currentProfile.birth_date;
      const hasAge = hasBirthDate || (!!currentProfile.age.trim() && parseInt(currentProfile.age) > 0);
      const hasGender = !!currentProfile.gender.trim();
      const hasPrefecture = !!currentProfile.prefecture.trim() && currentProfile.prefecture !== 'Not set';

      const isNewUserSetup = !hasName || !hasAge || !hasGender || !hasPrefecture;
      setIsNewUser(isNewUserSetup);
    } catch (_error) {
      console.error("Error loading profile:", _error);
      formLoadedRef.current = true; // Still mark as loaded even on error
      setIsNewUser(true); // Treat as new user on error
    } finally {
      setLoading(false);
      // Wait for UI to settle before allowing input - prevents IME crashes
      // This ensures the form is fully rendered before user can interact
      InteractionManager.runAfterInteractions(() => {
        setFormReady(true);
      });
    }
  };

  // Gender mapping for display
  const genderLabels: Record<string, string> = {
    male: "Male",
    female: "Female",
  };

  const getGenderDisplayLabel = (value: string): string => {
    return genderLabels[value] || value;
  };

  // Use useCallback to prevent recreation of handler on each render
  // This helps prevent IME crashes by keeping stable references
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
    "Main",
    "Golf Course",
    "Swing",
    "Putting",
    "Golf Outfit",
    "Hobby",
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
        Alert.alert("Error", "Camera access is required");
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
      Alert.alert("Error", "Failed to take photo");
    }
  };

  const openImageLibraryForSlot = async (slotIndex: number) => {
    try {
      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (permissionResult.granted === false) {
        Alert.alert("Error", "Photo library access is required");
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
      Alert.alert("Error", "Failed to choose photo");
    }
  };

  const showPickerForSlot = (slotIndex: number) => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Cancel", "Take Photo", "Choose from Library"],
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
      Alert.alert("Choose Photo", "How would you like to add a photo?", [
        { text: "Cancel", style: "cancel" },
        { text: "Take Photo", onPress: () => openCameraForSlot(slotIndex) },
        { text: "Choose from Library", onPress: () => openImageLibraryForSlot(slotIndex) },
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
            options: ["Cancel", "Change Photo", "Delete Photo"],
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
        Alert.alert("Photo Options", "Choose an action", [
          { text: "Cancel", style: "cancel" },
          { text: "Change Photo", onPress: () => showPickerForSlot(slotIndex) },
          { text: "Delete Photo", style: "destructive", onPress: () => removePhotoAtSlot(slotIndex) },
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
      missingFields.push("Main Profile Photo");
    }

    if (!formData.name.trim()) {
      missingFields.push("Name");
    }

    // Require birth_date for all users
    if (!formData.birth_date) {
      missingFields.push("Date of Birth");
    }

    if (!formData.gender.trim()) {
      missingFields.push("Gender");
    }

    if (!formData.prefecture.trim()) {
      missingFields.push("Location");
    }

    if (missingFields.length > 0) {
      Alert.alert(
        "Required Fields Missing",
        `Please fill in:\n${missingFields.join(", ")}`,
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
              Alert.alert("Error", `Failed to upload image ${i + 1}: ${error}`);
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
            Alert.alert("Error", `Something went wrong while uploading images`);
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
          skill_level: formData.golf_skill_level,
          average_score: formData.average_score,
          best_score: formData.best_score,
          transportation: formData.transportation,
          available_days: formData.available_days,
        },
        bio: formData.bio,
        profile_pictures: uploadedProfilePictures, // Use uploaded URLs instead of local paths
        status: "active",
        location: `${formData.prefecture} ${calculatedAge}`,
        play_prefecture: formData.play_prefecture, // Where the user typically plays
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

      Alert.alert("Saved", "Your profile has been updated.", [
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
      Alert.alert("Error", "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (isNewUser) {
      Alert.alert(
        "Finish Your Profile",
        "Please fill in the basic info before using the app.",
        [{ text: "OK" }]
      );
      return;
    }
    Alert.alert("Discard Changes?", "Your changes will be lost. Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: () => navigation.goBack(),
      },
    ]);
  };

  const handleBack = () => {
    // Onboarding now gates required fields, so EditProfile is always
    // exitable — just pop the stack, or fall back to Main if there's
    // nothing to pop.
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate("Main");
    }
  };

  // ============================================================
  // Row-based editing helpers (Tier 1 UX pattern, 2026-05-20).
  //
  // Replaces the inline chip-selects / bordered inputs / etc. with a
  // scannable list of rows; each row's onPress opens a focused editor.
  // ============================================================

  const openTextEditor = (
    field: keyof ProfileFormData,
    config: {
      title: string;
      placeholder: string;
      multiline?: boolean;
      keyboardType?: "default" | "number-pad" | "decimal-pad";
      maxLength?: number;
    },
  ) => {
    setTextEditorConfig(config);
    setTextEditorField(field);
  };

  const openListPicker = (
    field: keyof ProfileFormData,
    label: string,
    options: string[],
  ) => {
    setModalTitle(label);
    setModalOptions(options);
    setModalField(field);
    setModalVisible(true);
  };

  const openMultiSelectPicker = (
    field: keyof ProfileFormData,
    label: string,
    options: string[],
    max: number = 3,
  ) => {
    setMultiSelectTitle(label);
    setMultiSelectOptions(options);
    setMultiSelectField(field);
    setMultiSelectMax(max);
    setMultiSelectModalVisible(true);
  };

  /**
   * Returns the user-facing display string for a row's `value` prop.
   * Empty string means "no value yet" (row shows the placeholder).
   * Knows about per-field formatting: gender label, birth date format,
   * multi-select join, numeric suffixes like "cm" / "yrs".
   */
  const getRowDisplayValue = (field: keyof ProfileFormData): string => {
    const raw = formData[field];
    if (field === "gender" && typeof raw === "string" && raw) {
      return getGenderDisplayLabel(raw);
    }
    if (field === "birth_date" && typeof raw === "string" && raw) {
      return formatBirthDateJapanese(raw);
    }
    if (field === "play_prefecture") {
      const arr = Array.isArray(raw) ? raw : raw ? [raw as string] : [];
      return arr.length === 0 ? "" : arr.join(", ");
    }
    if (field === "height" && typeof raw === "string" && raw) {
      return `${raw} cm`;
    }
    if (field === "golf_experience" && typeof raw === "string" && raw) {
      return `${raw} yrs`;
    }
    if (typeof raw === "string") return raw;
    return "";
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
        <Loading text="Loading profile..." fullScreen />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} testID="EDIT_PROFILE_SCREEN.ROOT">
      <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          testID="EDIT_PROFILE_SCREEN.BACK_BTN"
          style={styles.backButton}
          onPress={handleBack}
          accessible
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Image
            source={require("../../assets/images/Icons/Arrow-LeftGrey.png")}
            style={styles.backIconImage}
            resizeMode="contain"
            fadeDuration={0}
          />
          <Text style={styles.backLabel}>Back</Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle}>
          {isNewUser ? "Set Up Profile" : "Edit Profile"}
        </Text>

        <TouchableOpacity
          testID="EDIT_PROFILE_SCREEN.HEADER_SAVE_BTN"
          style={styles.headerButton}
          onPress={handleSave}
        >
          <Text style={[styles.saveText, saving && styles.savingText]}>
            {saving ? "Saving..." : "Save"}
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
                Let's set up your profile.
              </Text>
              <Text style={styles.requiredNote}>* Required</Text>
            </View>
          )}

          {/* Profile Photo Grid (Pairs-style 6-slot) */}
          <View style={styles.photoGridSection}>
            <View style={styles.photoGridHeader}>
              <View style={styles.photoLabelRow}>
                <Text style={styles.photoGridTitle}>Profile Photos</Text>
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

          {/* Basic Information — row-based: each field is a single line
              showing label + value, tap opens a focused editor. */}
          <Card style={styles.sectionCard} shadow="small">
            <Text style={styles.sectionTitle}>Basic Info</Text>

            <EditableRow
              label="Name"
              value={formData.name}
              placeholder="Add your name"
              required
              onPress={() => openTextEditor("name", {
                title: "Name",
                placeholder: "Your name",
                multiline: false,
                maxLength: 60,
              })}
            />

            <EditableRow
              label="Date of Birth"
              value={getRowDisplayValue("birth_date")}
              placeholder="Select your birthday"
              required
              locked={isVerified}
              hint={isVerified ? "Can't be changed after verification" : undefined}
              onPress={() => setBirthDatePickerVisible(true)}
            />

            {/* Calculated Age (computed from birth_date, not editable) */}
            {formData.birth_date && (
              <EditableRow
                label="Age"
                value={`${calculateAge(formData.birth_date)} years old`}
                locked
                showCompleted={false}
              />
            )}

            <EditableRow
              label="Gender"
              value={getRowDisplayValue("gender")}
              placeholder="Select gender"
              required
              locked={isVerified}
              hint={isVerified ? "Can't be changed after verification" : undefined}
              onPress={() => openListPicker("gender", "Gender", GENDER_OPTIONS)}
            />

            <EditableRow
              label="State"
              value={getRowDisplayValue("prefecture")}
              placeholder="Select your state"
              required
              onPress={() => openListPicker("prefecture", "State", US_STATES)}
            />

            <EditableRow
              label="Blood Type"
              value={getRowDisplayValue("blood_type")}
              onPress={() => openListPicker("blood_type", "Blood Type", BLOOD_TYPES)}
            />

            <EditableRow
              label="Height"
              value={getRowDisplayValue("height")}
              placeholder="Add your height"
              onPress={() => openTextEditor("height", {
                title: "Height (cm)",
                placeholder: "e.g. 175",
                multiline: false,
                keyboardType: "number-pad",
                maxLength: 3,
              })}
            />

            <EditableRow
              label="Body Type"
              value={getRowDisplayValue("body_type")}
              onPress={() => openListPicker("body_type", "Body Type", BODY_TYPES)}
            />

            <EditableRow
              label="Smoking"
              value={getRowDisplayValue("smoking")}
              onPress={() => openListPicker("smoking", "Smoking", SMOKING_OPTIONS)}
            />

            <EditableRow
              label="Favorite Club"
              value={getRowDisplayValue("favorite_club")}
              onPress={() => openListPicker("favorite_club", "Favorite Club", FAVORITE_CLUBS)}
            />

            <EditableRow
              label="Personality"
              value={getRowDisplayValue("personality_type")}
              onPress={() => openListPicker("personality_type", "16 Personalities", PERSONALITY_TYPES)}
            />
          </Card>

          {/* Golf Profile — same row pattern. */}
          <Card style={styles.sectionCard} shadow="small">
            <Text style={styles.sectionTitle}>Golf Profile</Text>

            <EditableRow
              label="Years Playing"
              value={getRowDisplayValue("golf_experience")}
              placeholder="Add years"
              onPress={() => openTextEditor("golf_experience", {
                title: "Years Playing",
                placeholder: "e.g. 5",
                multiline: false,
                keyboardType: "number-pad",
                maxLength: 2,
              })}
            />

            <EditableRow
              label="Skill Level"
              value={getRowDisplayValue("golf_skill_level")}
              onPress={() => openListPicker("golf_skill_level", "Skill Level", SKILL_LEVELS)}
            />

            <EditableRow
              label="Average Score"
              value={getRowDisplayValue("average_score")}
              placeholder="e.g. 120-130"
              onPress={() => openTextEditor("average_score", {
                title: "Average Score",
                placeholder: "e.g. 120-130",
                multiline: false,
                maxLength: 10,
              })}
            />

            <EditableRow
              label="Best Score"
              value={getRowDisplayValue("best_score")}
              placeholder="e.g. 88"
              onPress={() => openTextEditor("best_score", {
                title: "Best Score",
                placeholder: "e.g. 88",
                multiline: false,
                keyboardType: "number-pad",
                maxLength: 3,
              })}
            />

            <EditableRow
              label="Transportation"
              value={getRowDisplayValue("transportation")}
              onPress={() => openListPicker("transportation", "Transportation", TRANSPORTATION_OPTIONS)}
            />

            <EditableRow
              label="Available Days"
              value={getRowDisplayValue("available_days")}
              onPress={() => openListPicker("available_days", "Available Days", AVAILABLE_DAYS_OPTIONS)}
            />

            <EditableRow
              label="Where I Play"
              value={getRowDisplayValue("play_prefecture")}
              placeholder="Pick up to 3 states"
              onPress={() => openMultiSelectPicker("play_prefecture", "Where I Play", US_STATES, 3)}
            />
          </Card>

          {/* Bio Section */}
          <Card style={styles.sectionCard} shadow="small">
            <Text style={styles.sectionTitle}>About Me</Text>
            <TouchableOpacity
              style={styles.bioPreview}
              onPress={() => setBioEditorVisible(true)}
              activeOpacity={0.7}
            >
              <Text
                style={formData.bio ? styles.bioPreviewText : styles.bioPreviewPlaceholder}
                numberOfLines={4}
              >
                {formData.bio || 'Tell us a little about yourself...'}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
            </TouchableOpacity>
          </Card>

          <View style={styles.actionButtons}>
            <Button
              testID="EDIT_PROFILE_SCREEN.SAVE_BTN"
              title={isNewUser ? "Save and Get Started" : "Save"}
              onPress={handleSave}
              variant="primary"
              size="large"
              loading={saving}
              fullWidth
            />

            {!isNewUser && (
              <Button
                testID="EDIT_PROFILE_SCREEN.CANCEL_BOTTOM_BTN"
                title="Cancel"
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
                  // Show display labels for gender options in modal
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
                  })()} / {multiSelectMax} selected
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
                  <Text style={styles.multiSelectDoneText}>Done</Text>
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
          title="About Me"
          placeholder="Tell us a little about yourself..."
          value={formData.bio}
          maxLength={1000}
          onSave={(text) => handleInputChange("bio", text)}
          onClose={() => setBioEditorVisible(false)}
        />

        {/* Generic Text Editor — drives Name / Height / Score rows.
            One instance reads its config from `textEditorConfig` state so
            we don't need a separate modal per field. */}
        <FullScreenTextEditor
          visible={textEditorField !== null}
          title={textEditorConfig.title}
          placeholder={textEditorConfig.placeholder}
          value={
            textEditorField && typeof formData[textEditorField] === "string"
              ? (formData[textEditorField] as string)
              : ""
          }
          maxLength={textEditorConfig.maxLength}
          multiline={textEditorConfig.multiline}
          keyboardType={textEditorConfig.keyboardType}
          onSave={(text) => {
            if (textEditorField) {
              // For number-pad fields, strip any non-digits the keyboard
              // somehow let through (paste, autofill).
              const clean = textEditorConfig.keyboardType === "number-pad"
                ? text.replace(/[^0-9]/g, "")
                : text;
              handleInputChange(textEditorField, clean);
            }
          }}
          onClose={() => setTextEditorField(null)}
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
    marginBottom: Spacing.md,
  },
  inputField: {
    marginBottom: Spacing.md,
  },
  inputLabel: {
    // Smaller, semibold, slightly muted — labels announce the field without
    // shouting. Matches modern dating-app field-list density (Hinge / Bumble).
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.gray[700],
    marginBottom: Spacing.xs,
    letterSpacing: 0.1,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  requiredIndicator: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.error,
    marginLeft: Spacing.xs,
  },
  // Inline required hint kept in styles for compatibility but no longer
  // rendered by renderXxx helpers — the asterisk + save-time alert give
  // unambiguous feedback without firing red text the moment the screen
  // opens (which framed pristine fields as "errored").
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
    marginLeft: Spacing.xs,
  },
  disabledOption: {
    backgroundColor: Colors.gray[100],
    opacity: 0.6,
  },
  // Locked-and-selected: kept clearly visible (it's the user's actual
  // chosen value, just not editable). Muted teal communicates "selected
  // but locked" without making the chip disappear.
  disabledSelectedOption: {
    backgroundColor: Colors.primaryDark,
    opacity: 0.85,
  },
  disabledOptionText: {
    color: Colors.gray[400],
  },
  disabledModalSelectButton: {
    backgroundColor: Colors.gray[100],
  },
  // requiredInput / requiredSelectOption / requiredSelectButton removed:
  // they fired red borders on every pristine required field at screen
  // open, which framed the form as already-broken. Validation now lives
  // in the save handler (handleSave alert at line ~409) where it belongs.
  textInput: {
    // Filled style — no border by default. Matches the soft, photo-grid
    // feel of the top of this screen and reads as one continuous design
    // language instead of "photo grid + 1990s form fields".
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.primary,
    // Transparent border placeholder keeps height stable if a focus
    // border ever gets added (currently RN's TextInput doesn't support
    // :focus styling directly without state).
    borderWidth: 1,
    borderColor: "transparent",
  },
  inputWithSuffixContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  textInputWithSuffix: {
    flex: 1,
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.primary,
    maxWidth: 100,
    borderWidth: 1,
    borderColor: "transparent",
  },
  inputSuffix: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    marginLeft: Spacing.sm,
  },
  disabledInput: {
    backgroundColor: Colors.gray[100],
    color: Colors.gray[400],
  },
  multilineInput: {
    minHeight: 120,
    paddingTop: 14,
    textAlignVertical: "top",
  },
  bioPreview: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    minHeight: 120,
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
    // Filled gray pill by default; brand color when selected. No outer
    // border — matches the soft filled-input language. Bigger horizontal
    // padding for easier tap (was 16/8, now 18/10).
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[100],
  },
  selectedOption: {
    backgroundColor: Colors.primary,
  },
  selectOptionText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
    color: Colors.gray[700],
  },
  selectedOptionText: {
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
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
  // Modal select field styles — filled "settings-row" feel; reads as
  // tappable native list item rather than a faux-input rectangle.
  modalSelectButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    backgroundColor: Colors.gray[50],
    borderWidth: 1,
    borderColor: "transparent",
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
