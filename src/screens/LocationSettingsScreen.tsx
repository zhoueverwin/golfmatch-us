import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import * as Linking from "expo-linking";

import { Colors } from "../constants/colors";
import { Typography } from "../constants/typography";
import { Spacing, BorderRadius } from "../constants/spacing";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabase";
import {
  requestPermissionAndGetLocation,
  updateHomeLocation,
  recordPermissionDenied,
  LocationSource,
} from "../services/locationService";
import { RootStackParamList } from "../types";
import { usePreserveScroll } from "../hooks/usePreserveScroll";

type Nav = StackNavigationProp<RootStackParamList, "LocationSettings">;

interface LocationState {
  source: LocationSource | null;
  updatedAt: string | null;
  prefecture: string | null;
}

const SOURCE_LABEL: Record<LocationSource, string> = {
  gps: "Precise (GPS)",
  state_centroid: "State only",
  manual: "Manually set",
  denied: "Not shared",
};

/**
 * Standalone screen for managing the home_location after onboarding.
 * Read-mostly: shows the current provenance and last update, lets the
 * user upgrade to GPS, downgrade to state-only, or re-grant after a
 * previous denial.
 */
const LocationSettingsScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { profileId } = useAuth();
  const scroll = usePreserveScroll();
  const [state, setState] = useState<LocationState>({
    source: null,
    updatedAt: null,
    prefecture: null,
  });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("location_source, location_updated_at, prefecture")
      .eq("id", profileId)
      .single();
    setState({
      source: (data?.location_source as LocationSource | null) ?? null,
      updatedAt: data?.location_updated_at ?? null,
      prefecture: data?.prefecture ?? null,
    });
    setLoading(false);
  }, [profileId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleEnableGps = async () => {
    if (!profileId || busy) return;
    setBusy(true);
    try {
      const result = await requestPermissionAndGetLocation("settings");
      if (result.status === "granted") {
        await updateHomeLocation(profileId, result.coords, "gps");
        await load();
      } else if (result.status === "denied") {
        await recordPermissionDenied(profileId);
        if (!result.canAskAgain) {
          // iOS won't show the system dialog anymore — direct to Settings app.
          Alert.alert(
            "Location is off",
            "To enable location, open the iOS Settings app and grant permission for GolfMatch.",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Open Settings", onPress: () => Linking.openSettings() },
            ],
          );
        }
        await load();
      } else {
        Alert.alert("Couldn't get your location", result.error);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleUseStateOnly = () => {
    if (!profileId || busy) return;
    Alert.alert(
      "Use state only?",
      "We'll delete your precise location and match based on your state instead. You can re-enable later.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Use state only",
          onPress: async () => {
            setBusy(true);
            try {
              // Server-side atomic downgrade: overwrites home_location with
              // the state centroid AND sets source='state_centroid' in one
              // transaction. The user's precise GPS point is physically
              // replaced — not just hidden — so the privacy intent is
              // honored at the storage layer, not only at the display layer.
              const { error } = await supabase.rpc(
                "downgrade_location_to_state_only",
                { p_profile_id: profileId },
              );
              if (error) {
                Alert.alert("Couldn't update", error.message);
              }
              await load();
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={24} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.title}>Location</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        ref={scroll.ref}
        onScroll={scroll.onScroll}
        scrollEventThrottle={scroll.scrollEventThrottle}
        contentContainerStyle={styles.scroll}
      >
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <Ionicons name="location" size={20} color={Colors.primary} />
            <Text style={styles.statusLabel}>Current</Text>
            <Text style={styles.statusValue}>
              {loading
                ? "Loading…"
                : state.source
                ? SOURCE_LABEL[state.source]
                : "Not set"}
            </Text>
          </View>
          {state.prefecture ? (
            <View style={styles.statusRow}>
              <Ionicons name="flag" size={20} color={Colors.gray[500]} />
              <Text style={styles.statusLabel}>State</Text>
              <Text style={styles.statusValue}>{state.prefecture}</Text>
            </View>
          ) : null}
          {state.updatedAt ? (
            <View style={styles.statusRow}>
              <Ionicons name="time" size={20} color={Colors.gray[500]} />
              <Text style={styles.statusLabel}>Updated</Text>
              <Text style={styles.statusValue}>
                {new Date(state.updatedAt).toLocaleDateString()}
              </Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.helpText}>
          We use your location to show how far away other golfers are. Your
          home address is never shown — only the distance, rounded to whole
          miles.
        </Text>

        <TouchableOpacity
          style={[styles.primaryButton, busy && styles.buttonDisabled]}
          onPress={handleEnableGps}
          disabled={busy}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonText}>
            {state.source === "gps"
              ? "Refresh my location"
              : "Use my precise location"}
          </Text>
        </TouchableOpacity>

        {state.source === "gps" ? (
          <TouchableOpacity
            style={[styles.secondaryButton, busy && styles.buttonDisabled]}
            onPress={handleUseStateOnly}
            disabled={busy}
            activeOpacity={0.85}
          >
            <Text style={styles.secondaryButtonText}>
              Use state only instead
            </Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
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
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
  },
  scroll: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  statusCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  statusLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text.secondary,
    width: 80,
  },
  statusValue: {
    flex: 1,
    fontSize: Typography.fontSize.base,
    color: Colors.text.primary,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
    fontWeight: Typography.fontWeight.medium,
  },
  helpText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text.secondary,
    lineHeight: 20,
    paddingHorizontal: Spacing.sm,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    alignItems: "center",
  },
  primaryButtonText: {
    color: Colors.white,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    fontWeight: Typography.fontWeight.semibold,
    fontSize: Typography.fontSize.base,
  },
  secondaryButton: {
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: Colors.primary,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
    fontWeight: Typography.fontWeight.medium,
    fontSize: Typography.fontSize.base,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});

export default LocationSettingsScreen;
