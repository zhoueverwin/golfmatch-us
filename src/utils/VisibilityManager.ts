/**
 * VisibilityManager - Ref-based visibility tracking for video playback
 *
 * This manager decouples video visibility from React state to prevent
 * re-renders during scroll. VideoPlayers subscribe to visibility changes
 * and update their playback state directly without triggering parent re-renders.
 */

type VisibilityCallback = (isVisible: boolean) => void;

class VisibilityManager {
  private visiblePostIds: Set<string> = new Set();
  private subscribers: Map<string, Set<VisibilityCallback>> = new Map();

  /**
   * Update the set of visible post IDs
   * Called from onViewableItemsChanged callback
   */
  setVisiblePosts(postIds: string[]): void {
    const newVisibleSet = new Set(postIds);

    // Find posts that became visible or hidden
    const becameVisible: string[] = [];
    const becameHidden: string[] = [];

    // Check for newly visible posts
    for (const id of postIds) {
      if (!this.visiblePostIds.has(id)) {
        becameVisible.push(id);
      }
    }

    // Check for newly hidden posts
    for (const id of this.visiblePostIds) {
      if (!newVisibleSet.has(id)) {
        becameHidden.push(id);
      }
    }

    // Update the visible set
    this.visiblePostIds = newVisibleSet;

    // Notify subscribers of visibility changes
    for (const id of becameVisible) {
      this.notifySubscribers(id, true);
    }

    for (const id of becameHidden) {
      this.notifySubscribers(id, false);
    }
  }

  /**
   * Check if a post is currently visible
   */
  isVisible(postId: string): boolean {
    return this.visiblePostIds.has(postId);
  }

  /**
   * Subscribe to visibility changes for a specific post
   * Returns an unsubscribe function
   */
  subscribe(postId: string, callback: VisibilityCallback): () => void {
    if (!this.subscribers.has(postId)) {
      this.subscribers.set(postId, new Set());
    }

    this.subscribers.get(postId)!.add(callback);

    // Immediately call with current visibility state
    callback(this.visiblePostIds.has(postId));

    // Return unsubscribe function
    return () => {
      const callbacks = this.subscribers.get(postId);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.subscribers.delete(postId);
        }
      }
    };
  }

  /**
   * Notify all subscribers of a post's visibility change
   */
  private notifySubscribers(postId: string, isVisible: boolean): void {
    const callbacks = this.subscribers.get(postId);
    if (callbacks) {
      for (const callback of callbacks) {
        callback(isVisible);
      }
    }
  }

  /**
   * Clear all visibility state (e.g., when switching tabs)
   */
  clear(): void {
    // Notify all currently visible posts that they're now hidden
    for (const id of this.visiblePostIds) {
      this.notifySubscribers(id, false);
    }
    this.visiblePostIds.clear();
  }
}

// Export singleton instance
export const visibilityManager = new VisibilityManager();
