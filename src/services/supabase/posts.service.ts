import { supabase } from "../supabase";
import {
  Post,
  ServiceResponse,
  PaginatedServiceResponse,
} from "../../types/dataModels";
import { resolveProfileId } from "../userMappingService";

export class PostsService {
  // Minimal profile fields needed for post display (reduces egress significantly)
  private readonly PROFILE_SELECT_FIELDS = `
    id,
    name,
    profile_pictures,
    is_verified,
    is_premium,
    current_streak_days
  `;

  // Minimal post fields needed for feed display
  private readonly POST_SELECT_FIELDS = `
    id,
    user_id,
    content,
    images,
    videos,
    aspect_ratio,
    reactions_count,
    comments_count,
    created_at
  `;

  // Extended profile fields needed for recommendation scoring
  private readonly PROFILE_SELECT_FIELDS_EXTENDED = `
    id,
    name,
    profile_pictures,
    is_verified,
    is_premium,
    current_streak_days,
    prefecture,
    golf_skill_level,
    average_score
  `;

  // Region mapping for location-based recommendation scoring (US Census regions).
  // Mirrors REGION_MAP in src/constants/filterOptions.ts; kept as a private field
  // here to avoid a cross-layer constants import from a service.
  private readonly REGIONS: Record<string, string[]> = {
    northeast: [
      'Connecticut', 'Maine', 'Massachusetts', 'New Hampshire', 'New Jersey',
      'New York', 'Pennsylvania', 'Rhode Island', 'Vermont',
    ],
    midwest: [
      'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Michigan', 'Minnesota',
      'Missouri', 'Nebraska', 'North Dakota', 'Ohio', 'South Dakota', 'Wisconsin',
    ],
    south: [
      'Alabama', 'Arkansas', 'Delaware', 'District of Columbia', 'Florida',
      'Georgia', 'Kentucky', 'Louisiana', 'Maryland', 'Mississippi',
      'North Carolina', 'Oklahoma', 'South Carolina', 'Tennessee', 'Texas',
      'Virginia', 'West Virginia',
    ],
    west: [
      'Alaska', 'Arizona', 'California', 'Colorado', 'Hawaii', 'Idaho',
      'Montana', 'Nevada', 'New Mexico', 'Oregon', 'Utah', 'Washington',
      'Wyoming',
    ],
  };

  // Skill level hierarchy for similarity scoring; values match the
  // profiles.golf_skill_level enum.
  private readonly SKILL_LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Pro'];

  /**
   * Transform minimal database response to full Post type with defaults
   * This allows us to select only essential columns while maintaining type compatibility
   */
  private transformToPost(data: any): Post {
    const user = Array.isArray(data.user) ? data.user[0] : data.user;
    return {
      id: data.id,
      user_id: data.user_id,
      user: {
        id: user?.id || '',
        legacy_id: '',
        user_id: user?.id || '',
        name: user?.name || '',
        age: 0,
        gender: 'male',
        location: '',
        prefecture: user?.prefecture || '',
        golf_skill_level: user?.golf_skill_level || 'Beginner',
        average_score: user?.average_score,
        profile_pictures: user?.profile_pictures || [],
        is_verified: user?.is_verified || false,
        is_premium: user?.is_premium || false,
        current_streak_days: user?.current_streak_days ?? 0,
        last_login: '',
        created_at: '',
        updated_at: '',
      },
      content: data.content || '',
      images: data.images || [],
      videos: data.videos || [],
      aspect_ratio: data.aspect_ratio || undefined,
      likes: data.reactions_count || 0,
      reactions_count: data.reactions_count || 0,
      comments: data.comments_count || 0,
      timestamp: this.formatTimestamp(data.created_at),
      isLiked: false,
      isSuperLiked: false,
      hasReacted: false,
      created_at: data.created_at || '',
      updated_at: data.created_at || '',
    };
  }

  private formatTimestamp(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
    if (diffDays < 7) return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
    return date.toLocaleDateString('en-US');
  }

  /**
   * Fetch social proximity data for recommendation scoring
   * Returns Sets for O(1) lookup performance
   */
  private async fetchSocialProximityData(currentUserId: string): Promise<{
    likedUserIds: Set<string>;
    likerIds: Set<string>;
    matchedUserIds: Set<string>;
  }> {
    const [likedUsers, likersOfUser, matches] = await Promise.all([
      // Users current user has liked
      supabase
        .from("user_likes")
        .select("liked_user_id")
        .eq("liker_user_id", currentUserId)
        .eq("is_active", true)
        .in("type", ["like", "super_like"]),

      // Users who have liked current user
      supabase
        .from("user_likes")
        .select("liker_user_id")
        .eq("liked_user_id", currentUserId)
        .eq("is_active", true)
        .in("type", ["like", "super_like"]),

      // Matched users (mutual likes)
      supabase
        .from("matches")
        .select("user1_id, user2_id")
        .or(`user1_id.eq.${currentUserId},user2_id.eq.${currentUserId}`)
        .eq("is_active", true),
    ]);

    return {
      likedUserIds: new Set((likedUsers.data || []).map(l => l.liked_user_id)),
      likerIds: new Set((likersOfUser.data || []).map(l => l.liker_user_id)),
      matchedUserIds: new Set(
        (matches.data || []).flatMap(m =>
          m.user1_id === currentUserId ? [m.user2_id] : [m.user1_id]
        )
      ),
    };
  }

  /**
   * Check if two prefectures are in the same region
   */
  private isSameRegion(pref1?: string, pref2?: string): boolean {
    if (!pref1 || !pref2) return false;

    for (const prefs of Object.values(this.REGIONS)) {
      if (prefs.includes(pref1) && prefs.includes(pref2)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Calculate skill level similarity score (0-10 points)
   */
  private calculateSkillSimilarity(skill1?: string, skill2?: string): number {
    if (!skill1 || !skill2) return 5; // Neutral if unknown

    const idx1 = this.SKILL_LEVELS.indexOf(skill1);
    const idx2 = this.SKILL_LEVELS.indexOf(skill2);

    if (idx1 === -1 || idx2 === -1) return 5;

    const diff = Math.abs(idx1 - idx2);
    if (diff === 0) return 10; // Exact match
    if (diff === 1) return 7;  // Adjacent levels
    if (diff === 2) return 3;  // Two levels apart
    return 0; // Far apart
  }

  /**
   * Calculate recommendation score for a post
   * Score components:
   * - Operator boost: +1000 points (always on top)
   * - Premium boost: +15 points
   * - Engagement score: 0-25 points
   * - User similarity: 0-30 points
   * - Social proximity: 0-25 points
   * - Recency: 0-20 points
   */
  // Operator account ID — always boosted to the top of Recommended
  private readonly OPERATOR_USER_ID = "73d88e5a-83a4-4ec0-8247-a5394db1be94";

  private calculatePostScore(
    post: any,
    currentUserProfile: { prefecture?: string; golf_skill_level?: string; average_score?: number } | null,
    socialData: { likedUserIds: Set<string>; likerIds: Set<string>; matchedUserIds: Set<string> }
  ): number {
    let score = 0;
    const postUser = Array.isArray(post.user) ? post.user[0] : post.user;
    const userId = postUser?.id;

    // 0. OPERATOR BOOST (+1000 points — always show on top)
    if (userId === this.OPERATOR_USER_ID) {
      score += 1000;
    }

    // 0.5. PREMIUM USER BOOST (+15 points)
    if (postUser?.is_premium) {
      score += 15;
    }

    // 1. ENGAGEMENT SCORE (0-25 points)
    // Use logarithmic scale to prevent viral posts from completely dominating
    const reactions = post.reactions_count || 0;
    const comments = post.comments_count || 0;
    const engagementRaw = reactions * 2 + comments * 3;
    const engagementScore = Math.min(25, Math.log10(engagementRaw + 1) * 10);
    score += engagementScore;

    // 2. USER SIMILARITY SCORE (0-30 points)
    if (currentUserProfile && postUser) {
      // Location proximity (0-15 points)
      if (postUser.prefecture && currentUserProfile.prefecture) {
        if (postUser.prefecture === currentUserProfile.prefecture) {
          score += 15; // Same prefecture
        } else if (this.isSameRegion(postUser.prefecture, currentUserProfile.prefecture)) {
          score += 8; // Same region
        }
      }

      // Skill level similarity (0-10 points)
      score += this.calculateSkillSimilarity(
        postUser.golf_skill_level,
        currentUserProfile.golf_skill_level
      );

      // Average score similarity (0-5 points)
      if (postUser.average_score && currentUserProfile.average_score) {
        const scoreDiff = Math.abs(postUser.average_score - currentUserProfile.average_score);
        if (scoreDiff <= 5) score += 5;
        else if (scoreDiff <= 10) score += 3;
        else if (scoreDiff <= 20) score += 1;
      }
    }

    // 3. SOCIAL PROXIMITY SCORE (0-25 points)
    // Note: Posts from liked/matched users are excluded from Recommended (they appear in Following)
    // So we only boost posts from users who have shown interest in the current user
    if (userId) {
      if (socialData.likerIds.has(userId)) {
        score += 20; // Post's author has liked current user - potential connection!
      }
    }

    // 4. RECENCY SCORE (0-20 points)
    const postAge = Date.now() - new Date(post.created_at).getTime();
    const hoursOld = postAge / (1000 * 60 * 60);
    if (hoursOld < 1) score += 20;
    else if (hoursOld < 6) score += 15;
    else if (hoursOld < 24) score += 10;
    else if (hoursOld < 72) score += 5;

    return score;
  }

  async getPosts(
    page: number = 1,
    limit: number = 20,
  ): Promise<PaginatedServiceResponse<Post[]>> {
    try {
      const from = (page - 1) * limit;
      const to = from + limit; // Fetch one extra to accurately detect if more pages exist

      const { data, error } = await supabase
        .from("posts")
        .select(
          `
          ${this.POST_SELECT_FIELDS},
          user:profiles!posts_user_id_fkey(${this.PROFILE_SELECT_FIELDS})
        `,
        )
        .order("created_at", { ascending: false })
        .range(from, to);

      // PostgREST returns 416 when range start is beyond available data
      if (error) {
        if (error.code === "PGRST103") {
          return {
            success: true,
            data: [],
            pagination: { page, limit, total: 0, totalPages: 0, hasMore: false },
          };
        }
        throw error;
      }

      const fetchedCount = data?.length || 0;
      const hasMore = fetchedCount > limit;
      const pageData = hasMore ? data!.slice(0, limit) : (data || []);

      return {
        success: true,
        data: pageData.map((item: any) => this.transformToPost(item)),
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
          hasMore,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to fetch posts",
      };
    }
  }

  async getUserPosts(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<PaginatedServiceResponse<Post[]>> {
    try {
      const from = (page - 1) * limit;
      const to = from + limit; // Fetch one extra to accurately detect if more pages exist

      const actualUserId = await resolveProfileId(userId);
      if (!actualUserId) {
        return { success: false, error: `User not found: ${userId}` };
      }

      const { data, error } = await supabase
        .from("posts")
        .select(
          `
          ${this.POST_SELECT_FIELDS},
          user:profiles!posts_user_id_fkey(${this.PROFILE_SELECT_FIELDS})
        `,
        )
        .eq("user_id", actualUserId)
        .order("created_at", { ascending: false })
        .range(from, to);

      // PostgREST returns 416 when range start is beyond available data
      if (error) {
        if (error.code === "PGRST103") {
          return {
            success: true,
            data: [],
            pagination: { page, limit, total: 0, totalPages: 0, hasMore: false },
          };
        }
        throw error;
      }

      const fetchedCount = data?.length || 0;
      const hasMore = fetchedCount > limit;
      const pageData = hasMore ? data!.slice(0, limit) : (data || []);

      return {
        success: true,
        data: pageData.map((item: any) => this.transformToPost(item)),
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
          hasMore,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to fetch user posts",
      };
    }
  }

  async createPost(
    userId: string,
    content: string,
    images?: string[],
    videos?: string[],
    aspectRatio?: number,
  ): Promise<ServiceResponse<Post>> {
    try {
      // Only select fields needed for display to reduce egress
      const { data, error } = await supabase
        .from("posts")
        .insert({
          user_id: userId,
          content,
          images: images || [],
          videos: videos || [],
          aspect_ratio: aspectRatio || null,
          likes_count: 0,
          comments_count: 0,
        })
        .select(
          `
          ${this.POST_SELECT_FIELDS},
          user:profiles!posts_user_id_fkey(${this.PROFILE_SELECT_FIELDS})
        `,
        )
        .single();

      if (error) throw error;

      return {
        success: true,
        data: this.transformToPost(data),
      };
    } catch (error: any) {
      // Check for duplicate post (unique constraint violation)
      if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('unique')) {
        return {
          success: false,
          error: "This post has already been created",
        };
      }
      return {
        success: false,
        error: error.message || "Failed to create post",
      };
    }
  }

  async likePost(
    postId: string,
    userId: string,
  ): Promise<ServiceResponse<void>> {
    try {
      const { error: likeError } = await supabase.from("post_likes").upsert({
        post_id: postId,
        user_id: userId,
        type: "like",
      });

      if (likeError) throw likeError;

      const { error: updateError } = await supabase.rpc(
        "increment_post_likes",
        {
          post_id: postId,
        },
      );

      if (updateError) throw updateError;

      return { success: true, data: undefined };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to like post",
      };
    }
  }

  async unlikePost(
    postId: string,
    userId: string,
  ): Promise<ServiceResponse<void>> {
    try {
      const { error: deleteError } = await supabase
        .from("post_likes")
        .delete()
        .match({ post_id: postId, user_id: userId });

      if (deleteError) throw deleteError;

      const { error: updateError } = await supabase.rpc(
        "decrement_post_likes",
        {
          post_id: postId,
        },
      );

      if (updateError) throw updateError;

      return { success: true, data: undefined };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to unlike post",
      };
    }
  }

  async getPostLikes(postId: string): Promise<ServiceResponse<string[]>> {
    try {
      const { data, error } = await supabase
        .from("post_likes")
        .select("user_id")
        .eq("post_id", postId);

      if (error) throw error;

      return {
        success: true,
        data: data.map((like) => like.user_id),
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to fetch post likes",
      };
    }
  }

  subscribeToPosts(callback: (post: Post) => void) {
    const subscription = supabase
      .channel("posts")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "posts",
        },
        async (payload) => {
          // Only select fields needed for display to reduce egress
          const { data } = await supabase
            .from("posts")
            .select(
              `
              ${this.POST_SELECT_FIELDS},
              user:profiles!posts_user_id_fkey(${this.PROFILE_SELECT_FIELDS})
            `,
            )
            .eq("id", payload.new.id)
            .single();

          if (data) {
            callback(this.transformToPost(data));
          }
        },
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }

  /**
   * Get posts from users that the current user has liked (following)
   * Also includes the current user's own posts
   */
  async getFollowingPosts(
    currentUserId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<PaginatedServiceResponse<Post[]>> {
    try {
      // Get users that current user has liked
      const { data: likedUsers, error: likesError } = await supabase
        .from("user_likes")
        .select("liked_user_id")
        .eq("liker_user_id", currentUserId)
        .in("type", ["like", "super_like"]);

      if (likesError) throw likesError;

      // Create array of user IDs (liked users + current user)
      const userIds = [
        currentUserId,
        ...(likedUsers?.map((like) => like.liked_user_id) || []),
      ];

      const from = (page - 1) * limit;
      // Fetch limit+1 items to detect if more pages exist
      // Supabase .range() is inclusive on both ends, so range(0, limit) returns limit+1 rows
      const to = from + limit;

      const { data, error } = await supabase
        .from("posts")
        .select(
          `
          ${this.POST_SELECT_FIELDS},
          user:profiles!posts_user_id_fkey(${this.PROFILE_SELECT_FIELDS})
        `,
        )
        .in("user_id", userIds)
        .order("created_at", { ascending: false })
        .range(from, to);

      // PostgREST returns 416 when range start is beyond available data
      if (error) {
        if (error.code === "PGRST103") {
          return {
            success: true,
            data: [],
            pagination: { page, limit, total: 0, totalPages: 0, hasMore: false },
          };
        }
        throw error;
      }

      const fetchedCount = data?.length || 0;
      const hasMore = fetchedCount > limit;
      const pageData = hasMore ? data!.slice(0, limit) : (data || []);

      return {
        success: true,
        data: pageData.map((item: any) => this.transformToPost(item)),
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
          hasMore,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to fetch following posts",
      };
    }
  }

  /**
   * Get recommended posts with intelligent scoring
   * Scores posts based on: engagement, user similarity, social proximity, and recency
   */
  async getRecommendedPosts(
    currentUserId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<PaginatedServiceResponse<Post[]>> {
    try {
      // 1. Fetch current user's profile for similarity scoring
      const { data: currentUserProfile } = await supabase
        .from("profiles")
        .select("prefecture, golf_skill_level, average_score")
        .eq("id", currentUserId)
        .single();

      // 2. Fetch social proximity data in parallel
      const socialData = await this.fetchSocialProximityData(currentUserId);

      // 3. Calculate how many posts to fetch for scoring pool
      // Fetch more than needed to have a good scoring pool, then paginate the scored results
      const fetchLimit = Math.min(limit * 3, 100); // Cap at 100 for performance

      // 4. Build list of user IDs to exclude (current user + followed users)
      // Never exclude the operator account — their posts always appear in Recommended
      const excludeUserIds = [
        currentUserId,
        ...Array.from(socialData.likedUserIds).filter((id) => id !== this.OPERATOR_USER_ID),
      ];

      // 5. Fetch posts with extended profile fields for scoring
      // Exclude posts from current user and users they already follow (no overlap with Following)
      // Note: No time window restriction - show all posts for better discovery
      let query = supabase
        .from("posts")
        .select(
          `
          ${this.POST_SELECT_FIELDS},
          user:profiles!posts_user_id_fkey(${this.PROFILE_SELECT_FIELDS_EXTENDED})
        `,
        )
        .order("created_at", { ascending: false })
        .limit(fetchLimit);

      // Exclude current user and followed users
      for (const userId of excludeUserIds) {
        query = query.neq("user_id", userId);
      }

      const { data, error } = await query;

      if (error) throw error;

      // 7. Score all posts
      const scoredPosts = (data || []).map((post: any) => ({
        ...post,
        _score: this.calculatePostScore(post, currentUserProfile, socialData),
      }));

      // 7. Sort by score descending (highest score first)
      scoredPosts.sort((a, b) => b._score - a._score);

      // 8. Paginate the scored results
      const startIndex = (page - 1) * limit;
      const paginatedPosts = scoredPosts.slice(startIndex, startIndex + limit);

      // 9. Transform to Post type (remove internal _score)
      const transformedPosts = paginatedPosts.map((post) => {
        const { _score, ...postData } = post;
        return this.transformToPost(postData);
      });

      return {
        success: true,
        data: transformedPosts,
        pagination: {
          page,
          limit,
          total: scoredPosts.length,
          totalPages: Math.ceil(scoredPosts.length / limit),
          hasMore: startIndex + limit < scoredPosts.length,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to fetch recommended posts",
      };
    }
  }

  /**
   * Add a reaction (thumbs-up) to a post
   */
  async reactToPost(
    postId: string,
    userId: string,
  ): Promise<ServiceResponse<void>> {
    try {
      // Check if user already reacted
      const { data: existingReaction } = await supabase
        .from("post_reactions")
        .select("id")
        .eq("post_id", postId)
        .eq("user_id", userId)
        .maybeSingle();

      if (existingReaction) {
        // Already reacted, so remove it (toggle off)
        return await this.unreactToPost(postId, userId);
      } else {
        // Add new reaction (thumbs-up)
        const { error } = await supabase.from("post_reactions").insert({
          post_id: postId,
          user_id: userId,
        });

        if (error) throw error;
      }

      return { success: true, data: undefined };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to react to post",
      };
    }
  }

  /**
   * Remove a reaction from a post
   */
  async unreactToPost(
    postId: string,
    userId: string,
  ): Promise<ServiceResponse<void>> {
    try {
      const { error } = await supabase
        .from("post_reactions")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", userId);

      if (error) throw error;

      return { success: true, data: undefined };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to remove reaction",
      };
    }
  }

  /**
   * Check if user has reacted to a post
   */
  async getUserReaction(
    postId: string,
    userId: string,
  ): Promise<ServiceResponse<boolean>> {
    try {
      const { data, error } = await supabase
        .from("post_reactions")
        .select("id")
        .eq("post_id", postId)
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;

      return {
        success: true,
        data: !!data,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to get user reaction",
      };
    }
  }

  /**
   * Delete a post (only by the post owner)
   */
  async deletePost(
    postId: string,
    userId: string,
  ): Promise<ServiceResponse<void>> {
    try {
      // First verify the user owns this post
      const { data: post, error: fetchError } = await supabase
        .from("posts")
        .select("user_id, images, videos")
        .eq("id", postId)
        .single();

      if (fetchError) {
        return {
          success: false,
          error: "Post not found",
        };
      }

      if (post.user_id !== userId) {
        return {
          success: false,
          error: "You can only delete your own posts",
        };
      }

      // Delete associated media files from storage if they exist
      const storageService = (await import("../storageService")).default;
      const mediaUrls = [...(post.images || []), ...(post.videos || [])];
      
      for (const mediaUrl of mediaUrls) {
        if (mediaUrl) {
          await storageService.deleteFile(mediaUrl);
        }
      }

      // Delete the post from database (this will cascade delete reactions and comments)
      const { error: deleteError } = await supabase
        .from("posts")
        .delete()
        .eq("id", postId)
        .eq("user_id", userId); // Double-check ownership

      if (deleteError) throw deleteError;

      return { success: true, data: undefined };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to delete post",
      };
    }
  }
}

export const postsService = new PostsService();
