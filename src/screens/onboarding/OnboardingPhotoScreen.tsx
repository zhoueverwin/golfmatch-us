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
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import OnboardingShell from "./OnboardingShell";
import { Colors } from "../../constants/colors";
import { Typography } from "../../constants/typography";
import { Spacing, BorderRadius } from "../../constants/spacing";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../services/supabase";
import { RootStackParamList } from "../../types";

type Nav = StackNavigationProp<RootStackParamList, "OnboardingPhoto">;

const BUCKET = "profile-pictures";

const OnboardingPhotoScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { profileId, user } = useAuth();
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const pickFromLibrary = async () => {
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
  };

  const takePhoto = async () => {
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

      return true;
    } catch (err: any) {
      Alert.alert("Couldn't upload photo", err?.message ?? "Please try again.");
      return false;
    } finally {
      setUploading(false);
      setSaving(false);
    }
  };

  const handleContinue = async () => {
    if (!localUri || uploading || saving) return;
    const ok = await uploadAndSave(localUri);
    if (ok) navigation.navigate("OnboardingDone");
  };

  const handleSkip = () => {
    navigation.navigate("OnboardingDone");
  };

  const busy = uploading || saving;

  return (
    <OnboardingShell
      step={5}
      title="Add a profile photo"
      subtitle="Pick a clear photo of yourself. You can change it anytime."
      continueDisabled={!localUri || busy}
      onContinue={handleContinue}
      continueLabel={busy ? "Uploading..." : "Continue"}
      secondaryLabel="Skip for now"
      onSecondary={handleSkip}
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
          style={styles.action}
          onPress={pickFromLibrary}
          activeOpacity={0.8}
        >
          <Ionicons name="images-outline" size={22} color={Colors.primary} />
          <Text style={styles.actionLabel}>Choose from library</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.action}
          onPress={takePhoto}
          activeOpacity={0.8}
        >
          <Ionicons name="camera-outline" size={22} color={Colors.primary} />
          <Text style={styles.actionLabel}>Take photo</Text>
        </TouchableOpacity>
      </View>
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
  actionLabel: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.primary,
  },
});

export default OnboardingPhotoScreen;
