/**
 * @jest-environment node
 */

import { UserActivityService } from '../services/userActivityService';
import { supabase } from '../services/supabase';

// Mock the supabase client
jest.mock('../services/supabase', () => ({
  supabase: {
    rpc: jest.fn(),
  },
}));

describe('UserActivityService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getFootprints', () => {
    it('should fetch and transform footprints correctly', async () => {
      const mockData = [
        {
          viewer_id: 'user1',
          viewer_name: 'John Doe',
          viewer_age: 30,
          viewer_prefecture: 'Tokyo',
          viewer_profile_picture: 'https://example.com/pic.jpg',
          viewed_at: '2025-10-30T10:00:00Z',
        },
        {
          viewer_id: 'user2',
          viewer_name: 'Jane Smith',
          viewer_age: 28,
          viewer_prefecture: 'Osaka',
          viewer_profile_picture: 'https://example.com/pic2.jpg',
          viewed_at: '2025-10-29T15:00:00Z',
        },
      ];

      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: mockData,
        error: null,
      });

      const result = await UserActivityService.getFootprints('target-user-id');

      expect(supabase.rpc).toHaveBeenCalledWith('get_user_footprints', {
        target_user_id: 'target-user-id',
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'user1',
        name: 'John Doe',
        profileImage: 'https://example.com/pic.jpg',
        age: 30,
        location: 'Tokyo',
        timestamp: '2025-10-30T10:00:00Z',
        type: 'footprint',
      });
    });

    it('should handle empty footprints', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: [],
        error: null,
      });

      const result = await UserActivityService.getFootprints('target-user-id');

      expect(result).toEqual([]);
    });

    it('should handle errors gracefully', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      const result = await UserActivityService.getFootprints('target-user-id');

      expect(result).toEqual([]);
    });

    it('should handle missing optional fields', async () => {
      const mockData = [
        {
          viewer_id: 'user1',
          viewer_name: null,
          viewer_age: null,
          viewer_prefecture: null,
          viewer_profile_picture: null,
          viewed_at: '2025-10-30T10:00:00Z',
        },
      ];

      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: mockData,
        error: null,
      });

      const result = await UserActivityService.getFootprints('target-user-id');

      expect(result[0].name).toBe('Unknown User');
      expect(result[0].profileImage).toBe('');
      expect(result[0].age).toBe(0);
      expect(result[0].location).toBe('');
    });
  });

  describe('getPastLikes', () => {
    it('should fetch and transform past likes correctly', async () => {
      const mockData = [
        {
          liker_id: 'user1',
          liker_name: 'Alice',
          liker_age: 25,
          liker_prefecture: 'Tokyo',
          liker_profile_picture: 'https://example.com/alice.jpg',
          liked_at: '2025-10-30T08:00:00Z',
        },
      ];

      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: mockData,
        error: null,
      });

      const result = await UserActivityService.getPastLikes('target-user-id');

      expect(supabase.rpc).toHaveBeenCalledWith('get_user_past_likes', {
        target_user_id: 'target-user-id',
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'user1',
        name: 'Alice',
        profileImage: 'https://example.com/alice.jpg',
        age: 25,
        location: 'Tokyo',
        timestamp: '2025-10-30T08:00:00Z',
        type: 'like',
      });
    });

    it('should handle empty past likes', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: [],
        error: null,
      });

      const result = await UserActivityService.getPastLikes('target-user-id');

      expect(result).toEqual([]);
    });

    it('should handle errors gracefully', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      const result = await UserActivityService.getPastLikes('target-user-id');

      expect(result).toEqual([]);
    });
  });

  describe('trackProfileView', () => {
    it('should track profile view successfully', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: true,
        error: null,
      });

      const result = await UserActivityService.trackProfileView('viewer-id', 'viewed-id');

      expect(supabase.rpc).toHaveBeenCalledWith('track_profile_view', {
        p_viewer_id: 'viewer-id',
        p_viewed_profile_id: 'viewed-id',
      });

      expect(result).toBe(true);
    });

    it('should not track self-views', async () => {
      const result = await UserActivityService.trackProfileView('same-id', 'same-id');

      expect(supabase.rpc).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it('should handle tracking errors gracefully', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'Tracking error' },
      });

      const result = await UserActivityService.trackProfileView('viewer-id', 'viewed-id');

      expect(result).toBe(false);
    });

    it('should return false for duplicate views', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: false,
        error: null,
      });

      const result = await UserActivityService.trackProfileView('viewer-id', 'viewed-id');

      expect(result).toBe(false);
    });
  });

  describe('getFootprintCount', () => {
    it('should return correct footprint count', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: 5,
        error: null,
      });

      const result = await UserActivityService.getFootprintCount('target-user-id');

      expect(supabase.rpc).toHaveBeenCalledWith('get_footprint_count', {
        target_user_id: 'target-user-id',
      });

      expect(result).toBe(5);
    });

    it('should return 0 for users with no footprints', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: 0,
        error: null,
      });

      const result = await UserActivityService.getFootprintCount('target-user-id');

      expect(result).toBe(0);
    });

    it('should handle errors and return 0', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'Error' },
      });

      const result = await UserActivityService.getFootprintCount('target-user-id');

      expect(result).toBe(0);
    });
  });

  describe('getPastLikesCount', () => {
    it('should return correct past likes count', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: 3,
        error: null,
      });

      const result = await UserActivityService.getPastLikesCount('target-user-id');

      expect(supabase.rpc).toHaveBeenCalledWith('get_past_likes_count', {
        target_user_id: 'target-user-id',
      });

      expect(result).toBe(3);
    });

    it('should return 0 for users with no past likes', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: 0,
        error: null,
      });

      const result = await UserActivityService.getPastLikesCount('target-user-id');

      expect(result).toBe(0);
    });

    it('should handle errors and return 0', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'Error' },
      });

      const result = await UserActivityService.getPastLikesCount('target-user-id');

      expect(result).toBe(0);
    });
  });
});

