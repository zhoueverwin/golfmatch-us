import { supabase } from "../supabase";
import { ServiceResponse } from "../../types/dataModels";

export interface UserBlock {
  id: string;
  blocker_id: string;
  blocked_user_id: string;
  created_at: string;
}

export class BlocksService {
  /**
   * Block a user
   */
  async blockUser(
    blockerId: string,
    blockedUserId: string
  ): Promise<ServiceResponse<UserBlock>> {
    try {
      // Prevent self-blocking
      if (blockerId === blockedUserId) {
        return {
          success: false,
          error: "自分自身をブロックすることはできません",
        };
      }

      const { data, error } = await supabase
        .from("user_blocks")
        .insert({
          blocker_id: blockerId,
          blocked_user_id: blockedUserId,
        })
        .select()
        .single();

      if (error) {
        // Handle unique constraint violation (already blocked)
        if (error.code === "23505") {
          return {
            success: false,
            error: "このユーザーは既にブロックされています",
          };
        }
        throw error;
      }

      return {
        success: true,
        data: data as UserBlock,
      };
    } catch (error: any) {
      console.error("[BlocksService] Failed to block user:", error);
      return {
        success: false,
        error: error.message || "ブロックに失敗しました",
      };
    }
  }

  /**
   * Unblock a user
   */
  async unblockUser(
    blockerId: string,
    blockedUserId: string
  ): Promise<ServiceResponse<void>> {
    try {
      const { error } = await supabase
        .from("user_blocks")
        .delete()
        .eq("blocker_id", blockerId)
        .eq("blocked_user_id", blockedUserId);

      if (error) throw error;

      return {
        success: true,
      };
    } catch (error: any) {
      console.error("[BlocksService] Failed to unblock user:", error);
      return {
        success: false,
        error: error.message || "ブロック解除に失敗しました",
      };
    }
  }

  /**
   * Check if a user is blocked
   */
  async isUserBlocked(
    blockerId: string,
    blockedUserId: string
  ): Promise<ServiceResponse<boolean>> {
    try {
      const { data, error } = await supabase.rpc("is_user_blocked", {
        p_blocker_id: blockerId,
        p_blocked_user_id: blockedUserId,
      });

      if (error) throw error;

      return {
        success: true,
        data: data as boolean,
      };
    } catch (error: any) {
      console.error("[BlocksService] Failed to check block status:", error);
      return {
        success: false,
        error: error.message || "ブロック状態の確認に失敗しました",
        data: false,
      };
    }
  }

  /**
   * Get list of blocked user IDs
   */
  async getBlockedUserIds(userId: string): Promise<ServiceResponse<string[]>> {
    try {
      const { data, error } = await supabase.rpc("get_blocked_user_ids", {
        p_user_id: userId,
      });

      if (error) throw error;

      return {
        success: true,
        data: (data as string[]) || [],
      };
    } catch (error: any) {
      console.error("[BlocksService] Failed to get blocked users:", error);
      return {
        success: false,
        error: error.message || "ブロックリストの取得に失敗しました",
        data: [],
      };
    }
  }

  /**
   * Get list of blocked users with profile details
   */
  async getBlockedUsers(userId: string): Promise<
    ServiceResponse<
      Array<{
        id: string;
        blocked_user_id: string;
        blocked_user: {
          id: string;
          name: string;
          profile_pictures: string[];
        } | null;
        created_at: string;
      }>
    >
  > {
    try {
      const { data, error } = await supabase
        .from("user_blocks")
        .select(
          `
          id,
          blocked_user_id,
          blocked_user:profiles!user_blocks_blocked_user_id_fkey(
            id,
            name,
            profile_pictures
          ),
          created_at
        `
        )
        .eq("blocker_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Transform the data - Supabase returns an array for the join
      const transformedData = (data || []).map((item: any) => ({
        id: item.id,
        blocked_user_id: item.blocked_user_id,
        blocked_user: Array.isArray(item.blocked_user)
          ? item.blocked_user[0] || null
          : item.blocked_user,
        created_at: item.created_at,
      }));

      return {
        success: true,
        data: transformedData,
      };
    } catch (error: any) {
      console.error(
        "[BlocksService] Failed to get blocked users with details:",
        error
      );
      return {
        success: false,
        error: error.message || "ブロックリストの取得に失敗しました",
        data: [],
      };
    }
  }

  /**
   * Helper to filter out blocked users from an array of items with user_id
   */
  filterBlockedUsers<T extends { user_id: string }>(
    items: T[],
    blockedUserIds: string[]
  ): T[] {
    const blockedSet = new Set(blockedUserIds);
    return items.filter((item) => !blockedSet.has(item.user_id));
  }
}

export const blocksService = new BlocksService();
