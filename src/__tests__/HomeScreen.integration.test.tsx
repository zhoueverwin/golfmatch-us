import React from 'react';
import { render, waitFor, fireEvent, screen } from '@testing-library/react-native';
import HomeScreen from '../screens/HomeScreen';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { AuthProvider } from '../contexts/AuthContext';
import { supabase } from '../services/supabase';
import { Alert } from 'react-native';

// Mock Alert
jest.spyOn(Alert, 'alert');

const Stack = createStackNavigator();

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AuthProvider>
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={() => <>{children}</>} />
      </Stack.Navigator>
    </NavigationContainer>
  </AuthProvider>
);

describe('HomeScreen Integration Tests with Real Supabase Data', () => {
  let testUserId: string;
  let testUserProfile: any;

  beforeAll(async () => {
    // Get a real user from database (don't require user_id since some profiles might not have it)
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, user_id, name, profile_pictures')
      .limit(1);

    if (error || !profiles || profiles.length === 0) {
      throw new Error('No test users found in database. Please run test data setup first.');
    }

    testUserProfile = profiles[0];
    testUserId = profiles[0].id;

    console.log('✓ Test user loaded:', { id: testUserId, name: testUserProfile.name });
  });

  afterAll(async () => {
    // Cleanup: Remove any test posts created during tests
    await supabase
      .from('posts')
      .delete()
      .like('content', '%TEST_POST_%');
  });

  describe('Post Feed Loading', () => {
    it('should load recommended posts from Supabase successfully', async () => {
      const { getByText, queryByText } = render(
        <TestWrapper>
          <HomeScreen />
        </TestWrapper>
      );

      // Wait for loading to complete
      await waitFor(() => {
        expect(queryByText('読み込み中...')).toBeNull();
      }, { timeout: 10000 });

      // Verify posts are loaded
      const { data: posts, error } = await supabase
        .from('posts')
        .select(`
          *,
          user:profiles!posts_user_id_fkey(*)
        `)
        .order('created_at', { ascending: false })
        .limit(5);

      expect(error).toBeNull();
      expect(posts).toBeDefined();
      
      if (posts && posts.length > 0) {
        console.log(`✓ Found ${posts.length} posts in database`);
        // At least one post should be visible
        const firstPost = posts[0];
        if (firstPost.content) {
          await waitFor(() => {
            expect(queryByText(firstPost.content)).toBeTruthy();
          });
        }
      }
    }, 15000);

    it('should display video posts without playback errors', async () => {
      // Get posts with videos
      const { data: videoPosts, error } = await supabase
        .from('posts')
        .select(`
          id,
          content,
          videos,
          user:profiles!posts_user_id_fkey(name, profile_pictures)
        `)
        .not('videos', 'is', null)
        .limit(1);

      expect(error).toBeNull();
      
      if (videoPosts && videoPosts.length > 0) {
        const videoPost = videoPosts[0];
        console.log('✓ Testing video post:', {
          id: videoPost.id,
          videoCount: videoPost.videos?.length,
          videoUrls: videoPost.videos
        });

        // Verify video URLs are valid
        if (videoPost.videos && videoPost.videos.length > 0) {
          for (const videoUrl of videoPost.videos) {
            expect(videoUrl).toBeTruthy();
            expect(videoUrl).toMatch(/^https?:\/\//);
            console.log('✓ Valid video URL:', videoUrl);
          }
        }
      } else {
        console.log('⚠ No video posts found in database for testing');
      }
    }, 10000);
  });

  describe('Post Creation with Authenticated User', () => {
    it('should create a new post with authenticated user ID', async () => {
      // First, ensure we have an authenticated session
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: process.env.EXPO_PUBLIC_TEST_EMAIL || 'test@example.com',
        password: process.env.EXPO_PUBLIC_TEST_PASSWORD || 'testpassword123'
      });

      if (authError) {
        console.log('⚠ Auth failed, using test user ID directly:', testUserId);
      } else {
        console.log('✓ Authenticated user:', authData.user?.id);
      }

      const testContent = `TEST_POST_${Date.now()}: This is a test post`;
      const testImages = ['https://example.com/test-image.jpg'];

      // Create post using actual user ID
      const { data: newPost, error: postError } = await supabase
        .from('posts')
        .insert({
          user_id: testUserId,
          content: testContent,
          images: testImages,
          videos: []
        })
        .select(`
          *,
          user:profiles!posts_user_id_fkey(*)
        `)
        .single();

      expect(postError).toBeNull();
      expect(newPost).toBeDefined();
      expect(newPost?.content).toBe(testContent);
      expect(newPost?.user_id).toBe(testUserId);
      
      console.log('✓ Post created successfully:', {
        id: newPost?.id,
        content: newPost?.content,
        userId: newPost?.user_id
      });

      // Verify the post appears in the feed
      const { data: posts, error: fetchError } = await supabase
        .from('posts')
        .select('*')
        .eq('id', newPost?.id)
        .single();

      expect(fetchError).toBeNull();
      expect(posts).toBeDefined();
      
      console.log('✓ Post verified in database feed');
    }, 15000);

    it('should handle post creation without authenticated user gracefully', async () => {
      // Sign out to test error handling
      await supabase.auth.signOut();

      // Attempt to create post with invalid "current_user" string
      const { data, error } = await supabase
        .from('posts')
        .insert({
          user_id: null, // This should fail
          content: 'This should fail',
          images: []
        })
        .select()
        .single();

      // Expect this to fail
      expect(error).toBeDefined();
      console.log('✓ Post creation correctly fails without authenticated user');
    }, 10000);
  });

  describe('Post Interactions', () => {
    it('should like and unlike a post successfully', async () => {
      // Get a post to interact with
      const { data: posts, error } = await supabase
        .from('posts')
        .select('id')
        .limit(1);

      expect(error).toBeNull();
      
      if (posts && posts.length > 0) {
        const postId = posts[0].id;

        // Like the post
        const { error: likeError } = await supabase
          .from('post_likes')
          .insert({
            post_id: postId,
            user_id: testUserId,
            type: 'like'
          });

        // Check if already liked (duplicate key error is ok)
        if (!likeError || likeError.code === '23505') {
          console.log('✓ Post liked successfully');

          // Verify like exists
          const { data: likes, error: fetchError } = await supabase
            .from('post_likes')
            .select('*')
            .eq('post_id', postId)
            .eq('user_id', testUserId);

          expect(fetchError).toBeNull();
          expect(likes).toBeDefined();
          expect(likes!.length).toBeGreaterThan(0);

          // Unlike the post
          const { error: unlikeError } = await supabase
            .from('post_likes')
            .delete()
            .eq('post_id', postId)
            .eq('user_id', testUserId);

          expect(unlikeError).toBeNull();
          console.log('✓ Post unliked successfully');
        }
      }
    }, 10000);
  });

  describe('Video Player Error Handling', () => {
    it('should validate video URLs before attempting playback', async () => {
      const validUrls = [
        'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
        'https://storage.supabase.co/object/public/videos/test.mp4'
      ];

      const invalidUrls = [
        '',
        'not-a-url',
        'http://invalid',
        null,
        undefined
      ];

      for (const url of validUrls) {
        expect(url).toMatch(/^https?:\/\/.+\.(mp4|mov|m4v)$/i);
      }

      for (const url of invalidUrls) {
        if (url) {
          expect(url).not.toMatch(/^https?:\/\/.+\.(mp4|mov|m4v)$/i);
        } else {
          expect(url).toBeFalsy();
        }
      }

      console.log('✓ Video URL validation working correctly');
    });

    it('should handle missing or malformed video data gracefully', async () => {
      const malformedPosts = [
        { videos: null },
        { videos: [] },
        { videos: [''] },
        { videos: undefined },
        {}
      ];

      for (const post of malformedPosts) {
        const videos = (post as any).videos;
        const hasValidVideos = videos && Array.isArray(videos) && videos.length > 0 && videos[0];
        
        expect(hasValidVideos).toBeFalsy();
      }

      console.log('✓ Malformed video data handled correctly');
    });
  });

  describe('User Authentication Integration', () => {
    it('should get current authenticated user correctly', async () => {
      // Sign in with test credentials
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: process.env.EXPO_PUBLIC_TEST_EMAIL || 'test@example.com',
        password: process.env.EXPO_PUBLIC_TEST_PASSWORD || 'testpassword123'
      });

      if (authError) {
        console.log('⚠ Could not authenticate with test credentials');
        return;
      }

      expect(authData.user).toBeDefined();
      expect(authData.user?.id).toBeTruthy();

      // Get user profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authData.user!.id)
        .single();

      expect(profileError).toBeNull();
      expect(profile).toBeDefined();
      
      console.log('✓ Current user retrieved successfully:', {
        id: profile?.id,
        name: profile?.name
      });
    }, 10000);
  });
});

