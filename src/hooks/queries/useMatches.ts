/**
 * React Query hooks for matches / likes-received / unseen matches.
 *
 * Phase 3 (refactor sequence, 2026-05-19). Built ADDITIVELY — does not
 * replace any existing screen call site. Migrating ConnectionsScreen
 * to use these hooks is deferred to a session where you can verify
 * on iOS Simulator.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DataProvider } from '../../services';
import { UserLike } from '../../types/dataModels';
import { queryKeys, queryDefaults } from './keys';

/**
 * All mutual matches for the current user.
 */
export const useMatches = (userId: string | undefined) => {
  const query = useQuery({
    queryKey: queryKeys.matches(userId),
    queryFn: async () => {
      if (!userId) return [];
      const response = await DataProvider.getMatches(userId);
      if (!response.success || response.error) {
        throw new Error(response.error || 'Failed to fetch matches');
      }
      return response.data ?? [];
    },
    enabled: !!userId,
    ...queryDefaults.feedLike,
  });

  return {
    matches: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
};

/**
 * Matches where the current user hasn't yet seen the celebration popup.
 * Drives MatchContext / match modal triggering.
 */
export const useUnseenMatches = (userId: string | undefined) => {
  const query = useQuery({
    queryKey: queryKeys.unseenMatches(userId),
    queryFn: async () => {
      if (!userId) return [];
      const response = await DataProvider.getUnseenMatches(userId);
      if (!response.success || response.error) {
        throw new Error(response.error || 'Failed to fetch unseen matches');
      }
      return response.data ?? [];
    },
    enabled: !!userId,
    ...queryDefaults.counter,
  });

  return {
    unseenMatches: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
};

/**
 * Likes RECEIVED by the current user (drives the Likes tab of Connections).
 */
export const useLikesReceived = (userId: string | undefined) => {
  const query = useQuery({
    queryKey: queryKeys.likesReceived(userId),
    queryFn: async (): Promise<UserLike[]> => {
      if (!userId) return [];
      const response = await DataProvider.getLikesReceived(userId);
      if (!response.success || response.error) {
        throw new Error(response.error || 'Failed to fetch likes received');
      }
      return (response.data ?? []) as UserLike[];
    },
    enabled: !!userId,
    ...queryDefaults.feedLike,
  });

  return {
    likes: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
};

/**
 * Mark a match as seen by the current user. Invalidates unseenMatches
 * so the badge / popup logic re-evaluates.
 */
export const useMarkMatchAsSeen = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ matchId, userId }: { matchId: string; userId: string }) => {
      const response = await DataProvider.markMatchAsSeen(matchId, userId);
      if (!response.success) {
        throw new Error(response.error || 'Failed to mark match as seen');
      }
      return response;
    },
    onSuccess: (_data, { userId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.unseenMatches(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.matches(userId) });
    },
  });
};
