import { useQuery } from '@tanstack/react-query';
import { DataProvider } from '../../services';
import { useMemo } from 'react';

// Hook for checking mutual likes for a single user pair
export const useMutualLikes = (currentUserId: string | undefined, targetUserId: string | undefined) => {
  const query = useQuery({
    queryKey: ['mutualLikes', currentUserId, targetUserId],
    queryFn: async () => {
      if (!currentUserId || !targetUserId) {
        return false;
      }

      const response = await DataProvider.checkMutualLikes(currentUserId, targetUserId);
      return response.success && response.data ? true : false;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes - mutual likes don't change frequently
    gcTime: 30 * 60 * 1000,
    enabled: !!currentUserId && !!targetUserId,
  });

  return {
    hasMutualLikes: query.data ?? false,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
};

// Hook for batch checking mutual likes for multiple users
// Uses a single batch API call instead of N individual calls (fixes N+1 query problem)
export const useBatchMutualLikes = (currentUserId: string | undefined, targetUserIds: string[]) => {
  // Memoize unique user IDs to prevent unnecessary re-fetches
  // Sort to ensure stable cache key regardless of post order
  const uniqueUserIds = useMemo(() => {
    const unique = Array.from(new Set(targetUserIds));
    return unique.sort();
  }, [targetUserIds.join(',')]); // Join to create stable dependency

  const query = useQuery({
    // Use a stable cache key based on sorted user IDs
    queryKey: ['batchMutualLikes', currentUserId, uniqueUserIds],
    queryFn: async () => {
      if (!currentUserId || uniqueUserIds.length === 0) {
        return {};
      }

      // Single batch API call instead of N individual calls
      const response = await DataProvider.batchCheckMutualLikes(currentUserId, uniqueUserIds);
      return response.success && response.data ? response.data : {};
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000,
    enabled: !!currentUserId && uniqueUserIds.length > 0,
    // Prevent refetching when user IDs change slightly (new posts loaded)
    // The batch result will be merged with cached results
    placeholderData: (previousData) => previousData,
  });

  return {
    mutualLikesMap: query.data ?? {},
    isLoading: query.isLoading,
    isError: query.isError,
  };
};

