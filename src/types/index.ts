// Re-export data models for convenience
export * from "./dataModels";
export * from "./auth";
import { User, SearchFilters } from "./dataModels";

// Matching and Likes Types
export interface Like {
  id: string;
  from_user_id: string;
  to_user_id: string;
  created_at: string;
}

export interface Match {
  id: string;
  user1_id: string;
  user2_id: string;
  created_at: string;
  last_message_at?: string;
}

// Chat Types
export interface ChatMessage {
  id: string;
  match_id: string;
  sender_id: string;
  content: string;
  message_type: "text" | "image" | "emoji";
  created_at: string;
  read_at?: string;
}

// Feed/Post Types
export interface Post {
  id: string;
  user_id: string;
  content: string;
  images: string[];
  likes_count: number;
  comments_count: number;
  created_at: string;
  updated_at: string;
}

export interface PostLike {
  id: string;
  post_id: string;
  user_id: string;
  created_at: string;
}

export interface PostComment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

// Filter Types - using SearchFilters from dataModels.ts

// Navigation Types
export type RootStackParamList = {
  Welcome: undefined;
  Auth: undefined;
  // First-time-user onboarding (single-question-per-screen flow)
  OnboardingName: undefined;
  OnboardingGender: undefined;
  OnboardingBirthdate: undefined;
  OnboardingState: undefined;
  OnboardingPhoto: undefined;
  OnboardingDone: undefined;
  Main: undefined;
  Chat: { chatId: string; userId: string; userName: string; userImage: string };
  Profile: { userId: string; refresh?: boolean };
  EditProfile: undefined;
  Settings: undefined;
  NotificationSettings: undefined;
  NotificationHistory: undefined;
  CalendarEdit: undefined;
  KycVerification: undefined;
  TestAccountSetup: undefined;
  UserPosts: { userId: string };
  Footprints: undefined;
  PastLikes: undefined;
  ContactReply: undefined;
  Store: undefined;
  MembershipStatus: undefined;
  Help: undefined;
  HelpDetail: { itemId: string };
  DeleteAccount: undefined;
  AccountLinking: undefined;
  Report: {
    reportedUserId: string;
    reportedPostId?: string;
    reportedMessageId?: string;
    reportedUserName: string;
  };
  BlockedUsers: undefined;
  HiddenPosts: undefined;
  SwipeCard: undefined; // Data passed via swipeCardData module
};

export type MainTabParamList = {
  Home: undefined;
  Search: undefined;
  Connections: undefined;
  Messages: undefined;
  MyPage: undefined;
};

// Component Props Types
export interface ProfileCardProps {
  profile: User;
  onViewProfile: (userId: string) => void;
  onLike?: (userId: string) => void;
  onPass?: (userId: string) => void;
  testID?: string;
}

export interface FilterModalProps {
  visible: boolean;
  onClose: () => void;
  onApply: (filters: SearchFilters) => void;
  initialFilters?: SearchFilters;
}
