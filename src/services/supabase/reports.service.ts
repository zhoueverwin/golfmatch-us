import { supabase } from "../supabase";
import { ServiceResponse } from "../../types/dataModels";

export type ReportType =
  | "inappropriate_content"
  | "spam"
  | "harassment"
  | "fraud"
  | "inappropriate_media"
  | "false_information"
  | "other";

export type ReportStatus = "pending" | "reviewed" | "resolved" | "dismissed";

export interface Report {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  reported_post_id?: string | null;
  reported_message_id?: string | null;
  report_type: ReportType;
  description: string;
  status: ReportStatus;
  created_at: string;
  updated_at: string;
}

export interface CreateReportParams {
  reporterId: string;
  reportedUserId: string;
  reportedPostId?: string;
  reportedMessageId?: string;
  reportType: ReportType;
  description: string;
}

export class ReportsService {
  /**
   * Check if user has exceeded rate limit (5 reports per hour)
   */
  async checkRateLimit(userId: string): Promise<ServiceResponse<boolean>> {
    try {
      const { data, error } = await supabase.rpc("check_report_rate_limit", {
        p_user_id: userId,
      });

      if (error) throw error;

      return {
        success: true,
        data: data as boolean,
      };
    } catch (error: any) {
      console.error("[ReportsService] Rate limit check failed:", error);
      return {
        success: false,
        error: error.message || "Failed to check rate limit",
      };
    }
  }

  /**
   * Create a new report
   */
  async createReport(
    params: CreateReportParams
  ): Promise<ServiceResponse<Report>> {
    try {
      // Validate description length
      if (params.description.length < 10) {
        return {
          success: false,
          error: "Description must be at least 10 characters",
        };
      }

      if (params.description.length > 1000) {
        return {
          success: false,
          error: "Description must be 1000 characters or fewer",
        };
      }

      // Prevent self-reporting
      if (params.reporterId === params.reportedUserId) {
        return {
          success: false,
          error: "You cannot report yourself",
        };
      }

      // Check rate limit
      const rateLimitCheck = await this.checkRateLimit(params.reporterId);
      if (!rateLimitCheck.success || !rateLimitCheck.data) {
        return {
          success: false,
          error:
            "You have reached the report limit. Please wait a while and try again.",
        };
      }

      const { data, error } = await supabase
        .from("reports")
        .insert({
          reporter_id: params.reporterId,
          reported_user_id: params.reportedUserId,
          reported_post_id: params.reportedPostId || null,
          reported_message_id: params.reportedMessageId || null,
          report_type: params.reportType,
          description: params.description,
          status: "pending",
        })
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        data: data as Report,
      };
    } catch (error: any) {
      console.error("[ReportsService] Failed to create report:", error);
      return {
        success: false,
        error: error.message || "Failed to submit report",
      };
    }
  }

  /**
   * Get reports created by a user (for user's reference)
   */
  async getUserReports(userId: string): Promise<ServiceResponse<Report[]>> {
    try {
      const { data, error } = await supabase
        .from("reports")
        .select("*")
        .eq("reporter_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return {
        success: true,
        data: (data as Report[]) || [],
      };
    } catch (error: any) {
      console.error("[ReportsService] Failed to get user reports:", error);
      return {
        success: false,
        error: error.message || "Failed to fetch report history",
      };
    }
  }

  /**
   * Check if a user has already reported a specific post/message/user
   */
  async hasAlreadyReported(
    reporterId: string,
    reportedUserId: string,
    reportedPostId?: string,
    reportedMessageId?: string
  ): Promise<ServiceResponse<boolean>> {
    try {
      let query = supabase
        .from("reports")
        .select("id")
        .eq("reporter_id", reporterId)
        .eq("reported_user_id", reportedUserId);

      if (reportedPostId) {
        query = query.eq("reported_post_id", reportedPostId);
      } else if (reportedMessageId) {
        query = query.eq("reported_message_id", reportedMessageId);
      } else {
        query = query
          .is("reported_post_id", null)
          .is("reported_message_id", null);
      }

      const { data, error } = await query.maybeSingle();

      if (error) throw error;

      return {
        success: true,
        data: !!data,
      };
    } catch (error: any) {
      console.error("[ReportsService] Failed to check existing report:", error);
      return {
        success: false,
        error: error.message || "Failed to check existing report",
      };
    }
  }
}

export const reportsService = new ReportsService();
