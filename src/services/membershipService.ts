import { supabase } from "./supabase";
import { Membership, ServiceResponse } from "../types/dataModels";

export class MembershipService {
  /**
   * Check if user has an active membership
   * Returns true if user has active membership (is_active = true AND not expired)
   */
  async checkActiveMembership(userId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase.rpc("check_active_membership", {
        p_user_id: userId,
      });

      if (error) {
        console.error("[MembershipService] Error checking active membership:", error);
        return false;
      }

      return data === true;
    } catch (error: any) {
      console.error("[MembershipService] Exception checking active membership:", error);
      return false;
    }
  }

  /**
   * Get current membership information for a user
   */
  async getMembershipInfo(userId: string): Promise<ServiceResponse<Membership | null>> {
    try {
      const { data, error } = await supabase
        .from("memberships")
        .select("*")
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          // No membership found
          return {
            success: true,
            data: null,
          };
        }
        console.error("[MembershipService] Error getting membership info:", error);
        return {
          success: false,
          error: error.message || "Failed to get membership info",
        };
      }

      return {
        success: true,
        data: data as Membership,
      };
    } catch (error: any) {
      console.error("[MembershipService] Exception getting membership info:", error);
      return {
        success: false,
        error: error.message || "Failed to get membership info",
      };
    }
  }

  /**
   * Create a new membership record after successful purchase
   */
  async createMembership(
    userId: string,
    planType: "basic" | "permanent",
    price: number,
    transactionId: string,
    platform: "ios" | "android",
  ): Promise<ServiceResponse<Membership>> {
    try {
      // Calculate expiration date for basic plan (1 month from now)
      const expirationDate =
        planType === "basic"
          ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
          : null;

      const { data, error } = await supabase
        .from("memberships")
        .insert({
          user_id: userId,
          plan_type: planType,
          price,
          purchase_date: new Date().toISOString(),
          expiration_date: expirationDate,
          is_active: true,
          store_transaction_id: transactionId,
          platform,
        })
        .select()
        .single();

      if (error) {
        console.error("[MembershipService] Error creating membership:", error);
        return {
          success: false,
          error: error.message || "Failed to create membership",
        };
      }

      return {
        success: true,
        data: data as Membership,
      };
    } catch (error: any) {
      console.error("[MembershipService] Exception creating membership:", error);
      return {
        success: false,
        error: error.message || "Failed to create membership",
      };
    }
  }

  /**
   * Validate and update membership status (check expiration, etc.)
   */
  async validateAndUpdateMembership(userId: string): Promise<void> {
    try {
      // Get all active memberships for user
      const { data: memberships, error } = await supabase
        .from("memberships")
        .select("*")
        .eq("user_id", userId)
        .eq("is_active", true);

      if (error) {
        console.error("[MembershipService] Error validating membership:", error);
        return;
      }

      if (!memberships || memberships.length === 0) {
        return;
      }

      const now = new Date();
      const updates: Promise<any>[] = [];

      for (const membership of memberships) {
        // Deactivate expired basic plans
        if (
          membership.plan_type === "basic" &&
          membership.expiration_date &&
          new Date(membership.expiration_date) < now
        ) {
          updates.push(
            (async () => {
              await supabase
                .from("memberships")
                .update({ is_active: false })
                .eq("id", membership.id);
            })()
          );
        }
      }

      await Promise.all(updates);
    } catch (error: any) {
      console.error("[MembershipService] Exception validating membership:", error);
    }
  }

  /**
   * Cancel user's membership
   * Sets is_active = false and immediately revokes message sending ability
   */
  async cancelMembership(userId: string): Promise<ServiceResponse<void>> {
    try {
      // Get active membership
      const membershipResult = await this.getMembershipInfo(userId);

      if (!membershipResult.success || !membershipResult.data) {
        return {
          success: false,
          error: "No active membership found to cancel",
        };
      }

      const membership = membershipResult.data;
      const now = new Date().toISOString();

      // Update membership to inactive
      const { error } = await supabase
        .from("memberships")
        .update({
          is_active: false,
          expiration_date: membership.plan_type === "basic" ? now : membership.expiration_date,
        })
        .eq("id", membership.id);

      if (error) {
        console.error("[MembershipService] Error canceling membership:", error);
        return {
          success: false,
          error: error.message || "Failed to cancel membership",
        };
      }

      return {
        success: true,
      };
    } catch (error: any) {
      console.error("[MembershipService] Exception canceling membership:", error);
      return {
        success: false,
        error: error.message || "Failed to cancel membership",
      };
    }
  }
}

export const membershipService = new MembershipService();
