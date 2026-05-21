import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import OnboardingShell from "./OnboardingShell";
import { Colors } from "../../constants/colors";
import { Typography } from "../../constants/typography";
import { Spacing, BorderRadius } from "../../constants/spacing";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../services/supabase";
import { PREFECTURES } from "../../constants/filterOptions";
import { RootStackParamList } from "../../types";

type Nav = StackNavigationProp<RootStackParamList, "OnboardingState">;

const OnboardingStateScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { profileId } = useAuth();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PREFECTURES as readonly string[];
    return (PREFECTURES as readonly string[]).filter((s) =>
      s.toLowerCase().includes(q),
    );
  }, [query]);

  const handleContinue = async () => {
    if (!selected || !profileId || saving) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ prefecture: selected, updated_at: new Date().toISOString() })
        .eq("id", profileId);
      if (error) throw error;
      // The state-centroid backfill at the DB layer ensures
      // home_location is populated immediately on this update — see
      // migration 00000000000011_state_centroid_backfill. The next
      // screen (Location) then offers GPS as an upgrade.
      navigation.navigate("OnboardingLocation");
    } catch (err: any) {
      Alert.alert("Couldn't save", err?.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <OnboardingShell
      step={2}
      title="Where do you live?"
      subtitle="We use this to surface golfers near you."
      continueDisabled={!selected || saving}
      onContinue={handleContinue}
    >
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={Colors.text.tertiary} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search states"
          placeholderTextColor={Colors.text.tertiary}
          autoCorrect={false}
          autoCapitalize="words"
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <Text style={styles.empty}>No states match "{query}".</Text>
        }
        renderItem={({ item }) => {
          const isSelected = selected === item;
          return (
            <TouchableOpacity
              onPress={() => setSelected(item)}
              style={styles.row}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={item}
            >
              <Text
                style={[styles.rowText, isSelected && styles.rowTextSelected]}
              >
                {item}
              </Text>
              {isSelected && (
                <Ionicons name="checkmark" size={20} color={Colors.primary} />
              )}
            </TouchableOpacity>
          );
        }}
      />
    </OnboardingShell>
  );
};

const styles = StyleSheet.create({
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    height: 48,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.gray[100],
    marginBottom: Spacing.md,
  },
  searchInput: {
    flex: 1,
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.primary,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  rowText: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.primary,
  },
  rowTextSelected: {
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.primary,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.gray[100],
  },
  empty: {
    textAlign: "center",
    paddingVertical: Spacing.lg,
    fontSize: Typography.fontSize.sm,
    color: Colors.text.tertiary,
  },
});

export default OnboardingStateScreen;
