// Notification type definitions

export type NotificationType = 'message' | 'like' | 'match' | 'post_reaction' | 'system' | 'kyc_approved' | 'kyc_rejected';

export interface NotificationData {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  from_user_id?: string;
  from_user_name?: string;
  from_user_image?: string;
  data: {
    chatId?: string;
    matchId?: string;
    postId?: string;
    fromUserId?: string;
    screen?: string;
  };
  is_read: boolean;
  created_at: string;
}

export interface NotificationPreferences {
  id?: string;
  user_id: string;
  messages_enabled: boolean;
  likes_enabled: boolean;
  matches_enabled: boolean;
  post_reactions_enabled: boolean;
  push_enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

// Database response types
export interface DBNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  from_user_id: string | null;
  data: Record<string, any>;
  is_read: boolean;
  created_at: string;
}

export interface DBNotificationPreferences {
  id: string;
  user_id: string;
  messages_enabled: boolean;
  likes_enabled: boolean;
  matches_enabled: boolean;
  post_reactions_enabled: boolean;
  push_enabled: boolean;
  created_at: string;
  updated_at: string;
}

// Payload types for real-time subscriptions
export interface MessageNotificationPayload {
  id: string;
  chat_id: string;
  sender_id: string;
  receiver_id: string;
  text: string;
  created_at: string;
}

export interface LikeNotificationPayload {
  id: string;
  liker_user_id: string;
  liked_user_id: string;
  type: 'like' | 'super_like' | 'pass';
  created_at: string;
}

export interface MatchNotificationPayload {
  id: string;
  user1_id: string;
  user2_id: string;
  matched_at: string;
}

export interface PostReactionNotificationPayload {
  id: string;
  post_id: string;
  user_id: string;
  created_at: string;
}







