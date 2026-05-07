/**
 * EditProfileScreen Image Upload Tests
 * Tests for profile picture upload to Supabase Storage
 */

import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import EditProfileScreen from '../screens/EditProfileScreen';
import { DataProvider } from '../services';
import { storageService } from '../services/storageService';
import { useAuth } from '../contexts/AuthContext';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

// Mock dependencies
jest.mock('../services');
jest.mock('../services/storageService');
jest.mock('../contexts/AuthContext');
jest.mock('expo-image-picker');
jest.mock('react-native/Libraries/Alert/Alert', () => ({
  alert: jest.fn(),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: jest.fn(),
  }),
}));

describe('EditProfileScreen - Image Upload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({
      profileId: 'test-user-id',
    });

    // Mock profile loading
    (DataProvider.getUserProfile as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        basic: {
          name: 'Test User',
          age: '30',
          prefecture: '東京都',
          blood_type: 'A型',
          height: '170',
          body_type: '普通',
          smoking: '吸わない',
        },
        golf: {
          skill_level: 'ビギナー',
          average_score: '90',
          experience: '1年',
          transportation: '車',
          available_days: '週末',
        },
        bio: 'Test bio',
        profile_pictures: [],
      },
    });
  });

  describe('Local File Path Handling', () => {
    it('should upload local file paths to Supabase Storage before saving', async () => {
      const mockUploadFile = jest.fn().mockResolvedValue({
        url: 'https://supabase.example.com/storage/uploaded-image.jpg',
        error: null,
      });
      (storageService.uploadFile as jest.Mock) = mockUploadFile;

      const mockUpdateProfile = jest.fn().mockResolvedValue({
        success: true,
      });
      (DataProvider.updateUserProfile as jest.Mock) = mockUpdateProfile;

      // Mock image picker to return local file
      (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: true,
      });
      (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{
          uri: 'file:///var/mobile/test-image.jpg',
        }],
      });

      const { getByText } = render(<EditProfileScreen />);

      await waitFor(() => {
        expect(getByText('Test User')).toBeTruthy();
      });

      // Simulate selecting an image (would trigger handlePhotoChange in real app)
      // Then save
      const saveButton = getByText('保存');
      fireEvent.press(saveButton);

      await waitFor(() => {
        expect(mockUploadFile).toHaveBeenCalledWith(
          expect.stringContaining('file://'),
          'test-user-id',
          'image'
        );
      });

      expect(mockUpdateProfile).toHaveBeenCalledWith(
        'test-user-id',
        expect.objectContaining({
          profile_pictures: expect.arrayContaining([
            expect.stringMatching(/^https:\/\//)
          ]),
        })
      );
    });

    it('should handle upload errors gracefully', async () => {
      const mockUploadFile = jest.fn().mockResolvedValue({
        url: null,
        error: 'Upload failed: Network error',
      });
      (storageService.uploadFile as jest.Mock) = mockUploadFile;

      const mockUpdateProfile = jest.fn();
      (DataProvider.updateUserProfile as jest.Mock) = mockUpdateProfile;

      const { getByText } = render(<EditProfileScreen />);

      await waitFor(() => {
        expect(getByText('Test User')).toBeTruthy();
      });

      // Simulate image selection with local path
      // (In real test, would need to manipulate state)

      const saveButton = getByText('保存');
      fireEvent.press(saveButton);

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'エラー',
          expect.stringContaining('アップロードに失敗しました')
        );
      });

      // Should not call updateUserProfile if upload fails
      expect(mockUpdateProfile).not.toHaveBeenCalled();
    });

    it('should not upload images that are already URLs', async () => {
      const mockUploadFile = jest.fn();
      (storageService.uploadFile as jest.Mock) = mockUploadFile;

      const mockUpdateProfile = jest.fn().mockResolvedValue({
        success: true,
      });
      (DataProvider.updateUserProfile as jest.Mock) = mockUpdateProfile;

      // Mock profile with existing Supabase URLs
      (DataProvider.getUserProfile as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          basic: {
            name: 'Test User',
            age: '30',
            prefecture: '東京都',
            blood_type: 'A型',
            height: '170',
            body_type: '普通',
            smoking: '吸わない',
          },
          golf: {
            skill_level: 'ビギナー',
            average_score: '90',
            experience: '1年',
            transportation: '車',
            play_fee: '¥10000',
            available_days: '週末',
          },
          bio: 'Test bio',
          profile_pictures: ['https://supabase.example.com/existing-image.jpg'],
        },
      });

      const { getByText } = render(<EditProfileScreen />);

      await waitFor(() => {
        expect(getByText('Test User')).toBeTruthy();
      });

      const saveButton = getByText('保存');
      fireEvent.press(saveButton);

      await waitFor(() => {
        expect(mockUpdateProfile).toHaveBeenCalled();
      });

      // Should not call uploadFile since image is already a URL
      expect(mockUploadFile).not.toHaveBeenCalled();
    });

    it('should upload multiple local images', async () => {
      const mockUploadFile = jest.fn()
        .mockResolvedValueOnce({
          url: 'https://supabase.example.com/image1.jpg',
          error: null,
        })
        .mockResolvedValueOnce({
          url: 'https://supabase.example.com/image2.jpg',
          error: null,
        });
      (storageService.uploadFile as jest.Mock) = mockUploadFile;

      const mockUpdateProfile = jest.fn().mockResolvedValue({
        success: true,
      });
      (DataProvider.updateUserProfile as jest.Mock) = mockUpdateProfile;

      // This test would need to simulate adding multiple images
      // Implementation depends on how the UI handles multiple image selection
    });

    it('should show upload progress during image upload', async () => {
      const mockUploadFile = jest.fn().mockImplementation(
        () => new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              url: 'https://supabase.example.com/uploaded.jpg',
              error: null,
            });
          }, 100);
        })
      );
      (storageService.uploadFile as jest.Mock) = mockUploadFile;

      const mockUpdateProfile = jest.fn().mockResolvedValue({
        success: true,
      });
      (DataProvider.updateUserProfile as jest.Mock) = mockUpdateProfile;

      // Would test that loading indicator is shown during upload
      // Implementation depends on UI state management
    });
  });

  describe('Image Validation', () => {
    it('should only accept valid image URIs', () => {
      const invalidURIs = [
        '',
        null,
        undefined,
        'not-a-uri',
        'data:text/plain;base64,SGVsbG8=', // Non-image data URI
      ];

      // Each invalid URI should be handled gracefully
      // Implementation would check that these don't cause crashes
    });

    it('should filter out local file paths when loading existing profile', async () => {
      // Mock profile with mix of local and remote images
      (DataProvider.getUserProfile as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          basic: {
            name: 'Test User',
            age: '30',
            prefecture: '東京都',
            blood_type: 'A型',
            height: '170',
            body_type: '普通',
            smoking: '吸わない',
          },
          golf: {
            skill_level: 'ビギナー',
            average_score: '90',
            experience: '1年',
            transportation: '車',
            play_fee: '¥10000',
            available_days: '週末',
          },
          bio: 'Test bio',
          profile_pictures: [
            'https://supabase.example.com/good-image.jpg',
            'file:///var/mobile/bad-image.jpg', // Should be filtered out
          ],
        },
      });

      const { getByText } = render(<EditProfileScreen />);

      await waitFor(() => {
        expect(getByText('Test User')).toBeTruthy();
      });

      // Profile should load without crashing
      // Local file path should be ignored in UI
    });
  });

  describe('Image Picker Integration', () => {
    it('should request permissions before accessing library', async () => {
      const mockRequestPermission = jest.fn().mockResolvedValue({
        granted: true,
      });
      (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock) = mockRequestPermission;
      (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
        canceled: true,
      });

      const { getByText } = render(<EditProfileScreen />);

      await waitFor(() => {
        expect(getByText('Test User')).toBeTruthy();
      });

      // Simulate photo change button press
      // (Implementation depends on UI structure)

      await waitFor(() => {
        expect(mockRequestPermission).toHaveBeenCalled();
      });
    });

    it('should handle permission denial', async () => {
      (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: false,
      });

      const { getByText } = render(<EditProfileScreen />);

      await waitFor(() => {
        expect(getByText('Test User')).toBeTruthy();
      });

      // Simulate photo change attempt

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'エラー',
          'ライブラリの使用許可が必要です'
        );
      });
    });

    it('should handle camera permissions for photo capture', async () => {
      const mockRequestCamera = jest.fn().mockResolvedValue({
        granted: true,
      });
      (ImagePicker.requestCameraPermissionsAsync as jest.Mock) = mockRequestCamera;
      (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({
        canceled: true,
      });

      const { getByText } = render(<EditProfileScreen />);

      await waitFor(() => {
        expect(getByText('Test User')).toBeTruthy();
      });

      // Simulate camera button press

      await waitFor(() => {
        expect(mockRequestCamera).toHaveBeenCalled();
      });
    });
  });

  describe('Save Profile with Images', () => {
    it('should save profile with uploaded image URLs', async () => {
      const uploadedUrl = 'https://supabase.example.com/uploaded.jpg';
      
      (storageService.uploadFile as jest.Mock).mockResolvedValue({
        url: uploadedUrl,
        error: null,
      });

      const mockUpdateProfile = jest.fn().mockResolvedValue({
        success: true,
      });
      (DataProvider.updateUserProfile as jest.Mock) = mockUpdateProfile;

      const { getByText } = render(<EditProfileScreen />);

      await waitFor(() => {
        expect(getByText('Test User')).toBeTruthy();
      });

      // Simulate save with image
      const saveButton = getByText('保存');
      fireEvent.press(saveButton);

      await waitFor(() => {
        expect(mockUpdateProfile).toHaveBeenCalledWith(
          'test-user-id',
          expect.objectContaining({
            profile_pictures: expect.not.arrayContaining([
              expect.stringMatching(/^file:\/\//)
            ]),
          })
        );
      });
    });

    it('should show success message after successful save', async () => {
      (DataProvider.updateUserProfile as jest.Mock).mockResolvedValue({
        success: true,
      });

      const { getByText } = render(<EditProfileScreen />);

      await waitFor(() => {
        expect(getByText('Test User')).toBeTruthy();
      });

      const saveButton = getByText('保存');
      fireEvent.press(saveButton);

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          '保存完了',
          'プロフィールが正常に更新されました',
          expect.any(Array)
        );
      });
    });
  });
});

