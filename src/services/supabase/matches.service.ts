import { supabase } from "../supabase";
import {
  UserLike,
  InteractionType,
  ServiceResponse,
} from "../../types/dataModels";
import { getCachedAuthUserId } from "../authCache";
import { resolveProfileId } from "../userMappingService";
import { logMatchCreated, logLikeSent } from "../facebookAnalytics";
import {
  logMatchCreated as firebaseLogMatchCreated,
  logLikeSent as firebaseLogLikeSent,
} from "../firebaseAnalytics";

export class MatchesService {
  async likeUser(
    likerUserId: string,
    likedUserId: string,
    type: InteractionType = "like",
  ): Promise<ServiceResponse<{ matched: boolean }>> {
    try {
      // Derive liker from current auth session to satisfy RLS (profiles.user_id = auth.uid())
      let actualLikerUserId = likerUserId;
      try {
        const authUserId = await getCachedAuthUserId();
        if (authUserId) {
          // Map auth user -> profile UUID
          const { data: selfProfile, error: selfErr } = await supabase
            .from("profiles")
            .select("id, user_id")
            .eq("user_id", authUserId)
            .single();
          if (!selfErr && selfProfile?.id) {
            actualLikerUserId = selfProfile.id;
          }
        }
      } catch (_e) {
        // Ignore; fallback to provided likerUserId
      }

      // Resolve liker / liked ids through centralized helper (handles
      // UUID-vs-legacy_id transparently). likeUser previously declared
      // `actualLikerUserId` mutably above; resolving here overwrites it.
      const resolvedLiker = await resolveProfileId(actualLikerUserId);
      if (!resolvedLiker) {
        return {
          success: false,
          error: `Liker user not found: ${actualLikerUserId}`,
        };
      }
      actualLikerUserId = resolvedLiker;

      const actualLikedUserId = await resolveProfileId(likedUserId);
      if (!actualLikedUserId) {
        return {
          success: false,
          error: `Liked user not found: ${likedUserId}`,
        };
      }

      console.log("[likeUser] auth-mapped liker:", actualLikerUserId, "liked:", actualLikedUserId, "type:", type);
      const { error } = await supabase.from("user_likes").upsert(
        {
          liker_user_id: actualLikerUserId,
          liked_user_id: actualLikedUserId,
          type,
          is_active: true,
          deleted_at: null,
        },
        {
          onConflict: "liker_user_id,liked_user_id",
          ignoreDuplicates: false, // Update if exists
        }
      );

      if (error) {
        console.error("[likeUser] upsert error:", error);
        throw error;
      }

      // Passes only need to be recorded — skip match logic and analytics
      if (type === "pass") {
        return {
          success: true,
          data: { matched: false },
        };
      }

      // Track like sent with Facebook + Firebase Analytics
      logLikeSent({ likeType: type === "super_like" ? "super_like" : "like" });
      firebaseLogLikeSent({ likeType: type === "super_like" ? "super_like" : "like" });

      const { data: mutualLike } = await supabase
        .from("user_likes")
        .select("*")
        .eq("liker_user_id", actualLikedUserId)
        .eq("liked_user_id", actualLikerUserId)
        .in("type", ["like", "super_like"])
        .eq("is_active", true)
        .maybeSingle();

      const matched = !!mutualLike;

      if (matched) {
        const [id1, id2] = [actualLikerUserId, actualLikedUserId].sort();
        // Try to create a match; ignore unique conflicts
        const { data: newMatch, error: matchError } = await supabase.from("matches").insert({
          user1_id: id1,
          user2_id: id2,
          is_active: true,
          matched_at: new Date().toISOString(),
          seen_by_user1: false,
          seen_by_user2: false,
        }).select('id').single();

        if (matchError && matchError.code !== "23505") {
          // Unique violation code in Postgres; ignore
          console.warn("Failed to insert match:", matchError.message);
        } else if (newMatch) {
          // Track match created with Facebook + Firebase Analytics
          logMatchCreated({ matchId: newMatch.id });
          firebaseLogMatchCreated({ matchId: newMatch.id });
        }
      }

      return {
        success: true,
        data: { matched },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to like user",
      };
    }
  }

  async undoLike(
    likerUserId: string,
    likedUserId: string,
  ): Promise<ServiceResponse<void>> {
    try {
      const actualLikerUserId = await resolveProfileId(likerUserId);
      if (!actualLikerUserId) {
        return { success: false, error: `Liker user not found: ${likerUserId}` };
      }
      const actualLikedUserId = await resolveProfileId(likedUserId);
      if (!actualLikedUserId) {
        return { success: false, error: `Liked user not found: ${likedUserId}` };
      }

      const { error } = await supabase
        .from("user_likes")
        .update({ is_active: false, deleted_at: new Date().toISOString() })
        .eq("liker_user_id", actualLikerUserId)
        .eq("liked_user_id", actualLikedUserId)
        .eq("type", "like");
      if (error) throw error;

      return { success: true, data: undefined };
    } catch (error: any) {
      return { success: false, error: error.message || "Failed to undo like" };
    }
  }

  async unlikeUser(
    likerUserId: string,
    likedUserId: string,
  ): Promise<ServiceResponse<void>> {
    return this.undoLike(likerUserId, likedUserId);
  }

  async getUserLikes(userId: string): Promise<ServiceResponse<UserLike[]>> {
    try {
      const actualUserId = await resolveProfileId(userId);
      if (!actualUserId) {
        return { success: false, error: `User not found: ${userId}` };
      }

      const { data, error } = await supabase
        .from("user_likes")
        .select("id, liker_user_id, liked_user_id, type, created_at, updated_at")
        .eq("liker_user_id", actualUserId);

      if (error) throw error;

      return {
        success: true,
        data: data as UserLike[],
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to fetch user likes",
      };
    }
  }

  async getMatches(userId: string): Promise<ServiceResponse<any[]>> {
    try {
      const { data, error } = await supabase
        .from("matches")
        .select(
          `
          id, user1_id, user2_id, matched_at, is_active, seen_by_user1, seen_by_user2,
          user1:profiles!matches_user1_id_fkey(id, name, profile_pictures, age, prefecture, gender, is_verified, is_premium, last_active_at),
          user2:profiles!matches_user2_id_fkey(id, name, profile_pictures, age, prefecture, gender, is_verified, is_premium, last_active_at)
        `,
        )
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
        .eq("is_active", true)
        .order("matched_at", { ascending: false });

      if (error) throw error;

      return {
        success: true,
        data: data || [],
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to fetch matches",
      };
    }
  }

  /**
   * Helper function to resolve user ID (UUID, legacy_id, or user_id) to profile UUID
   */
  private async resolveUserId(userId: string): Promise<string | null> {
    // If already a UUID, return as-is
    if (
      userId.match(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      )
    ) {
      return userId;
    }

    // Try to find by legacy_id
    const { data: legacyProfile, error: legacyError } = await supabase
      .from("profiles")
      .select("id")
      .eq("legacy_id", userId)
      .maybeSingle();

    if (!legacyError && legacyProfile) {
      return legacyProfile.id;
    }

    // Try to find by user_id (auth.users.id)
    const { data: authProfile, error: authError } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!authError && authProfile) {
      return authProfile.id;
    }

    return null;
  }

  async checkMatch(
    user1Id: string,
    user2Id: string,
  ): Promise<ServiceResponse<boolean>> {
    try {
      // Resolve both user IDs to profile UUIDs
      const resolvedUser1Id = await this.resolveUserId(user1Id);
      const resolvedUser2Id = await this.resolveUserId(user2Id);

      if (!resolvedUser1Id || !resolvedUser2Id) {
        return {
          success: false,
          error: `User not found: ${!resolvedUser1Id ? user1Id : user2Id}`,
        };
      }

      const [id1, id2] = [resolvedUser1Id, resolvedUser2Id].sort();

      const { data, error } = await supabase
        .from("matches")
        .select("*")
        .eq("user1_id", id1)
        .eq("user2_id", id2)
        .eq("is_active", true)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return {
        success: true,
        data: !!data,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to check match",
      };
    }
  }

  /**
   * Check if two users have mutual likes (both liked each other)
   */
  async checkMutualLikes(
    user1Id: string,
    user2Id: string,
  ): Promise<ServiceResponse<boolean>> {
    try {
      // Resolve both user IDs to profile UUIDs
      const resolvedUser1Id = await this.resolveUserId(user1Id);
      const resolvedUser2Id = await this.resolveUserId(user2Id);

      if (!resolvedUser1Id || !resolvedUser2Id) {
        return {
          success: false,
          error: `User not found: ${!resolvedUser1Id ? user1Id : user2Id}`,
        };
      }

      // Check both directions in parallel
      const [result1, result2] = await Promise.all([
        supabase
          .from("user_likes")
          .select("id")
          .eq("liker_user_id", resolvedUser1Id)
          .eq("liked_user_id", resolvedUser2Id)
          .eq("is_active", true)
          .in("type", ["like", "super_like"])
          .maybeSingle(),
        supabase
          .from("user_likes")
          .select("id")
          .eq("liker_user_id", resolvedUser2Id)
          .eq("liked_user_id", resolvedUser1Id)
          .eq("is_active", true)
          .in("type", ["like", "super_like"])
          .maybeSingle(),
      ]);

      if (result1.error) throw result1.error;
      if (result2.error) throw result2.error;

      const hasMutualLikes = !!(result1.data && result2.data);

      return {
        success: true,
        data: hasMutualLikes,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to check mutual likes",
      };
    }
  }

  /**
   * Batch check mutual likes for multiple users in a single query
   * This is much more efficient than checking each user individually (N+1 problem)
   * Returns a map of userId -> hasMutualLikes
   */
  async batchCheckMutualLikes(
    currentUserId: string,
    targetUserIds: string[],
  ): Promise<ServiceResponse<Record<string, boolean>>> {
    try {
      if (!targetUserIds.length) {
        return { success: true, data: {} };
      }

      // Resolve current user ID
      const resolvedCurrentUserId = await this.resolveUserId(currentUserId);
      if (!resolvedCurrentUserId) {
        return {
          success: false,
          error: `Current user not found: ${currentUserId}`,
        };
      }

      // Resolve all target user IDs in parallel (limited batch)
      const resolvedTargetIds = await Promise.all(
        targetUserIds.map(async (id) => ({
          original: id,
          resolved: await this.resolveUserId(id),
        }))
      );

      const validTargets = resolvedTargetIds.filter((t) => t.resolved);
      if (!validTargets.length) {
        return { success: true, data: {} };
      }

      const resolvedIds = validTargets.map((t) => t.resolved!);

      // Single query: Get all likes FROM current user TO any of the targets
      const { data: likesFromCurrent, error: error1 } = await supabase
        .from("user_likes")
        .select("liked_user_id")
        .eq("liker_user_id", resolvedCurrentUserId)
        .in("liked_user_id", resolvedIds)
        .eq("is_active", true)
        .in("type", ["like", "super_like"]);

      if (error1) throw error1;

      // Single query: Get all likes FROM targets TO current user
      const { data: likesToCurrent, error: error2 } = await supabase
        .from("user_likes")
        .select("liker_user_id")
        .in("liker_user_id", resolvedIds)
        .eq("liked_user_id", resolvedCurrentUserId)
        .eq("is_active", true)
        .in("type", ["like", "super_like"]);

      if (error2) throw error2;

      // Create sets for O(1) lookup
      const likedByCurrentSet = new Set(
        (likesFromCurrent || []).map((l) => l.liked_user_id)
      );
      const likedCurrentSet = new Set(
        (likesToCurrent || []).map((l) => l.liker_user_id)
      );

      // Build result map using original IDs
      const result: Record<string, boolean> = {};
      for (const { original, resolved } of validTargets) {
        if (resolved) {
          result[original] = likedByCurrentSet.has(resolved) && likedCurrentSet.has(resolved);
        }
      }

      // Set false for any unresolved users
      for (const id of targetUserIds) {
        if (!(id in result)) {
          result[id] = false;
        }
      }

      return { success: true, data: result };
    } catch (error: any) {
      console.error("Error in batchCheckMutualLikes:", error);
      return {
        success: false,
        error: error.message || "Failed to batch check mutual likes",
      };
    }
  }

  /**
   * Get likes received with full user profiles (optimized - single query)
   * Use this instead of getLikesReceived + individual getUserById calls
   */
  async getLikesReceivedWithProfiles(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<ServiceResponse<any[]>> {
    try {
      const actualUserId = await this.resolveUserId(userId);
      if (!actualUserId) {
        return {
          success: false,
          error: `User not found: ${userId}`,
        };
      }

      const { data, error } = await supabase
        .rpc('get_likes_received_with_profiles', {
          p_user_id: actualUserId,
          p_limit: limit,
          p_offset: offset
        });

      if (error) throw error;

      return {
        success: true,
        data: data || [],
      };
    } catch (error: any) {
      console.error('[MatchesService] Error getting likes with profiles:', error);
      return {
        success: false,
        error: error.message || 'Failed to get received likes',
      };
    }
  }

  /**
   * Get likes received with full user profiles AND has_liked_back status
   * Fully optimized - single query for all data needed by ConnectionsScreen
   * Eliminates N+1 query pattern (was: 2 + N calls, now: 1 call)
   */
  async getLikesReceivedWithProfilesV2(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<ServiceResponse<any[]>> {
    try {
      const actualUserId = await this.resolveUserId(userId);
      if (!actualUserId) {
        return {
          success: false,
          error: `User not found: ${userId}`,
        };
      }

      const { data, error } = await supabase.rpc('get_likes_received_with_profiles_v2', {
        p_user_id: actualUserId,
        p_limit: limit,
        p_offset: offset
      });

      if (error) throw error;

      return {
        success: true,
        data: data || [],
      };
    } catch (error: any) {
      console.error('[MatchesService] Error getting likes with profiles v2:', error);
      return {
        success: false,
        error: error.message || 'Failed to get received likes',
      };
    }
  }

  async getLikesReceived(userId: string): Promise<ServiceResponse<UserLike[]>> {
    try {
      const actualUserId = await resolveProfileId(userId);
      if (!actualUserId) {
        return { success: false, error: `User not found: ${userId}` };
      }

      const { data, error } = await supabase
        .from("user_likes")
        .select(
          `
          *,
          liker:profiles!user_likes_liker_user_id_fkey(*)
        `,
        )
        .eq("liked_user_id", actualUserId)
        .in("type", ["like", "super_like"]);

      if (error) throw error;

      return {
        success: true,
        data: data as UserLike[],
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to fetch received likes",
      };
    }
  }

  /**
   * Get unseen matches for a user (matches where popup hasn't been shown yet)
   */
  async getUnseenMatches(
    userId: string,
  ): Promise<ServiceResponse<any[]>> {
    try {
      const actualUserId = await resolveProfileId(userId);
      if (!actualUserId) {
        return { success: false, error: `User not found: ${userId}` };
      }

      // Query matches where user is participant and hasn't seen the popup
      const { data, error } = await supabase
        .from("matches")
        .select(
          `
          *,
          user1:profiles!matches_user1_id_fkey(id, name, profile_pictures),
          user2:profiles!matches_user2_id_fkey(id, name, profile_pictures)
        `,
        )
        .or(
          `and(user1_id.eq.${actualUserId},seen_by_user1.eq.false),and(user2_id.eq.${actualUserId},seen_by_user2.eq.false)`,
        )
        .eq("is_active", true)
        .order("matched_at", { ascending: false });

      if (error) throw error;

      return {
        success: true,
        data: data || [],
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to fetch unseen matches",
      };
    }
  }

  /**
   * Mark a match as seen by a specific user
   */
  async markMatchAsSeen(
    matchId: string,
    userId: string,
  ): Promise<ServiceResponse<void>> {
    try {
      const actualUserId = await resolveProfileId(userId);
      if (!actualUserId) {
        return { success: false, error: `User not found: ${userId}` };
      }

      // Get the match to determine which user field to update
      const { data: match, error: matchError } = await supabase
        .from("matches")
        .select("user1_id, user2_id")
        .eq("id", matchId)
        .single();

      if (matchError || !match) {
        return {
          success: false,
          error: `Match not found: ${matchId}`,
        };
      }

      // Update the appropriate seen flag
      const updateField =
        match.user1_id === actualUserId ? "seen_by_user1" : "seen_by_user2";
      const { error: updateError } = await supabase
        .from("matches")
        .update({ [updateField]: true })
        .eq("id", matchId);

      if (updateError) throw updateError;

      return { success: true, data: undefined };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to mark match as seen",
      };
    }
  }

  subscribeToMatches(userId: string, callback: (match: any) => void) {
    const subscription = supabase
      .channel(`matches:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "matches",
          filter: `user1_id=eq.${userId}`,
        },
        async (payload) => {
          const { data } = await supabase
            .from("matches")
            .select(
              `
              *,
              user1:profiles!matches_user1_id_fkey(id, name, profile_pictures),
              user2:profiles!matches_user2_id_fkey(id, name, profile_pictures)
            `,
            )
            .eq("id", payload.new.id)
            .single();

          if (data) {
            callback(data);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "matches",
          filter: `user2_id=eq.${userId}`,
        },
        async (payload) => {
          const { data } = await supabase
            .from("matches")
            .select(
              `
              *,
              user1:profiles!matches_user1_id_fkey(id, name, profile_pictures),
              user2:profiles!matches_user2_id_fkey(id, name, profile_pictures)
            `,
            )
            .eq("id", payload.new.id)
            .single();

          if (data) {
            callback(data);
          }
        },
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }
}

export const matchesService = new MatchesService();
