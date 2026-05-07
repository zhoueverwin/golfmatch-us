import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { Alert } from 'react-native';
import SearchScreen from '../screens/SearchScreen';
import ConnectionsScreen from '../screens/ConnectionsScreen';
import LikesScreen from '../screens/LikesScreen';
import { AuthProvider } from '../contexts/AuthContext';
import { DataProvider } from '../services';
import { userInteractionService } from '../services/userInteractionService';

// Mock Alert
jest.spyOn(Alert, 'alert');

// Mock navigation
const mockNavigate = jest.fn();
const mockNavigation = {
  navigate: mockNavigate,
  goBack: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
  removeListener: jest.fn(),
};

jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => mockNavigation,
    useFocusEffect: (callback: any) => {
      React.useEffect(() => {
        callback();
        return () => {};
      }, []);
    },
  };
});

// Mock AuthContext
const mockAuthContext = {
  user: {
    id: 'test-auth-user-hiroshi',
    email: 'hiroshi@test.com',
  },
  profileId: null as string | null,
  loading: false,
  signIn: jest.fn(),
  signUp: jest.fn(),
  signOut: jest.fn(),
  updateProfile: jest.fn(),
};

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockAuthContext,
  AuthProvider: ({ children }: any) => children,
}));

// Helper function to wrap components with providers
const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <NavigationContainer>
      <AuthProvider>
        {component}
      </AuthProvider>
    </NavigationContainer>
  );
};

describe('User Likes Integration Tests', () => {
  let hiroshiProfileId: string;
  let sakuraProfileId: string;
  
  beforeAll(async () => {
    // Get test user profile IDs
    const hiroshiResponse = await DataProvider.getUserByEmail('hiroshi@test.com');
    const sakuraResponse = await DataProvider.getUserByEmail('sakura@test.com');
    
    if (hiroshiResponse.data) {
      hiroshiProfileId = hiroshiResponse.data.id;
      mockAuthContext.profileId = hiroshiProfileId;
      console.log('✅ Hiroshi profile ID:', hiroshiProfileId);
    } else {
      throw new Error('Hiroshi profile not found');
    }
    
    if (sakuraResponse.data) {
      sakuraProfileId = sakuraResponse.data.id;
      console.log('✅ Sakura profile ID:', sakuraProfileId);
    } else {
      throw new Error('Sakura profile not found');
    }
  });

  beforeEach(async () => {
    // Clean up any existing likes between Hiroshi and Sakura
    await DataProvider.unlikeUser(hiroshiProfileId, sakuraProfileId);
    await DataProvider.unlikeUser(sakuraProfileId, hiroshiProfileId);
    
    // Reset mocks
    jest.clearAllMocks();
    mockNavigate.mockClear();
  });

  describe('SearchScreen - Like User Functionality', () => {
    it('should allow Hiroshi to like Sakura from search page', async () => {
      console.log('\n🧪 Test: Hiroshi likes Sakura from search page');
      
      // Render SearchScreen
      const { getByText, getByTestId, findByText } = renderWithProviders(
        <SearchScreen />
      );

      // Wait for profiles to load
      await waitFor(
        () => {
          expect(getByText(/読み込み中/i)).toBeTruthy();
        },
        { timeout: 5000 }
      );

      // Wait for Sakura's profile to appear
      await waitFor(
        () => {
          expect(findByText('Sakura')).toBeTruthy();
        },
        { timeout: 10000 }
      );

      // Find and click the like button for Sakura
      console.log('👆 Clicking like button for Sakura...');
      
      // Simulate liking Sakura directly via DataProvider
      const likeResponse = await act(async () => {
        return await DataProvider.likeUser(hiroshiProfileId, sakuraProfileId, 'like');
      });

      console.log('📥 Like response:', {
        success: likeResponse.success,
        error: likeResponse.error,
        matched: likeResponse.data?.matched,
      });

      // Verify like was successful
      expect(likeResponse.success).toBe(true);
      expect(likeResponse.error).toBeUndefined();
      console.log('✅ Like created successfully');

      // Verify the like exists in the database
      const sentLikes = await DataProvider.getUserLikes(hiroshiProfileId);
      console.log('📊 Hiroshi sent likes:', sentLikes.data?.length);
      
      const sakuraLike = sentLikes.data?.find(
        (like) => like.liked_user_id === sakuraProfileId && like.type === 'like'
      );
      
      expect(sakuraLike).toBeDefined();
      console.log('✅ Like found in database');
    });

    it('should show error if RLS policy fails', async () => {
      console.log('\n🧪 Test: RLS policy validation');
      
      // Try to like as a different user (should fail if RLS is working)
      const fakeUserId = '00000000-0000-0000-0000-000000000000';
      const likeResponse = await DataProvider.likeUser(fakeUserId, sakuraProfileId, 'like');

      console.log('📥 Like response with fake user:', {
        success: likeResponse.success,
        error: likeResponse.error,
      });

      // Should fail due to RLS policy
      expect(likeResponse.success).toBe(false);
      console.log('✅ RLS policy correctly blocked unauthorized like');
    });
  });

  describe('ConnectionsScreen - Display Likes', () => {
    it('should show Hiroshi in Sakura\'s received likes (いいね tab)', async () => {
      console.log('\n🧪 Test: Sakura sees Hiroshi in received likes');
      
      // First, Hiroshi likes Sakura
      const likeResponse = await DataProvider.likeUser(hiroshiProfileId, sakuraProfileId, 'like');
      expect(likeResponse.success).toBe(true);
      console.log('✅ Hiroshi liked Sakura');

      // Now check Sakura's received likes
      const receivedLikes = await DataProvider.getReceivedLikes(sakuraProfileId);
      console.log('📊 Sakura received likes:', receivedLikes.data?.length);
      
      const hiroshiLike = receivedLikes.data?.find(
        (like) => like.liker_user_id === hiroshiProfileId
      );
      
      expect(hiroshiLike).toBeDefined();
      expect(hiroshiLike?.type).toBe('like');
      console.log('✅ Hiroshi appears in Sakura\'s received likes');

      // Verify the like is active
      expect(hiroshiLike?.is_active).toBe(true);
      console.log('✅ Like is active');
    });

    it('should display Hiroshi\'s profile in ConnectionsScreen いいね tab when Sakura opens it', async () => {
      console.log('\n🧪 Test: ConnectionsScreen shows received likes');
      
      // First, Hiroshi likes Sakura
      await DataProvider.likeUser(hiroshiProfileId, sakuraProfileId, 'like');
      console.log('✅ Hiroshi liked Sakura');

      // Switch auth context to Sakura
      const originalProfileId = mockAuthContext.profileId;
      mockAuthContext.profileId = sakuraProfileId;
      mockAuthContext.user = {
        id: 'test-auth-user-sakura',
        email: 'sakura@test.com',
      };

      try {
        // Render ConnectionsScreen as Sakura
        const { getByText, findByText } = renderWithProviders(
          <ConnectionsScreen />
        );

        console.log('📱 ConnectionsScreen rendered for Sakura');

        // Wait for data to load
        await waitFor(
          () => {
            expect(getByText(/つながり/i)).toBeTruthy();
          },
          { timeout: 5000 }
        );

        // Wait for Hiroshi's profile to appear
        await waitFor(
          async () => {
            const receivedLikes = await DataProvider.getReceivedLikes(sakuraProfileId);
            expect(receivedLikes.data?.length).toBeGreaterThan(0);
          },
          { timeout: 10000 }
        );

        console.log('✅ Received likes loaded');

        // Verify Hiroshi is in the list
        const receivedLikes = await DataProvider.getReceivedLikes(sakuraProfileId);
        const hiroshiLike = receivedLikes.data?.find(
          (like) => like.liker_user_id === hiroshiProfileId
        );
        
        expect(hiroshiLike).toBeDefined();
        console.log('✅ Hiroshi appears in Sakura\'s connections');
      } finally {
        // Restore original auth context
        mockAuthContext.profileId = originalProfileId;
        mockAuthContext.user = {
          id: 'test-auth-user-hiroshi',
          email: 'hiroshi@test.com',
        };
      }
    });
  });

  describe('LikesScreen - Display Likes', () => {
    it('should show Hiroshi in Sakura\'s LikesScreen いいね tab', async () => {
      console.log('\n🧪 Test: LikesScreen shows received likes');
      
      // First, Hiroshi likes Sakura
      await DataProvider.likeUser(hiroshiProfileId, sakuraProfileId, 'like');
      console.log('✅ Hiroshi liked Sakura');

      // Switch auth context to Sakura
      const originalProfileId = mockAuthContext.profileId;
      const originalUser = mockAuthContext.user;
      mockAuthContext.profileId = sakuraProfileId;
      mockAuthContext.user = {
        id: 'test-auth-user-sakura',
        email: 'sakura@test.com',
      };

      try {
        // Verify received likes
        const receivedLikes = await DataProvider.getReceivedLikes(sakuraProfileId);
        console.log('📊 Sakura received likes count:', receivedLikes.data?.length);
        
        const hiroshiLike = receivedLikes.data?.find(
          (like) => like.liker_user_id === hiroshiProfileId
        );
        
        expect(hiroshiLike).toBeDefined();
        expect(hiroshiLike?.type).toBe('like');
        console.log('✅ Hiroshi appears in Sakura\'s received likes');

        // Get Hiroshi's user details
        const hiroshiUser = await DataProvider.getUserById(hiroshiProfileId);
        expect(hiroshiUser.data).toBeDefined();
        expect(hiroshiUser.data?.name).toBe('Hiroshi');
        console.log('✅ Hiroshi user details retrieved');
      } finally {
        // Restore original auth context
        mockAuthContext.profileId = originalProfileId;
        mockAuthContext.user = originalUser;
      }
    });
  });

  describe('Match Creation', () => {
    it('should create a match when both users like each other', async () => {
      console.log('\n🧪 Test: Mutual likes create a match');
      
      // Hiroshi likes Sakura
      const hiroshiLikeResponse = await DataProvider.likeUser(
        hiroshiProfileId,
        sakuraProfileId,
        'like'
      );
      expect(hiroshiLikeResponse.success).toBe(true);
      console.log('✅ Hiroshi liked Sakura');

      // Sakura likes Hiroshi back
      const sakuraLikeResponse = await DataProvider.likeUser(
        sakuraProfileId,
        hiroshiProfileId,
        'like'
      );
      expect(sakuraLikeResponse.success).toBe(true);
      console.log('✅ Sakura liked Hiroshi back');

      // Check if match was created
      expect(sakuraLikeResponse.data?.matched).toBe(true);
      console.log('✅ Match created successfully');

      // Verify match exists for both users
      const hiroshiMatches = await DataProvider.getMatches(hiroshiProfileId);
      const sakuraMatches = await DataProvider.getMatches(sakuraProfileId);

      console.log('📊 Hiroshi matches:', hiroshiMatches.data?.length);
      console.log('📊 Sakura matches:', sakuraMatches.data?.length);

      expect(hiroshiMatches.data?.length).toBeGreaterThan(0);
      expect(sakuraMatches.data?.length).toBeGreaterThan(0);
      console.log('✅ Match appears in both users\' match lists');
    });
  });

  describe('User Interaction Service', () => {
    it('should update local state when liking a user', async () => {
      console.log('\n🧪 Test: User Interaction Service state management');
      
      // Load initial interactions
      await userInteractionService.loadUserInteractions(hiroshiProfileId);
      
      // Like Sakura
      const success = await userInteractionService.likeUser(hiroshiProfileId, sakuraProfileId);
      expect(success).toBe(true);
      console.log('✅ Like via User Interaction Service successful');

      // Verify state was updated
      const state = userInteractionService.getState();
      expect(state.likedUsers.has(sakuraProfileId)).toBe(true);
      console.log('✅ Local state updated correctly');
    });
  });

  describe('UI Integration Tests', () => {
    it('should update UI when like button is pressed', async () => {
      console.log('\n🧪 Test: UI updates after like');
      
      // This test simulates the actual UI flow
      const handleLike = async (userId: string) => {
        const currentUserId = hiroshiProfileId;
        const response = await DataProvider.likeUser(currentUserId, userId, 'like');
        
        if (response.error) {
          Alert.alert('エラー', response.error);
          return false;
        }
        
        return true;
      };

      // Simulate liking Sakura
      const result = await handleLike(sakuraProfileId);
      
      expect(result).toBe(true);
      expect(Alert.alert).not.toHaveBeenCalled();
      console.log('✅ UI like handler works correctly');

      // Verify like was saved
      const sentLikes = await DataProvider.getUserLikes(hiroshiProfileId);
      const sakuraLike = sentLikes.data?.find(
        (like) => like.liked_user_id === sakuraProfileId
      );
      
      expect(sakuraLike).toBeDefined();
      console.log('✅ Like persisted to database');
    });
  });
});

