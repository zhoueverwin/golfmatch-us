import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import {
  NotificationPreferences,
  DBNotificationPreferences,
  NotificationType,
  NotificationData,
  DBNotification,
} from '../types/notifications';
import { ServiceResponse } from '../types/dataModels';

export class NotificationService {
  /**
   * Register push notification token for the current device
   */
  async registerPushToken(userId: string): Promise<ServiceResponse<string>> {
    try {
      // Request permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        return {
          success: false,
          error: 'Push notification permissions not granted',
        };
      }

      // Get the Expo push token
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
      });
      const token = tokenData.data;

      // Save token to database
      const { error } = await supabase
        .from('profiles')
        .update({
          push_token: token,
          push_token_updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (error) throw error;

      return {
        success: true,
        data: token,
      };
    } catch (error: any) {
      console.error('Error registering push token:', error);
      return {
        success: false,
        error: error.message || 'Failed to register push token',
      };
    }
  }

  /**
   * Unregister push notification token
   */
  async unregisterPushToken(userId: string): Promise<ServiceResponse<void>> {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          push_token: null,
          push_token_updated_at: null,
        })
        .eq('id', userId);

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to unregister push token',
      };
    }
  }

  /**
   * Get notification preferences for a user
   */
  async getPreferences(userId: string): Promise<ServiceResponse<NotificationPreferences>> {
    try {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        // If no preferences exist, create default ones
        if (error.code === 'PGRST116') {
          return await this.createDefaultPreferences(userId);
        }
        throw error;
      }

      return {
        success: true,
        data: data as NotificationPreferences,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to fetch preferences',
      };
    }
  }

  /**
   * Create default notification preferences
   */
  async createDefaultPreferences(userId: string): Promise<ServiceResponse<NotificationPreferences>> {
    try {
      const { data, error } = await supabase
        .from('notification_preferences')
        .insert({
          user_id: userId,
          messages_enabled: true,
          likes_enabled: true,
          matches_enabled: true,
          post_reactions_enabled: true,
          push_enabled: true,
        })
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        data: data as NotificationPreferences,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to create preferences',
      };
    }
  }

  /**
   * Update notification preferences
   */
  async updatePreferences(
    userId: string,
    preferences: Partial<NotificationPreferences>
  ): Promise<ServiceResponse<NotificationPreferences>> {
    try {
      const { data, error } = await supabase
        .from('notification_preferences')
        .update(preferences)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        data: data as NotificationPreferences,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to update preferences',
      };
    }
  }

  /**
   * Check if a specific notification type is enabled
   */
  async isNotificationEnabled(
    userId: string,
    type: NotificationType
  ): Promise<boolean> {
    const result = await this.getPreferences(userId);
    if (!result.success || !result.data) return true; // Default to enabled

    const preferences = result.data;
    switch (type) {
      case 'message':
        return preferences.messages_enabled;
      case 'like':
        return preferences.likes_enabled;
      case 'match':
        return preferences.matches_enabled;
      case 'post_reaction':
        return preferences.post_reactions_enabled;
      default:
        return true;
    }
  }

  /**
   * Create a notification in the database
   */
  async createNotification(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    fromUserId?: string,
    data?: Record<string, any>
  ): Promise<ServiceResponse<NotificationData>> {
    try {
      const { data: notification, error } = await supabase
        .from('notifications')
        .insert({
          user_id: userId,
          type,
          title,
          body,
          from_user_id: fromUserId || null,
          data: data || {},
          is_read: false,
        })
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        data: notification as any,
      };
    } catch (error: any) {
      console.error('Error creating notification:', error);
      return {
        success: false,
        error: error.message || 'Failed to create notification',
      };
    }
  }

  /**
   * Get all notifications for a user
   */
  async getNotifications(userId: string, limit = 50): Promise<ServiceResponse<NotificationData[]>> {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select(`
          *,
          from_user:profiles!notifications_from_user_id_fkey(
            id,
            name,
            profile_pictures
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      // Transform data to include from_user info
      const notifications = (data || []).map((notification: any) => ({
        ...notification,
        from_user_name: notification.from_user?.name,
        from_user_image: notification.from_user?.profile_pictures?.[0],
      }));

      return {
        success: true,
        data: notifications as NotificationData[],
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to fetch notifications',
        data: [],
      };
    }
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(userId: string): Promise<ServiceResponse<number>> {
    try {
      const { data, error } = await supabase
        .rpc('get_unread_notification_count', { p_user_id: userId });

      if (error) throw error;

      return {
        success: true,
        data: data || 0,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to get unread count',
        data: 0,
      };
    }
  }

  /**
   * Mark a notification as read
   */
  async markAsRead(notificationId: string): Promise<ServiceResponse<void>> {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to mark as read',
      };
    }
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userId: string): Promise<ServiceResponse<void>> {
    try {
      const { error } = await supabase
        .rpc('mark_all_notifications_read', { p_user_id: userId });

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to mark all as read',
      };
    }
  }

  /**
   * Send push notification via Expo
   */
  async sendPushNotification(
    pushToken: string,
    title: string,
    body: string,
    data?: Record<string, any>
  ): Promise<ServiceResponse<void>> {
    try {
      const message = {
        to: pushToken,
        sound: 'default',
        title,
        body,
        data: data || {},
        priority: 'high',
      };

      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      // Check if response has content before parsing JSON
      const responseText = await response.text();
      
      if (!responseText || responseText.trim() === '') {
        console.warn('Empty response from push notification service');
        return { success: true }; // Treat empty response as success
      }

      let result;
      try {
        result = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Failed to parse push notification response:', parseError);
        console.error('Response text:', responseText);
        throw new Error('Invalid response from notification service');
      }

      if (result.data?.status === 'error') {
        throw new Error(result.data.message);
      }

      return { success: true };
    } catch (error: any) {
      console.error('Error sending push notification:', error);
      return {
        success: false,
        error: error.message || 'Failed to send push notification',
      };
    }
  }

  /**
   * Delete old notifications (cleanup)
   */
  async deleteOldNotifications(userId: string, daysOld = 30): Promise<ServiceResponse<void>> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('user_id', userId)
        .lt('created_at', cutoffDate.toISOString());

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to delete old notifications',
      };
    }
  }
}

export const notificationService = new NotificationService();







