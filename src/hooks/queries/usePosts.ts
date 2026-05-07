import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DataProvider } from '../../services';
import { Post } from '../../types/dataModels';

interface UsePostsOptions {
  type: 'recommended' | 'following';
  userId?: string;
  limit?: number;
  enabled?: boolean;
}

export const usePosts = ({ type, userId, limit = 10, enabled }: UsePostsOptions) => {
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: ['posts', type, userId],
    queryFn: async ({ pageParam = 1 }) => {
      const response = type === 'recommended'
        ? await DataProvider.getRecommendedPosts(pageParam, limit)
        : await DataProvider.getFollowingPosts(pageParam, limit);

      if (!response.success || response.error) {
        throw new Error(response.error || 'Failed to fetch posts');
      }

      return {
        posts: (response.data || []) as Post[],
        pagination: response.pagination,
      };
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (!lastPage.pagination?.hasMore) {
        return undefined;
      }
      return (lastPage.pagination.page || 0) + 1;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes - increased to reduce refetches
    gcTime: 60 * 60 * 1000, // 60 minutes - keep in cache longer
    refetchOnWindowFocus: false, // Disable auto-refetch on focus to save egress
    refetchOnMount: false, // Don't refetch if data exists and is not stale
    refetchOnReconnect: false, // Don't auto-refetch on reconnect
    enabled: enabled !== false, // Allow lazy loading (default: enabled)
  });

  // Flatten all pages into a single array of posts and deduplicate by id
  const allPosts = query.data?.pages.flatMap(page => page.posts) ?? [];
  const posts = allPosts.filter((post, index, self) =>
    index === self.findIndex(p => p.id === post.id)
  );

  return {
    posts,
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

// Hook for user-specific posts
export const useUserPosts = (userId: string, limit: number = 10) => {
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: ['userPosts', userId],
    queryFn: async ({ pageParam = 1 }) => {
      const response = await DataProvider.getUserPosts(userId, pageParam, limit);

      if (!response.success || response.error) {
        throw new Error(response.error || 'Failed to fetch user posts');
      }

      return {
        posts: (response.data || []) as Post[],
        pagination: response.pagination,
      };
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (!lastPage.pagination?.hasMore) {
        return undefined;
      }
      return (lastPage.pagination.page || 0) + 1;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes - increased to reduce refetches
    gcTime: 60 * 60 * 1000, // 60 minutes - keep in cache longer
    refetchOnWindowFocus: false, // Disable auto-refetch on focus to save egress
    refetchOnMount: false, // Don't refetch if data exists and is not stale
    refetchOnReconnect: false, // Don't auto-refetch on reconnect
    enabled: !!userId, // Only run query if userId is provided
  });

  // Flatten all pages into a single array of posts and deduplicate by id
  const allPosts = query.data?.pages.flatMap(page => page.posts) ?? [];
  const posts = allPosts.filter((post, index, self) =>
    index === self.findIndex(p => p.id === post.id)
  );

  return {
    posts,
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

// Mutation hooks for post interactions with optimistic updates
export const useReactToPost = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ postId, userId }: { postId: string; userId: string }) => {
      const response = await DataProvider.reactToPost(postId, userId);
      if (!response.success) {
        throw new Error(response.error || 'Failed to react to post');
      }
      return response;
    },
    // Optimistic update: Update UI immediately before server responds
    onMutate: async ({ postId }) => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ['posts'] });
      await queryClient.cancelQueries({ queryKey: ['userPosts'] });

      // Snapshot the previous values
      const previousPosts = queryClient.getQueriesData({ queryKey: ['posts'] });
      const previousUserPosts = queryClient.getQueriesData({ queryKey: ['userPosts'] });

      // Helper function to update posts in a query
      const updatePostsInQuery = (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            posts: page.posts.map((post: Post) =>
              post.id === postId
                ? {
                    ...post,
                    hasReacted: true,
                    reactions_count: (post.reactions_count || 0) + 1,
                  }
                : post
            ),
          })),
        };
      };

      // Optimistically update posts (home page)
      queryClient.setQueriesData({ queryKey: ['posts'] }, updatePostsInQuery);

      // Optimistically update userPosts (profile pages)
      queryClient.setQueriesData({ queryKey: ['userPosts'] }, updatePostsInQuery);

      // Return context with previous values for rollback
      return { previousPosts, previousUserPosts };
    },
    // On error, rollback to previous values
    onError: (err, variables, context) => {
      if (context?.previousPosts) {
        // Restore each query individually
        context.previousPosts.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      if (context?.previousUserPosts) {
        context.previousUserPosts.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
    },
    // Re-added onSuccess to ensure cache is properly updated after mutation
    onSuccess: () => {
      // Invalidate both posts and userPosts queries to refetch with updated data
      queryClient.invalidateQueries({ queryKey: ['posts'], refetchType: 'none' });
      queryClient.invalidateQueries({ queryKey: ['userPosts'], refetchType: 'none' });
    },
  });
};

export const useUnreactToPost = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ postId, userId }: { postId: string; userId: string }) => {
      const response = await DataProvider.unreactToPost(postId, userId);
      if (!response.success) {
        throw new Error(response.error || 'Failed to unreact to post');
      }
      return response;
    },
    // Optimistic update for unreact
    onMutate: async ({ postId }) => {
      await queryClient.cancelQueries({ queryKey: ['posts'] });
      await queryClient.cancelQueries({ queryKey: ['userPosts'] });

      const previousPosts = queryClient.getQueriesData({ queryKey: ['posts'] });
      const previousUserPosts = queryClient.getQueriesData({ queryKey: ['userPosts'] });

      // Helper function to update posts in a query
      const updatePostsInQuery = (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            posts: page.posts.map((post: Post) =>
              post.id === postId
                ? {
                    ...post,
                    hasReacted: false,
                    reactions_count: Math.max(0, (post.reactions_count || 0) - 1),
                  }
                : post
            ),
          })),
        };
      };

      // Optimistically update posts (home page)
      queryClient.setQueriesData({ queryKey: ['posts'] }, updatePostsInQuery);

      // Optimistically update userPosts (profile pages)
      queryClient.setQueriesData({ queryKey: ['userPosts'] }, updatePostsInQuery);

      return { previousPosts, previousUserPosts };
    },
    onError: (err, variables, context) => {
      if (context?.previousPosts) {
        // Restore each query individually
        context.previousPosts.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      if (context?.previousUserPosts) {
        context.previousUserPosts.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
    },
    // Re-added onSuccess to ensure cache is properly updated after mutation
    onSuccess: () => {
      // Invalidate both posts and userPosts queries to refetch with updated data
      queryClient.invalidateQueries({ queryKey: ['posts'], refetchType: 'none' });
      queryClient.invalidateQueries({ queryKey: ['userPosts'], refetchType: 'none' });
    },
  });
};

export const useCreatePost = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, content, images, videos }: { userId: string; content: string; images?: string[]; videos?: string[] }) => {
      const response = await DataProvider.createPost(userId, content, images, videos);
      if (!response.success) {
        throw new Error(response.error || 'Failed to create post');
      }
      return response;
    },
    onSuccess: () => {
      // Invalidate all post queries to show the new post
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['userPosts'] });
    },
  });
};

export const useUpdatePost = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ postId, updates }: { postId: string; updates: { text?: string; images?: string[]; videos?: string[] } }) => {
      const response = await DataProvider.updatePost(postId, updates);
      if (!response.success) {
        throw new Error(response.error || 'Failed to update post');
      }
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['userPosts'] });
    },
  });
};

export const useDeletePost = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ postId, userId }: { postId: string; userId: string }) => {
      const response = await DataProvider.deletePost(postId, userId);
      if (!response.success) {
        throw new Error(response.error || 'Failed to delete post');
      }
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['userPosts'] });
    },
  });
};

