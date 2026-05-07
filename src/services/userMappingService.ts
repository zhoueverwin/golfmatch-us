import { supabase } from './supabase';
import { getCachedAuthUser, clearAuthCache } from './authCache';

/**
 * Service to manage user ID mapping between auth.users and profiles table
 * Ensures consistent user ID references across the app
 */
class UserMappingService {
  private profileIdCache: Map<string, string> = new Map();

  /**
   * Get profile ID from authenticated user
   * Maps auth.users.id -> profiles.id
   */
  async getProfileIdFromAuth(): Promise<string | null> {
    try {
      const authUser = await getCachedAuthUser();
      
      if (!authUser) {
        return null;
      }

      // Check cache first
      if (this.profileIdCache.has(authUser.id)) {
        return this.profileIdCache.get(authUser.id)!;
      }

      // Query profile table for user's profile
      // IMPORTANT: profiles.id is UUID for profile; profiles.user_id stores auth.users.id
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', authUser.id)
        .single();

      if (profileError || !profile) {
        console.error('Profile not found for authenticated user:', authUser.id);
        return null;
      }

      // Cache the mapping (auth user id -> profile uuid)
      this.profileIdCache.set(authUser.id, profile.id);

      return profile.id;
    } catch (error) {
      console.error('Error getting profile ID from auth:', error);
      return null;
    }
  }

  /**
   * Get current user's profile ID or fallback to env variable for testing
   */
  async getCurrentUserId(): Promise<string | null> {
    const profileId = await this.getProfileIdFromAuth();
    
    if (profileId) {
      return profileId;
    }

    // Fallback to test user ID if set
    const testUserId = process.env.EXPO_PUBLIC_TEST_USER_ID;
    if (testUserId) {
      return testUserId;
    }

    return null;
  }

  /**
   * Clear the profile ID cache (useful when signing out)
   */
  clearCache(): void {
    this.profileIdCache.clear();
    clearAuthCache(); // Also clear the auth cache
  }

  /**
   * Get user email from authenticated user
   */
  async getCurrentUserEmail(): Promise<string | null> {
    try {
      const authUser = await getCachedAuthUser();
      return authUser?.email || null;
    } catch (error) {
      console.error('Error getting user email:', error);
      return null;
    }
  }
}

export const userMappingService = new UserMappingService();
export default userMappingService;

