import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { RootStackParamList } from "../types";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";

import { Colors } from "../constants/colors";
import { Spacing, BorderRadius } from "../constants/spacing";
import { Typography } from "../constants/typography";
import { UserActivityService } from "../services/userActivityService";
import { UserListItem } from "../types/userActivity";
import EmptyState from "../components/EmptyState";
import StandardHeader from "../components/StandardHeader";

type PastLikesScreenNavigationProp = StackNavigationProp<RootStackParamList>;

const PastLikesScreen: React.FC = () => {
  const navigation = useNavigation<PastLikesScreenNavigationProp>();
  const { profileId } = useAuth();
  const [pastLikesUsers, setPastLikesUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPastLikes = async () => {
    try {
      setLoading(true);
      const currentUserId = profileId || process.env.EXPO_PUBLIC_TEST_USER_ID;
      if (!currentUserId) {
        console.log('No user ID available');
        setLoading(false);
        return;
      }

      const pastLikes = await UserActivityService.getPastLikes(currentUserId);
      setPastLikesUsers(pastLikes);
    } catch (error) {
      console.error("Error loading past likes:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPastLikes();
  }, [profileId]);

  const handleUserPress = (user: UserListItem) => {
    navigation.navigate("Profile", { userId: user.id });
  };

  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60),
    );

    if (diffInHours < 1) {
      return "たった今";
    } else if (diffInHours < 24) {
      return `${diffInHours}時間前`;
    } else {
      const diffInDays = Math.floor(diffInHours / 24);
      return `${diffInDays}日前`;
    }
  };

  const renderUserItem = ({ item }: { item: UserListItem }) => (
    <TouchableOpacity
      style={styles.userItem}
      onPress={() => handleUserPress(item)}
      activeOpacity={0.7}
    >
      <Image source={{ uri: item.profileImage }} style={styles.userImage} />
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{item.name}</Text>
        <View style={styles.userDetails}>
          {item.age && <Text style={styles.userDetail}>{item.age}歳</Text>}
          {item.location && (
            <Text style={styles.userDetail}>・{String(item.location)}</Text>
          )}
        </View>
      </View>
      <View style={styles.timestampContainer}>
        <Text style={styles.timestamp}>{formatTimestamp(item.timestamp)}</Text>
        <Ionicons name="chevron-forward" size={16} color={Colors.gray[400]} />
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons
        name="heart-outline"
        size={48}
        color={Colors.gray[400]}
      />
      <Text style={styles.emptyTitle}>送ったいいねはありません</Text>
      <Text style={styles.emptySubtitle}>
        いいねを送った相手がここに表示されます
      </Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>送ったいいねを読み込み中...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />

      {/* Header */}
      <StandardHeader
        title="送ったいいね"
        showBackButton={true}
        onBackPress={() => navigation.goBack()}
      />

      {/* Content */}
      <View style={styles.content}>
        {pastLikesUsers.length > 0 ? (
          <FlatList
            data={pastLikesUsers}
            renderItem={renderUserItem}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContainer}
          />
        ) : (
          renderEmptyState()
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
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
  content: {
    flex: 1,
  },
  listContainer: {
    paddingVertical: Spacing.sm,
  },
  userItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    backgroundColor: Colors.white,
  },
  userImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: Spacing.md,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    marginBottom: Spacing.xs,
  },
  userDetails: {
    flexDirection: "row",
    alignItems: "center",
  },
  userDetail: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
  },
  timestampContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  timestamp: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    marginRight: Spacing.xs,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  emptySubtitle: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    textAlign: "center",
    lineHeight: 22,
  },
});

export default PastLikesScreen;
