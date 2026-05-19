import { supabase } from './supabase';
import { getCachedAuthUser, clearAuthCache } from './authCache';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves an arbitrary id-shaped input to a `profiles.id` UUID.
 *
 * Replaces the 19+ inline UUID-or-legacy_id blocks that were copy-pasted
 * across the service layer (JP-fork residue). Behavior matches the
 * original inline pattern exactly:
 *   - empty / whitespace input → null
 *   - UUID-shaped input (case-insensitive) → returned as-is (assumed
 *     to already be a profiles.id; the inline pattern never re-validated
 *     these, and we preserve that for behavior parity)
 *   - non-UUID input → looked up via `profiles.legacy_id`
 *   - lookup failure or missing row → null
 *
 * Pinned by `src/__tests__/legacyIdResolution.behavior.test.ts`. Do not
 * change the matching rules here without updating that test in the same
 * PR.
 */
export async function resolveProfileId(input: string): Promise<string | null> {
  if (!input) return null;
  if (UUID_REGEX.test(input)) return input;
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('legacy_id', input)
    .single();
  if (error || !data) return null;
  return data.id;
}

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

