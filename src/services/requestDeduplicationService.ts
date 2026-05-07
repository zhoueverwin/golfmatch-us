/**
 * Request Deduplication Service
 * Prevents duplicate concurrent requests to the same endpoint
 *
 * Features:
 * - Coalesces identical concurrent requests into single API call
 * - Request batching for bulk operations
 * - Automatic cleanup of stale pending requests
 * - Performance metrics
 */

interface PendingRequest<T> {
  promise: Promise<T>;
  timestamp: number;
  subscribers: number;
}

interface BatchConfig {
  maxBatchSize: number;
  maxWaitMs: number;
}

interface DedupeStats {
  totalRequests: number;
  deduplicatedRequests: number;
  batchedRequests: number;
  savedCalls: number;
}

class RequestDeduplicationService {
  private static instance: RequestDeduplicationService;

  // Pending requests map
  private pendingRequests: Map<string, PendingRequest<any>> = new Map();

  // Batch queues
  private batchQueues: Map<string, {
    items: Array<{ key: string; resolve: (value: any) => void; reject: (error: any) => void }>;
    timer: NodeJS.Timeout | null;
    config: BatchConfig;
    executor: (keys: string[]) => Promise<Map<string, any>>;
  }> = new Map();

  // Statistics
  private stats: DedupeStats = {
    totalRequests: 0,
    deduplicatedRequests: 0,
    batchedRequests: 0,
    savedCalls: 0,
  };

  // Cleanup interval
  private cleanupInterval: NodeJS.Timeout;

  private constructor() {
    // Cleanup stale pending requests every 30 seconds
    this.cleanupInterval = setInterval(() => this.cleanup(), 30000);
  }

  static getInstance(): RequestDeduplicationService {
    if (!RequestDeduplicationService.instance) {
      RequestDeduplicationService.instance = new RequestDeduplicationService();
    }
    return RequestDeduplicationService.instance;
  }

  /**
   * Execute a request with deduplication
   * If an identical request is in flight, return the same promise
   */
  async dedupe<T>(
    key: string,
    executor: () => Promise<T>,
    ttlMs: number = 100
  ): Promise<T> {
    this.stats.totalRequests++;

    // Check for pending request
    const pending = this.pendingRequests.get(key);
    if (pending && Date.now() - pending.timestamp < ttlMs) {
      pending.subscribers++;
      this.stats.deduplicatedRequests++;
      this.stats.savedCalls++;
      return pending.promise;
    }

    // Create new request
    const promise = executor().finally(() => {
      // Clean up after request completes
      setTimeout(() => {
        this.pendingRequests.delete(key);
      }, ttlMs);
    });

    this.pendingRequests.set(key, {
      promise,
      timestamp: Date.now(),
      subscribers: 1,
    });

    return promise;
  }

  /**
   * Register a batch executor for a specific operation type
   */
  registerBatchExecutor<T>(
    operationType: string,
    executor: (keys: string[]) => Promise<Map<string, T>>,
    config: BatchConfig = { maxBatchSize: 50, maxWaitMs: 50 }
  ): void {
    this.batchQueues.set(operationType, {
      items: [],
      timer: null,
      config,
      executor,
    });
  }

  /**
   * Add item to batch queue
   * Items are batched and executed together for efficiency
   */
  async batch<T>(operationType: string, key: string): Promise<T> {
    const queue = this.batchQueues.get(operationType);
    if (!queue) {
      throw new Error(`No batch executor registered for: ${operationType}`);
    }

    this.stats.totalRequests++;
    this.stats.batchedRequests++;

    return new Promise<T>((resolve, reject) => {
      queue.items.push({ key, resolve, reject });

      // Execute immediately if batch is full
      if (queue.items.length >= queue.config.maxBatchSize) {
        this.executeBatch(operationType);
        return;
      }

      // Otherwise, wait for more items
      if (!queue.timer) {
        queue.timer = setTimeout(() => {
          this.executeBatch(operationType);
        }, queue.config.maxWaitMs);
      }
    });
  }

  /**
   * Execute pending batch
   */
  private async executeBatch(operationType: string): Promise<void> {
    const queue = this.batchQueues.get(operationType);
    if (!queue || queue.items.length === 0) return;

    // Clear timer
    if (queue.timer) {
      clearTimeout(queue.timer);
      queue.timer = null;
    }

    // Get items to process
    const items = [...queue.items];
    queue.items = [];

    // Deduplicate keys
    const uniqueKeys = [...new Set(items.map(i => i.key))];
    const savedCalls = items.length - uniqueKeys.length;
    this.stats.savedCalls += savedCalls + (items.length > 1 ? items.length - 1 : 0);

    try {
      // Execute batch
      const results = await queue.executor(uniqueKeys);

      // Resolve individual promises
      for (const item of items) {
        const result = results.get(item.key);
        if (result !== undefined) {
          item.resolve(result);
        } else {
          item.reject(new Error(`No result for key: ${item.key}`));
        }
      }
    } catch (error) {
      // Reject all promises
      for (const item of items) {
        item.reject(error);
      }
    }
  }

  /**
   * Get deduplication statistics
   */
  getStats(): DedupeStats & { dedupeRate: number } {
    const total = this.stats.totalRequests;
    return {
      ...this.stats,
      dedupeRate: total > 0 ? this.stats.savedCalls / total : 0,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      deduplicatedRequests: 0,
      batchedRequests: 0,
      savedCalls: 0,
    };
  }

  /**
   * Cleanup stale pending requests
   */
  private cleanup(): void {
    const now = Date.now();
    const staleThreshold = 60000; // 1 minute

    for (const [key, pending] of this.pendingRequests) {
      if (now - pending.timestamp > staleThreshold) {
        this.pendingRequests.delete(key);
      }
    }
  }

  /**
   * Destroy the service (cleanup intervals)
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    for (const queue of this.batchQueues.values()) {
      if (queue.timer) {
        clearTimeout(queue.timer);
      }
    }
  }
}

export const requestDeduplication = RequestDeduplicationService.getInstance();
export default requestDeduplication;
