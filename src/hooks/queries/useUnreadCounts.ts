/**
 * React Query hook for the notification unread count.
 *
 * Phase 3 (refactor sequence, 2026-05-19). Built ADDITIVELY. Existing
 * NotificationContext currently maintains its own copy of this state via
 * a realtime subscription; migrating it to consume this hook (and using
 * the realtime channel to call `refetch()` instead of duplicating state)
 * is deferred to a session where you can verify on iOS Simulator.
 */

import { useQuery } from '@tanstack/react-query';
import { notificationService } from '../../services/notificationService';
import { queryKeys, queryDefaults } from './keys';

/**
 * Total unread notification count for the given user. Used by the tab
 * bar badge.
 */
export const useUnreadCount = (userId: string | undefined) => {
  const query = useQuery({
    queryKey: queryKeys.unreadCounts(userId),
    queryFn: async (): Promise<number> => {
      if (!userId) return 0;
      const response = await notificationService.getUnreadCount(userId);
      if (!response.success || response.error) {
        throw new Error(response.error || 'Failed to fetch unread count');
      }
      return response.data ?? 0;
    },
    enabled: !!userId,
    // Counts back tab-bar badges — keep tight so the UI stays honest.
    ...queryDefaults.counter,
  });

  return {
    count: query.data ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
};
