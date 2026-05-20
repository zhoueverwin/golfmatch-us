// Supabase Data Provider - Replaces the mock DataProvider with real Supabase backend
// Maintains the same interface as the original DataProvider for seamless migration

import {
  User,
  Post,
  Message,
  MessagePreview,
  ConnectionItem,
  SearchFilters,
  UserProfile,
  Availability,
  CalendarData,
  UserLike,
  UserInteraction,
  InteractionType,
  ServiceResponse,
  PaginatedServiceResponse,
  ContactInquiry,
  ContactReply,
} from "../types/dataModels";
import { calculateAge } from "../utils/formatters";
import { ProfilesService } from "./supabase/profiles.service";
import { PostsService } from "./supabase/posts.service";
import { MatchesService } from "./supabase/matches.service";
import { MessagesService } from "./supabase/messages.service";
import { AvailabilityService } from "./supabase/availability.service";
import { ContactInquiriesService } from "./supabase/contact-inquiries.service";
import { supabase } from "./supabase";
import { resolveProfileId } from "./userMappingService";

// Create service instances
const profilesService = new ProfilesService();
const postsService = new PostsService();
const matchesService = new MatchesService();
const messagesService = new MessagesService();
const availabilityService = new AvailabilityService();
const contactInquiriesService = new ContactInquiriesService();
import CacheService from "./cacheService";
import { getCachedAuthUserId } from "./authCache";

class SupabaseDataProvider {
  /**
   * Optimized profile resolution - single query with OR conditions
   * Replaces 3 sequential queries with 1 query
   */
  private async resolveProfileByAnyColumn(
    value: string,
  ): Promise<{ id: string; gender: User["gender"] | null; isPremium: boolean } | null> {
    if (!value) return null;

    const trimmedValue = value.trim();
    
    // Check if value looks like a UUID
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmedValue);

    // Single query with OR conditions - checks all three columns at once
    const { data, error } = await supabase
      .from("profiles")
      .select("id, gender, is_premium")
      .or(
        isUuid
          ? `id.eq.${trimmedValue},user_id.eq.${trimmedValue},legacy_id.eq.${trimmedValue}`
          : `legacy_id.eq.${trimmedValue},user_id.eq.${trimmedValue}`
      )
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(
        `[SupabaseDataProvider] Failed to resolve profile for ${trimmedValue}:`,
        error.message,
      );
      return null;
    }

    if (!data) {
      return null;
    }

    return {
      id: data.id,
      gender: (data.gender ?? null) as User["gender"] | null,
      isPremium: data.is_premium === true,
    };
  }

  private async resolveProfileContext(
    userId?: string,
  ): Promise<{ id: string; gender: User["gender"] | null; isPremium: boolean } | null> {
    // If userId provided, try to resolve it first
    if (userId) {
      const profile = await this.resolveProfileByAnyColumn(userId);
      if (profile) return profile;
    }

    // Fall back to authenticated user (uses shared auth cache)
    const authUserId = await getCachedAuthUserId();
    if (authUserId) {
      return await this.resolveProfileByAnyColumn(authUserId);
    }

    return null;
  }

  private async prepareViewerContext(userId?: string): Promise<{
    profileId: string | null;
    gender: User["gender"] | null;
    isPremium: boolean;
  }> {
    const profile = await this.resolveProfileContext(userId);

    if (!profile) {
      return { profileId: null, gender: null, isPremium: false };
    }

    return {
      profileId: profile.id,
      gender: profile.gender ?? null,
      isPremium: profile.isPremium,
    };
  }

  // ============================================================================
  // USER PROFILES
  // ============================================================================

  async getCurrentUser(): Promise<ServiceResponse<User>> {
    const result = await profilesService.getCurrentUserProfile();

    if (result.success && result.data) {
      // Cache the current user
      await CacheService.set("current_user", result.data);
    }

    return result;
  }

  async getUser(userId: string): Promise<ServiceResponse<User>> {
    // Try cache first
    const cached = await CacheService.get<User>(`user_${userId}`);
    if (cached) {
      console.log('[getUser] Returning cached data for:', userId, 'play_prefecture:', cached.play_prefecture);
      return { success: true, data: cached };
    }

    // Try by legacy ID first (for backward compatibility)
    let result = await profilesService.getProfileByLegacyId(userId);

    // If not found by legacy ID, try by UUID
    if (!result.success) {
      result = await profilesService.getProfile(userId);
    }

    if (result.success && result.data) {
      console.log('[getUser] Fresh data fetched for:', userId, 'play_prefecture:', result.data.play_prefecture);
      await CacheService.set(`user_${userId}`, result.data);
    }

    return result;
  }

  async searchUsers(
    filters: SearchFilters,
    page: number = 1,
    limit: number = 20,
    sortBy: "registration" | "recommended" | "login" | "likes" = "recommended",
    excludeUserIds?: string[],
  ): Promise<PaginatedServiceResponse<User[]>> {
    const appliedFilters: SearchFilters = {
      ...(filters || {}),
    };
    const appliedSort = sortBy;

    // Force opposite-gender matching — overrides any UI filter the caller
    // passed. Female viewer → males only; male viewer → females only. If the
    // viewer's gender is unknown (shouldn't happen post-KYC) we return nothing
    // rather than risk showing same-gender profiles. Filters and sort are no
    // longer premium-gated since the hard paywall already enforces entry.
    const { gender: viewerGender } = await this.prepareViewerContext();
    if (viewerGender === "female") {
      appliedFilters.gender = "male";
    } else if (viewerGender === "male") {
      appliedFilters.gender = "female";
    } else {
      return {
        success: true,
        data: [],
        pagination: { page, limit, total: 0, totalPages: 0, hasMore: false },
      };
    }

    const result = await profilesService.searchProfiles(
      appliedFilters,
      page,
      limit,
      appliedSort,
      excludeUserIds,
    );

    if (result.success && result.data) {
      // Cache individual users (fire-and-forget — don't block rendering)
      for (const user of result.data as User[]) {
        CacheService.set(`user_${user.id}`, user);
      }
    }

    return result;
  }

  // ============================================================================
  // POSTS
  // ============================================================================

  async getPosts(
    page: number = 1,
    limit: number = 20,
  ): Promise<PaginatedServiceResponse<Post[]>> {
    const result = await postsService.getPosts(page, limit);

    if (result.success && result.data) {
      // Cache posts
      for (const post of result.data as Post[]) {
        await CacheService.set(`post_${post.id}`, post);
      }
    }

    return result;
  }

  async getUserPosts(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<PaginatedServiceResponse<Post[]>> {
    const result = await postsService.getUserPosts(userId, page, limit);

    if (result.success && result.data) {
      // Get current user ID to enrich posts with reaction status
      const currentUser = await this.getCurrentUser();
      const currentUserId = currentUser.success && currentUser.data ? currentUser.data.id : null;

      // Enrich posts with reaction information if we have a current user
      let enrichedPosts = result.data as Post[];
      if (currentUserId) {
        enrichedPosts = await this.enrichPostsWithReactions(enrichedPosts, currentUserId);
      }

      // Cache posts
      for (const post of enrichedPosts) {
        await CacheService.set(`post_${post.id}`, post);
      }

      return {
        ...result,
        data: enrichedPosts,
      };
    }

    return result;
  }

  async createPost(
    userId: string,
    content: string,
    images?: string[],
    videos?: string[],
    aspectRatio?: number,
  ): Promise<ServiceResponse<Post>> {
    const actualUserId = await resolveProfileId(userId);
    if (!actualUserId) {
      return { success: false, error: `User not found: ${userId}` };
    }

    const result = await postsService.createPost(
      actualUserId,
      content,
      images,
      videos,
      aspectRatio,
    );

    if (result.success && result.data) {
      // Cache the new post
      if (result.data) {
        await CacheService.set(`post_${result.data.id}`, result.data);
      }
    }

    return result;
  }

  async likePost(
    postId: string,
    userId: string,
    type: "like" | "super_like" = "like",
  ): Promise<ServiceResponse<void>> {
    return await postsService.likePost(postId, userId);
  }

  async unlikePost(
    postId: string,
    userId: string,
  ): Promise<ServiceResponse<void>> {
    return await postsService.unlikePost(postId, userId);
  }

  async getPostLikes(postId: string): Promise<ServiceResponse<string[]>> {
    return await postsService.getPostLikes(postId);
  }

  // ============================================================================
  // USER INTERACTIONS (LIKES/MATCHES)
  // ============================================================================

  async likeUser(
    likerUserId: string,
    likedUserId: string,
    type: InteractionType = "like",
  ): Promise<ServiceResponse<{ matched: boolean }>> {
    const result = await matchesService.likeUser(
      likerUserId,
      likedUserId,
      type,
    );

    if (result.success && result.data?.matched) {
      // Clear cache for both users to refresh their match status
      await CacheService.remove(`user_${likerUserId}`);
      await CacheService.remove(`user_${likedUserId}`);
    }

    return result;
  }

  async superLikeUser(
    userId: string,
    targetUserId: string,
  ): Promise<ServiceResponse<any>> {
    const result = await matchesService.likeUser(
      userId,
      targetUserId,
      "super_like",
    );

    if (result.success && result.data?.matched) {
      // Clear cache for both users to refresh their match status
      await CacheService.remove(`user_${userId}`);
      await CacheService.remove(`user_${targetUserId}`);
    }

    return result;
  }

  async passUser(
    userId: string,
    targetUserId: string,
  ): Promise<ServiceResponse<any>> {
    const result = await matchesService.likeUser(
      userId,
      targetUserId,
      "pass",
    );

    if (result.success) {
      // Clear cache for both users to refresh their interaction status
      await CacheService.remove(`user_${userId}`);
      await CacheService.remove(`user_${targetUserId}`);
    }

    return result;
  }

  async undoLike(
    likerUserId: string,
    likedUserId: string,
  ): Promise<ServiceResponse<void>> {
    return await matchesService.undoLike(likerUserId, likedUserId);
  }

  async getUserLikes(userId: string): Promise<ServiceResponse<UserLike[]>> {
    return await matchesService.getUserLikes(userId);
  }

  async getMatches(userId: string): Promise<ServiceResponse<any[]>> {
    const result = await matchesService.getMatches(userId);

    if (result.success && result.data) {
      // Cache matches
      await CacheService.set(`matches_${userId}`, result.data);
    }

    return result;
  }

  async checkMatch(
    user1Id: string,
    user2Id: string,
  ): Promise<ServiceResponse<boolean>> {
    return await matchesService.checkMatch(user1Id, user2Id);
  }

  async checkMutualLikes(
    user1Id: string,
    user2Id: string,
  ): Promise<ServiceResponse<boolean>> {
      return await matchesService.checkMutualLikes(user1Id, user2Id);
  }

  async batchCheckMutualLikes(
    currentUserId: string,
    targetUserIds: string[],
  ): Promise<ServiceResponse<Record<string, boolean>>> {
    return await matchesService.batchCheckMutualLikes(currentUserId, targetUserIds);
  }

  async getUnseenMatches(userId: string): Promise<ServiceResponse<any[]>> {
    return await matchesService.getUnseenMatches(userId);
  }

  async markMatchAsSeen(
    matchId: string,
    userId: string,
  ): Promise<ServiceResponse<void>> {
    return await matchesService.markMatchAsSeen(matchId, userId);
  }

  // ============================================================================
  // CONTACT INQUIRIES
  // ============================================================================

  async getContactInquiries(
    userId: string,
  ): Promise<ServiceResponse<ContactInquiry[]>> {
    return await contactInquiriesService.getContactInquiries(userId);
  }

  async getContactInquiry(
    inquiryId: string,
  ): Promise<ServiceResponse<ContactInquiry>> {
    return await contactInquiriesService.getContactInquiry(inquiryId);
  }

  async markReplyAsRead(replyId: string): Promise<ServiceResponse<void>> {
    return await contactInquiriesService.markReplyAsRead(replyId);
  }

  async markAllRepliesAsRead(
    inquiryId: string,
  ): Promise<ServiceResponse<void>> {
    return await contactInquiriesService.markAllRepliesAsRead(inquiryId);
  }

  async createContactInquiry(
    userId: string,
    subject: string,
    message: string,
    inquiryType?: string,
  ): Promise<ServiceResponse<ContactInquiry>> {
    return await contactInquiriesService.createContactInquiry(
      userId,
      subject,
      message,
      inquiryType,
    );
  }

  async getLikesReceived(userId: string): Promise<ServiceResponse<UserLike[]>> {
    return await matchesService.getLikesReceived(userId);
  }

  // Alias for getLikesReceived
  async getReceivedLikes(userId: string): Promise<ServiceResponse<UserLike[]>> {
    return this.getLikesReceived(userId);
  }

  /**
   * Get count of likes received by a user
   * Counts active likes where liked_user_id = userId AND type = 'like' AND is_active = true
   */
  async getLikesReceivedCount(userId: string): Promise<ServiceResponse<number>> {
    const { count, error } = await supabase
      .from("user_likes")
      .select("*", { count: "exact", head: true })
      .eq("liked_user_id", userId)
      .eq("type", "like")
      .eq("is_active", true);

    if (error) {
      console.error("[SupabaseDataProvider] Error getting likes count:", error);
      return {
        success: false,
        error: error.message || "Failed to get likes count",
      };
    }

    return {
      success: true,
      data: count || 0,
    };
  }

  async unlikeUser(
    likerUserId: string,
    likedUserId: string,
  ): Promise<ServiceResponse<void>> {
    const result = await matchesService.unlikeUser(likerUserId, likedUserId);

    if (result.success) {
      // Clear cache for both users to refresh their interaction status
      await CacheService.remove(`user_${likerUserId}`);
      await CacheService.remove(`user_${likedUserId}`);
    }

    return result;
  }

  async getUserByEmail(email: string): Promise<ServiceResponse<User>> {
    return await profilesService.getProfileByEmail(email);
  }

  // ============================================================================
  // MESSAGES
  // ============================================================================

  async getChatMessages(chatId: string): Promise<ServiceResponse<Message[]>> {
    const result = await messagesService.getChatMessages(chatId);

    if (result.success && result.data) {
      // Cache messages
      await CacheService.set(`messages_${chatId}`, result.data);
    }

    return result;
  }

  async sendMessage(
    chatId: string,
    senderId: string,
    receiverId: string,
    text: string,
    type: "text" | "image" | "emoji" | "video" = "text",
    imageUri?: string,
  ): Promise<ServiceResponse<Message>> {
    const result = await messagesService.sendMessage(
      chatId,
      senderId,
      receiverId,
      text,
      type,
      imageUri,
    );

    if (result.success && result.data) {
      // Clear message cache to force refresh
      await CacheService.remove(`messages_${chatId}`);
    }

    return result;
  }

  async markAsRead(messageId: string): Promise<ServiceResponse<void>> {
    return await messagesService.markAsRead(messageId);
  }

  async getMessagePreviews(
    userId: string,
  ): Promise<ServiceResponse<MessagePreview[]>> {
    const result = await messagesService.getMessagePreviews(userId);

    if (result.success && result.data) {
      // Cache message previews
      await CacheService.set(`message_previews_${userId}`, result.data);
    }

    return result;
  }

  async getOrCreateChat(
    matchId: string,
    participants: string[],
  ): Promise<ServiceResponse<string>> {
    return await messagesService.getOrCreateChat(matchId, participants);
  }

  async getOrCreateChatBetweenUsers(
    user1Id: string,
    user2Id: string,
    matchId?: string,
  ): Promise<ServiceResponse<string>> {
    return await messagesService.getOrCreateChatBetweenUsers(user1Id, user2Id, matchId);
  }

  // ============================================================================
  // AVAILABILITY/CALENDAR
  // ============================================================================

  async getUserAvailability(
    userId: string,
    month: number,
    year: number,
  ): Promise<ServiceResponse<CalendarData>> {
    const result = await availabilityService.getUserAvailability(
      userId,
      month,
      year,
    );

    if (result.success && result.data) {
      // Cache calendar data
      await CacheService.set(
        `calendar_${userId}_${year}_${month}`,
        result.data,
      );
    }

    return result;
  }

  async setAvailability(
    userId: string,
    date: string,
    isAvailable: boolean,
    timeSlots?: string[],
    notes?: string,
  ): Promise<ServiceResponse<Availability>> {
    const result = await availabilityService.setAvailability(
      userId,
      date,
      isAvailable,
      timeSlots,
      notes,
    );

    if (result.success && result.data) {
      // Clear calendar cache to force refresh
      const dateObj = new Date(date);
      const month = dateObj.getMonth() + 1;
      const year = dateObj.getFullYear();
      await CacheService.remove(`calendar_${userId}_${year}_${month}`);
    }

    return result;
  }

  async deleteAvailability(
    userId: string,
    date: string,
  ): Promise<ServiceResponse<void>> {
    const result = await availabilityService.deleteAvailability(userId, date);

    if (result.success) {
      // Clear calendar cache to force refresh
      const dateObj = new Date(date);
      const month = dateObj.getMonth() + 1;
      const year = dateObj.getFullYear();
      await CacheService.remove(`calendar_${userId}_${year}_${month}`);
    }

    return result;
  }

  async updateUserAvailability(
    userId: string,
    year: number,
    month: number,
    availabilityData: Partial<Availability>[],
  ): Promise<ServiceResponse<boolean>> {
    const result = await availabilityService.updateUserAvailability(
      userId,
      year,
      month,
      availabilityData,
    );

    if (result.success) {
      // Clear calendar cache to force refresh
      await CacheService.remove(`calendar_${userId}_${year}_${month}`);
    }

    return result;
  }

  // ============================================================================
  // REAL-TIME SUBSCRIPTIONS
  // ============================================================================

  subscribeToProfile(userId: string, callback: (profile: User) => void) {
    return profilesService.subscribeToProfile(userId, callback);
  }

  subscribeToPosts(callback: (post: Post) => void) {
    return postsService.subscribeToPosts(callback);
  }

  subscribeToMatches(userId: string, callback: (match: any) => void) {
    return matchesService.subscribeToMatches(userId, callback);
  }

  subscribeToChat(chatId: string, callback: (message: Message) => void) {
    return messagesService.subscribeToChat(chatId, callback);
  }

  subscribeToAvailability(
    userId: string,
    callback: (availability: Availability) => void,
  ) {
    return availabilityService.subscribeToAvailability(userId, callback);
  }

  // ============================================================================
  // POST RECOMMENDATIONS
  // ============================================================================

  async getRecommendedPosts(
    page: number = 1,
    limit: number = 10,
  ): Promise<PaginatedServiceResponse<Post[]>> {
    // Get current user ID
    const currentUser = await this.getCurrentUser();
    if (!currentUser.success || !currentUser.data) {
      return { 
        success: false, 
        error: "No authenticated user",
      };
    }

    const currentUserId = currentUser.data.id;

    // Get recommended posts (excludes current user's posts)
    const result = await postsService.getRecommendedPosts(currentUserId, page, limit);

    if (result.success && result.data) {
      // Enrich posts with reaction information
      const enrichedPosts = await this.enrichPostsWithReactions(result.data as Post[], currentUserId);

      // Cache posts in parallel, non-blocking (don't stall pagination response)
      Promise.all(
        enrichedPosts.map((post) => CacheService.set(`post_${post.id}`, post))
      ).catch((err) => console.error("[getRecommendedPosts] Cache write error:", err));

      return {
        ...result,
        data: enrichedPosts,
      };
    }

    return result;
  }

  async getFollowingPosts(
    page: number = 1,
    limit: number = 10,
  ): Promise<PaginatedServiceResponse<Post[]>> {
    // Get current user ID
    const currentUser = await this.getCurrentUser();
    if (!currentUser.success || !currentUser.data) {
      return { 
        success: false, 
        error: "No authenticated user",
      };
    }

    const currentUserId = currentUser.data.id;

    // Get following posts (includes current user's posts + liked users' posts)
    const result = await postsService.getFollowingPosts(currentUserId, page, limit);

    if (result.success && result.data) {
      // Enrich posts with reaction information
      const enrichedPosts = await this.enrichPostsWithReactions(result.data as Post[], currentUserId);

      // Cache posts in parallel, non-blocking (don't stall pagination response)
      Promise.all(
        enrichedPosts.map((post) => CacheService.set(`post_${post.id}`, post))
      ).catch((err) => console.error("[getFollowingPosts] Cache write error:", err));

      return {
        ...result,
        data: enrichedPosts,
      };
    }

    return result;
  }

  /**
   * Enrich posts with user's reaction information
   * Uses batch query instead of N individual queries for efficiency
   */
  private async enrichPostsWithReactions(posts: Post[], userId: string): Promise<Post[]> {
    if (posts.length === 0) return posts;

    // Get all post IDs
    const postIds = posts.map(post => post.id);

    // Single batch query to get all user reactions for these posts
    const { data: userReactions, error } = await supabase
      .from("post_reactions")
      .select("post_id")
      .eq("user_id", userId)
      .in("post_id", postIds);

    if (error) {
      console.error("[enrichPostsWithReactions] Error fetching reactions:", error);
    }

    // Create a Set for O(1) lookup
    const reactedPostIds = new Set((userReactions || []).map(r => r.post_id));

    // Enrich posts with reaction status
    return posts.map(post => ({
      ...post,
      // Ensure user object is preserved with all fields including gender
      user: {
        ...post.user,
        gender: post.user?.gender || undefined,
      },
      // Keep legacy fields for backward compatibility
      likes: post.reactions_count || post.likes || 0,
      isLiked: reactedPostIds.has(post.id),
      // New fields
      reactions_count: post.reactions_count || 0,
      hasReacted: reactedPostIds.has(post.id),
    }));
  }

  /**
   * React to a post (thumbs-up)
   */
  async reactToPost(
    postId: string,
    userId: string,
  ): Promise<ServiceResponse<void>> {
    const result = await postsService.reactToPost(postId, userId);

    if (result.success) {
      // Clear post cache to force refresh
      await CacheService.remove(`post_${postId}`);
    }

    return result;
  }

  /**
   * Remove reaction from a post
   */
  async unreactToPost(
    postId: string,
    userId: string,
  ): Promise<ServiceResponse<void>> {
    const result = await postsService.unreactToPost(postId, userId);
    
    if (result.success) {
      // Clear post cache to force refresh
      await CacheService.remove(`post_${postId}`);
    }

    return result;
  }

  // ============================================================================
  // USER RECOMMENDATIONS
  // ============================================================================

  async getRecommendedUsers(
    userId: string,
    limit: number = 10,
  ): Promise<ServiceResponse<User[]>> {
    if (!userId) {
      return { success: false, error: "Invalid user ID provided" };
    }

    if (limit <= 0 || limit > 100) {
      return {
        success: false,
        error: "Invalid limit provided. Must be between 0 and 100",
      };
    }

    const { profileId: actualUserId } =
      await this.prepareViewerContext(userId);

    if (!actualUserId) {
      return { success: false, error: `User not found: ${userId}` };
    }

    // Get users that the current user hasn't interacted with
    const { data: userLikes, error: likesError } = await supabase
      .from("user_likes")
      .select("liked_user_id")
      .eq("liker_user_id", actualUserId);

    if (likesError) {
      return { success: false, error: likesError.message };
    }

    const exclusionIds = new Set<string>();
    (userLikes || []).forEach((like) => {
      if (like?.liked_user_id) {
        exclusionIds.add(like.liked_user_id);
      }
    });
    exclusionIds.add(actualUserId);

    // Get recommended users (excluding interacted users) - no gender filtering
    let query = supabase.from("profiles").select(ProfilesService.PROFILE_COLUMNS);

    // Filter out incomplete profiles (must have gender, birth_date, and at least 1 photo)
    query = query
      .not("gender", "is", null)
      .not("birth_date", "is", null)
      .not("profile_pictures", "eq", "{}");

    exclusionIds.forEach((excludedId) => {
      if (excludedId) {
        query = query.neq("id", excludedId);
      }
    });

    const { data: users, error } = await query.limit(limit);

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data: users as User[],
    };
  }

  /**
   * Get intelligent recommendations using scoring algorithm
   * This replaces the simple getRecommendedUsers() with a multi-factor scoring system
   * @param userId - Current user ID
   * @param limit - Number of results (default: 20)
   * @returns Ranked list of recommended users based on compatibility
   */
  async getIntelligentRecommendations(
    userId: string,
    limit: number = 20,
  ): Promise<ServiceResponse<User[]>> {
    if (!userId) {
      return { success: false, error: "Invalid user ID provided" };
    }

    if (limit <= 0 || limit > 100) {
      return {
        success: false,
        error: "Invalid limit provided. Must be between 0 and 100",
      };
    }

    const { profileId: actualUserId } =
      await this.prepareViewerContext(userId);

    if (!actualUserId) {
      return { success: false, error: `User not found: ${userId}` };
    }

    // Try cache first (10 minute TTL)
    // Cache version v2 - updated 2025-12-03 to invalidate old empty caches
    const cacheKey = `intelligent_recommendations_v2:${actualUserId}:${limit}`;
    const cached = await CacheService.get<User[]>(cacheKey);
    if (cached && cached.length > 0) {
      console.log('[SupabaseDataProvider] Intelligent recommendations cache hit');
      return { success: true, data: cached };
    }

    console.log('[SupabaseDataProvider] Fetching intelligent recommendations from database');

    // Call ProfilesService method
    const result = await profilesService.getIntelligentRecommendations(
      actualUserId,
      limit,
      0
    );

    if (result.success && result.data && result.data.length > 0) {
      // Cache the results (10 minute TTL)
      await CacheService.set(cacheKey, result.data, 10 * 60 * 1000);

      console.log(`[SupabaseDataProvider] Cached ${result.data.length} intelligent recommendations`);

      return {
        success: true,
        data: result.data,
      };
    }

    return {
      success: false,
      error: result.error || 'Failed to fetch intelligent recommendations',
    };
  }

  /**
   * Get server-enforced daily recommendations (today's picks).
   * Cached by date — results don't change within a day.
   */
  async getDailyRecommendations(
    userId: string,
  ): Promise<ServiceResponse<User[]>> {
    if (!userId) {
      return { success: false, error: "Invalid user ID provided" };
    }

    // Cache keyed by user + today's date (JST) — check cache BEFORE any DB call
    // Use en-CA locale which returns YYYY-MM-DD directly (avoids Date constructor parsing issues on Hermes/JSC)
    const todayJST = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
    const cacheKey = `daily_recs:${userId}:${todayJST}`;
    const cached = await CacheService.get<User[]>(cacheKey);
    if (cached && cached.length > 0) {
      console.log('[SupabaseDataProvider] Daily recommendations cache hit');
      return { success: true, data: cached };
    }

    // userId from AuthContext is already a profiles.id UUID — skip prepareViewerContext
    const result = await profilesService.getDailyRecommendations(userId);

    if (result.success && result.data && result.data.length > 0) {
      // Cache for 24 hours — data is idempotent per day (keyed by today's date)
      await CacheService.set(cacheKey, result.data, 24 * 60 * 60 * 1000);
      return { success: true, data: result.data };
    }

    return {
      success: false,
      error: result.error || 'Failed to fetch daily recommendations',
    };
  }

  /**
   * Mark a daily recommendation as swiped and remove it from local cache.
   */
  async markRecommendationSwiped(
    userId: string,
    recommendedUserId: string,
  ): Promise<ServiceResponse<void>> {
    // Fire-and-forget RPC — don't block the swipe animation
    const result = await profilesService.markRecommendationSwiped(userId, recommendedUserId);

    // Remove swiped user from local cache so re-fetches stay consistent
    const todayJST = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
    const cacheKey = `daily_recs:${userId}:${todayJST}`;
    const cached = await CacheService.get<User[]>(cacheKey);
    if (cached) {
      const updated = cached.filter((u) => u.id !== recommendedUserId);
      if (updated.length > 0) {
        await CacheService.set(cacheKey, updated, 24 * 60 * 60 * 1000);
      } else {
        await CacheService.remove(cacheKey);
      }
    }

    return result;
  }

  // ============================================================================
  // USER PROFILE (EXTENDED)
  // ============================================================================

  async getUserProfile(userId: string): Promise<ServiceResponse<UserProfile>> {
    // Try cache first
    const cached = await CacheService.get<UserProfile>(
      `user_profile_${userId}`,
    );
    if (cached) {
      return { success: true, data: cached };
    }

    // Get user data (this handles legacy ID mapping)
    const userResult = await this.getUser(userId);
    if (!userResult.success || !userResult.data) {
      return { success: false, error: "User not found" };
    }

    const user = userResult.data;

    // Create UserProfile from User data
    // Dynamically calculate age from birth_date to ensure it's always current
    const dynamicAge = user.birth_date ? calculateAge(user.birth_date) : user.age;
    const userProfile: UserProfile = {
      basic: {
        name: user.name,
        age: dynamicAge?.toString() || "0",
        birth_date: user.birth_date,
        gender: user.gender,
        prefecture: user.prefecture,
        location: user.location,
        blood_type: user.blood_type || "",
        height: user.height || "",
        body_type: user.body_type || "",
        smoking: user.smoking || "",
        favorite_club: user.favorite_club,
        personality_type: user.personality_type,
      },
      golf: {
        skill_level: user.golf_skill_level,
        average_score: user.average_score?.toString() || "0",
        experience: user.golf_experience || "",
        best_score: user.best_score || "",
        transportation: user.transportation || "",
        available_days: user.available_days || "",
        // PM expansion (2026-05-20)
        handicap: user.handicap !== undefined && user.handicap !== null
          ? String(user.handicap)
          : "",
        home_course: user.home_course || "",
        dominant_hand: user.dominant_hand || "",
        walking_or_riding: user.walking_or_riding || "",
        playing_frequency: user.playing_frequency || "",
      },
      relationship: {
        looking_for: user.looking_for || "",
        has_kids: user.has_kids || "",
        wants_kids: user.wants_kids || "",
      },
      lifestyle: {
        drinking: user.drinking || "",
        occupation: user.occupation || "",
        education: user.education || "",
        pets: user.pets || "",
        languages: user.languages || [],
        religion: user.religion || "",
        politics: user.politics || "",
      },
      bio: user.bio || "",
      profile_pictures: user.profile_pictures,
      status: {
        is_verified: user.is_verified,
        is_premium: user.is_premium,
        current_streak_days: user.current_streak_days ?? 0,
        last_login: user.last_login,
      },
      location: {
        prefecture: user.prefecture,
        transportation: user.transportation || "",
        available_days: user.available_days || "",
      },
      play_prefecture: user.play_prefecture || [], // Prefectures where user plays golf (max 3)
    };

    // Cache the profile
    await CacheService.set(`user_profile_${userId}`, userProfile);

    return {
      success: true,
      data: userProfile,
    };
  }

  async updateUserProfile(
    userId: string,
    profile: Partial<UserProfile>,
  ): Promise<ServiceResponse<UserProfile>> {
    console.log("📝 updateUserProfile called with userId:", userId);
    
    // Get current authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error("❌ Auth error:", authError?.message || "No user");
      return {
        success: false,
        error: "User not authenticated. Please log in again.",
      };
    }
    
    console.log("✅ Authenticated user ID:", user.id);
    
    // Resolve the actual user ID (handle legacy IDs)
    let actualUserId = userId;
    
    // If userId is a legacy ID or "current_user", use authenticated user's ID
    if (userId === "current_user" || !userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      actualUserId = user.id;
      console.log("🔄 Resolved userId to authenticated user:", actualUserId);
    }
    
    // Verify the userId matches the authenticated user (security check)
    if (actualUserId !== user.id) {
      console.error("❌ Security error: Cannot update another user's profile");
      return {
        success: false,
        error: "Cannot update another user's profile",
      };
    }
    
    // Convert UserProfile to User updates
    const updates: Partial<User> = {};

    if (profile.basic) {
      if (profile.basic.name !== undefined && profile.basic.name !== '') updates.name = profile.basic.name;
      if (profile.basic.age !== undefined && profile.basic.age !== null) updates.age = Number(profile.basic.age);
      if (profile.basic.birth_date !== undefined && profile.basic.birth_date !== '') updates.birth_date = profile.basic.birth_date;
      if (profile.basic.gender !== undefined && profile.basic.gender !== '') updates.gender = profile.basic.gender as User["gender"];
      if (profile.basic.prefecture !== undefined && profile.basic.prefecture !== '') updates.prefecture = profile.basic.prefecture;
      if (profile.basic.location !== undefined && profile.basic.location !== '') updates.location = profile.basic.location;
      if (profile.basic.blood_type !== undefined && profile.basic.blood_type !== '') updates.blood_type = profile.basic.blood_type;
      if (profile.basic.height !== undefined && profile.basic.height !== null) updates.height = profile.basic.height;
      if (profile.basic.body_type !== undefined && profile.basic.body_type !== '') updates.body_type = profile.basic.body_type;
      if (profile.basic.smoking !== undefined && profile.basic.smoking !== '') updates.smoking = profile.basic.smoking;
      if (profile.basic.favorite_club !== undefined && profile.basic.favorite_club !== '') updates.favorite_club = profile.basic.favorite_club;
      if (profile.basic.personality_type !== undefined && profile.basic.personality_type !== '') updates.personality_type = profile.basic.personality_type;
    }

    if (profile.golf) {
      if (profile.golf.skill_level !== undefined && profile.golf.skill_level !== '') {
        updates.golf_skill_level = profile.golf.skill_level as User["golf_skill_level"];
      }
      if (profile.golf.average_score !== undefined && profile.golf.average_score !== null) {
        updates.average_score = Number(profile.golf.average_score);
      }
      if (profile.golf.experience !== undefined && profile.golf.experience !== '') updates.golf_experience = profile.golf.experience;
      if (profile.golf.best_score !== undefined && profile.golf.best_score !== null) updates.best_score = profile.golf.best_score;
      if (profile.golf.transportation !== undefined && profile.golf.transportation !== '') updates.transportation = profile.golf.transportation;
      if (profile.golf.available_days !== undefined) updates.available_days = profile.golf.available_days;
      // PM expansion (2026-05-20) — golf identity fields.
      // Guard against empty strings — matches the behavior of every
      // pre-existing field on this object. Without this, an unchanged
      // (empty in formData) field would clobber a previously-saved DB
      // value back to empty whenever the user saved any OTHER field.
      if (profile.golf.handicap !== undefined && profile.golf.handicap !== '') {
        const h = Number(profile.golf.handicap);
        if (!Number.isNaN(h)) updates.handicap = h;
      }
      if (profile.golf.home_course !== undefined && profile.golf.home_course !== '') updates.home_course = profile.golf.home_course;
      if (profile.golf.dominant_hand !== undefined && profile.golf.dominant_hand !== '') updates.dominant_hand = profile.golf.dominant_hand;
      if (profile.golf.walking_or_riding !== undefined && profile.golf.walking_or_riding !== '') updates.walking_or_riding = profile.golf.walking_or_riding;
      if (profile.golf.playing_frequency !== undefined && profile.golf.playing_frequency !== '') updates.playing_frequency = profile.golf.playing_frequency;
    }

    // PM expansion (2026-05-20) — relationship / lifestyle sections.
    // Same empty-string guard as above to prevent unrelated-field saves
    // from clobbering previously-set values back to empty.
    if (profile.relationship) {
      if (profile.relationship.looking_for !== undefined && profile.relationship.looking_for !== '') updates.looking_for = profile.relationship.looking_for;
      if (profile.relationship.has_kids !== undefined && profile.relationship.has_kids !== '') updates.has_kids = profile.relationship.has_kids;
      if (profile.relationship.wants_kids !== undefined && profile.relationship.wants_kids !== '') updates.wants_kids = profile.relationship.wants_kids;
    }
    if (profile.lifestyle) {
      if (profile.lifestyle.drinking !== undefined && profile.lifestyle.drinking !== '') updates.drinking = profile.lifestyle.drinking;
      if (profile.lifestyle.occupation !== undefined && profile.lifestyle.occupation !== '') updates.occupation = profile.lifestyle.occupation;
      if (profile.lifestyle.education !== undefined && profile.lifestyle.education !== '') updates.education = profile.lifestyle.education;
      if (profile.lifestyle.pets !== undefined && profile.lifestyle.pets !== '') updates.pets = profile.lifestyle.pets;
      // Languages is an array — guard against empty array overwriting a
      // previously-saved language list.
      if (profile.lifestyle.languages !== undefined && Array.isArray(profile.lifestyle.languages) && profile.lifestyle.languages.length > 0) {
        updates.languages = profile.lifestyle.languages;
      }
      if (profile.lifestyle.religion !== undefined && profile.lifestyle.religion !== '') updates.religion = profile.lifestyle.religion;
      if (profile.lifestyle.politics !== undefined && profile.lifestyle.politics !== '') updates.politics = profile.lifestyle.politics;
    }

    if (typeof profile.bio === "string") {
      updates.bio = profile.bio;
    }

    if (profile.profile_pictures) {
      updates.profile_pictures = profile.profile_pictures;
    }

    if (profile.status) {
      if (profile.status.is_verified !== undefined) {
        updates.is_verified = profile.status.is_verified;
      }
      if (profile.status.last_login) {
        updates.last_login = profile.status.last_login;
      }
    }

    // Handle play_prefecture (prefectures where user plays golf)
    if ((profile as any).play_prefecture !== undefined) {
      updates.play_prefecture = (profile as any).play_prefecture;
    }

    // Check if user is verified - if so, prevent changes to locked fields (birth_date, gender, age)
    // But only lock fields that already have values — don't block initial population
    const { data: currentUserData } = await supabase
      .from('profiles')
      .select('is_verified, gender, birth_date, age')
      .eq('id', actualUserId)
      .single();

    if (currentUserData?.is_verified === true) {
      if (currentUserData.gender) {
        console.log("🔒 User is verified - locking gender (already set)");
        delete updates.gender;
      }
      if (currentUserData.birth_date) {
        console.log("🔒 User is verified - locking birth_date (already set)");
        delete updates.birth_date;
      }
      if (currentUserData.age) {
        console.log("🔒 User is verified - locking age (already set)");
        delete updates.age;
      }
    }

    console.log("📊 Updates to apply:", Object.keys(updates).join(", "));

    // Update the user
    const result = await profilesService.updateProfile(actualUserId, updates);

    if (!result.success) {
      console.error("❌ Profile update failed:", result.error);
      return {
        success: false,
        error: result.error || "Failed to update profile",
      };
    }

    console.log("✅ Profile updated successfully");

    // Clear cache for all possible ID variants to ensure fresh data is fetched
    // The profile might be cached under id, user_id, or legacy_id
    const updatedProfile = result.data;
    if (updatedProfile) {
      await CacheService.remove(`user_${updatedProfile.id}`);
      await CacheService.remove(`user_${updatedProfile.user_id}`);
      await CacheService.remove(`user_${updatedProfile.legacy_id}`);
      await CacheService.remove(`user_profile_${updatedProfile.id}`);
      await CacheService.remove(`user_profile_${updatedProfile.user_id}`);
      await CacheService.remove(`user_profile_${updatedProfile.legacy_id}`);
      console.log("🗑️ Cache cleared for all ID variants:", {
        id: updatedProfile.id,
        user_id: updatedProfile.user_id,
        legacy_id: updatedProfile.legacy_id,
      });
    } else {
      // Fallback to original cache clearing
      await CacheService.remove(`user_${actualUserId}`);
      await CacheService.remove(`user_profile_${actualUserId}`);
    }

    // Get updated profile
    return await this.getUserProfile(actualUserId);
  }

  /**
   * Get user's online status and last active timestamp
   * @param userId - The user's profile ID (UUID)
   * @returns Object with isOnline boolean and lastActiveAt timestamp
   */
  async getUserOnlineStatus(userId: string): Promise<ServiceResponse<{ isOnline: boolean; lastActiveAt: string | null }>> {
    const { data, error } = await supabase
      .from("profiles")
      .select("last_active_at")
      .eq("id", userId)
      .single();

    if (error) {
      console.error("[SupabaseDataProvider] Error fetching online status:", error);
      return {
        success: false,
        error: error.message || "Failed to fetch online status",
      };
    }

    const lastActiveAt = data?.last_active_at || null;
    const now = new Date();
    const lastActiveDate = lastActiveAt ? new Date(lastActiveAt) : null;
    
    // Consider user online if active within last 5 minutes
    // Timestamps are stored in UTC, compare them directly (milliseconds are timezone-independent)
    const isOnline = lastActiveDate 
      ? (now.getTime() - lastActiveDate.getTime()) < 5 * 60 * 1000 
      : false;

    return {
      success: true,
      data: {
        isOnline,
        lastActiveAt,
      },
    };
  }

  // ============================================================================
  // ADDITIONAL METHODS FOR COMPATIBILITY
  // ============================================================================

  async getUsers(filters?: SearchFilters, sortBy: "registration" | "recommended" = "recommended"): Promise<ServiceResponse<User[]>> {
    // No automatic gender filtering - users can match with anyone
    const appliedFilters: SearchFilters = {
      ...(filters || {}),
    };

    const result = await profilesService.searchProfiles(
      appliedFilters,
      1,
      100,
      sortBy,
    );
    if (result.success) {
      return { success: true, data: result.data as User[] };
    }
    return { success: false, error: result.error };
  }

  async getUserById(id: string): Promise<ServiceResponse<User>> {
    return this.getUser(id);
  }

  async getPostById(id: string): Promise<ServiceResponse<Post>> {
    // Try cache first
    const cached = await CacheService.get<Post>(`post_${id}`);
    if (cached) {
      return { success: true, data: cached };
    }

    // Try by legacy ID first
    const { data: post, error } = await supabase
      .from("posts")
      .select(
        `
        *,
        user:profiles!posts_user_id_fkey(*)
      `,
      )
      .eq("legacy_id", id)
      .single();

    if (error && error.code !== "PGRST116") {
      // If not found by legacy ID, try by UUID
      const { data: postByUuid, error: uuidError } = await supabase
        .from("posts")
        .select(
          `
          *,
          user:profiles!posts_user_id_fkey(*)
        `,
        )
        .eq("id", id)
        .single();

      if (uuidError) {
        return { success: false, error: uuidError.message };
      }

      await CacheService.set(`post_${id}`, postByUuid);
      return { success: true, data: postByUuid as Post };
    }

    if (post) {
      await CacheService.set(`post_${id}`, post);
      return { success: true, data: post as Post };
    }

    return { success: false, error: "Post not found" };
  }

  async getMessages(chatId: string): Promise<ServiceResponse<Message[]>> {
    return this.getChatMessages(chatId);
  }

  async getCurrentUserMessagePreviews(): Promise<
    ServiceResponse<MessagePreview[]>
  > {
    // Wrapper: derive userId from current session and call primary method
    const current = await this.getCurrentUser();
    if (!current.success || !current.data)
      return { success: false, error: "No authenticated user" };
    return this.getMessagePreviews(current.data!.id);
  }

  // duplicate sendMessage overload removed

  async getConnections(
    type?: "like" | "match",
  ): Promise<ServiceResponse<ConnectionItem[]>> {
    // Get current user first
    const currentUserResult = await this.getCurrentUser();
    if (!currentUserResult.success || !currentUserResult.data) {
      return { success: false, error: "No authenticated user" };
    }

    if (type === "match") {
      const matchesResult = await this.getMatches(currentUserResult.data!.id);
      if (!matchesResult.success || !matchesResult.data) {
        return { success: false, error: matchesResult.error };
      }

      const connections: ConnectionItem[] = (matchesResult.data || []).map(
        (match: any) => ({
          id: match.id,
          type: "match",
          profile:
            match.user1_id === currentUserResult.data!.id
              ? match.user2
              : match.user1,
          timestamp: match.matched_at,
        }),
      );

      return { success: true, data: connections };
    } else {
      const likesResult = await this.getLikesReceived(
        currentUserResult.data!.id,
      );
      if (!likesResult.success || !likesResult.data) {
        return { success: false, error: likesResult.error };
      }

      const connections: ConnectionItem[] = (likesResult.data || []).map(
        (like: any) => ({
          id: like.id,
          type: "like",
          profile: like.liker,
          timestamp: like.created_at,
        }),
      );

      return { success: true, data: connections };
    }
  }

  async getConnectionStats(): Promise<
    ServiceResponse<{ likes: number; matches: number }>
  > {
    // Get current user first
    const currentUserResult = await this.getCurrentUser();
    if (!currentUserResult.success || !currentUserResult.data) {
      return { success: false, error: "No authenticated user" };
    }

    const [likesResult, matchesResult] = await Promise.all([
      this.getLikesReceived(currentUserResult.data!.id),
      this.getMatches(currentUserResult.data!.id),
    ]);

    return {
      success: true,
      data: {
        likes:
          likesResult.success && likesResult.data
            ? likesResult.data.length
            : 0,
        matches:
          matchesResult.success && matchesResult.data
            ? matchesResult.data.length
            : 0,
      },
    };
  }

  async getCalendarData(
    userId: string,
    year?: number,
    month?: number,
  ): Promise<ServiceResponse<CalendarData>> {
    const currentYear = year || new Date().getFullYear();
    const currentMonth = month || new Date().getMonth() + 1;

    return this.getUserAvailability(userId, currentMonth, currentYear);
  }

  async updateAvailability(
    userId: string,
    date: string,
    isAvailable: boolean,
  ): Promise<ServiceResponse<Availability>> {
    return this.setAvailability(userId, date, isAvailable);
  }

  async createPostWithData(postData: {
    text: string;
    images: string[];
    videos: string[];
    userId: string;
    aspectRatio?: number;
  }): Promise<ServiceResponse<Post>> {
    return this.createPost(
      postData.userId,
      postData.text,
      postData.images,
      postData.videos,
      postData.aspectRatio,
    );
  }

  async updatePost(
    postId: string,
    updates: { text?: string; images?: string[]; videos?: string[] },
  ): Promise<ServiceResponse<Post>> {
    const { data, error } = await supabase
      .from("posts")
      .update({
        content: updates.text,
        images: updates.images,
        videos: updates.videos,
      })
      .eq("id", postId)
      .select(
        `
        *,
        user:profiles!posts_user_id_fkey(*)
      `,
      )
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    // Update cache
    await CacheService.set(`post_${postId}`, data);
    if (data.legacy_id) {
      await CacheService.set(`post_${data.legacy_id}`, data);
    }

    return { success: true, data: data as Post };
  }

  async deletePost(
    postId: string,
    userId: string,
  ): Promise<ServiceResponse<void>> {
    const result = await postsService.deletePost(postId, userId);
    
    if (result.success) {
      // Remove from cache
      await CacheService.remove(`post_${postId}`);
    }
    
    return result;
  }

  async getUserInteractions(
    userId: string,
  ): Promise<ServiceResponse<UserLike[]>> {
    return this.getUserLikes(userId);
  }

  async getMutualLikes(userId: string): Promise<ServiceResponse<User[]>> {
    // Get users that the current user has liked
    const likedResult = await this.getUserLikes(userId);
    if (!likedResult.success) {
      return { success: false, error: likedResult.error };
    }

    const likedUserIds = (likedResult.data || []).map(
      (like) => like.liked_user_id,
    );

    // Get users who have liked the current user back
    const receivedLikesResult = await this.getLikesReceived(userId);
    if (!receivedLikesResult.success) {
      return { success: false, error: receivedLikesResult.error };
    }

    const mutualUserIds = (receivedLikesResult.data || [])
      .filter((like) => likedUserIds.includes(like.liker_user_id))
      .map((like) => like.liker_user_id);

    // Get user details for mutual likes
    const { data: users, error } = await supabase
      .from("profiles")
      .select("*")
      .in("id", mutualUserIds);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: users as User[] };
  }

  // ============================================================================
  // CACHE MANAGEMENT
  // ============================================================================

  async clearCache(): Promise<void> {
    await CacheService.clear();
  }

  async clearUserCache(userId: string): Promise<void> {
    await CacheService.remove(`user_${userId}`);
    await CacheService.remove(`user_profile_${userId}`);
    await CacheService.remove(`matches_${userId}`);
    await CacheService.remove(`message_previews_${userId}`);

    // Clear calendar cache for all months (approximate)
    for (let year = 2024; year <= 2026; year++) {
      for (let month = 1; month <= 12; month++) {
        await CacheService.remove(`calendar_${userId}_${year}_${month}`);
      }
    }
  }
}

// Export singleton instance
export const supabaseDataProvider = new SupabaseDataProvider();
export default supabaseDataProvider;
