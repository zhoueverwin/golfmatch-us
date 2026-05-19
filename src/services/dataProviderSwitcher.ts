// Data Provider Switcher
// This class provides a unified interface that can switch between different data providers
// Currently configured to use Supabase only (no fallback to mock data)

import {
  User,
  Post,
  Chat,
  Message,
  Availability,
  CalendarData,
  SearchFilters,
  InteractionType,
  ServiceResponse,
  PaginatedServiceResponse,
  ContactInquiry,
} from "../types/dataModels";

// Import Supabase data provider only
import supabaseDataProvider from "./supabaseDataProvider";

// Configuration
interface DataProviderConfig {
  useSupabase: boolean;
  fallbackToMock: boolean;
}

const DEFAULT_CONFIG: DataProviderConfig = {
  useSupabase: true, // Set to true to use Supabase, false for mock data
  fallbackToMock: false, // No fallback to mock data - use Supabase only
};

class DataProviderSwitcher {
  private config: DataProviderConfig;
  private currentProvider: any;

  constructor(config: DataProviderConfig = DEFAULT_CONFIG) {
    this.config = config;
    this.initializeProvider();
  }

  private initializeProvider(): void {
    if (this.config.useSupabase) {
      this.currentProvider = supabaseDataProvider;
    } else {
      throw new Error(
        "Mock data provider is no longer available. Please use Supabase.",
      );
    }
  }

  // ============================================================================
  // USER PROFILES
  // ============================================================================

  async getCurrentUser(): Promise<ServiceResponse<User>> {
    return await this.currentProvider.getCurrentUser();
  }

  async getUser(userId: string): Promise<ServiceResponse<User>> {
    return await this.currentProvider.getUser(userId);
  }

  async searchUsers(
    filters: SearchFilters,
    page: number = 1,
    limit: number = 20,
    sortBy: "registration" | "recommended" | "login" | "likes" = "recommended",
    excludeUserIds?: string[],
  ): Promise<PaginatedServiceResponse<User[]>> {
    return await this.currentProvider.searchUsers(filters, page, limit, sortBy, excludeUserIds);
  }

  async updateUserProfile(
    userId: string,
    updates: Partial<User>,
  ): Promise<ServiceResponse<User>> {
    return await this.currentProvider.updateUserProfile(userId, updates);
  }

  // ============================================================================
  // POSTS
  // ============================================================================

  async getPosts(
    page: number = 1,
    limit: number = 20,
  ): Promise<PaginatedServiceResponse<Post>> {
    return await this.currentProvider.getPosts(page, limit);
  }

  async getUserPosts(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<PaginatedServiceResponse<Post[]>> {
    return await this.currentProvider.getUserPosts(userId, page, limit);
  }

  async createPost(
    userId: string,
    content: string,
    images: string[] = [],
    videos: string[] = [],
  ): Promise<ServiceResponse<Post>> {
    return await this.currentProvider.createPost(
      userId,
      content,
      images,
      videos,
    );
  }

  async likePost(
    postId: string,
    userId: string,
    type: "like" | "super_like" = "like",
  ): Promise<ServiceResponse<Post>> {
    return await this.currentProvider.likePost(postId, userId, type);
  }

  async unlikePost(
    postId: string,
    userId: string,
  ): Promise<ServiceResponse<Post>> {
    return await this.currentProvider.unlikePost(postId, userId);
  }

  async getPostLikes(postId: string): Promise<ServiceResponse<any[]>> {
    return await this.currentProvider.getPostLikes(postId);
  }

  async reactToPost(
    postId: string,
    userId: string,
    reactionType: "nice" | "good_job" | "helpful" | "inspiring" = "nice",
  ): Promise<ServiceResponse<void>> {
    return await this.currentProvider.reactToPost(postId, userId, reactionType);
  }

  async unreactToPost(
    postId: string,
    userId: string,
  ): Promise<ServiceResponse<void>> {
    return await this.currentProvider.unreactToPost(postId, userId);
  }

  // ============================================================================
  // USER INTERACTIONS
  // ============================================================================

  async likeUser(
    likerUserId: string,
    likedUserId: string,
    type: InteractionType = "like",
  ): Promise<ServiceResponse<any>> {
    return await this.currentProvider.likeUser(likerUserId, likedUserId, type);
  }

  async getUserLikes(userId: string): Promise<ServiceResponse<any[]>> {
    return await this.currentProvider.getUserLikes(userId);
  }

  async getMatches(userId: string): Promise<ServiceResponse<any[]>> {
    return await this.currentProvider.getMatches(userId);
  }

  async checkMatch(
    user1Id: string,
    user2Id: string,
  ): Promise<ServiceResponse<boolean>> {
    return await this.currentProvider.checkMatch(user1Id, user2Id);
  }

  async checkMutualLikes(
    user1Id: string,
    user2Id: string,
  ): Promise<ServiceResponse<boolean>> {
    return await this.currentProvider.checkMutualLikes(user1Id, user2Id);
  }

  async batchCheckMutualLikes(
    currentUserId: string,
    targetUserIds: string[],
  ): Promise<ServiceResponse<Record<string, boolean>>> {
    return await this.currentProvider.batchCheckMutualLikes(currentUserId, targetUserIds);
  }

  async getUnseenMatches(userId: string): Promise<ServiceResponse<any[]>> {
    return await this.currentProvider.getUnseenMatches(userId);
  }

  async markMatchAsSeen(
    matchId: string,
    userId: string,
  ): Promise<ServiceResponse<void>> {
    return await this.currentProvider.markMatchAsSeen(matchId, userId);
  }

  async getLikesReceived(userId: string): Promise<ServiceResponse<any[]>> {
    return await this.currentProvider.getLikesReceived(userId);
  }

  async undoLike(
    likerUserId: string,
    likedUserId: string,
  ): Promise<ServiceResponse<void>> {
    return await this.currentProvider.undoLike(likerUserId, likedUserId);
  }

  async unlikeUser(
    likerUserId: string,
    likedUserId: string,
  ): Promise<ServiceResponse<void>> {
    return await this.currentProvider.unlikeUser(likerUserId, likedUserId);
  }

  // ============================================================================
  // MESSAGES
  // ============================================================================

  async getChatMessages(chatId: string): Promise<ServiceResponse<Message[]>> {
    return await this.currentProvider.getChatMessages(chatId);
  }

  async sendMessage(
    chatId: string,
    senderId: string,
    receiverId: string,
    text: string,
    type: "text" | "image" | "video" = "text",
    imageUri?: string,
  ): Promise<ServiceResponse<Message>> {
    return await this.currentProvider.sendMessage(
      chatId,
      senderId,
      receiverId,
      text,
      type,
      imageUri,
    );
  }

  async markAsRead(messageId: string): Promise<ServiceResponse<Message>> {
    return await this.currentProvider.markAsRead(messageId);
  }

  async getMessagePreviews(userId: string): Promise<ServiceResponse<any[]>> {
    return await this.currentProvider.getMessagePreviews(userId);
  }

  async getOrCreateChat(
    matchId: string,
    participants: string[],
  ): Promise<ServiceResponse<Chat>> {
    return await this.currentProvider.getOrCreateChat(matchId, participants);
  }

  async getOrCreateChatBetweenUsers(
    user1Id: string,
    user2Id: string,
    matchId?: string,
  ): Promise<ServiceResponse<string>> {
    return await this.currentProvider.getOrCreateChatBetweenUsers(user1Id, user2Id, matchId);
  }

  // ============================================================================
  // AVAILABILITY
  // ============================================================================

  async getUserAvailability(
    userId: string,
    month: number,
    year: number,
  ): Promise<ServiceResponse<CalendarData>> {
    return await this.currentProvider.getUserAvailability(userId, month, year);
  }

  async setAvailability(
    userId: string,
    date: string,
    isAvailable: boolean,
    timeSlots?: string[],
    notes?: string,
  ): Promise<ServiceResponse<Availability>> {
    return await this.currentProvider.setAvailability(
      userId,
      date,
      isAvailable,
      timeSlots,
      notes,
    );
  }

  async deleteAvailability(
    userId: string,
    date: string,
  ): Promise<ServiceResponse<void>> {
    return await this.currentProvider.deleteAvailability(userId, date);
  }

  async updateUserAvailability(
    userId: string,
    year: number,
    month: number,
    availabilityData: Partial<Availability>[],
  ): Promise<ServiceResponse<boolean>> {
    return await this.currentProvider.updateUserAvailability(
      userId,
      year,
      month,
      availabilityData,
    );
  }

  // ============================================================================
  // REAL-TIME SUBSCRIPTIONS
  // ============================================================================

  subscribeToProfile(
    userId: string,
    callback: (data: any) => void,
  ): () => void {
    return this.currentProvider.subscribeToProfile(userId, callback);
  }

  subscribeToPosts(callback: (data: any) => void): () => void {
    return this.currentProvider.subscribeToPosts(callback);
  }

  subscribeToMessages(
    chatId: string,
    callback: (data: any) => void,
  ): () => void {
    return this.currentProvider.subscribeToMessages(chatId, callback);
  }

  subscribeToMatches(
    userId: string,
    callback: (data: any) => void,
  ): () => void {
    return this.currentProvider.subscribeToMatches(userId, callback);
  }

  subscribeToAvailability(
    userId: string,
    callback: (data: any) => void,
  ): () => void {
    return this.currentProvider.subscribeToAvailability(userId, callback);
  }

  // ============================================================================
  // ADDITIONAL METHODS (from SupabaseDataProvider)
  // ============================================================================

  async getRecommendedPosts(
    page: number = 1,
    limit: number = 20,
  ): Promise<PaginatedServiceResponse<Post[]>> {
    return await this.currentProvider.getRecommendedPosts(page, limit);
  }

  async getFollowingPosts(
    page: number = 1,
    limit: number = 20,
  ): Promise<PaginatedServiceResponse<Post[]>> {
    return await this.currentProvider.getFollowingPosts(page, limit);
  }

  async getRecommendedUsers(
    userId: string,
    limit: number = 10,
  ): Promise<ServiceResponse<User[]>> {
    return await this.currentProvider.getRecommendedUsers(userId, limit);
  }

  async getIntelligentRecommendations(
    userId: string,
    limit: number = 20,
  ): Promise<ServiceResponse<User[]>> {
    return await this.currentProvider.getIntelligentRecommendations(userId, limit);
  }

  async getDailyRecommendations(
    userId: string,
  ): Promise<ServiceResponse<User[]>> {
    return await this.currentProvider.getDailyRecommendations(userId);
  }

  async markRecommendationSwiped(
    userId: string,
    recommendedUserId: string,
  ): Promise<ServiceResponse<void>> {
    return await this.currentProvider.markRecommendationSwiped(userId, recommendedUserId);
  }

  async getUserProfile(userId: string): Promise<ServiceResponse<any>> {
    return await this.currentProvider.getUserProfile(userId);
  }

  // (keep primary updateUserProfile declared earlier)

  async getUsers(filters?: SearchFilters, sortBy: "registration" | "recommended" = "recommended"): Promise<ServiceResponse<User[]>> {
    return await this.currentProvider.getUsers(filters, sortBy);
  }

  async getUserById(userId: string): Promise<ServiceResponse<User>> {
    return await this.currentProvider.getUserById(userId);
  }

  async getPostById(postId: string): Promise<ServiceResponse<Post>> {
    return await this.currentProvider.getPostById(postId);
  }

  // (duplicates removed; use getChatMessages/sendMessage above)

  async getConnections(userId: string): Promise<ServiceResponse<any[]>> {
    return await this.currentProvider.getConnections(userId);
  }

  async getConnectionStats(userId: string): Promise<ServiceResponse<any>> {
    return await this.currentProvider.getConnectionStats(userId);
  }

  async getCalendarData(
    userId: string,
    year: number,
    month?: number,
  ): Promise<ServiceResponse<any>> {
    return await this.currentProvider.getCalendarData(userId, year, month);
  }

  // (use setAvailability/deleteAvailability defined above)

  async createPostWithData(postData: {
    text: string;
    images: string[];
    videos: string[];
    userId: string;
    aspectRatio?: number;
  }): Promise<ServiceResponse<Post>> {
    return await this.currentProvider.createPostWithData(postData);
  }

  async updatePost(
    postId: string,
    updates: Partial<Post>,
  ): Promise<ServiceResponse<Post>> {
    return await this.currentProvider.updatePost(postId, updates);
  }

  async deletePost(
    postId: string,
    userId: string,
  ): Promise<ServiceResponse<void>> {
    return await this.currentProvider.deletePost(postId, userId);
  }

  // (duplicates removed; use getUserAvailability(month,year) signature above)

  async getUserInteractions(userId: string): Promise<ServiceResponse<any[]>> {
    return await this.currentProvider.getUserInteractions(userId);
  }

  async getReceivedLikes(userId: string): Promise<ServiceResponse<any[]>> {
    return await this.currentProvider.getReceivedLikes(userId);
  }

  async getMutualLikes(userId: string): Promise<ServiceResponse<any[]>> {
    return await this.currentProvider.getMutualLikes(userId);
  }

  async superLikeUser(
    userId: string,
    targetUserId: string,
  ): Promise<ServiceResponse<any>> {
    return await this.currentProvider.superLikeUser(userId, targetUserId);
  }

  async passUser(
    userId: string,
    targetUserId: string,
  ): Promise<ServiceResponse<any>> {
    return await this.currentProvider.passUser(userId, targetUserId);
  }

  async clearCache(): Promise<void> {
    return await this.currentProvider.clearCache();
  }

  async clearUserCache(userId: string): Promise<void> {
    return await this.currentProvider.clearUserCache(userId);
  }

  // ============================================================================
  // CONTACT INQUIRIES
  // ============================================================================

  async getContactInquiries(
    userId: string,
  ): Promise<ServiceResponse<ContactInquiry[]>> {
    return await this.currentProvider.getContactInquiries(userId);
  }

  async getContactInquiry(
    inquiryId: string,
  ): Promise<ServiceResponse<ContactInquiry>> {
    return await this.currentProvider.getContactInquiry(inquiryId);
  }

  async markReplyAsRead(replyId: string): Promise<ServiceResponse<void>> {
    return await this.currentProvider.markReplyAsRead(replyId);
  }

  async markAllRepliesAsRead(
    inquiryId: string,
  ): Promise<ServiceResponse<void>> {
    return await this.currentProvider.markAllRepliesAsRead(inquiryId);
  }

  async createContactInquiry(
    userId: string,
    subject: string,
    message: string,
    inquiryType?: string,
  ): Promise<ServiceResponse<ContactInquiry>> {
    return await this.currentProvider.createContactInquiry(
      userId,
      subject,
      message,
      inquiryType,
    );
  }
}

// Create and export a singleton instance
const dataProviderSwitcher = new DataProviderSwitcher();
export default dataProviderSwitcher;
