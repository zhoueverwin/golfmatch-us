import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from "react-native";
import { FlashList, ListRenderItemInfo } from "@shopify/flash-list";
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
import { hiddenPostsService } from "../services/hiddenPosts.service";
import { supabase } from "../services/supabase";
import { getProfilePicture } from "../constants/defaults";
import StandardHeader from "../components/StandardHeader";
import EmptyState from "../components/EmptyState";

type HiddenPostsScreenNavigationProp = StackNavigationProp<RootStackParamList>;

const { width: screenWidth } = Dimensions.get("window");

interface HiddenPostInfo {
  id: string;
  content: string;
  user_id: string;
  user_name: string;
  user_profile_picture: string;
  created_at: string;
  hidden_at?: string;
}

const HiddenPostsScreen: React.FC = () => {
  const navigation = useNavigation<HiddenPostsScreenNavigationProp>();
  const { profileId } = useAuth();

  const [hiddenPosts, setHiddenPosts] = useState<HiddenPostInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unhidingId, setUnhidingId] = useState<string | null>(null);

  const loadHiddenPosts = useCallback(async () => {
    if (!profileId) return;

    try {
      // Get hidden post IDs from AsyncStorage
      const hiddenPostIds = await hiddenPostsService.getHiddenPosts(profileId);

      if (hiddenPostIds.length === 0) {
        setHiddenPosts([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // Fetch post details from Supabase
      const { data, error } = await supabase
        .from("posts")
        .select(
          `
          id,
          content,
          user_id,
          created_at,
          user:profiles!posts_user_id_fkey(
            id,
            name,
            profile_pictures
          )
        `
        )
        .in("id", hiddenPostIds);

      if (error) {
        console.error("Error fetching hidden posts:", error);
        setHiddenPosts([]);
        return;
      }

      // Transform to HiddenPostInfo
      const postsInfo: HiddenPostInfo[] = (data || []).map((post: any) => {
        const user = Array.isArray(post.user) ? post.user[0] : post.user;
        return {
          id: post.id,
          content: post.content || "",
          user_id: post.user_id,
          user_name: user?.name || "不明なユーザー",
          user_profile_picture: getProfilePicture(user?.profile_pictures || [], 0),
          created_at: post.created_at,
        };
      });

      // Sort by created_at descending
      postsInfo.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setHiddenPosts(postsInfo);
    } catch (error) {
      console.error("Error loading hidden posts:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profileId]);

  useEffect(() => {
    loadHiddenPosts();
  }, [loadHiddenPosts]);

  // Refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadHiddenPosts();
    }, [loadHiddenPosts])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadHiddenPosts();
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const truncateContent = (content: string, maxLength: number = 50): string => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + "...";
  };

  const handleUnhide = (post: HiddenPostInfo) => {
    Alert.alert(
      "非表示を解除",
      "この投稿を再び表示しますか？",
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "表示する",
          onPress: async () => {
            if (!profileId) return;

            setUnhidingId(post.id);

            try {
              await hiddenPostsService.unhidePost(profileId, post.id);

              // Remove from local state
              setHiddenPosts((prev) => prev.filter((p) => p.id !== post.id));
              Alert.alert("完了", "投稿の非表示を解除しました。");
            } catch (error) {
              console.error("Error unhiding post:", error);
              Alert.alert("エラー", "非表示の解除に失敗しました。");
            } finally {
              setUnhidingId(null);
            }
          },
        },
      ]
    );
  };

  const handleViewProfile = (userId: string) => {
    navigation.navigate("Profile", { userId });
  };

  const renderHiddenPost = useCallback(({ item }: ListRenderItemInfo<HiddenPostInfo>) => {
    const isUnhiding = unhidingId === item.id;

    return (
      <View style={styles.postCard}>
        <TouchableOpacity
          style={styles.postInfo}
          onPress={() => handleViewProfile(item.user_id)}
          disabled={isUnhiding}
        >
          <ExpoImage
            source={{ uri: item.user_profile_picture }}
            style={styles.avatar}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
          />
          <View style={styles.postDetails}>
            <Text style={styles.userName}>{item.user_name}</Text>
            <Text style={styles.postContent} numberOfLines={2}>
              {item.content || "(画像/動画のみの投稿)"}
            </Text>
            <Text style={styles.postDate}>{formatDate(item.created_at)}</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.unhideButton, isUnhiding && styles.unhideButtonDisabled]}
          onPress={() => handleUnhide(item)}
          disabled={isUnhiding}
        >
          {isUnhiding ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Text style={styles.unhideButtonText}>表示</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }, [unhidingId, handleUnhide, handleViewProfile]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StandardHeader
          title="非表示リスト"
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
        title="非表示リスト"
        showBackButton={true}
        onBackPress={() => navigation.goBack()}
      />

      {hiddenPosts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <EmptyState
            title="非表示の投稿はありません"
            subtitle="非表示にした投稿はここに表示されます。"
            icon="eye-off-outline"
          />
        </View>
      ) : (
        <FlashList
          data={hiddenPosts}
          renderItem={renderHiddenPost}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          drawDistance={screenWidth * 2}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.primary}
            />
          }
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <Ionicons
                name="information-circle-outline"
                size={20}
                color={Colors.text.secondary}
              />
              <Text style={styles.listHeaderText}>
                非表示を解除すると、投稿が再びフィードに表示されます。
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
  postCard: {
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
  postInfo: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.gray[200],
  },
  postDetails: {
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
  postContent: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    lineHeight: Typography.fontSize.sm * 1.4,
    marginBottom: 4,
  },
  postDate: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.tertiary,
  },
  unhideButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.primary + "15",
    borderRadius: BorderRadius.md,
    minWidth: 60,
    alignItems: "center",
  },
  unhideButtonDisabled: {
    opacity: 0.5,
  },
  unhideButtonText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
    color: Colors.primary,
  },
});

export default HiddenPostsScreen;
