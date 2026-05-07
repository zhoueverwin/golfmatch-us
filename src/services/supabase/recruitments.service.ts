/**
 * Recruitments Service
 *
 * Handles all recruitment (ゴルフメンバー募集) operations:
 * - CRUD operations for recruitments
 * - Application workflow (apply, approve, reject, withdraw)
 * - Queries with filtering and pagination
 * - Real-time subscriptions
 */

import { supabase } from '../supabase';
import {
  Recruitment,
  RecruitmentWithCounts,
  RecruitmentApplication,
  CreateRecruitmentInput,
  UpdateRecruitmentInput,
  CreateApplicationInput,
  RecruitmentFilters,
  ApplicationStatus,
  ServiceResponse,
  PaginatedServiceResponse,
  User,
  isRecruitmentNew,
} from '../../types';

// Minimal profile fields needed for display
const PROFILE_SELECT_FIELDS = `
  id,
  name,
  profile_pictures,
  is_verified,
  is_premium,
  prefecture,
  gender,
  golf_skill_level,
  average_score
`;

// Full recruitment select with host profile
const RECRUITMENT_SELECT = `
  *,
  host:profiles!recruitments_host_id_fkey(${PROFILE_SELECT_FIELDS}),
  golf_course:golf_courses(id, name, prefecture, image_url, reserve_url, gora_course_id, evaluation)
`;

// Application select with applicant profile (includes nested recruitment with golf_course)
const APPLICATION_SELECT = `
  *,
  applicant:profiles!recruitment_applications_applicant_id_fkey(${PROFILE_SELECT_FIELDS}),
  recruitment:recruitments(
    *,
    host:profiles!recruitments_host_id_fkey(${PROFILE_SELECT_FIELDS}),
    golf_course:golf_courses(*)
  )
`;

class RecruitmentsService {
  /**
   * Transform database response to Recruitment type with computed fields
   */
  private transformRecruitment(data: any, currentUserId?: string): Recruitment {
    const host = Array.isArray(data.host) ? data.host[0] : data.host;
    const golfCourse = Array.isArray(data.golf_course) ? data.golf_course[0] : data.golf_course;

    // Debug logging for golf course data
    console.log('[RecruitmentsService] transformRecruitment:', {
      recruitmentId: data.id,
      golf_course_id: data.golf_course_id,
      golf_course_raw: data.golf_course,
      golf_course_parsed: golfCourse,
      has_image_url: !!golfCourse?.image_url,
      has_reserve_url: !!golfCourse?.reserve_url,
    });

    return {
      ...data,
      host: host ? this.transformToUser(host) : undefined,
      golf_course: golfCourse || undefined,
      remaining_slots: data.total_slots - data.filled_slots,
      is_new: isRecruitmentNew(data.created_at),
    };
  }

  /**
   * Transform minimal profile to User type
   */
  private transformToUser(profile: any): User {
    return {
      id: profile.id,
      legacy_id: '',
      user_id: profile.id,
      name: profile.name || '',
      age: 0,
      gender: profile.gender || 'male',
      location: '',
      prefecture: profile.prefecture || '',
      golf_skill_level: profile.golf_skill_level || 'ビギナー',
      average_score: profile.average_score,
      profile_pictures: profile.profile_pictures || [],
      is_verified: profile.is_verified || false,
      is_premium: profile.is_premium || false,
      last_login: '',
      created_at: '',
      updated_at: '',
    };
  }

  /**
   * Transform database response to RecruitmentApplication type
   */
  private transformApplication(data: any): RecruitmentApplication {
    const applicant = Array.isArray(data.applicant) ? data.applicant[0] : data.applicant;
    const recruitment = Array.isArray(data.recruitment) ? data.recruitment[0] : data.recruitment;

    return {
      ...data,
      applicant: applicant ? this.transformToUser(applicant) : undefined,
      recruitment: recruitment ? this.transformRecruitment(recruitment) : undefined,
    };
  }

  // ==========================================================================
  // Recruitment CRUD Operations
  // ==========================================================================

  /**
   * Get paginated list of recruitments with filters
   */
  async getRecruitments(
    filters?: RecruitmentFilters,
    page: number = 1,
    limit: number = 20,
    currentUserId?: string
  ): Promise<PaginatedServiceResponse<Recruitment[]>> {
    try {
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      let query = supabase
        .from('recruitments')
        .select(RECRUITMENT_SELECT, { count: 'planned' })
        .eq('is_visible', true)
        .in('status', ['open', 'full'])
        .gte('play_date', new Date().toISOString().split('T')[0]) // Future dates only
        .order('created_at', { ascending: false })
        .order('play_date', { ascending: true });

      // Apply filters
      if (filters?.prefecture) {
        query = query.eq('prefecture', filters.prefecture);
      }

      if (filters?.course_type) {
        query = query.eq('course_type', filters.course_type);
      }

      if (filters?.play_date_from) {
        query = query.gte('play_date', filters.play_date_from);
      }

      if (filters?.play_date_to) {
        query = query.lte('play_date', filters.play_date_to);
      }

      if (filters?.has_slots) {
        query = query.eq('status', 'open');
      }

      if (filters?.gender_preference && filters.gender_preference !== 'any') {
        query = query.or(`gender_preference.eq.${filters.gender_preference},gender_preference.eq.any`);
      }

      // Filter by skill level - show recruitments that accept this skill level
      if (filters?.min_skill_level) {
        // Map skill levels to numeric values for comparison
        const skillOrder = ['ビギナー', '中級者', '上級者', 'プロ'];
        const selectedIndex = skillOrder.indexOf(filters.min_skill_level);

        // Filter where: recruitment's max_skill_level >= selected OR max_skill_level is null
        // AND: recruitment's min_skill_level <= selected OR min_skill_level is null
        const skillLevelsAtOrAbove = skillOrder.slice(selectedIndex);
        const skillLevelsAtOrBelow = skillOrder.slice(0, selectedIndex + 1);

        // Show recruitments where the selected skill level falls within their range
        query = query.or(
          `min_skill_level.is.null,min_skill_level.in.(${skillLevelsAtOrBelow.join(',')})`
        );
      }

      if (filters?.exclude_own && currentUserId) {
        query = query.neq('host_id', currentUserId);
      }

      if (filters?.search_query) {
        query = query.or(
          `title.ilike.%${filters.search_query}%,golf_course_name.ilike.%${filters.search_query}%`
        );
      }

      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      // If currentUserId provided, check application status for each recruitment
      let recruitments = (data || []).map(item => this.transformRecruitment(item, currentUserId));

      if (currentUserId && recruitments.length > 0) {
        const recruitmentIds = recruitments.map(r => r.id);
        const { data: applications } = await supabase
          .from('recruitment_applications')
          .select('recruitment_id, status')
          .eq('applicant_id', currentUserId)
          .in('recruitment_id', recruitmentIds);

        if (applications) {
          const appMap = new Map(applications.map(a => [a.recruitment_id, a.status]));
          recruitments = recruitments.map(r => ({
            ...r,
            has_applied: appMap.has(r.id),
            application_status: appMap.get(r.id) as ApplicationStatus | undefined,
          }));
        }
      }

      return {
        success: true,
        data: recruitments,
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
          hasMore: data && data.length === limit,
        },
      };
    } catch (error: any) {
      console.error('Error fetching recruitments:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch recruitments',
        data: [],
        pagination: { page, limit, total: 0, totalPages: 0, hasMore: false },
      };
    }
  }

  /**
   * Get a single recruitment by ID
   */
  async getRecruitmentById(
    recruitmentId: string,
    currentUserId?: string
  ): Promise<ServiceResponse<Recruitment | null>> {
    try {
      const { data, error } = await supabase
        .from('recruitments')
        .select(RECRUITMENT_SELECT)
        .eq('id', recruitmentId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return { success: true, data: null };
        }
        throw error;
      }

      let recruitment = this.transformRecruitment(data, currentUserId);

      // Check if current user has applied
      if (currentUserId) {
        const { data: application } = await supabase
          .from('recruitment_applications')
          .select('status')
          .eq('recruitment_id', recruitmentId)
          .eq('applicant_id', currentUserId)
          .single();

        if (application) {
          recruitment = {
            ...recruitment,
            has_applied: true,
            application_status: application.status as ApplicationStatus,
          };
        }
      }

      return { success: true, data: recruitment };
    } catch (error: any) {
      console.error('Error fetching recruitment:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch recruitment',
      };
    }
  }

  /**
   * Create a new recruitment
   */
  async createRecruitment(
    hostId: string,
    input: CreateRecruitmentInput
  ): Promise<ServiceResponse<Recruitment>> {
    try {
      const { data, error } = await supabase
        .from('recruitments')
        .insert({
          host_id: hostId,
          title: input.title,
          description: input.description || null,
          play_date: input.play_date,
          tee_time: input.tee_time || null,
          golf_course_id: input.golf_course_id || null, // Convert empty string to null for UUID field
          golf_course_name: input.golf_course_name,
          golf_course_location: input.golf_course_location || null,
          prefecture: input.prefecture || null,
          course_type: input.course_type || 'THROUGH',
          total_slots: input.total_slots || 3,
          gender_preference: input.gender_preference || 'any',
          min_skill_level: input.min_skill_level || null,
          max_skill_level: input.max_skill_level || null,
          estimated_cost: input.estimated_cost || null,
          additional_notes: input.additional_notes || null,
        })
        .select(RECRUITMENT_SELECT)
        .single();

      if (error) throw error;

      return {
        success: true,
        data: this.transformRecruitment(data),
      };
    } catch (error: any) {
      console.error('Error creating recruitment:', error);
      return {
        success: false,
        error: error.message || 'Failed to create recruitment',
      };
    }
  }

  /**
   * Update an existing recruitment
   */
  async updateRecruitment(
    recruitmentId: string,
    updates: UpdateRecruitmentInput
  ): Promise<ServiceResponse<Recruitment>> {
    try {
      const { data, error } = await supabase
        .from('recruitments')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', recruitmentId)
        .select(RECRUITMENT_SELECT)
        .single();

      if (error) throw error;

      return {
        success: true,
        data: this.transformRecruitment(data),
      };
    } catch (error: any) {
      console.error('Error updating recruitment:', error);
      return {
        success: false,
        error: error.message || 'Failed to update recruitment',
      };
    }
  }

  /**
   * Delete a recruitment
   */
  async deleteRecruitment(recruitmentId: string): Promise<ServiceResponse<void>> {
    try {
      const { error } = await supabase
        .from('recruitments')
        .delete()
        .eq('id', recruitmentId);

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      console.error('Error deleting recruitment:', error);
      return {
        success: false,
        error: error.message || 'Failed to delete recruitment',
      };
    }
  }

  /**
   * Close a recruitment (stop accepting applications)
   */
  async closeRecruitment(recruitmentId: string): Promise<ServiceResponse<Recruitment>> {
    return this.updateRecruitment(recruitmentId, { status: 'closed' });
  }

  /**
   * Cancel a recruitment
   */
  async cancelRecruitment(recruitmentId: string): Promise<ServiceResponse<Recruitment>> {
    return this.updateRecruitment(recruitmentId, { status: 'cancelled', is_visible: false });
  }

  // ==========================================================================
  // User's Recruitments
  // ==========================================================================

  /**
   * Get recruitments hosted by a user
   */
  async getMyRecruitments(userId: string): Promise<ServiceResponse<RecruitmentWithCounts[]>> {
    try {
      const { data, error } = await supabase
        .from('recruitments')
        .select(RECRUITMENT_SELECT)
        .eq('host_id', userId)
        .order('play_date', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get application counts for each recruitment
      const recruitmentIds = (data || []).map(r => r.id);

      if (recruitmentIds.length === 0) {
        return { success: true, data: [] };
      }

      const { data: appCounts } = await supabase
        .from('recruitment_applications')
        .select('recruitment_id, status')
        .in('recruitment_id', recruitmentIds);

      // Count by status
      const countMap = new Map<string, { pending: number; approved: number }>();
      (appCounts || []).forEach(app => {
        const current = countMap.get(app.recruitment_id) || { pending: 0, approved: 0 };
        if (app.status === 'pending') current.pending++;
        if (app.status === 'approved') current.approved++;
        countMap.set(app.recruitment_id, current);
      });

      const recruitments: RecruitmentWithCounts[] = (data || []).map(item => {
        const counts = countMap.get(item.id) || { pending: 0, approved: 0 };
        return {
          ...this.transformRecruitment(item),
          pending_count: counts.pending,
          approved_count: counts.approved,
        };
      });

      return { success: true, data: recruitments };
    } catch (error: any) {
      console.error('Error fetching my recruitments:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch my recruitments',
        data: [],
      };
    }
  }

  /**
   * Get applications submitted by a user
   */
  async getMyApplications(userId: string): Promise<ServiceResponse<RecruitmentApplication[]>> {
    try {
      const { data, error } = await supabase
        .from('recruitment_applications')
        .select(`
          *,
          recruitment:recruitments(
            *,
            host:profiles!recruitments_host_id_fkey(${PROFILE_SELECT_FIELDS}),
            golf_course:golf_courses(*)
          )
        `)
        .eq('applicant_id', userId)
        .neq('status', 'withdrawn')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const applications = (data || []).map(item => {
        const recruitment = Array.isArray(item.recruitment) ? item.recruitment[0] : item.recruitment;
        return {
          ...item,
          recruitment: recruitment ? this.transformRecruitment(recruitment) : undefined,
        };
      });

      return { success: true, data: applications };
    } catch (error: any) {
      console.error('Error fetching my applications:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch my applications',
        data: [],
      };
    }
  }

  // ==========================================================================
  // Application Workflow
  // ==========================================================================

  /**
   * Apply to join a recruitment
   */
  async applyToRecruitment(
    recruitmentId: string,
    applicantId: string,
    message?: string
  ): Promise<ServiceResponse<RecruitmentApplication>> {
    try {
      // Check if already applied
      const { data: existing } = await supabase
        .from('recruitment_applications')
        .select('id, status')
        .eq('recruitment_id', recruitmentId)
        .eq('applicant_id', applicantId)
        .single();

      if (existing) {
        if (existing.status === 'withdrawn') {
          // Re-apply by updating status back to pending
          const { data, error } = await supabase
            .from('recruitment_applications')
            .update({ status: 'pending', message, updated_at: new Date().toISOString() })
            .eq('id', existing.id)
            .select(APPLICATION_SELECT)
            .single();

          if (error) throw error;
          return { success: true, data: this.transformApplication(data) };
        }
        return {
          success: false,
          error: 'You have already applied to this recruitment',
        };
      }

      // Create new application
      const { data, error } = await supabase
        .from('recruitment_applications')
        .insert({
          recruitment_id: recruitmentId,
          applicant_id: applicantId,
          message,
        })
        .select(APPLICATION_SELECT)
        .single();

      if (error) throw error;

      return { success: true, data: this.transformApplication(data) };
    } catch (error: any) {
      console.error('Error applying to recruitment:', error);
      return {
        success: false,
        error: error.message || 'Failed to apply to recruitment',
      };
    }
  }

  /**
   * Approve an application (host only)
   */
  async approveApplication(
    applicationId: string,
    responseMessage?: string
  ): Promise<ServiceResponse<RecruitmentApplication>> {
    try {
      const { data, error } = await supabase
        .from('recruitment_applications')
        .update({
          status: 'approved',
          host_response_message: responseMessage,
          responded_at: new Date().toISOString(),
        })
        .eq('id', applicationId)
        .select(APPLICATION_SELECT)
        .single();

      if (error) throw error;

      return { success: true, data: this.transformApplication(data) };
    } catch (error: any) {
      console.error('Error approving application:', error);
      return {
        success: false,
        error: error.message || 'Failed to approve application',
      };
    }
  }

  /**
   * Reject an application (host only)
   */
  async rejectApplication(
    applicationId: string,
    responseMessage?: string
  ): Promise<ServiceResponse<RecruitmentApplication>> {
    try {
      const { data, error } = await supabase
        .from('recruitment_applications')
        .update({
          status: 'rejected',
          host_response_message: responseMessage,
          responded_at: new Date().toISOString(),
        })
        .eq('id', applicationId)
        .select(APPLICATION_SELECT)
        .single();

      if (error) throw error;

      return { success: true, data: this.transformApplication(data) };
    } catch (error: any) {
      console.error('Error rejecting application:', error);
      return {
        success: false,
        error: error.message || 'Failed to reject application',
      };
    }
  }

  /**
   * Withdraw an application (applicant only)
   */
  async withdrawApplication(applicationId: string): Promise<ServiceResponse<void>> {
    try {
      const { error } = await supabase
        .from('recruitment_applications')
        .update({
          status: 'withdrawn',
          updated_at: new Date().toISOString(),
        })
        .eq('id', applicationId);

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      console.error('Error withdrawing application:', error);
      return {
        success: false,
        error: error.message || 'Failed to withdraw application',
      };
    }
  }

  // ==========================================================================
  // Queries
  // ==========================================================================

  /**
   * Get applications for a recruitment (host view)
   */
  async getApplicationsForRecruitment(
    recruitmentId: string,
    status?: ApplicationStatus
  ): Promise<ServiceResponse<RecruitmentApplication[]>> {
    try {
      let query = supabase
        .from('recruitment_applications')
        .select(APPLICATION_SELECT)
        .eq('recruitment_id', recruitmentId)
        .order('created_at', { ascending: false });

      if (status) {
        query = query.eq('status', status);
      } else {
        query = query.neq('status', 'withdrawn');
      }

      const { data, error } = await query;

      if (error) throw error;

      return {
        success: true,
        data: (data || []).map(item => this.transformApplication(item)),
      };
    } catch (error: any) {
      console.error('Error fetching applications:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch applications',
        data: [],
      };
    }
  }

  /**
   * Get approved participants for a recruitment
   */
  async getApprovedParticipants(recruitmentId: string): Promise<ServiceResponse<User[]>> {
    try {
      const { data, error } = await supabase
        .from('recruitment_applications')
        .select(`applicant:profiles!recruitment_applications_applicant_id_fkey(${PROFILE_SELECT_FIELDS})`)
        .eq('recruitment_id', recruitmentId)
        .eq('status', 'approved');

      if (error) throw error;

      const participants = (data || []).map(item => {
        const applicant = Array.isArray(item.applicant) ? item.applicant[0] : item.applicant;
        return this.transformToUser(applicant);
      });

      return { success: true, data: participants };
    } catch (error: any) {
      console.error('Error fetching participants:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch participants',
        data: [],
      };
    }
  }

  /**
   * Get pending application count for a user's recruitments
   */
  async getPendingApplicationCount(userId: string): Promise<ServiceResponse<number>> {
    try {
      // Get all recruitments hosted by user
      const { data: recruitments, error: rError } = await supabase
        .from('recruitments')
        .select('id')
        .eq('host_id', userId)
        .in('status', ['open', 'full']);

      if (rError) throw rError;

      if (!recruitments || recruitments.length === 0) {
        return { success: true, data: 0 };
      }

      const recruitmentIds = recruitments.map(r => r.id);

      const { count, error } = await supabase
        .from('recruitment_applications')
        .select('id', { count: 'exact', head: true })
        .in('recruitment_id', recruitmentIds)
        .eq('status', 'pending');

      if (error) throw error;

      return { success: true, data: count || 0 };
    } catch (error: any) {
      console.error('Error counting pending applications:', error);
      return {
        success: false,
        error: error.message || 'Failed to count pending applications',
        data: 0,
      };
    }
  }

  // ==========================================================================
  // Real-time Subscriptions
  // ==========================================================================

  /**
   * Subscribe to changes on a specific recruitment
   */
  subscribeToRecruitment(
    recruitmentId: string,
    callback: (recruitment: Recruitment) => void
  ): () => void {
    const subscription = supabase
      .channel(`recruitment:${recruitmentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'recruitments',
          filter: `id=eq.${recruitmentId}`,
        },
        async () => {
          // Fetch fresh data
          const { data } = await supabase
            .from('recruitments')
            .select(RECRUITMENT_SELECT)
            .eq('id', recruitmentId)
            .single();

          if (data) {
            callback(this.transformRecruitment(data));
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }

  /**
   * Subscribe to application changes for a recruitment (host view)
   */
  subscribeToApplications(
    recruitmentId: string,
    callback: (applications: RecruitmentApplication[]) => void
  ): () => void {
    const subscription = supabase
      .channel(`applications:${recruitmentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'recruitment_applications',
          filter: `recruitment_id=eq.${recruitmentId}`,
        },
        async () => {
          // Fetch fresh applications
          const result = await this.getApplicationsForRecruitment(recruitmentId);
          if (result.success && result.data) {
            callback(result.data);
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }
}

export const recruitmentsService = new RecruitmentsService();
export default recruitmentsService;
