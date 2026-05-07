// Main service exports
// This file provides a unified interface for all data services

// Export the data provider switcher as the main data provider
export { default as DataProvider } from "./dataProviderSwitcher";

// Export individual services
export { profilesService, ProfilesService } from "./supabase/profiles.service";
export { postsService, PostsService } from "./supabase/posts.service";
export { matchesService, MatchesService } from "./supabase/matches.service";
export { messagesService, MessagesService } from "./supabase/messages.service";
export {
  availabilityService,
  AvailabilityService,
} from "./supabase/availability.service";

// Export the original mock data provider for fallback (moved to backup)
// export { default as MockDataProvider } from './dataProvider';

// Export the Supabase data provider
export { default as SupabaseDataProvider } from "./supabaseDataProvider";

// Export the data provider switcher
export { default as DataProviderSwitcher } from "./dataProviderSwitcher";

// Export other services
export { default as CacheService } from "./cacheService";
export { authService as AuthService } from "./authService";
export {
  userInteractionService,
  UserInteractionService,
} from "./userInteractionService";
export {
  getCachedAuthUser,
  getCachedAuthUserId,
  clearAuthCache,
  refreshAuthCache,
} from "./authCache";

// Export Supabase client
export { supabase } from "./supabase";
