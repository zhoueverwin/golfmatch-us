// User Interaction Service
// Manages user likes, passes, and super likes with proper state management

import { User, UserLike, InteractionType } from "../types/dataModels";
import { MatchesService } from "./supabase/matches.service";

// Create service instance
const matchesService = new MatchesService();

export interface UserInteractionState {
  likedUsers: Set<string>;
  passedUsers: Set<string>;
  loading: boolean;
  error: string | null;
}

export class UserInteractionService {
  private static instance: UserInteractionService;
  private state: UserInteractionState = {
    likedUsers: new Set(),
    passedUsers: new Set(),
    loading: false,
    error: null,
  };
  private listeners: Set<(state: UserInteractionState) => void> = new Set();

  private constructor() {}

  static getInstance(): UserInteractionService {
    if (!UserInteractionService.instance) {
      UserInteractionService.instance = new UserInteractionService();
    }
    return UserInteractionService.instance;
  }

  // Subscribe to state changes
  subscribe(listener: (state: UserInteractionState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // Notify all listeners of state changes
  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener(this.state));
  }

  // Update state and notify listeners
  private updateState(updates: Partial<UserInteractionState>): void {
    this.state = { ...this.state, ...updates };
    this.notifyListeners();
  }

  // Load user interactions from data provider
  async loadUserInteractions(userId: string): Promise<void> {
    try {
      this.updateState({ loading: true, error: null });

      const response = await matchesService.getUserLikes(userId);

      if (!response.success) {
        this.updateState({
          error: response.error || "Failed to load interactions",
          loading: false,
        });
        return;
      }

      const interactions = response.data || [];
      const likedUsers = new Set<string>();
      const passedUsers = new Set<string>();

      interactions.forEach((interaction) => {
        switch (interaction.type) {
          case "like":
            likedUsers.add(interaction.liked_user_id);
            break;
          case "pass":
            passedUsers.add(interaction.liked_user_id);
            break;
          
        }
      });

      this.updateState({
        likedUsers,
        passedUsers,
        loading: false,
        error: null,
      });
    } catch (error) {
      this.updateState({
        error: error instanceof Error ? error.message : "Unknown error",
        loading: false,
      });
    }
  }

  // Like a user
  async likeUser(likerUserId: string, likedUserId: string): Promise<boolean> {
    try {
      this.updateState({ loading: true, error: null });

      const response = await matchesService.likeUser(
        likerUserId,
        likedUserId,
        "like",
      );

      if (!response.success) {
        this.updateState({
          error: response.error || "Failed to like user",
          loading: false,
        });
        return false;
      }

      // Update local state
      const newLikedUsers = new Set(this.state.likedUsers);
      newLikedUsers.add(likedUserId);

      // Remove from other sets if present
      const newPassedUsers = new Set(this.state.passedUsers);
      newPassedUsers.delete(likedUserId);

      this.updateState({
        likedUsers: newLikedUsers,
        passedUsers: newPassedUsers,
        loading: false,
        error: null,
      });

      return true;
    } catch (error) {
      this.updateState({
        error: error instanceof Error ? error.message : "Unknown error",
        loading: false,
      });
      return false;
    }
  }

  // super like removed

  // Pass a user
  async passUser(likerUserId: string, likedUserId: string): Promise<boolean> {
    try {
      this.updateState({ loading: true, error: null });

      const response = await matchesService.likeUser(
        likerUserId,
        likedUserId,
        "pass",
      );

      if (!response.success) {
        this.updateState({
          error: response.error || "Failed to pass user",
          loading: false,
        });
        return false;
      }

      // Update local state
      const newPassedUsers = new Set(this.state.passedUsers);
      newPassedUsers.add(likedUserId);

      // Remove from other sets if present
      const newLikedUsers = new Set(this.state.likedUsers);
      newLikedUsers.delete(likedUserId);

      this.updateState({
        likedUsers: newLikedUsers,
        passedUsers: newPassedUsers,
        loading: false,
        error: null,
      });

      return true;
    } catch (error) {
      this.updateState({
        error: error instanceof Error ? error.message : "Unknown error",
        loading: false,
      });
      return false;
    }
  }

  // Apply interaction state to users
  applyInteractionState(users: User[]): User[] {
    return users.map((user) => {
      const isLiked = this.state.likedUsers.has(user.id);
      const isPassed = this.state.passedUsers.has(user.id);

      let interactionType: InteractionType | undefined;
      if (isLiked) interactionType = "like";
      else if (isPassed) interactionType = "pass";

      return {
        ...user,
        isLiked,
        isPassed,
        interactionType,
      };
    });
  }

  // Get current state
  getState(): UserInteractionState {
    return { ...this.state };
  }

  // Check if user is liked
  isUserLiked(userId: string): boolean {
    return this.state.likedUsers.has(userId);
  }

  // Check if user is passed
  isUserPassed(userId: string): boolean {
    return this.state.passedUsers.has(userId);
  }

  

  // Get interaction type for user
  getUserInteractionType(userId: string): InteractionType | null {
    if (this.state.likedUsers.has(userId)) return "like";
    if (this.state.passedUsers.has(userId)) return "pass";
    return null;
  }

  // Reset all state (call on logout to prevent data leaking between accounts)
  reset(): void {
    this.updateState({
      likedUsers: new Set(),
      passedUsers: new Set(),
      loading: false,
      error: null,
    });
  }

  // Clear error
  clearError(): void {
    this.updateState({ error: null });
  }
}

// Export singleton instance
export const userInteractionService = UserInteractionService.getInstance();
