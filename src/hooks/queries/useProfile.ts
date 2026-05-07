import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DataProvider } from '../../services';
import { User, UserProfile } from '../../types/dataModels';

export const useProfile = (userId: string | undefined) => {
  const query = useQuery({
    queryKey: ['profile', userId],
    queryFn: async () => {
      if (!userId) {
        throw new Error('User ID is required');
      }

      // OPTIMIZED: Removed CacheService clearing that defeated React Query caching
      // Let React Query be the single source of truth for cache management
      // Previous: Cleared cache on every query, causing unnecessary API calls

      // Use getUserProfile to get the nested UserProfile structure
      const response = await DataProvider.getUserProfile(userId);

      if (!response.success || response.error) {
        throw new Error(response.error || 'Failed to fetch profile');
      }

      return response.data as UserProfile;
    },
    // OPTIMIZED: Increased staleTime from 1 min to 5 min
    // Profiles rarely change, 1 min was causing 6x more refetches than necessary
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes (increased to match)
    enabled: !!userId, // Only run query if userId is provided
  });

  return {
    profile: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
};

// Hook for current user profile
export const useCurrentUserProfile = () => {
  const query = useQuery({
    queryKey: ['currentUserProfile'],
    queryFn: async () => {
      // OPTIMIZED: Removed CacheService clearing that defeated React Query caching
      const response = await DataProvider.getCurrentUser();

      if (!response.success || response.error) {
        throw new Error(response.error || 'Failed to fetch current user profile');
      }

      return response.data as User;
    },
    // OPTIMIZED: Increased staleTime from 1 min to 5 min
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });

  return {
    profile: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
};

// Mutation hook for updating profile
export const useUpdateProfile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, updates }: { userId: string; updates: Partial<User> }) => {
      const response = await DataProvider.updateUserProfile(userId, updates);
      if (!response.success) {
        throw new Error(response.error || 'Failed to update profile');
      }
      return response.data;
    },
    onSuccess: (data, variables) => {
      // Invalidate and refetch profile queries
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['currentUserProfile'] });
    },
  });
};

