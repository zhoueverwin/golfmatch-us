import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { Ionicons } from "@expo/vector-icons";

import { Colors } from "../constants/colors";
import { Spacing, BorderRadius } from "../constants/spacing";
import { Typography } from "../constants/typography";
import { RootStackParamList } from "../types";
import { useAuth } from "../contexts/AuthContext";
import { blocksService } from "../services/supabase/blocks.service";
import { getProfilePicture } from "../constants/defaults";
import StandardHeader from "../components/StandardHeader";
import EmptyState from "../components/EmptyState";

type BlockedUsersScreenNavigationProp = StackNavigationProp<RootStackParamList>;

interface BlockedUser {
  id: string;
  blocked_user_id: string;
  blocked_user: {
    id: string;
    name: string;
    profile_pictures: string[];
  } | null;
  created_at: string;
}

const BlockedUsersScreen: React.FC = () => {
  const navigation = useNavigation<BlockedUsersScreenNavigationProp>();
  const { profileId } = useAuth();

  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  const loadBlockedUsers = useCallback(async () => {
    if (!profileId) return;

    try {
      const result = await blocksService.getBlockedUsers(profileId);
      if (result.success && result.data) {
        setBlockedUsers(result.data);
      }
    } catch (error) {
      console.error("Error loading blocked users:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profileId]);

  useEffect(() => {
    loadBlockedUsers();
  }, [loadBlockedUsers]);

  // Refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadBlockedUsers();
    }, [loadBlockedUsers])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadBlockedUsers();
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const handleUnblock = (user: BlockedUser) => {
    const userName = user.blocked_user?.name || "このユーザー";

    Alert.alert(
      "ブロック解除",
      `${userName}さんのブロックを解除しますか？\n解除すると、この相手の投稿やメッセージが再び表示されるようになります。`,
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "解除する",
          onPress: async () => {
            if (!profileId) return;

            setUnblockingId(user.id);

            try {
              const result = await blocksService.unblockUser(
                profileId,
                user.blocked_user_id
              );

              if (result.success) {
                // Remove from local state
                setBlockedUsers((prev) =>
                  prev.filter((u) => u.id !== user.id)
                );
                Alert.alert("完了", `${userName}さんのブロックを解除しました。`);
              } else {
                Alert.alert("エラー", result.error || "ブロック解除に失敗しました。");
              }
            } catch (error) {
              console.error("Error unblocking user:", error);
              Alert.alert("エラー", "ブロック解除に失敗しました。");
            } finally {
              setUnblockingId(null);
            }
          },
        },
      ]
    );
  };

  const handleViewProfile = (userId: string) => {
    navigation.navigate("Profile", { userId });
  };

  const renderBlockedUser = ({ item }: { item: BlockedUser }) => {
    const isUnblocking = unblockingId === item.id;
    const userName = item.blocked_user?.name || "不明なユーザー";
    const profilePicture = getProfilePicture(
      item.blocked_user?.profile_pictures || [],
      0
    );

    return (
      <View style={styles.userCard}>
        <TouchableOpacity
          style={styles.userInfo}
          onPress={() => handleViewProfile(item.blocked_user_id)}
          disabled={isUnblocking}
        >
          <ExpoImage
            source={{ uri: profilePicture }}
            style={styles.avatar}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
          />
          <View style={styles.userDetails}>
            <Text style={styles.userName}>{userName}</Text>
            <Text style={styles.blockedDate}>
              {formatDate(item.created_at)}にブロック
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.unblockButton, isUnblocking && styles.unblockButtonDisabled]}
          onPress={() => handleUnblock(item)}
          disabled={isUnblocking}
        >
          {isUnblocking ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Text style={styles.unblockButtonText}>解除</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StandardHeader
          title="ブロックリスト"
          showBackButton={true}
          onBackPress={() => navigation.goBack()}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>読み込み中...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StandardHeader
        title="ブロックリスト"
        showBackButton={true}
        onBackPress={() => navigation.goBack()}
      />

      {blockedUsers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <EmptyState
            title="ブロック中のユーザーはいません"
            subtitle="ブロックしたユーザーはここに表示されます。"
            icon="ban-outline"
          />
        </View>
      ) : (
        <FlatList
          data={blockedUsers}
          renderItem={renderBlockedUser}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.primary}
            />
          }
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <Ionicons name="information-circle-outline" size={20} color={Colors.text.secondary} />
              <Text style={styles.listHeaderText}>
                ブロックを解除すると、相手の投稿やメッセージが再び表示されます。
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  listContent: {
    padding: Spacing.md,
  },
  listHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: Colors.gray[100],
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  listHeaderText: {
    flex: 1,
    marginLeft: Spacing.sm,
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    lineHeight: Typography.fontSize.sm * 1.5,
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.gray[200],
  },
  userDetails: {
    marginLeft: Spacing.md,
    flex: 1,
  },
  userName: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    marginBottom: 2,
  },
  blockedDate: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
  },
  unblockButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.primary + "15",
    borderRadius: BorderRadius.md,
    minWidth: 60,
    alignItems: "center",
  },
  unblockButtonDisabled: {
    opacity: 0.5,
  },
  unblockButtonText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
    color: Colors.primary,
  },
});

export default BlockedUsersScreen;
