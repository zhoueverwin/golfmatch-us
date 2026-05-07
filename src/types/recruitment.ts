/**
 * Type definitions for the Golf Member Recruitment (ゴルフメンバー募集) feature.
 *
 * This feature allows users to post golf round invitations and others can apply to join.
 * Similar to golfmembers.jp functionality.
 */

import { User } from './dataModels';

// =============================================================================
// Enums and Literal Types
// =============================================================================

/** Status of a recruitment posting */
export type RecruitmentStatus = 'open' | 'full' | 'closed' | 'cancelled' | 'completed';

/** Status of an application to join a recruitment */
export type ApplicationStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

/** Gender preference for recruitment participants */
export type GenderPreference = 'male' | 'female' | 'any';

/**
 * Course type indicating which holes to play:
 * - OUT: Front 9 holes (1-9) - アウト
 * - IN: Back 9 holes (10-18) - イン
 * - THROUGH: Full 18 holes - スルー
 */
export type CourseType = 'OUT' | 'IN' | 'THROUGH';

/** Golf skill level (matches profiles.golf_skill_level) */
export type SkillLevel = 'ビギナー' | '中級者' | '上級者' | 'プロ';

// =============================================================================
// Golf Course Types
// =============================================================================

/** Golf course data (cached from Rakuten GORA API) */
export interface GolfCourse {
  id: string;
  gora_course_id?: string;
  name: string;
  name_kana?: string;
  prefecture: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  image_url?: string;
  reserve_url?: string; // Rakuten GORA reservation/booking URL for affiliate linking
  evaluation?: number; // Rating from GORA (1.0-5.0)
  created_at?: string;
  updated_at?: string;
}

/** Response from Rakuten GORA API */
export interface GoraApiCourse {
  golfCourseId: number;
  golfCourseName: string;
  golfCourseNameKana?: string;
  golfCourseAbbr?: string;
  address: string;
  prefecture?: string;
  latitude: number;
  longitude: number;
  golfCourseImageUrl?: string;
  evaluation?: number;
  highway?: string;
  ic?: string;
  icDistance?: string;
  reserveCalUrl?: string;
}

/** Rakuten GORA API response structure */
export interface GoraApiResponse {
  Items: Array<{ Item: GoraApiCourse }>;
  count: number;
  page: number;
  pageCount: number;
}

/** Call/reservation info within a plan */
export interface GoraPlanCallInfo {
  playDate: string;
  reservePageUrlPC?: string;
  reservePageUrlMobile?: string;
  stockCount?: number;
  stockStatus?: number;
}

/** Individual plan data within planInfo array */
export interface GoraPlanDetail {
  planId: number;
  planName: string;
  price: number; // Total price including all taxes
  basePrice: number; // Base price before taxes
  salesTax: number; // Consumption tax
  courseUseTax: number; // Golf course usage tax
  otherTax: number; // Other taxes/fees
  round: string; // "1R" for 18 holes, "0.5R" for 9 holes
  lunch: number; // 0: no lunch, 1: lunch included
  cart: number; // 0: no cart, 1: cart included (2 = self cart)
  caddie: number; // 0: no caddie, 1: caddie included
  callInfo?: GoraPlanCallInfo; // Reservation URLs
}

/** Course-level data from Rakuten GORA Plan Search API */
export interface GoraPlanItem {
  golfCourseId: number;
  golfCourseName: string;
  golfCourseCaption?: string; // Course description/features
  evaluation?: number; // Course rating
  displayWeekdayMinPrice?: string; // Pre-formatted: "平日 7,000円（6046円＋税）～"
  displayHolidayMinPrice?: string; // Pre-formatted: "休日 7,000円（6046円＋税）～"
  planInfo?: Array<{ plan: GoraPlanDetail }>; // Array of available plans
  reserveCalUrlPC?: string; // Reservation calendar URL
  reserveCalUrlMobile?: string;
}

/** Rakuten GORA Plan Search API response structure */
export interface GoraPlanApiResponse {
  Items: Array<{ Item: GoraPlanItem }>;
  count: number;
  page: number;
  pageCount: number;
}

/** Plan info for display in bottom sheet */
export interface PlanDisplayInfo {
  planId: number;
  planName: string;
  price: number;
  hasLunch: boolean;
  hasCart: boolean;
  hasCaddie: boolean;
  round: string; // "1R" or "0.5R"
  reserveUrl?: string;
  stockStatus?: number; // 1=◎ plenty, 2=○ available, 3=△ few, 4=special
}

/** Simplified pricing info for display */
export interface CoursePricing {
  minPrice: number; // Minimum total price available
  maxPrice: number; // Maximum total price available
  planCount: number; // Number of available plans
  hasLunchIncluded: boolean; // Whether any plan includes lunch
  caption?: string; // Course description/features (golfCourseCaption)
  plans?: PlanDisplayInfo[]; // Detailed plan list for bottom sheet
}

// =============================================================================
// Recruitment Types
// =============================================================================

/** Input for creating a new recruitment */
export interface CreateRecruitmentInput {
  title: string;
  description?: string | null;
  play_date: string; // ISO date string (YYYY-MM-DD)
  tee_time?: string; // Time string (HH:MM)
  golf_course_id?: string;
  golf_course_name: string;
  golf_course_location?: string;
  prefecture?: string;
  course_type?: CourseType;
  total_slots?: number;
  gender_preference?: GenderPreference;
  min_skill_level?: SkillLevel;
  max_skill_level?: SkillLevel;
  estimated_cost?: string | null;
  additional_notes?: string | null;
}

/** Input for updating an existing recruitment */
export interface UpdateRecruitmentInput extends Partial<CreateRecruitmentInput> {
  status?: RecruitmentStatus;
  is_visible?: boolean;
}

/** Full recruitment data model */
export interface Recruitment {
  id: string;
  host_id: string;
  host?: User;

  // Golf Round Details
  title: string;
  description?: string;
  play_date: string;
  tee_time?: string;

  // Course Info
  golf_course_id?: string;
  golf_course?: GolfCourse;
  golf_course_name: string;
  golf_course_location?: string;
  prefecture?: string;
  course_type: CourseType;

  // Slot Management
  total_slots: number;
  filled_slots: number;

  // Requirements
  gender_preference: GenderPreference;
  min_skill_level?: SkillLevel;
  max_skill_level?: SkillLevel;

  // Additional Info
  estimated_cost?: string;
  additional_notes?: string;

  // Status
  status: RecruitmentStatus;
  is_visible: boolean;

  // Timestamps
  created_at: string;
  updated_at?: string;

  // Computed fields (added by service layer)
  remaining_slots?: number;
  is_new?: boolean; // Created within last 24 hours
  has_applied?: boolean; // Current user has applied
  application_status?: ApplicationStatus; // Current user's application status
}

/** Recruitment with application counts for host view */
export interface RecruitmentWithCounts extends Recruitment {
  pending_count?: number;
  approved_count?: number;
}

// =============================================================================
// Application Types
// =============================================================================

/** Input for creating an application */
export interface CreateApplicationInput {
  recruitment_id: string;
  message?: string;
}

/** Full application data model */
export interface RecruitmentApplication {
  id: string;
  recruitment_id: string;
  recruitment?: Recruitment;
  applicant_id: string;
  applicant?: User;
  message?: string;
  status: ApplicationStatus;
  host_response_message?: string;
  responded_at?: string;
  created_at: string;
  updated_at?: string;
}

// =============================================================================
// Filter Types
// =============================================================================

/** Filters for querying recruitments */
export interface RecruitmentFilters {
  /** Filter by play date range (start) */
  play_date_from?: string;
  /** Filter by play date range (end) */
  play_date_to?: string;
  /** Filter by prefecture */
  prefecture?: string;
  /** Filter by course type (IN/OUT/THROUGH) */
  course_type?: CourseType;
  /** Only show recruitments with available slots */
  has_slots?: boolean;
  /** Filter by gender preference */
  gender_preference?: GenderPreference;
  /** Filter by minimum skill level */
  min_skill_level?: SkillLevel;
  /** Filter by maximum skill level */
  max_skill_level?: SkillLevel;
  /** Exclude user's own recruitments */
  exclude_own?: boolean;
  /** Search by title or course name */
  search_query?: string;
}

// =============================================================================
// Prefecture Data (Japan's 47 prefectures grouped by region)
// =============================================================================

export interface PrefectureRegion {
  region: string;
  prefectures: string[];
}

/** Japan's 47 prefectures grouped by region (like golfmembers.jp) */
export const PREFECTURE_REGIONS: PrefectureRegion[] = [
  {
    region: '北海道・東北',
    prefectures: ['北海道', '青森', '岩手', '宮城', '秋田', '山形', '福島']
  },
  {
    region: '関東',
    prefectures: ['東京', '神奈川', '埼玉', '千葉', '茨城', '栃木', '群馬']
  },
  {
    region: '信越・北陸',
    prefectures: ['山梨', '新潟', '長野', '富山', '石川', '福井']
  },
  {
    region: '東海',
    prefectures: ['愛知', '岐阜', '静岡', '三重']
  },
  {
    region: '近畿',
    prefectures: ['大阪', '兵庫', '京都', '滋賀', '奈良', '和歌山']
  },
  {
    region: '中国',
    prefectures: ['鳥取', '島根', '岡山', '広島', '山口']
  },
  {
    region: '四国',
    prefectures: ['徳島', '香川', '愛媛', '高知']
  },
  {
    region: '九州・沖縄',
    prefectures: ['福岡', '佐賀', '長崎', '熊本', '大分', '宮崎', '鹿児島', '沖縄']
  }
];

/** Flat array of all prefectures */
export const ALL_PREFECTURES = PREFECTURE_REGIONS.flatMap(r => r.prefectures);

// =============================================================================
// Display Helpers
// =============================================================================

/** Get display text for course type */
export function getCourseTypeLabel(courseType: CourseType): string {
  switch (courseType) {
    case 'OUT': return 'OUT';
    case 'IN': return 'IN';
    case 'THROUGH': return 'スルー';
    default: return 'スルー';
  }
}

/** Get Japanese display text for gender preference */
export function getGenderPreferenceLabel(preference: GenderPreference): string {
  switch (preference) {
    case 'male': return '男性のみ';
    case 'female': return '女性のみ';
    case 'any': return '指定なし';
    default: return '指定なし';
  }
}

/** Get Japanese display text for application status */
export function getApplicationStatusLabel(status: ApplicationStatus): string {
  switch (status) {
    case 'pending': return '審査中';
    case 'approved': return '承認済';
    case 'rejected': return '不承認';
    case 'withdrawn': return '取り下げ';
    default: return status;
  }
}

/** Get color for application status badge */
export function getApplicationStatusColor(status: ApplicationStatus): string {
  switch (status) {
    case 'pending': return '#F59E0B'; // Amber/warning
    case 'approved': return '#10B981'; // Green/success
    case 'rejected': return '#6B7280'; // Gray
    case 'withdrawn': return '#9CA3AF'; // Light gray
    default: return '#6B7280';
  }
}

/** Get Japanese display text for recruitment status */
export function getRecruitmentStatusLabel(status: RecruitmentStatus): string {
  switch (status) {
    case 'open': return '募集中';
    case 'full': return '満員';
    case 'closed': return '締切';
    case 'cancelled': return 'キャンセル';
    case 'completed': return '終了';
    default: return status;
  }
}

/** Get skill level range display text */
export function getSkillRangeLabel(min?: SkillLevel, max?: SkillLevel): string {
  if (!min && !max) return '指定なし';
  if (min && max && min === max) return min;
  if (min && max) return `${min}〜${max}`;
  if (min) return `${min}以上`;
  if (max) return `${max}以下`;
  return '指定なし';
}

/** Format tee time for display */
export function formatTeeTime(time?: string): string {
  if (!time) return '未定';
  // Time is stored as HH:MM:SS or HH:MM
  const parts = time.split(':');
  if (parts.length >= 2) {
    return `${parts[0]}:${parts[1]}`;
  }
  return time;
}

/** Check if recruitment is new (created within last 24 hours) */
export function isRecruitmentNew(createdAt: string): boolean {
  const created = new Date(createdAt);
  const now = new Date();
  const hoursDiff = (now.getTime() - created.getTime()) / (1000 * 60 * 60);
  return hoursDiff < 24;
}
