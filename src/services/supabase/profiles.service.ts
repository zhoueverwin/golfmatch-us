import { supabase } from "../supabase";
import {
  User,
  SearchFilters,
  ServiceResponse,
  PaginatedServiceResponse,
} from "../../types/dataModels";
import { AGE_DECADES } from "../../constants/filterOptions";
import { getCachedAuthUserId } from "../authCache";

export class ProfilesService {
  // Explicit column list — excludes internal fields (push_token, push_token_updated_at,
  // premium_source, premium_granted_at, last_footprints_viewed_at, last_likes_viewed_at)
  static readonly PROFILE_COLUMNS = "id, user_id, legacy_id, name, age, gender, prefecture, location, golf_skill_level, average_score, bio, profile_pictures, is_verified, is_premium, current_streak_days, longest_streak_days, last_login, last_active_at, blood_type, height, body_type, smoking, favorite_club, personality_type, golf_experience, best_score, transportation, available_days, created_at, updated_at, kyc_status, birth_date, play_prefecture, received_likes_count, looking_for, has_kids, wants_kids, drinking, occupation, education, pets, languages, religion, politics, handicap, home_course, dominant_hand, walking_or_riding, playing_frequency";

  async getProfile(userId: string): Promise<ServiceResponse<User>> {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select(ProfilesService.PROFILE_COLUMNS)
        .eq("id", userId)
        .single();

      if (error) throw error;

      return {
        success: true,
        data: data as User,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to fetch profile",
      };
    }
  }

  async getProfileByLegacyId(legacyId: string): Promise<ServiceResponse<User>> {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select(ProfilesService.PROFILE_COLUMNS)
        .eq("legacy_id", legacyId)
        .single();

      if (error) throw error;

      return {
        success: true,
        data: data as User,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to fetch profile",
      };
    }
  }

  async getProfileByEmail(email: string): Promise<ServiceResponse<User>> {
    try {
      // OPTIMIZED: Single RPC call instead of fetching ALL auth users
      // Previous: listUsers() fetched entire user table, then filtered client-side
      // Now: Single database query with proper join
      const { data, error } = await supabase.rpc('get_profile_by_email', {
        p_email: email
      });

      if (error) throw error;

      if (!data || data.length === 0) {
        return {
          success: false,
          error: `User with email ${email} not found`,
        };
      }

      return {
        success: true,
        data: data[0] as User,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to fetch profile by email",
      };
    }
  }

  async searchProfiles(
    filters: SearchFilters,
    page: number = 1,
    limit: number = 20,
    sortBy: "registration" | "recommended" | "login" | "likes" = "recommended",
    excludeUserIds?: string[],
  ): Promise<PaginatedServiceResponse<User[]>> {
    // Distance filter routes through the server-side ST_DWithin RPC. We
    // can't use PostgREST for this — geography filtering is server-only.
    // When `distance_miles` is set (and not "Anywhere" = null/undefined),
    // we delegate to searchProfilesWithinRadius which hits the GIST index.
    if (filters.distance_miles != null && filters.distance_miles > 0) {
      return this.searchProfilesWithinRadius(
        filters.distance_miles,
        page,
        limit,
        excludeUserIds,
      );
    }
    try {
      // Force opposite-gender results regardless of any caller-supplied gender
      // filter. Mirrors the strict rule applied to Discover RPCs in
      // migration 21 — this is a male<->female dating app.
      const { data: sessionData } = await supabase.auth.getUser();
      const authUserId = sessionData?.user?.id;
      let viewerGender: string | null = null;
      if (authUserId) {
        const { data: viewer } = await supabase
          .from("profiles")
          .select("gender")
          .eq("user_id", authUserId)
          .single();
        viewerGender = viewer?.gender ?? null;
      }
      const forcedOppositeGender: string | null =
        viewerGender === "male"
          ? "female"
          : viewerGender === "female"
            ? "male"
            : null;

      let query = supabase.from("profiles").select(ProfilesService.PROFILE_COLUMNS, { count: "exact" });

      // Exclude specific user IDs (e.g., already liked/passed users)
      // PostgREST requires double-quoted values inside the in() tuple
      if (excludeUserIds && excludeUserIds.length > 0) {
        const quotedIds = excludeUserIds.map(id => `"${id}"`).join(",");
        query = query.not("id", "in", `(${quotedIds})`);
      }

      // IMPORTANT: Filter out incomplete profiles
      // A complete profile must have: gender, birth_date, and at least 1 profile picture
      // This prevents showing users who registered but never finished profile setup
      query = query
        .not("gender", "is", null)
        .not("birth_date", "is", null)
        .not("profile_pictures", "eq", "{}");

      // Visibility gate (v1.2 model):
      //   - Females: visible as long as profile is complete (gender +
      //     birth_date + at least one photo, already filtered above).
      //   - Males: visible if premium. The hard paywall enforces premium
      //     at entry; that's the only male-side gate.
      // KYC verification is NOT a visibility gate on either side. It is
      // purely a per-action gate (useRequireVerification on the client)
      // and a display badge on the profile card. Unverified profiles
      // appear in Search and can be browsed; they just can't perform
      // active interactions until they verify.
      query = query.or("gender.eq.female,and(gender.eq.male,is_premium.eq.true)");

      // Prefecture filter (single or multiple for region-based search)
      if (filters.prefectures && filters.prefectures.length > 0) {
        query = query.in("prefecture", filters.prefectures);
      } else if (filters.prefecture) {
        query = query.eq("prefecture", filters.prefecture);
      }

      // Golf skill level filter
      if (filters.golf_skill_level) {
        query = query.eq("golf_skill_level", filters.golf_skill_level);
      }

      // Gender filter. Force opposite-gender when we know the viewer's
      // gender, regardless of any caller-supplied filter — this is a strict
      // male<->female dating app.
      if (forcedOppositeGender) {
        query = query.eq("gender", forcedOppositeGender);
      } else if (filters.gender) {
        query = query.eq("gender", filters.gender);
      }

      // Age decade filter - handle multiple decades correctly
      if (filters.age_decades && filters.age_decades.length > 0) {
        // If only one decade selected, use simple range
        if (filters.age_decades.length === 1) {
          const decade = filters.age_decades[0];
          const decadeOption = AGE_DECADES.find((d) => d.value === decade);
          if (decadeOption) {
            query = query.gte("age", decadeOption.ageMin).lte("age", decadeOption.ageMax);
          }
        } else {
          // Multiple decades selected - use .or() to match any of the selected decades
          // FIX: Use explicit and() syntax for combining conditions within OR
          // Correct format: .or("and(age.gte.20,age.lte.29),and(age.gte.30,age.lte.39)")
          // Previous format "(age.gte.20,age.lte.29)" was incorrect PostgREST syntax
          const orConditions = filters.age_decades
            .map((decade) => {
              const decadeOption = AGE_DECADES.find((d) => d.value === decade);
              if (decadeOption) {
                // Use explicit and() to group each age range
                return `and(age.gte.${decadeOption.ageMin},age.lte.${decadeOption.ageMax})`;
              }
              return null;
            })
            .filter((condition): condition is string => condition !== null);

          if (orConditions.length > 0) {
            query = query.or(orConditions.join(","));
          }
        }
      }

      // Average score filter (maximum)
      if (filters.average_score_max !== undefined) {
        query = query.lte("average_score", filters.average_score_max);
      }

      // Last active filter (days) - uses last_active_at which is updated by presence service
      if (filters.last_login_days !== undefined && filters.last_login_days !== null) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - filters.last_login_days);
        query = query.gte("last_active_at", cutoffDate.toISOString());
      }

      // Sorting
      if (sortBy === "registration") {
        query = query.order("created_at", { ascending: false });
      } else if (sortBy === "login") {
        query = query.order("last_active_at", { ascending: false, nullsFirst: false });
      } else if (sortBy === "likes") {
        query = query.order("received_likes_count", { ascending: false });
      }
      // For "recommended", no explicit ordering is needed (database default or custom logic)

      // Pagination
      const from = (page - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        success: true,
        data: data as User[],
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
          hasMore: (count || 0) > page * limit,
        },
      };
    } catch (error: any) {
      console.error("❌ searchProfiles error:", error);
      return {
        success: false,
        error: error.message || "Failed to search profiles",
      };
    }
  }

  /**
   * Search within a radius (miles) of the current user's home_location.
   *
   * Backed by the search_profiles_within_radius SECURITY DEFINER RPC.
   * The RPC handles:
   *   - ST_DWithin filter against the GIST index (fast at 100k+ profiles)
   *   - opposite-gender enforcement (matches the existing search invariant)
   *   - banned-user exclusion (same hard filter as everywhere else)
   *   - distance_miles populated on each row, ready for the card chip
   *
   * Falls back to an error response if the current user has no
   * home_location yet — callers should surface "Update your location
   * to see distance-based results" UX in that case.
   */
  async searchProfilesWithinRadius(
    radiusMiles: number,
    page: number = 1,
    limit: number = 20,
    excludeUserIds?: string[],
  ): Promise<PaginatedServiceResponse<User[]>> {
    try {
      const authUserId = await getCachedAuthUserId();
      if (!authUserId) {
        return {
          success: false,
          error: "No authenticated user",
        };
      }

      const offset = (page - 1) * limit;
      const { data, error } = await supabase.rpc(
        "search_profiles_within_radius",
        {
          p_current_user_id: authUserId,
          p_radius_miles: radiusMiles,
          p_limit: limit,
          p_offset: offset,
        },
      );

      if (error) throw error;

      let users: User[] = (data || []) as User[];

      // Client-side exclusion of already-liked/passed users. The RPC could
      // do this too but the existing pattern keeps exclusion lists on the
      // client to avoid argument-count blowup; few enough rows that the
      // post-filter is fine.
      if (excludeUserIds && excludeUserIds.length > 0) {
        const exclude = new Set(excludeUserIds);
        users = users.filter((u) => !exclude.has(u.id));
      }

      return {
        success: true,
        data: users,
        pagination: {
          page,
          limit,
          total: users.length,
          totalPages: users.length === limit ? page + 1 : page,
          hasMore: users.length === limit,
        },
      };
    } catch (error: any) {
      console.error("❌ searchProfilesWithinRadius error:", error);
      return {
        success: false,
        error: error.message || "Failed to search nearby profiles",
      };
    }
  }

  /**
   * Get intelligent recommendations using scoring algorithm
   * Replaces simple exclusion-based recommendations with multi-factor scoring
   * @param userId - Current user ID
   * @param limit - Number of results to return
   * @param offset - Pagination offset
   * @returns Ranked list of recommended users with scores
   */
  async getIntelligentRecommendations(
    userId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<PaginatedServiceResponse<User[]>> {
    try {
      console.log(`[ProfilesService] Getting intelligent recommendations for user ${userId}`);

      // Call PostgreSQL RPC function
      const { data, error } = await supabase.rpc('get_intelligent_recommendations', {
        p_current_user_id: userId,
        p_limit: limit,
        p_offset: offset,
      });

      if (error) {
        console.error('[ProfilesService] RPC error:', error);
        console.warn('[ProfilesService] RPC function not deployed yet - this is expected until database migration is run');

        // Temporary fallback: return empty array until migration is deployed
        return {
          success: true,
          data: [],
          pagination: {
            page: 1,
            limit,
            total: 0,
            totalPages: 0,
            hasMore: false,
          },
        };
      }

      const users: User[] = (data || []) as User[];

      console.log(`[ProfilesService] Retrieved ${users.length} intelligent recommendations`);

      return {
        success: true,
        data: users,
        pagination: {
          page: Math.floor(offset / limit) + 1,
          limit,
          total: users.length,
          totalPages: 1,
          hasMore: users.length === limit,
        },
      };
    } catch (error: any) {
      console.error('[ProfilesService] Error in getIntelligentRecommendations:', error);

      // Fallback: Return empty array instead of failing
      return {
        success: false,
        error: error.message || 'Failed to fetch intelligent recommendations',
      };
    }
  }

  async updateProfile(
    userId: string,
    updates: Partial<User>,
  ): Promise<ServiceResponse<User>> {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", userId)
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        data: data as User,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to update profile",
      };
    }
  }

  async getCurrentUserProfile(): Promise<ServiceResponse<User>> {
    try {
      const authUserId = await getCachedAuthUserId();

      if (!authUserId) {
        return {
          success: false,
          error: "No authenticated user",
        };
      }

      return this.getProfile(authUserId);
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to fetch current user profile",
      };
    }
  }

  subscribeToProfile(userId: string, callback: (profile: User) => void) {
    const subscription = supabase
      .channel(`profile:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          callback(payload.new as User);
        },
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }

  /**
   * Get server-enforced daily recommendations (today's picks).
   * Idempotent: returns the same picks for the entire day (JST).
   * Female users get 10 picks, premium males get 5, free males get 3.
   */
  async getDailyRecommendations(
    userId: string,
  ): Promise<ServiceResponse<User[]>> {
    try {
      const { data, error } = await supabase.rpc('get_daily_recommendations', {
        p_user_id: userId,
      });

      if (error) {
        console.error('[ProfilesService] get_daily_recommendations RPC error:', error);
        return {
          success: false,
          error: error.message || 'Failed to fetch daily recommendations',
        };
      }

      // Map out_ prefixed columns back to standard User shape
      const users: User[] = (data || []).map((row: any) => ({
        id: row.out_id,
        user_id: row.out_user_id,
        legacy_id: row.out_legacy_id,
        name: row.out_name,
        age: row.out_age,
        gender: row.out_gender,
        prefecture: row.out_prefecture,
        location: row.out_location,
        golf_skill_level: row.out_golf_skill_level,
        average_score: row.out_average_score,
        profile_pictures: row.out_profile_pictures,
        bio: row.out_bio,
        is_verified: row.out_is_verified,
        is_premium: row.out_is_premium,
        current_streak_days: row.out_current_streak_days,
        last_login: row.out_last_login,
        created_at: row.out_created_at,
        updated_at: row.out_updated_at,
      }));

      return {
        success: true,
        data: users,
      };
    } catch (error: any) {
      console.error('[ProfilesService] Error in getDailyRecommendations:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch daily recommendations',
      };
    }
  }

  /**
   * Mark a daily recommendation as swiped (server-side tracking).
   */
  async markRecommendationSwiped(
    userId: string,
    recommendedUserId: string,
  ): Promise<ServiceResponse<void>> {
    try {
      const { error } = await supabase.rpc('mark_recommendation_swiped', {
        p_user_id: userId,
        p_recommended_user_id: recommendedUserId,
      });

      if (error) {
        console.error('[ProfilesService] mark_recommendation_swiped error:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data: undefined };
    } catch (error: any) {
      console.error('[ProfilesService] Error in markRecommendationSwiped:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Batch fetch multiple users by IDs
   * Much more efficient than fetching one by one
   */
  async getUsersByIds(userIds: string[]): Promise<ServiceResponse<User[]>> {
    try {
      if (userIds.length === 0) {
        return { success: true, data: [] };
      }

      const { data, error } = await supabase
        .rpc('get_users_by_ids', { p_user_ids: userIds });

      if (error) throw error;

      return {
        success: true,
        data: (data || []) as User[],
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to fetch users",
      };
    }
  }

  /**
   * Batch check online status for multiple users
   */
  async getUsersOnlineStatus(userIds: string[]): Promise<ServiceResponse<Map<string, boolean>>> {
    try {
      if (userIds.length === 0) {
        return { success: true, data: new Map() };
      }

      const { data, error } = await supabase
        .rpc('get_users_online_status', { p_user_ids: userIds });

      if (error) throw error;

      const statusMap = new Map<string, boolean>();
      for (const row of data || []) {
        statusMap.set(row.user_id, row.is_online);
      }

      return {
        success: true,
        data: statusMap,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to fetch online status",
      };
    }
  }

  /**
   * Grant premium status to a user (admin function)
   * Sets premium_source to 'manual' or 'permanent' which prevents RevenueCat from overwriting
   * @param userId - Profile ID to grant premium to
   * @param source - 'manual' for temporary admin grant, 'permanent' for lifetime
   */
  async grantPremium(
    userId: string,
    source: 'manual' | 'permanent' = 'manual'
  ): Promise<ServiceResponse<User>> {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .update({
          is_premium: true,
          premium_source: source,
          premium_granted_at: new Date().toISOString(),
        })
        .eq("id", userId)
        .select()
        .single();

      if (error) throw error;

      // Also create a membership record for audit trail
      await supabase.from("memberships").insert({
        user_id: userId,
        plan_type: source,
        price: 0,
        purchase_date: new Date().toISOString(),
        expiration_date: null,
        is_active: true,
        platform: 'ios',
      });

      console.log(`[ProfilesService] Granted ${source} premium to user:`, userId);

      return {
        success: true,
        data: data as User,
      };
    } catch (error: any) {
      console.error("[ProfilesService] Error granting premium:", error);
      return {
        success: false,
        error: error.message || "Failed to grant premium",
      };
    }
  }

  /**
   * Revoke premium status from a user (admin function)
   * Only revokes if premium_source is 'manual' or 'permanent' (not RevenueCat subscriptions)
   * @param userId - Profile ID to revoke premium from
   */
  async revokePremium(userId: string): Promise<ServiceResponse<User>> {
    try {
      // First check current premium source
      const { data: profile, error: fetchError } = await supabase
        .from("profiles")
        .select("premium_source")
        .eq("id", userId)
        .single();

      if (fetchError) throw fetchError;

      // Only allow revoking manual/permanent grants (not RevenueCat subscriptions)
      if (profile?.premium_source === 'revenuecat') {
        return {
          success: false,
          error: "Cannot revoke RevenueCat subscription from backend. User must cancel in app store.",
        };
      }

      const { data, error } = await supabase
        .from("profiles")
        .update({
          is_premium: false,
          premium_source: null,
          premium_granted_at: null,
        })
        .eq("id", userId)
        .select()
        .single();

      if (error) throw error;

      // Deactivate membership records
      await supabase
        .from("memberships")
        .update({ is_active: false })
        .eq("user_id", userId)
        .eq("is_active", true);

      console.log("[ProfilesService] Revoked premium from user:", userId);

      return {
        success: true,
        data: data as User,
      };
    } catch (error: any) {
      console.error("[ProfilesService] Error revoking premium:", error);
      return {
        success: false,
        error: error.message || "Failed to revoke premium",
      };
    }
  }

  /**
   * Check if a user has premium status (from any source)
   * Single source of truth for premium status
   * @param userId - Profile ID to check
   */
  async checkPremiumStatus(userId: string): Promise<ServiceResponse<{
    isPremium: boolean;
    source: string | null;
    grantedAt: string | null;
  }>> {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("is_premium, premium_source, premium_granted_at")
        .eq("id", userId)
        .single();

      if (error) throw error;

      return {
        success: true,
        data: {
          isPremium: data?.is_premium ?? false,
          source: data?.premium_source ?? null,
          grantedAt: data?.premium_granted_at ?? null,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to check premium status",
      };
    }
  }
}

export const profilesService = new ProfilesService();
