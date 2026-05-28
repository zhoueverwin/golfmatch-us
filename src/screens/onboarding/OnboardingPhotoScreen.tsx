import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { decode } from "base64-arraybuffer";
import { useNavigation, CommonActions } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import OnboardingShell from "./OnboardingShell";
import { Colors } from "../../constants/colors";
import { Typography } from "../../constants/typography";
import { Spacing, BorderRadius } from "../../constants/spacing";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../services/supabase";
import CacheService from "../../services/cacheService";
import { logOnboardingStepCompleted } from "../../services/firebaseAnalytics";
import { RootStackParamList } from "../../types";

type Nav = StackNavigationProp<RootStackParamList, "OnboardingPhoto">;

const BUCKET = "profile-pictures";

const OnboardingPhotoScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { profileId, user, userProfile } = useAuth();
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  // Tracks which picker is currently requesting OS permission, so we can
  // (a) show "Requesting permission..." text and (b) block double-taps while
  // the iOS system dialog is on screen.
  const [requestingPerm, setRequestingPerm] = useState<
    "library" | "camera" | null
  >(null);

  const pickFromLibrary = async () => {
    if (requestingPerm) return;
    setRequestingPerm("library");
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Photos permission needed",
          "Grant photo library access in Settings to choose a photo.",
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.85,
      });
      if (!result.canceled && result.assets[0]) {
        setLocalUri(result.assets[0].uri);
      }
    } finally {
      setRequestingPerm(null);
    }
  };

  const takePhoto = async () => {
    if (requestingPerm) return;
    setRequestingPerm("camera");
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Camera permission needed",
          "Grant camera access in Settings to take a photo.",
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.85,
      });
      if (!result.canceled && result.assets[0]) {
        setLocalUri(result.assets[0].uri);
      }
    } finally {
      setRequestingPerm(null);
    }
  };

  const uploadAndSave = async (uri: string): Promise<boolean> => {
    if (!profileId || !user?.id) return false;
    setUploading(true);
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const arrayBuffer = decode(base64);
      const ext = (uri.split(".").pop() || "jpg").toLowerCase();
      const path = `${user.id}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, arrayBuffer, {
          contentType: `image/${ext === "jpg" ? "jpeg" : ext}`,
          cacheControl: "3600",
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from(BUCKET).getPublicUrl(path);

      setSaving(true);
      const { error: dbError } = await supabase
        .from("profiles")
        .update({
          profile_pictures: [publicUrl],
          updated_at: new Date().toISOString(),
        })
        .eq("id", profileId);
      if (dbError) throw dbError;

      // Invalidate every cache layer that holds profile data so MyPage,
      // EditProfile, Discover all pick up the new photo on next render.
      // Two distinct cache keys exist: `user_${id}` (User shape, read by
      // DataProvider.getUser) and `user_profile_${id}` (UserProfile shape,
      // read by MyPage via DataProvider.getUserProfile). Clear both.
      await Promise.all([
        CacheService.remove(`user_${profileId}`),
        CacheService.remove(`user_profile_${profileId}`),
      ]);

      return true;
    } catch (err: any) {
      Alert.alert("Couldn't upload photo", err?.message ?? "Please try again.");
      return false;
    } finally {
      setUploading(false);
      setSaving(false);
    }
  };

  // v1.1: paywall comes BEFORE liveness (sunk-cost commitment drives
  // liveness completion). Non-female users hit the paywall first; female
  // users go straight to liveness. Both paths land at Main once liveness
  // approves. Photo is REQUIRED — skipping leaves the profile with empty
  // profile_pictures, which makes the user undiscoverable in search and
  // also makes the navigator misclassify them as a "new user" on re-login.
  const handleContinue = async () => {
    if (!localUri || uploading || saving) return;
    const ok = await uploadAndSave(localUri);
    if (!ok) return;
    void logOnboardingStepCompleted("photo");
    // v1.2 routing (face verification removed from onboarding per App Store
    // Review 5.x): females finish onboarding here and reset straight to
    // Main; verification happens in-app at the moment they like / message /
    // post (see useRequireVerification). Males still go through the paywall
    // first. Fail-secure: anything not explicitly "female" goes to paywall.
    const isFemale = userProfile?.gender === "female";
    if (isFemale) {
      navigation.dispatch(
        CommonActions.reset({ index: 0, routes: [{ name: "Main" }] }),
      );
    } else {
      navigation.navigate("OnboardingPaywall");
    }
  };

  const busy = uploading || saving;

  return (
    <OnboardingShell
      step={6}
      title="Add a profile photo"
      subtitle="A clear photo of you is required. You can change it anytime."
      continueDisabled={!localUri || busy}
      onContinue={handleContinue}
      continueLabel={busy ? "Uploading..." : "Continue"}
    >
      <View style={styles.previewWrap}>
        {localUri ? (
          <View style={styles.previewFrame}>
            <Image source={{ uri: localUri }} style={styles.preview} />
            {busy && (
              <View style={styles.previewOverlay}>
                <ActivityIndicator size="large" color={Colors.white} />
              </View>
            )}
          </View>
        ) : (
          <View style={[styles.previewFrame, styles.previewEmpty]}>
            <Ionicons name="person" size={64} color={Colors.gray[300]} />
          </View>
        )}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.action, requestingPerm && styles.actionDisabled]}
          onPress={pickFromLibrary}
          activeOpacity={0.8}
          disabled={!!requestingPerm}
        >
          {requestingPerm === "library" ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Ionicons name="images-outline" size={22} color={Colors.primary} />
          )}
          <Text style={styles.actionLabel}>
            {requestingPerm === "library"
              ? "Requesting permission…"
              : "Choose from library"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.action, requestingPerm && styles.actionDisabled]}
          onPress={takePhoto}
          activeOpacity={0.8}
          disabled={!!requestingPerm}
        >
          {requestingPerm === "camera" ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Ionicons name="camera-outline" size={22} color={Colors.primary} />
          )}
          <Text style={styles.actionLabel}>
            {requestingPerm === "camera"
              ? "Requesting permission…"
              : "Take photo"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Privacy explainer — surfaces the reason camera / photo access is
          requested. App Store reviewers expect this kind of in-app rationale
          alongside the Info.plist usage strings (NSCameraUsageDescription,
          NSPhotoLibraryUsageDescription). */}
      <Text style={styles.privacyText}>
        We use your photo to display on your profile so other members can
        recognize you. It is stored securely and never shared outside the app.
        You can replace or remove it anytime from your profile page.
      </Text>
    </OnboardingShell>
  );
};

const styles = StyleSheet.create({
  previewWrap: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  previewFrame: {
    width: 180,
    height: 240,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.gray[100],
    overflow: "hidden",
  },
  previewEmpty: {
    alignItems: "center",
    justifyContent: "center",
  },
  preview: {
    width: "100%",
    height: "100%",
  },
  previewOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  actions: {
    gap: Spacing.sm,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    height: 56,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionDisabled: {
    opacity: 0.5,
  },
  privacyText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    lineHeight: 20,
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.xs,
  },
  actionLabel: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.primary,
  },
});

export default OnboardingPhotoScreen;
