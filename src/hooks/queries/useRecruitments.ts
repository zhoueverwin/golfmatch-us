/**
 * React Query hooks for the Recruitment (募集) feature
 *
 * Provides:
 * - List queries with pagination and filtering
 * - Single item queries
 * - Mutations for CRUD operations
 * - Application workflow mutations
 */

import {
  useInfiniteQuery,
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { recruitmentsService } from '../../services/supabase/recruitments.service';
import {
  Recruitment,
  RecruitmentWithCounts,
  RecruitmentApplication,
  CreateRecruitmentInput,
  UpdateRecruitmentInput,
  RecruitmentFilters,
  ApplicationStatus,
} from '../../types';

// Query key factory for consistent key management
export const recruitmentKeys = {
  all: ['recruitments'] as const,
  lists: () => [...recruitmentKeys.all, 'list'] as const,
  list: (filters?: RecruitmentFilters) => [...recruitmentKeys.lists(), filters] as const,
  details: () => [...recruitmentKeys.all, 'detail'] as const,
  detail: (id: string) => [...recruitmentKeys.details(), id] as const,
  myRecruitments: (userId: string) => [...recruitmentKeys.all, 'my', userId] as const,
  myApplications: (userId: string) => [...recruitmentKeys.all, 'applications', userId] as const,
  applications: (recruitmentId: string) => [...recruitmentKeys.all, 'apps', recruitmentId] as const,
  participants: (recruitmentId: string) => [...recruitmentKeys.all, 'participants', recruitmentId] as const,
  pendingCount: (userId: string) => [...recruitmentKeys.all, 'pendingCount', userId] as const,
};

// =============================================================================
// List Queries
// =============================================================================

interface UseRecruitmentsOptions {
  filters?: RecruitmentFilters;
  currentUserId?: string;
  limit?: number;
  enabled?: boolean;
}

/**
 * Hook for fetching paginated recruitments with filters
 */
export const useRecruitments = ({
  filters,
  currentUserId,
  limit = 20,
  enabled = true,
}: UseRecruitmentsOptions = {}) => {
  const query = useInfiniteQuery({
    queryKey: recruitmentKeys.list(filters),
    queryFn: async ({ pageParam = 1 }) => {
      const response = await recruitmentsService.getRecruitments(
        filters,
        pageParam,
        limit,
        currentUserId
      );

      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch recruitments');
      }

      return {
        recruitments: response.data || [],
        pagination: response.pagination,
      };
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (!lastPage.pagination?.hasMore) return undefined;
      return (lastPage.pagination.page || 0) + 1;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: false,
    enabled,
  });

  // Flatten pages and deduplicate
  const allRecruitments = query.data?.pages.flatMap(page => page.recruitments) ?? [];
  const recruitments = allRecruitments.filter(
    (r, index, self) => index === self.findIndex(item => item.id === r.id)
  );

  return {
    recruitments,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    refetch: query.refetch,
  };
};

/**
 * Hook for fetching user's own recruitments (as host)
 */
export const useMyRecruitments = (userId: string, enabled = true) => {
  return useQuery({
    queryKey: recruitmentKeys.myRecruitments(userId),
    queryFn: async () => {
      const response = await recruitmentsService.getMyRecruitments(userId);
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch my recruitments');
      }
      return response.data || [];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!userId && enabled,
  });
};

/**
 * Hook for fetching user's applications (as applicant)
 */
export const useMyApplications = (userId: string, enabled = true) => {
  return useQuery({
    queryKey: recruitmentKeys.myApplications(userId),
    queryFn: async () => {
      const response = await recruitmentsService.getMyApplications(userId);
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch my applications');
      }
      return response.data || [];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!userId && enabled,
  });
};

// =============================================================================
// Single Item Queries
// =============================================================================

/**
 * Hook for fetching a single recruitment by ID
 */
export const useRecruitment = (recruitmentId: string, currentUserId?: string, enabled = true) => {
  return useQuery({
    queryKey: recruitmentKeys.detail(recruitmentId),
    queryFn: async () => {
      const response = await recruitmentsService.getRecruitmentById(recruitmentId, currentUserId);
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch recruitment');
      }
      return response.data;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!recruitmentId && enabled,
  });
};

/**
 * Hook for fetching applications for a recruitment (host view)
 */
export const useRecruitmentApplications = (
  recruitmentId: string,
  status?: ApplicationStatus,
  enabled = true
) => {
  return useQuery({
    queryKey: [...recruitmentKeys.applications(recruitmentId), status],
    queryFn: async () => {
      const response = await recruitmentsService.getApplicationsForRecruitment(recruitmentId, status);
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch applications');
      }
      return response.data || [];
    },
    staleTime: 2 * 60 * 1000, // 2 minutes - applications change more frequently
    gcTime: 15 * 60 * 1000,
    enabled: !!recruitmentId && enabled,
  });
};

/**
 * Hook for fetching approved participants
 */
export const useApprovedParticipants = (recruitmentId: string, enabled = true) => {
  return useQuery({
    queryKey: recruitmentKeys.participants(recruitmentId),
    queryFn: async () => {
      const response = await recruitmentsService.getApprovedParticipants(recruitmentId);
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch participants');
      }
      return response.data || [];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!recruitmentId && enabled,
  });
};

/**
 * Hook for fetching pending application count (for badge)
 */
export const usePendingApplicationCount = (userId: string, enabled = true) => {
  return useQuery({
    queryKey: recruitmentKeys.pendingCount(userId),
    queryFn: async () => {
      const response = await recruitmentsService.getPendingApplicationCount(userId);
      if (!response.success) {
        throw new Error(response.error || 'Failed to count pending applications');
      }
      return response.data || 0;
    },
    staleTime: 1 * 60 * 1000, // 1 minute - check frequently for new applications
    gcTime: 10 * 60 * 1000,
    enabled: !!userId && enabled,
  });
};

// =============================================================================
// Mutations
// =============================================================================

/**
 * Hook for creating a new recruitment
 */
export const useCreateRecruitment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      hostId,
      input,
    }: {
      hostId: string;
      input: CreateRecruitmentInput;
    }) => {
      const response = await recruitmentsService.createRecruitment(hostId, input);
      if (!response.success) {
        throw new Error(response.error || 'Failed to create recruitment');
      }
      return response.data!;
    },
    onSuccess: (data, variables) => {
      // Invalidate list queries
      queryClient.invalidateQueries({ queryKey: recruitmentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: recruitmentKeys.myRecruitments(variables.hostId) });
    },
  });
};

/**
 * Hook for updating a recruitment
 */
export const useUpdateRecruitment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      recruitmentId,
      updates,
    }: {
      recruitmentId: string;
      updates: UpdateRecruitmentInput;
    }) => {
      const response = await recruitmentsService.updateRecruitment(recruitmentId, updates);
      if (!response.success) {
        throw new Error(response.error || 'Failed to update recruitment');
      }
      return response.data!;
    },
    onSuccess: (data) => {
      // Update cache with new data
      queryClient.setQueryData(recruitmentKeys.detail(data.id), data);
      // Invalidate list queries
      queryClient.invalidateQueries({ queryKey: recruitmentKeys.lists() });
      if (data.host_id) {
        queryClient.invalidateQueries({ queryKey: recruitmentKeys.myRecruitments(data.host_id) });
      }
    },
  });
};

/**
 * Hook for deleting a recruitment
 */
export const useDeleteRecruitment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      recruitmentId,
      hostId,
    }: {
      recruitmentId: string;
      hostId: string;
    }) => {
      const response = await recruitmentsService.deleteRecruitment(recruitmentId);
      if (!response.success) {
        throw new Error(response.error || 'Failed to delete recruitment');
      }
      return { recruitmentId, hostId };
    },
    onSuccess: (_, variables) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: recruitmentKeys.detail(variables.recruitmentId) });
      // Invalidate lists
      queryClient.invalidateQueries({ queryKey: recruitmentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: recruitmentKeys.myRecruitments(variables.hostId) });
    },
  });
};

/**
 * Hook for closing a recruitment
 */
export const useCloseRecruitment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (recruitmentId: string) => {
      const response = await recruitmentsService.closeRecruitment(recruitmentId);
      if (!response.success) {
        throw new Error(response.error || 'Failed to close recruitment');
      }
      return response.data!;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(recruitmentKeys.detail(data.id), data);
      queryClient.invalidateQueries({ queryKey: recruitmentKeys.lists() });
    },
  });
};

// =============================================================================
// Application Mutations
// =============================================================================

/**
 * Hook for applying to a recruitment
 */
export const useApplyToRecruitment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      recruitmentId,
      applicantId,
      message,
    }: {
      recruitmentId: string;
      applicantId: string;
      message?: string;
    }) => {
      const response = await recruitmentsService.applyToRecruitment(
        recruitmentId,
        applicantId,
        message
      );
      if (!response.success) {
        throw new Error(response.error || 'Failed to apply to recruitment');
      }
      return response.data!;
    },
    onSuccess: (data, variables) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: recruitmentKeys.detail(variables.recruitmentId) });
      queryClient.invalidateQueries({ queryKey: recruitmentKeys.myApplications(variables.applicantId) });
      queryClient.invalidateQueries({ queryKey: recruitmentKeys.lists() });
    },
  });
};

/**
 * Hook for approving an application
 */
export const useApproveApplication = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      applicationId,
      responseMessage,
    }: {
      applicationId: string;
      recruitmentId: string;
      hostId: string;
      responseMessage?: string;
    }) => {
      const response = await recruitmentsService.approveApplication(applicationId, responseMessage);
      if (!response.success) {
        throw new Error(response.error || 'Failed to approve application');
      }
      return response.data!;
    },
    onSuccess: (data, variables) => {
      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: recruitmentKeys.applications(variables.recruitmentId) });
      queryClient.invalidateQueries({ queryKey: recruitmentKeys.detail(variables.recruitmentId) });
      queryClient.invalidateQueries({ queryKey: recruitmentKeys.participants(variables.recruitmentId) });
      queryClient.invalidateQueries({ queryKey: recruitmentKeys.pendingCount(variables.hostId) });
      queryClient.invalidateQueries({ queryKey: recruitmentKeys.myRecruitments(variables.hostId) });
    },
  });
};

/**
 * Hook for rejecting an application
 */
export const useRejectApplication = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      applicationId,
      responseMessage,
    }: {
      applicationId: string;
      recruitmentId: string;
      hostId: string;
      responseMessage?: string;
    }) => {
      const response = await recruitmentsService.rejectApplication(applicationId, responseMessage);
      if (!response.success) {
        throw new Error(response.error || 'Failed to reject application');
      }
      return response.data!;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: recruitmentKeys.applications(variables.recruitmentId) });
      queryClient.invalidateQueries({ queryKey: recruitmentKeys.pendingCount(variables.hostId) });
      queryClient.invalidateQueries({ queryKey: recruitmentKeys.myRecruitments(variables.hostId) });
    },
  });
};

/**
 * Hook for withdrawing an application
 */
export const useWithdrawApplication = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      applicationId,
    }: {
      applicationId: string;
      applicantId: string;
      recruitmentId: string;
    }) => {
      const response = await recruitmentsService.withdrawApplication(applicationId);
      if (!response.success) {
        throw new Error(response.error || 'Failed to withdraw application');
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: recruitmentKeys.myApplications(variables.applicantId) });
      queryClient.invalidateQueries({ queryKey: recruitmentKeys.detail(variables.recruitmentId) });
      queryClient.invalidateQueries({ queryKey: recruitmentKeys.lists() });
    },
  });
};
