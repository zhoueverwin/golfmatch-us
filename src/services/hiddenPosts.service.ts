import AsyncStorage from "@react-native-async-storage/async-storage";

const HIDDEN_POSTS_KEY_PREFIX = "@golfmatch:hidden_posts:";

export interface HiddenPostsService {
  hidePost(userId: string, postId: string): Promise<void>;
  unhidePost(userId: string, postId: string): Promise<void>;
  isPostHidden(userId: string, postId: string): Promise<boolean>;
  getHiddenPosts(userId: string): Promise<string[]>;
  clearHiddenPosts(userId: string): Promise<void>;
  filterHiddenPosts<T extends { id: string }>(
    userId: string,
    posts: T[]
  ): Promise<T[]>;
}

class HiddenPostsServiceImpl implements HiddenPostsService {
  private getStorageKey(userId: string): string {
    return `${HIDDEN_POSTS_KEY_PREFIX}${userId}`;
  }

  /**
   * Hide a post (store in AsyncStorage)
   */
  async hidePost(userId: string, postId: string): Promise<void> {
    try {
      const hiddenPosts = await this.getHiddenPostsMap(userId);
      hiddenPosts[postId] = true;
      await AsyncStorage.setItem(
        this.getStorageKey(userId),
        JSON.stringify(hiddenPosts)
      );
    } catch (error) {
      console.error("[HiddenPostsService] Failed to hide post:", error);
      throw error;
    }
  }

  /**
   * Unhide a post (remove from AsyncStorage)
   */
  async unhidePost(userId: string, postId: string): Promise<void> {
    try {
      const hiddenPosts = await this.getHiddenPostsMap(userId);
      delete hiddenPosts[postId];
      await AsyncStorage.setItem(
        this.getStorageKey(userId),
        JSON.stringify(hiddenPosts)
      );
    } catch (error) {
      console.error("[HiddenPostsService] Failed to unhide post:", error);
      throw error;
    }
  }

  /**
   * Check if a post is hidden
   */
  async isPostHidden(userId: string, postId: string): Promise<boolean> {
    try {
      const hiddenPosts = await this.getHiddenPostsMap(userId);
      return !!hiddenPosts[postId];
    } catch (error) {
      console.error(
        "[HiddenPostsService] Failed to check hidden status:",
        error
      );
      return false;
    }
  }

  /**
   * Get all hidden post IDs
   */
  async getHiddenPosts(userId: string): Promise<string[]> {
    try {
      const hiddenPosts = await this.getHiddenPostsMap(userId);
      return Object.keys(hiddenPosts);
    } catch (error) {
      console.error("[HiddenPostsService] Failed to get hidden posts:", error);
      return [];
    }
  }

  /**
   * Clear all hidden posts for a user
   */
  async clearHiddenPosts(userId: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.getStorageKey(userId));
    } catch (error) {
      console.error(
        "[HiddenPostsService] Failed to clear hidden posts:",
        error
      );
      throw error;
    }
  }

  /**
   * Filter out hidden posts from an array
   */
  async filterHiddenPosts<T extends { id: string }>(
    userId: string,
    posts: T[]
  ): Promise<T[]> {
    try {
      const hiddenPosts = await this.getHiddenPostsMap(userId);
      return posts.filter((post) => !hiddenPosts[post.id]);
    } catch (error) {
      console.error(
        "[HiddenPostsService] Failed to filter hidden posts:",
        error
      );
      return posts; // Return unfiltered on error
    }
  }

  /**
   * Internal helper to get hidden posts as a map
   */
  private async getHiddenPostsMap(
    userId: string
  ): Promise<Record<string, boolean>> {
    try {
      const stored = await AsyncStorage.getItem(this.getStorageKey(userId));
      if (stored) {
        return JSON.parse(stored);
      }
      return {};
    } catch (error) {
      console.error(
        "[HiddenPostsService] Failed to get hidden posts map:",
        error
      );
      return {};
    }
  }
}

export const hiddenPostsService = new HiddenPostsServiceImpl();
