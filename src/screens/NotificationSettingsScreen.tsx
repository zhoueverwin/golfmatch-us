import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { useNotifications } from '../contexts/NotificationContext';
import { Typography } from "../constants/typography";
import StandardHeader from '../components/StandardHeader';

const NotificationSettingsScreen: React.FC = () => {
  const navigation = useNavigation();
  const { preferences, updatePreferences } = useNotifications();
  const [loading, setLoading] = useState(false);
  const [localPreferences, setLocalPreferences] = useState({
    messages_enabled: true,
    likes_enabled: true,
    matches_enabled: true,
    post_reactions_enabled: true,
    push_enabled: true,
  });

  useEffect(() => {
    if (preferences) {
      setLocalPreferences({
        messages_enabled: preferences.messages_enabled,
        likes_enabled: preferences.likes_enabled,
        matches_enabled: preferences.matches_enabled,
        post_reactions_enabled: preferences.post_reactions_enabled,
        push_enabled: preferences.push_enabled,
      });
    }
  }, [preferences]);

  const handleToggle = async (key: keyof typeof localPreferences, value: boolean) => {
    setLoading(true);
    
    // Update local state immediately for responsive UI
    setLocalPreferences((prev) => ({
      ...prev,
      [key]: value,
    }));

    try {
      await updatePreferences({ [key]: value });
    } catch (error) {
      console.error('Error updating preferences:', error);
      // Revert on error
      setLocalPreferences((prev) => ({
        ...prev,
        [key]: !value,
      }));
    } finally {
      setLoading(false);
    }
  };

  const settingItems = [
    {
      key: 'push_enabled' as const,
      title: 'プッシュ通知',
      description: 'アプリが閉じているときも通知を受け取る',
      icon: 'notifications' as keyof typeof Ionicons.glyphMap,
      isPrimary: true,
    },
    {
      key: 'messages_enabled' as const,
      title: 'メッセージ',
      description: '新しいメッセージを受信したとき',
      icon: 'chatbubble' as keyof typeof Ionicons.glyphMap,
    },
    {
      key: 'likes_enabled' as const,
      title: 'いいね',
      description: '誰かがあなたにいいねしたとき',
      icon: 'heart' as keyof typeof Ionicons.glyphMap,
    },
    {
      key: 'matches_enabled' as const,
      title: 'マッチ',
      description: '新しいマッチが成立したとき',
      icon: 'people' as keyof typeof Ionicons.glyphMap,
    },
    {
      key: 'post_reactions_enabled' as const,
      title: '投稿リアクション',
      description: '投稿にリアクションがついたとき',
      icon: 'thumbs-up' as keyof typeof Ionicons.glyphMap,
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <StandardHeader
        title="通知設定"
        showBackButton={true}
        onBackPress={() => navigation.goBack()}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.header}>
          <Text style={styles.subtitle}>
            受け取りたい通知を選択してください
          </Text>
        </View>

        <View style={styles.section}>
          {settingItems.map((item, index) => (
            <View key={item.key}>
              <View
                style={[
                  styles.settingItem,
                  item.isPrimary && styles.primarySettingItem,
                ]}
              >
                <View style={styles.settingItemLeft}>
                  <View
                    style={[
                      styles.iconContainer,
                      item.isPrimary && styles.primaryIconContainer,
                    ]}
                  >
                    <Ionicons
                      name={item.icon}
                      size={24}
                      color={item.isPrimary ? Colors.white : Colors.primary}
                    />
                  </View>
                  <View style={styles.settingItemText}>
                    <Text
                      style={[
                        styles.settingItemTitle,
                        item.isPrimary && styles.primaryTitle,
                      ]}
                    >
                      {item.title}
                    </Text>
                    <Text style={styles.settingItemDescription}>
                      {item.description}
                    </Text>
                  </View>
                </View>
                <Switch
                  value={localPreferences[item.key]}
                  onValueChange={(value) => handleToggle(item.key, value)}
                  trackColor={{ false: Colors.gray[300], true: Colors.primary }}
                  thumbColor={Colors.white}
                  disabled={loading}
                />
              </View>
              {index < settingItems.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </View>

        <View style={styles.infoBox}>
          <Ionicons
            name="information-circle"
            size={20}
            color={Colors.primary}
            style={styles.infoIcon}
          />
          <Text style={styles.infoText}>
            通知をオフにしても、アプリ内のお知らせ履歴には記録されます。
          </Text>
        </View>

        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        )}
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
    padding: 24,
  },
  header: {
    marginBottom: 24,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    lineHeight: 22,
  },
  section: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  primarySettingItem: {
    backgroundColor: Colors.primary + '08',
  },
  settingItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 16,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary + '10',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  primaryIconContainer: {
    backgroundColor: Colors.primary,
  },
  settingItemText: {
    flex: 1,
  },
  settingItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: Typography.getFontFamily('600'),
    color: Colors.text.primary,
    marginBottom: 4,
  },
  primaryTitle: {
    fontSize: 17,
    fontWeight: '700',
    fontFamily: Typography.getFontFamily('700'),
  },
  settingItemDescription: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: 80,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: Colors.primary + '08',
    padding: 16,
    borderRadius: 12,
    marginTop: 24,
    alignItems: 'flex-start',
  },
  infoIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    lineHeight: 20,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default NotificationSettingsScreen;





