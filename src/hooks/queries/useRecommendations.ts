/**
 * React Query hooks for the swipe/recommendation feed.
 *
 * Phase 3 (refactor sequence, 2026-05-19). Built ADDITIVELY. Existing
 * callers (TodaySwipeView, SwipeCardScreen) still go through
 * DataProvider directly — migration deferred.
 */

import { useQuery } from '@tanstack/react-query';
import { DataProvider } from '../../services';
import { User } from '../../types/dataModels';
import { queryKeys, queryDefaults } from './keys';

/**
 * Intelligent (scored) recommendations for the current user. This is the
 * recommended swipe-feed path; falls back to the simple recommender
 * server-side when the scoring RPC isn't available.
 */
export const useRecommendations = (
  userId: string | undefined,
  limit: number = 20,
) => {
  const query = useQuery({
    queryKey: queryKeys.recommendations(userId),
    queryFn: async (): Promise<User[]> => {
      if (!userId) return [];
      const response = await DataProvider.getIntelligentRecommendations(userId, limit);
      if (!response.success || response.error) {
        throw new Error(response.error || 'Failed to fetch recommendations');
      }
      return (response.data ?? []) as User[];
    },
    enabled: !!userId,
    ...queryDefaults.feedLike,
  });

  return {
    users: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
};

/**
 * Daily curated recommendations (TodaySwipeView). Smaller batch than
 * the general recommendation feed, refreshed once per server-day.
 */
export const useDailyRecommendations = (userId: string | undefined) => {
  const query = useQuery({
    queryKey: queryKeys.dailyRecommendations(userId),
    queryFn: async (): Promise<User[]> => {
      if (!userId) return [];
      const response = await DataProvider.getDailyRecommendations(userId);
      if (!response.success || response.error) {
        throw new Error(response.error || 'Failed to fetch daily recommendations');
      }
      return (response.data ?? []) as User[];
    },
    enabled: !!userId,
    // Daily recommendations turn over by server-day boundary, but the
    // *batch* is stable for hours — long staleTime is appropriate.
    ...queryDefaults.longLived,
  });

  return {
    users: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
};
