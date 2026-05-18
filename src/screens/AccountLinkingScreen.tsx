import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { Colors } from "../constants/colors";
import { Spacing, BorderRadius } from "../constants/spacing";
import { Typography } from "../constants/typography";
import { RootStackParamList } from "../types";
import { useAuth } from "../contexts/AuthContext";
import StandardHeader from "../components/StandardHeader";

type AccountLinkingScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  "AccountLinking"
>;

interface ProviderInfo {
  provider: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  isLinked: boolean;
}

// Sign-in providers the global app supports. LINE was removed when the
// global app forked away from the JP version; email/password sign-in was
// removed too, so the only auth methods now are Google and Apple. Legacy
// identities of other types simply won't render (the screen iterates this
// config to build the list).
const PROVIDER_CONFIG: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  google: { label: "Google", icon: "logo-google", color: "#4285F4" },
  apple: { label: "Apple ID", icon: "logo-apple", color: "#000000" },
};

const AccountLinkingScreen: React.FC = () => {
  const navigation = useNavigation<AccountLinkingScreenNavigationProp>();
  const { getUserIdentities } = useAuth();

  const [identities, setIdentities] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchIdentities = useCallback(async () => {
    setLoading(true);
    const result = await getUserIdentities();
    if (result.success && result.identities) {
      const linkedProviders = new Set(
        result.identities.map((id: any) => id.provider)
      );
      const providers: ProviderInfo[] = Object.entries(PROVIDER_CONFIG).map(
        ([key, config]) => ({
          provider: key,
          label: config.label,
          icon: config.icon,
          color: config.color,
          isLinked: linkedProviders.has(key),
        })
      );
      setIdentities(providers);
    }
    setLoading(false);
  }, [getUserIdentities]);

  useEffect(() => {
    fetchIdentities();
  }, [fetchIdentities]);

  return (
    <SafeAreaView style={styles.container}>
      <StandardHeader
        title=""
        showBackButton={true}
        onBackPress={() => navigation.goBack()}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current Linked Accounts</Text>
          {loading ? (
            <ActivityIndicator
              color={Colors.primary}
              style={styles.loadingIndicator}
            />
          ) : (
            identities.map((provider) => (
              <View key={provider.provider} style={styles.providerRow}>
                <View style={[styles.providerIcon, { backgroundColor: provider.color + "15" }]}>
                  <Ionicons
                    name={provider.icon}
                    size={20}
                    color={provider.color}
                  />
                </View>
                <Text style={styles.providerLabel}>{provider.label}</Text>
                {provider.isLinked ? (
                  <View style={styles.linkedBadge}>
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color={Colors.primary}
                    />
                    <Text style={styles.linkedText}>Linked</Text>
                  </View>
                ) : (
                  <Text style={styles.unlinkedText}>Not linked</Text>
                )}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
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
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: 40,
  },
  section: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    fontFamily: Typography.getFontFamily("600"),
    color: Colors.text.primary,
    marginBottom: 16,
  },
  loadingIndicator: {
    paddingVertical: Spacing.lg,
  },
  providerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  providerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  providerLabel: {
    fontSize: 15,
    fontWeight: "500",
    fontFamily: Typography.getFontFamily("500"),
    color: Colors.text.primary,
    flex: 1,
  },
  linkedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  linkedText: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: "500",
    fontFamily: Typography.getFontFamily("500"),
  },
  unlinkedText: {
    fontSize: 14,
    color: Colors.text.secondary,
  },
});

export default AccountLinkingScreen;
