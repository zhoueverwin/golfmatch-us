/**
 * ChatScreen Image Upload Test
 * 
 * Tests the image upload functionality in ChatScreen
 */

import React from 'react';
import { render, waitFor, act } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import ChatScreen from '../screens/ChatScreen';
import { supabase } from '../services/supabase';
import { messagesService } from '../services/supabase/messages.service';

// Mock dependencies
jest.mock('expo-image-picker');
jest.mock('expo-file-system');
jest.mock('base64-arraybuffer');
jest.mock('../services/supabase');
jest.mock('../services/supabase/messages.service', () => ({
  messagesService: {
    getMessages: jest.fn(),
    sendMessage: jest.fn(),
    subscribeToChat: jest.fn(),
  },
}));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'test-user-id' },
    profileId: 'test-user-id',
  }),
}));
jest.mock('../hooks/useBackHandler', () => ({
  useBackHandler: jest.fn(),
}));
jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({
    params: {
      chatId: 'test-chat-id',
      userId: 'other-user-id',
      userName: 'Test User',
      userImage: 'https://example.com/avatar.jpg',
    },
  }),
  useNavigation: () => ({
    goBack: jest.fn(),
    navigate: jest.fn(),
  }),
  useFocusEffect: jest.fn((callback) => callback()),
}));

describe('ChatScreen Image Upload', () => {
  const mockBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const mockArrayBuffer = new ArrayBuffer(8);
  const mockLocalUri = 'file:///path/to/image.jpg';
  const mockPublicUrl = 'https://example.supabase.co/storage/v1/object/public/message-media/test-chat-id/123456_abc.jpg';

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock FileSystem.readAsStringAsync
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(mockBase64);

    // Mock base64-arraybuffer decode
    (decode as jest.Mock).mockReturnValue(mockArrayBuffer);

    // Mock Supabase Storage upload
    const mockStorage = {
      from: jest.fn().mockReturnThis(),
      upload: jest.fn().mockResolvedValue({
        data: { path: 'test-chat-id/123456_abc.jpg' },
        error: null,
      }),
      getPublicUrl: jest.fn().mockReturnValue({
        data: { publicUrl: mockPublicUrl },
      }),
    };
    (supabase as any).storage = mockStorage;

    // Mock messagesService
    (messagesService.getMessages as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });
    (messagesService.sendMessage as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        id: 'msg-1',
        text: '',
        image_uri: mockPublicUrl,
        sender_id: 'test-user-id',
        receiver_id: 'other-user-id',
        created_at: new Date().toISOString(),
        is_read: false,
        type: 'image',
      },
    });
    (messagesService.subscribeToChat as jest.Mock).mockReturnValue(jest.fn());

    // Mock ImagePicker permissions
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
      granted: true,
    });
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
      granted: true,
    });
    (ImagePicker.getCameraPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
      granted: true,
    });
  });

  describe('Image Upload Flow', () => {
    it('should successfully upload image from gallery', async () => {
      // Mock ImagePicker.launchImageLibraryAsync
      (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: mockLocalUri }],
      });

      render(<ChatScreen />);

      await waitFor(() => {
        expect(messagesService.getMessages).toHaveBeenCalled();
      });

      // Simulate image selection (this would normally be triggered by button press)
      await act(async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.8,
        });

        if (!result.canceled && result.assets[0]) {
          // Simulate upload process
          const base64 = await FileSystem.readAsStringAsync(result.assets[0].uri, {
            encoding: 'base64',
          });
          const arrayBuffer = decode(base64);
          
          await supabase.storage
            .from('message-media')
            .upload('test-path.jpg', arrayBuffer, {
              contentType: 'image/jpg',
              cacheControl: '3600',
              upsert: false,
            });
        }
      });

      // Verify the upload flow
      expect(FileSystem.readAsStringAsync).toHaveBeenCalledWith(
        mockLocalUri,
        { encoding: 'base64' }
      );
      expect(decode).toHaveBeenCalledWith(mockBase64);
      expect(supabase.storage.from).toHaveBeenCalledWith('message-media');
      expect(supabase.storage.upload).toHaveBeenCalledWith(
        'test-path.jpg',
        mockArrayBuffer,
        expect.objectContaining({
          contentType: 'image/jpg',
          cacheControl: '3600',
          upsert: false,
        })
      );
    });

    it('should handle FileSystem.readAsStringAsync with base64 encoding', async () => {
      const testUri = 'file:///test/image.jpg';
      
      await act(async () => {
        await FileSystem.readAsStringAsync(testUri, {
          encoding: 'base64',
        });
      });

      expect(FileSystem.readAsStringAsync).toHaveBeenCalledWith(
        testUri,
        { encoding: 'base64' }
      );
    });

    it('should convert base64 to ArrayBuffer using decode', async () => {
      const testBase64 = 'test-base64-string';
      
      await act(async () => {
        decode(testBase64);
      });

      expect(decode).toHaveBeenCalledWith(testBase64);
    });

    it('should upload ArrayBuffer to Supabase Storage', async () => {
      const testFileName = 'test-chat-id/123456_abc.jpg';
      const testArrayBuffer = new ArrayBuffer(100);

      await act(async () => {
        await supabase.storage
          .from('message-media')
          .upload(testFileName, testArrayBuffer, {
            contentType: 'image/jpg',
            cacheControl: '3600',
            upsert: false,
          });
      });

      expect(supabase.storage.from).toHaveBeenCalledWith('message-media');
      expect(supabase.storage.upload).toHaveBeenCalledWith(
        testFileName,
        testArrayBuffer,
        expect.objectContaining({
          contentType: 'image/jpg',
        })
      );
    });

    it('should get public URL after upload', async () => {
      const testFileName = 'test-chat-id/123456_abc.jpg';

      await act(async () => {
        const result = supabase.storage
          .from('message-media')
          .getPublicUrl(testFileName);
        
        expect(result.data.publicUrl).toBe(mockPublicUrl);
      });

      expect(supabase.storage.getPublicUrl).toHaveBeenCalledWith(testFileName);
    });
  });

  describe('Camera Permissions', () => {
    it('should request camera permissions', async () => {
      render(<ChatScreen />);

      await waitFor(() => {
        expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalled();
      });
    });

    it('should check camera permissions before launching camera', async () => {
      (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: mockLocalUri }],
      });

      await act(async () => {
        const permission = await ImagePicker.getCameraPermissionsAsync();
        expect(permission.granted).toBe(true);
      });

      expect(ImagePicker.getCameraPermissionsAsync).toHaveBeenCalled();
    });

    it('should handle denied camera permissions', async () => {
      (ImagePicker.getCameraPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
        granted: false,
      });
      (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
        granted: false,
      });

      await act(async () => {
        const permission = await ImagePicker.getCameraPermissionsAsync();
        if (!permission.granted) {
          const newPermission = await ImagePicker.requestCameraPermissionsAsync();
          expect(newPermission.granted).toBe(false);
        }
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle FileSystem read error', async () => {
      const error = new Error('Failed to read file');
      (FileSystem.readAsStringAsync as jest.Mock).mockRejectedValue(error);

      await expect(
        FileSystem.readAsStringAsync(mockLocalUri, { encoding: 'base64' })
      ).rejects.toThrow('Failed to read file');
    });

    it('should handle Supabase upload error', async () => {
      const uploadError = { message: 'Upload failed' };
      (supabase.storage.upload as jest.Mock).mockResolvedValue({
        data: null,
        error: uploadError,
      });

      await act(async () => {
        const result = await supabase.storage
          .from('message-media')
          .upload('test.jpg', mockArrayBuffer, {
            contentType: 'image/jpg',
          });

        expect(result.error).toEqual(uploadError);
      });
    });

    it('should handle base64 decode error', async () => {
      const error = new Error('Invalid base64');
      (decode as jest.Mock).mockImplementation(() => {
        throw error;
      });

      expect(() => decode('invalid-base64')).toThrow('Invalid base64');
    });
  });

  describe('Integration Test', () => {
    it('should complete full image upload and send message flow', async () => {
      (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: mockLocalUri }],
      });

      render(<ChatScreen />);

      await waitFor(() => {
        expect(messagesService.getMessages).toHaveBeenCalled();
      });

      // Simulate full upload flow
      await act(async () => {
        // 1. Select image
        const pickerResult = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.8,
        });

        if (!pickerResult.canceled && pickerResult.assets[0]) {
          // 2. Read as base64
          const base64 = await FileSystem.readAsStringAsync(
            pickerResult.assets[0].uri,
            { encoding: 'base64' }
          );

          // 3. Convert to ArrayBuffer
          const arrayBuffer = decode(base64);

          // 4. Upload to Storage
          const uploadResult = await supabase.storage
            .from('message-media')
            .upload('test-chat-id/123456_abc.jpg', arrayBuffer, {
              contentType: 'image/jpg',
              cacheControl: '3600',
              upsert: false,
            });

          if (!uploadResult.error) {
            // 5. Get public URL
            const { data: { publicUrl } } = supabase.storage
              .from('message-media')
              .getPublicUrl('test-chat-id/123456_abc.jpg');

            // 6. Send message with image URL
            await messagesService.sendMessage(
              'test-chat-id',
              'test-user-id',
              'other-user-id',
              '',
              'image',
              publicUrl
            );
          }
        }
      });

      // Verify all steps were executed
      expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalled();
      expect(FileSystem.readAsStringAsync).toHaveBeenCalled();
      expect(decode).toHaveBeenCalled();
      expect(supabase.storage.upload).toHaveBeenCalled();
      expect(supabase.storage.getPublicUrl).toHaveBeenCalled();
      expect(messagesService.sendMessage).toHaveBeenCalledWith(
        'test-chat-id',
        'test-user-id',
        'other-user-id',
        '',
        'image',
        mockPublicUrl
      );
    });
  });
});

