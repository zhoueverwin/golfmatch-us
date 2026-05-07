// Core data models for the application

export interface User {
  id: string;
  legacy_id: string;
  user_id: string;
  name: string;
  age: number;
  birth_date?: string; // ISO date string (YYYY-MM-DD) for automatic age calculation
  gender: "male" | "female";
  location: string;
  prefecture: string;
  play_prefecture?: string[]; // Prefectures where user typically plays golf (プレー地域) - max 3
  golf_skill_level: "ビギナー" | "中級者" | "上級者" | "プロ";
  average_score?: number;
  bio?: string;
  profile_pictures: string[];
  is_verified: boolean;
  is_premium?: boolean;
  kyc_status?: 'not_started' | 'pending_review' | 'approved' | 'retry' | 'rejected';
  kyc_submitted_at?: string | null;
  kyc_verified_at?: string | null;
  last_login: string;
  last_active_at?: string | null;
  blood_type?: string;
  height?: string;
  body_type?: string;
  smoking?: string;
  favorite_club?: string;
  personality_type?: string;
  golf_experience?: string;
  best_score?: string;
  transportation?: string;
  available_days?: string;
  created_at: string;
  updated_at: string;
  // Interaction state (for UI)
  isLiked?: boolean;
  isSuperLiked?: boolean;
  isPassed?: boolean;
  interactionType?: InteractionType;
  // Recommendation data (for intelligent matching)
  recommendation_score?: number;
  score_breakdown?: {
    calendar_score: number;
    skill_score: number;
    score_similarity: number;
    location_score: number;
    activity_score: number;
    profile_quality_score: number;
    shared_days_count: number;
  };
}

export interface Post {
  id: string;
  user_id: string;
  user: User;
  content: string;
  images: string[];
  videos?: string[];
  aspect_ratio?: number; // Aspect ratio of media (width/height): 1.0 (square), 0.8 (portrait 4:5), 1.91 (landscape)
  likes: number; // DEPRECATED: Use reactions_count for new functionality
  reactions_count?: number; // New: Total reaction count (thumbs-up)
  comments: number;
  timestamp: string;
  isLiked: boolean; // DEPRECATED: Use hasReacted for new functionality
  isSuperLiked: boolean; // DEPRECATED: Removed from UI
  hasReacted?: boolean; // New: Whether current user has reacted (thumbs-up)
  created_at: string;
  updated_at: string;
}

// Post reactions are simple thumbs-up (no type needed)
export interface PostReaction {
  id: string;
  post_id: string;
  user_id: string;
  created_at: string;
}

// Reaction types for posts (simplified to just thumbs-up)
export type ReactionType = 'nice' | 'good_job' | 'helpful' | 'inspiring';

export interface Message {
  id: string;
  chat_id: string;
  sender_id: string;
  receiver_id: string;
  text: string;
  timestamp: string;
  isFromUser: boolean;
  isRead: boolean;
  type: "text" | "image" | "emoji" | "video";
  imageUri?: string;
  created_at: string;
  updated_at: string;
}

export interface Chat {
  id: string;
  participants: string[]; // User IDs
  last_message?: Message;
  unread_count: number;
  created_at: string;
  updated_at: string;
}

export interface MessagePreview {
  id: string;
  userId: string;
  name: string;
  profileImage: string;
  lastMessage: string;
  timestamp: string;
  isUnread: boolean;
  unreadCount: number;
}

export interface ConnectionItem {
  id: string;
  type: "like" | "match";
  profile: User;
  timestamp: string;
  isNew?: boolean;
}

export interface SearchFilters {
  // Age filtering by decade (e.g., [20, 30] for 20代 and 30代)
  age_decades?: number[];
  // Converted age range (computed from age_decades)
  age_min?: number;
  age_max?: number;
  // Single prefecture selection
  prefecture?: string;
  // Multiple prefectures (for region-based search)
  prefectures?: string[];
  // Single skill level selection
  golf_skill_level?: string;
  // Target gender (used internally for filtering opposite-gender matches)
  gender?: "male" | "female";
  // Maximum average score (show users with score ≤ this value)
  average_score_max?: number;
  // Last login within X days
  last_login_days?: number | null;
}

export interface UserProfile {
  basic: {
    name: string;
    age: string;
    birth_date?: string; // ISO date string (YYYY-MM-DD) for automatic age calculation
    gender?: string;
    prefecture: string;
    location?: string;
    blood_type: string;
    height: string;
    body_type: string;
    smoking: string;
    favorite_club?: string;
    personality_type?: string;
  };
  golf: {
    experience: string;
    skill_level: string;
    average_score: string;
    best_score?: string;
    transportation: string;
    available_days: string;
  };
  bio: string;
  profile_pictures: string[];
  play_prefecture?: string[]; // Prefectures where user typically plays golf (プレー地域) - max 3
  status?: {
    is_verified: boolean;
    is_premium?: boolean;
    last_login: string;
  };
  location?: {
    prefecture: string;
    transportation: string;
    available_days: string;
  };
}

export interface Availability {
  id: string;
  user_id: string;
  date: string;
  is_available: boolean;
  time_slots?: string[];
  notes?: string;
}

export interface CalendarData {
  year: number;
  month: number;
  days: Availability[];
}

// User Interaction Types
export type InteractionType = "like" | "super_like" | "pass";

export interface UserLike {
  id: string;
  liker_user_id: string;
  liked_user_id: string;
  type: InteractionType;
  created_at: string;
  updated_at: string;
}

export interface UserInteraction {
  userId: string;
  type: InteractionType;
  timestamp: string;
}

// API Response types
export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
  success: boolean;
  message?: string;
  error?: string;
}

// Service response types
export interface ServiceResponse<T> {
  success?: boolean;
  data?: T;
  error?: string;
  loading?: boolean;
}

export interface PaginatedServiceResponse<T> {
  success?: boolean;
  data?: T;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages?: number;
    hasMore: boolean;
  };
  error?: string;
  loading?: boolean;
}

// Contact Inquiry Types
export interface ContactReply {
  id: string;
  inquiry_id: string;
  reply_message: string;
  from_admin: boolean;
  is_read: boolean;
  created_at: string;
}

export interface ContactInquiry {
  id: string;
  user_id: string;
  subject: string;
  message: string;
  status: 'pending' | 'replied' | 'closed';
  created_at: string;
  replied_at: string | null;
  updated_at: string;
  replies?: ContactReply[];
  unread_reply_count?: number;
}

// Membership Types
export interface Membership {
  id: string;
  user_id: string;
  plan_type: 'basic' | 'permanent';
  price: number;
  purchase_date: string;
  expiration_date?: string | null;
  is_active: boolean;
  store_transaction_id?: string | null;
  platform: 'ios' | 'android';
  created_at: string;
  updated_at: string;
}

export interface PurchaseProduct {
  productId: string;
  price: string;
  title: string;
  description: string;
  type: 'basic' | 'permanent';
}

// KYC Verification Types
export type KycStatus = 'not_started' | 'pending_review' | 'approved' | 'retry' | 'rejected';

export type KycPhotoType = 'id_front' | 'id_back' | 'selfie' | 'id_selfie' | 'golf_photo';

// Per-photo rejection reasons (stored as JSON in rejection_reason field)
export interface KycPhotoRejections {
  id_front?: string | null;
  id_back?: string | null;
  selfie?: string | null;
  id_selfie?: string | null;
  golf_photo?: string | null;
}

export interface KycSubmission {
  id: string;
  user_id: string;
  id_image_url: string;
  id_back_image_url?: string;
  selfie_image_url: string;
  id_selfie_image_url: string;
  golf_photo_url?: string;
  status: KycStatus;
  submission_date: string;
  verification_date?: string | null;
  rejection_reason?: string | null; // Can be JSON string of KycPhotoRejections or plain text
  retry_count: number;
  reviewed_by_admin_id?: string | null;
  review_notes?: string | null;
  created_at: string;
  updated_at: string;
}

// Helper to parse rejection reasons
export function parseKycRejectionReasons(rejectionReason?: string | null): KycPhotoRejections {
  if (!rejectionReason) return {};
  try {
    const parsed = JSON.parse(rejectionReason);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as KycPhotoRejections;
    }
    // If it's a plain string, apply to all photos
    return {
      id_front: rejectionReason,
      id_back: rejectionReason,
      selfie: rejectionReason,
      id_selfie: rejectionReason,
      golf_photo: rejectionReason,
    };
  } catch {
    // Plain text rejection reason - apply to all
    return {
      id_front: rejectionReason,
      id_back: rejectionReason,
      selfie: rejectionReason,
      id_selfie: rejectionReason,
      golf_photo: rejectionReason,
    };
  }
}

export interface KycImageValidationResult {
  ok: boolean;
  message: string;
}

export interface KycSubmissionResponse {
  success: boolean;
  data?: KycSubmission;
  error?: string;
}
