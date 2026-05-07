/**
 * Share Service
 * Handles image capture and sharing functionality for posts
 */

import { RefObject } from 'react';
import { Platform, Alert, Linking } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';

// App Store URLs (matching app_config in database)
const APP_STORE_URL = 'https://apps.apple.com/jp/app/golfmatch/id6754797576';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.zhoueverwin.golfmatchapp';

export interface SharePostData {
  userName: string;
  content?: string;
  imageUrl?: string;
}

export const shareService = {
  /**
   * Get the appropriate app store link based on platform
   */
  getAppLink: (): string => {
    return Platform.OS === 'ios' ? APP_STORE_URL : PLAY_STORE_URL;
  },

  /**
   * Capture a React Native view as a PNG image
   * @param viewRef - Reference to the view to capture
   * @returns URI of the captured image
   */
  captureView: async (viewRef: RefObject<any>): Promise<string> => {
    if (!viewRef.current) {
      throw new Error('View reference is not available');
    }

    try {
      const uri = await captureRef(viewRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      return uri;
    } catch (error) {
      console.error('Failed to capture view:', error);
      throw new Error('画像のキャプチャに失敗しました');
    }
  },

  /**
   * Share an image via the native share sheet
   * @param uri - URI of the image to share
   * @param message - Optional message to include
   */
  shareImage: async (uri: string, message?: string): Promise<boolean> => {
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('エラー', 'シェア機能は現在利用できません');
        return false;
      }

      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: message || 'Golfmatchでシェア',
        UTI: 'public.png',
      });
      return true;
    } catch (error) {
      console.error('Failed to share image:', error);
      // User cancelled sharing - not an error
      if ((error as Error).message?.includes('cancel')) {
        return false;
      }
      Alert.alert('エラー', 'シェアに失敗しました');
      return false;
    }
  },

  /**
   * Save an image to the device's gallery
   * @param uri - URI of the image to save
   * @returns true if successful, false otherwise
   */
  saveToGallery: async (uri: string): Promise<boolean> => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert(
          'アクセス許可が必要',
          '写真を保存するには、フォトライブラリへのアクセスを許可してください。',
          [{ text: 'OK' }]
        );
        return false;
      }

      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert('保存完了', '画像を保存しました');
      return true;
    } catch (error) {
      console.error('Failed to save to gallery:', error);
      Alert.alert('エラー', '画像の保存に失敗しました');
      return false;
    }
  },

  /**
   * Generate share message for a post
   */
  generatePostShareMessage: (data: SharePostData): string => {
    const appLink = shareService.getAppLink();
    return `🏌️ Golfmatchで見つけた投稿をシェア！

${data.content ? data.content.substring(0, 100) + (data.content.length > 100 ? '...' : '') : ''}

アプリをダウンロード👇
${appLink}`;
  },

  /**
   * Share an image to Instagram
   * Saves the image to the camera roll first, then opens Instagram.
   * Direct programmatic sharing to Instagram feed/stories is restricted by Meta,
   * so the reliable approach is: save to gallery → open Instagram → user selects image.
   * @param uri - URI of the image to share
   * @returns true if successful, false otherwise
   */
  shareToInstagram: async (uri: string): Promise<boolean> => {
    try {
      // Check if Instagram is installed
      const canOpen = await Linking.canOpenURL('instagram://app');
      if (!canOpen) {
        Alert.alert(
          'Instagramが見つかりません',
          'Instagramアプリをインストールしてください'
        );
        return false;
      }

      // Save image to camera roll so user can select it in Instagram
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'アクセス許可が必要',
          'Instagramにシェアするには、フォトライブラリへのアクセスを許可してください。'
        );
        return false;
      }

      await MediaLibrary.saveToLibraryAsync(uri);

      // Open Instagram — image is now in camera roll for the user to select
      Alert.alert(
        '画像を保存しました',
        'Instagramが開きます。保存した画像を選んで投稿してください。',
        [
          {
            text: 'Instagramを開く',
            onPress: async () => {
              await Linking.openURL('instagram://app');
            },
          },
          { text: 'キャンセル', style: 'cancel' },
        ]
      );

      return true;
    } catch (error) {
      console.error('Failed to share to Instagram:', error);
      Alert.alert('エラー', 'Instagramへのシェアに失敗しました');
      return false;
    }
  },
};

export default shareService;
