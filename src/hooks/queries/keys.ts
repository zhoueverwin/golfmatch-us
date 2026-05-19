/**
 * Central React Query key factory.
 *
 * Phase 3 (refactor sequence, 2026-05-19): every query hook in
 * src/hooks/queries/ should derive its `queryKey` from here rather than
 * inventing tuple shapes ad-hoc. This matters because:
 *
 *  1. Invalidation is by key prefix. If two screens hold the same data
 *     under different key shapes, `invalidateQueries({ queryKey: ['profile'] })`
 *     misses one of them and the UI drifts.
 *  2. Phase 4 will collapse the data-layer god-files behind these hooks.
 *     The hooks' query keys are the stable seam — internal data fetching
 *     changes, keys do not.
 *
 * Rules:
 *  - Always use `as const` so the tuple type narrows to literal members.
 *    Without it `['profile', userId]` has type `string[]` and React Query
 *    loses the discriminated-key benefits.
 *  - Prefer broader prefixes for groups you want to invalidate together.
 *    `posts.home(userId)` and `posts.user(userId)` both start with
 *    `['posts']` so a `invalidateQueries({ queryKey: ['posts'] })` on
 *    create/delete reaches both feeds.
 *  - When adding a new hook, add its key here first.
 */

export const queryKeys = {
  // Profile data
  profile: (userId: string | undefined) => ['profile', userId] as const,
  currentUserProfile: () => ['currentUserProfile'] as const,

  // Posts (broad 'posts' prefix invalidates both feeds together)
  posts: {
    home: (type: 'recommended' | 'following', userId: string | undefined) =>
      ['posts', type, userId] as const,
    user: (userId: string) => ['userPosts', userId] as const,
  },

  // Likes & matches
  mutualLikes: (currentUserId: string | undefined, targetUserId: string | undefined) =>
    ['mutualLikes', currentUserId, targetUserId] as const,
  matches: (userId: string | undefined) => ['matches', userId] as const,
  unseenMatches: (userId: string | undefined) => ['unseenMatches', userId] as const,
  likesReceived: (userId: string | undefined) => ['likesReceived', userId] as const,

  // Recommendations (swipe feed)
  recommendations: (userId: string | undefined) =>
    ['recommendations', userId] as const,
  dailyRecommendations: (userId: string | undefined) =>
    ['dailyRecommendations', userId] as const,

  // Notifications
  unreadCounts: (userId: string | undefined) => ['unreadCounts', userId] as const,
  notifications: (userId: string | undefined) => ['notifications', userId] as const,

  // Messages
  messagePreviews: (userId: string | undefined) =>
    ['messagePreviews', userId] as const,
  chatMessages: (chatId: string | undefined) => ['chatMessages', chatId] as const,
} as const;

/**
 * Default cache config tuned for this app's traffic patterns.
 *
 * Profile/match data is rarely volatile from the user's perspective —
 * staleTime is generous to keep egress costs down. Override per-hook
 * when the data is genuinely time-sensitive (e.g. chat messages).
 */
export const queryDefaults = {
  // Profile-shaped data (profile, recommendations, mutual likes): low churn
  longLived: {
    staleTime: 5 * 60 * 1000, // 5 min
    gcTime: 30 * 60 * 1000, // 30 min
  },
  // Lists that benefit from background revalidation (matches, posts feeds)
  feedLike: {
    staleTime: 2 * 60 * 1000, // 2 min
    gcTime: 30 * 60 * 1000,
  },
  // Counts that affect badges — keep tighter so the tab bar stays honest
  counter: {
    staleTime: 30 * 1000, // 30 sec
    gcTime: 5 * 60 * 1000,
  },
} as const;
