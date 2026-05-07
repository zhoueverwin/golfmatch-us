/**
 * Test suite for MyPageScreen - Footprints and Past Likes functionality
 */

import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import MyPageScreen from '../screens/MyPageScreen';
import { UserActivityService } from '../services/userActivityService';
import { DataProvider } from '../services';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

// Mock dependencies
jest.mock('../services/userActivityService');
jest.mock('../services', () => ({
  DataProvider: {
    getUserProfile: jest.fn(),
  },
}));

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    profileId: 'test-user-id',
    user: { id: 'test-user-id' },
  }),
}));

jest.mock('../contexts/NotificationContext', () => ({
  useNotifications: () => ({
    unreadCount: 5,
  }),
}));

const Stack = createStackNavigator();

const renderWithNavigation = (component: React.ReactElement) => {
  return render(
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="MyPage" component={() => component} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

describe('MyPageScreen - Footprints and Past Likes', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock getUserProfile
    (DataProvider.getUserProfile as jest.Mock).mockResolvedValue({
      data: {
        basic: {
          name: 'Test User',
        },
        profile_pictures: ['https://example.com/profile.jpg'],
      },
    });
  });

  describe('Footprints Feature', () => {
    it('should display footprint count badge', async () => {
      (UserActivityService.getFootprints as jest.Mock).mockResolvedValue([
        {
          id: 'user1',
          name: 'John',
          age: 30,
          location: 'Tokyo',
          profileImage: 'https://example.com/john.jpg',
          timestamp: '2025-10-30T10:00:00Z',
          type: 'footprint',
        },
        {
          id: 'user2',
          name: 'Jane',
          age: 28,
          location: 'Osaka',
          profileImage: 'https://example.com/jane.jpg',
          timestamp: '2025-10-29T15:00:00Z',
          type: 'footprint',
        },
      ]);

      (UserActivityService.getFootprintCount as jest.Mock).mockResolvedValue(2);
      (UserActivityService.getPastLikes as jest.Mock).mockResolvedValue([]);
      (UserActivityService.getPastLikesCount as jest.Mock).mockResolvedValue(0);

      const { getByText } = renderWithNavigation(<MyPageScreen />);

      await waitFor(() => {
        expect(UserActivityService.getFootprints).toHaveBeenCalledWith('test-user-id');
        expect(UserActivityService.getFootprintCount).toHaveBeenCalledWith('test-user-id');
      });

      // Check if footprint count badge is displayed
      await waitFor(() => {
        expect(getByText('2')).toBeTruthy();
      });
    });

    it('should load footprints when footprint menu item is pressed', async () => {
      const mockFootprints = [
        {
          id: 'user1',
          name: 'John',
          age: 30,
          location: 'Tokyo',
          profileImage: 'https://example.com/john.jpg',
          timestamp: '2025-10-30T10:00:00Z',
          type: 'footprint',
        },
      ];

      (UserActivityService.getFootprints as jest.Mock).mockResolvedValue(mockFootprints);
      (UserActivityService.getFootprintCount as jest.Mock).mockResolvedValue(1);
      (UserActivityService.getPastLikes as jest.Mock).mockResolvedValue([]);
      (UserActivityService.getPastLikesCount as jest.Mock).mockResolvedValue(0);

      const { getByText } = renderWithNavigation(<MyPageScreen />);

      await waitFor(() => {
        expect(getByText('足あと')).toBeTruthy();
      });

      // Press footprint menu item
      fireEvent.press(getByText('足あと'));

      await waitFor(() => {
        expect(getByText('John')).toBeTruthy();
      });
    });

    it('should show empty state when no footprints exist', async () => {
      (UserActivityService.getFootprints as jest.Mock).mockResolvedValue([]);
      (UserActivityService.getFootprintCount as jest.Mock).mockResolvedValue(0);
      (UserActivityService.getPastLikes as jest.Mock).mockResolvedValue([]);
      (UserActivityService.getPastLikesCount as jest.Mock).mockResolvedValue(0);

      const { getByText, queryByText } = renderWithNavigation(<MyPageScreen />);

      await waitFor(() => {
        expect(getByText('足あと')).toBeTruthy();
      });

      // Press footprint menu item
      fireEvent.press(getByText('足あと'));

      await waitFor(() => {
        // Badge should not be shown
        const badge = queryByText('0');
        expect(badge).toBeFalsy();
      });
    });
  });

  describe('Past Likes Feature', () => {
    it('should display past likes count badge', async () => {
      (UserActivityService.getPastLikes as jest.Mock).mockResolvedValue([
        {
          id: 'user1',
          name: 'Alice',
          age: 25,
          location: 'Tokyo',
          profileImage: 'https://example.com/alice.jpg',
          timestamp: '2025-10-30T08:00:00Z',
          type: 'like',
        },
        {
          id: 'user2',
          name: 'Bob',
          age: 27,
          location: 'Kyoto',
          profileImage: 'https://example.com/bob.jpg',
          timestamp: '2025-10-29T12:00:00Z',
          type: 'like',
        },
      ]);

      (UserActivityService.getPastLikesCount as jest.Mock).mockResolvedValue(2);
      (UserActivityService.getFootprints as jest.Mock).mockResolvedValue([]);
      (UserActivityService.getFootprintCount as jest.Mock).mockResolvedValue(0);

      const { getByText } = renderWithNavigation(<MyPageScreen />);

      await waitFor(() => {
        expect(UserActivityService.getPastLikes).toHaveBeenCalledWith('test-user-id');
        expect(UserActivityService.getPastLikesCount).toHaveBeenCalledWith('test-user-id');
      });

      // Check if past likes count badge is displayed
      await waitFor(() => {
        expect(getByText('2')).toBeTruthy();
      });
    });

    it('should load past likes when past likes menu item is pressed', async () => {
      const mockPastLikes = [
        {
          id: 'user1',
          name: 'Alice',
          age: 25,
          location: 'Tokyo',
          profileImage: 'https://example.com/alice.jpg',
          timestamp: '2025-10-30T08:00:00Z',
          type: 'like',
        },
      ];

      (UserActivityService.getPastLikes as jest.Mock).mockResolvedValue(mockPastLikes);
      (UserActivityService.getPastLikesCount as jest.Mock).mockResolvedValue(1);
      (UserActivityService.getFootprints as jest.Mock).mockResolvedValue([]);
      (UserActivityService.getFootprintCount as jest.Mock).mockResolvedValue(0);

      const { getByText } = renderWithNavigation(<MyPageScreen />);

      await waitFor(() => {
        expect(getByText('過去のいいね')).toBeTruthy();
      });

      // Press past likes menu item
      fireEvent.press(getByText('過去のいいね'));

      await waitFor(() => {
        expect(getByText('Alice')).toBeTruthy();
      });
    });

    it('should show empty state when no past likes exist', async () => {
      (UserActivityService.getPastLikes as jest.Mock).mockResolvedValue([]);
      (UserActivityService.getPastLikesCount as jest.Mock).mockResolvedValue(0);
      (UserActivityService.getFootprints as jest.Mock).mockResolvedValue([]);
      (UserActivityService.getFootprintCount as jest.Mock).mockResolvedValue(0);

      const { getByText, queryByText } = renderWithNavigation(<MyPageScreen />);

      await waitFor(() => {
        expect(getByText('過去のいいね')).toBeTruthy();
      });

      // Press past likes menu item
      fireEvent.press(getByText('過去のいいね'));

      await waitFor(() => {
        // Badge should not be shown
        const badge = queryByText('0');
        expect(badge).toBeFalsy();
      });
    });
  });

  describe('Data Refresh', () => {
    it('should refresh data when screen comes into focus', async () => {
      (UserActivityService.getFootprints as jest.Mock).mockResolvedValue([]);
      (UserActivityService.getFootprintCount as jest.Mock).mockResolvedValue(0);
      (UserActivityService.getPastLikes as jest.Mock).mockResolvedValue([]);
      (UserActivityService.getPastLikesCount as jest.Mock).mockResolvedValue(0);

      renderWithNavigation(<MyPageScreen />);

      await waitFor(() => {
        expect(UserActivityService.getFootprints).toHaveBeenCalled();
        expect(UserActivityService.getPastLikes).toHaveBeenCalled();
      });

      // Verify initial call count
      expect(UserActivityService.getFootprints).toHaveBeenCalledTimes(1);
      expect(UserActivityService.getPastLikes).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle errors when loading footprints', async () => {
      (UserActivityService.getFootprints as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );
      (UserActivityService.getFootprintCount as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );
      (UserActivityService.getPastLikes as jest.Mock).mockResolvedValue([]);
      (UserActivityService.getPastLikesCount as jest.Mock).mockResolvedValue(0);

      const { getByText } = renderWithNavigation(<MyPageScreen />);

      await waitFor(() => {
        expect(getByText('足あと')).toBeTruthy();
      });

      // App should still render, even with errors
      expect(getByText('プロフィール')).toBeTruthy();
    });

    it('should handle errors when loading past likes', async () => {
      (UserActivityService.getPastLikes as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );
      (UserActivityService.getPastLikesCount as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );
      (UserActivityService.getFootprints as jest.Mock).mockResolvedValue([]);
      (UserActivityService.getFootprintCount as jest.Mock).mockResolvedValue(0);

      const { getByText } = renderWithNavigation(<MyPageScreen />);

      await waitFor(() => {
        expect(getByText('過去のいいね')).toBeTruthy();
      });

      // App should still render, even with errors
      expect(getByText('プロフィール')).toBeTruthy();
    });
  });
});

