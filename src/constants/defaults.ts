/**
 * Default Constants
 * Contains default values, placeholders, and fallback data
 */

// Default avatar/profile picture when user has no images
export const DEFAULT_AVATAR_URL = "https://via.placeholder.com/400x400/20B2AA/FFFFFF?text=No+Photo";

// Alternative: Using a data URL for a simple avatar icon
export const DEFAULT_AVATAR_DATA_URL = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'%3E%3Crect width='400' height='400' fill='%2320B2AA'/%3E%3Ccircle cx='200' cy='160' r='60' fill='white'/%3E%3Cpath d='M 100 320 Q 100 240 200 240 Q 300 240 300 320 Z' fill='white'/%3E%3C/svg%3E";

// Helper function to get profile picture with fallback
export const getProfilePicture = (
  profile_pictures: string[] | null | undefined,
  index: number = 0
): string => {
  if (!profile_pictures || profile_pictures.length === 0) {
    return DEFAULT_AVATAR_DATA_URL;
  }
  
  const url = profile_pictures[index];
  
  // Check if URL is valid (not local file path)
  if (!url || url.startsWith('file://')) {
    return DEFAULT_AVATAR_DATA_URL;
  }
  
  return url;
};

// Helper to get all profile pictures with validation
export const getValidProfilePictures = (
  profile_pictures: string[] | null | undefined
): string[] => {
  if (!profile_pictures || profile_pictures.length === 0) {
    return [DEFAULT_AVATAR_DATA_URL];
  }
  
  const validPictures = profile_pictures.filter(
    url => url && !url.startsWith('file://')
  );
  
  if (validPictures.length === 0) {
    return [DEFAULT_AVATAR_DATA_URL];
  }
  
  return validPictures;
};

// Default user data for empty profiles
export const DEFAULT_PROFILE_TEXT = {
  NO_BIO: "自己紹介が登録されていません",
  NO_NAME: "名前未設定",
  NO_PREFECTURE: "未設定",
  NO_AGE: "年齢未設定",
  NO_SCORE: "スコア未設定",
  NO_EXPERIENCE: "ゴルフ歴未設定",
  NO_SKILL_LEVEL: "レベル未設定",
};

export default {
  DEFAULT_AVATAR_URL,
  DEFAULT_AVATAR_DATA_URL,
  DEFAULT_PROFILE_TEXT,
  getProfilePicture,
  getValidProfilePictures,
};

