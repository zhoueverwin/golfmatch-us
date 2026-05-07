/**
 * Optimized Cache Service with LRU eviction and memory management
 * Designed for scalability with 50,000+ users
 *
 * Features:
 * - In-memory LRU cache for hot data (instant access)
 * - AsyncStorage persistence for cold data
 * - Automatic memory pressure handling
 * - Cache statistics for monitoring
 * - TTL-based expiration
 * - Batch operations
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccess: number;
  size: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  memoryHits: number;
  storageHits: number;
  evictions: number;
  totalSize: number;
}

// LRU Node for doubly linked list
interface LRUNode<T> {
  key: string;
  value: CacheEntry<T>;
  prev: LRUNode<T> | null;
  next: LRUNode<T> | null;
}

class OptimizedCacheService {
  private static instance: OptimizedCacheService;

  // Configuration
  private readonly CACHE_PREFIX = "@gm_cache:";
  private readonly MAX_MEMORY_ITEMS = 500; // Max items in memory
  private readonly MAX_MEMORY_SIZE = 10 * 1024 * 1024; // 10MB max memory
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

  // In-memory LRU cache
  private memoryCache: Map<string, LRUNode<any>> = new Map();
  private head: LRUNode<any> | null = null;
  private tail: LRUNode<any> | null = null;
  private currentMemorySize = 0;

  // Statistics
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    memoryHits: 0,
    storageHits: 0,
    evictions: 0,
    totalSize: 0,
  };

  // Pending writes (batched for performance)
  private pendingWrites: Map<string, CacheEntry<any>> = new Map();
  private writeTimer: NodeJS.Timeout | null = null;

  private constructor() {
    // Warm up cache on initialization
    this.warmUpCache();
  }

  static getInstance(): OptimizedCacheService {
    if (!OptimizedCacheService.instance) {
      OptimizedCacheService.instance = new OptimizedCacheService();
    }
    return OptimizedCacheService.instance;
  }

  /**
   * Get item from cache (memory first, then storage)
   */
  async get<T>(key: string): Promise<T | null> {
    const cacheKey = this.CACHE_PREFIX + key;

    // Try memory cache first (O(1) lookup)
    const memoryNode = this.memoryCache.get(cacheKey);
    if (memoryNode) {
      const entry = memoryNode.value;

      // Check expiration
      if (Date.now() - entry.timestamp > entry.ttl) {
        this.removeFromMemory(cacheKey);
        this.stats.misses++;
        return null;
      }

      // Update access tracking and move to front (LRU)
      entry.accessCount++;
      entry.lastAccess = Date.now();
      this.moveToFront(memoryNode);

      this.stats.hits++;
      this.stats.memoryHits++;
      return entry.data as T;
    }

    // Try persistent storage
    try {
      const stored = await AsyncStorage.getItem(cacheKey);
      if (stored) {
        const entry: CacheEntry<T> = JSON.parse(stored);

        // Check expiration
        if (Date.now() - entry.timestamp > entry.ttl) {
          AsyncStorage.removeItem(cacheKey).catch(() => {});
          this.stats.misses++;
          return null;
        }

        // Promote to memory cache for future access
        this.addToMemory(cacheKey, entry);

        this.stats.hits++;
        this.stats.storageHits++;
        return entry.data;
      }
    } catch (error) {
      // Ignore storage errors
    }

    this.stats.misses++;
    return null;
  }

  /**
   * Set item in cache with optional TTL
   */
  async set<T>(
    key: string,
    data: T,
    ttl: number = this.DEFAULT_TTL
  ): Promise<void> {
    const cacheKey = this.CACHE_PREFIX + key;
    const size = this.estimateSize(data);

    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl,
      accessCount: 1,
      lastAccess: Date.now(),
      size,
    };

    // Add to memory cache
    this.addToMemory(cacheKey, entry);

    // Queue for persistent storage (batched writes)
    this.queueWrite(cacheKey, entry);
  }

  /**
   * Batch get multiple items
   */
  async getMany<T>(keys: string[]): Promise<Map<string, T>> {
    const results = new Map<string, T>();
    const missingKeys: string[] = [];

    // Check memory cache first
    for (const key of keys) {
      const cacheKey = this.CACHE_PREFIX + key;
      const memoryNode = this.memoryCache.get(cacheKey);

      if (memoryNode && Date.now() - memoryNode.value.timestamp <= memoryNode.value.ttl) {
        results.set(key, memoryNode.value.data);
        memoryNode.value.accessCount++;
        this.moveToFront(memoryNode);
      } else {
        missingKeys.push(key);
      }
    }

    // Batch fetch from storage
    if (missingKeys.length > 0) {
      const storageKeys = missingKeys.map(k => this.CACHE_PREFIX + k);
      try {
        const stored = await AsyncStorage.multiGet(storageKeys);
        for (const [cacheKey, value] of stored) {
          if (value) {
            try {
              const entry: CacheEntry<T> = JSON.parse(value);
              if (Date.now() - entry.timestamp <= entry.ttl) {
                const key = cacheKey.replace(this.CACHE_PREFIX, '');
                results.set(key, entry.data);
                this.addToMemory(cacheKey, entry);
              }
            } catch {}
          }
        }
      } catch {}
    }

    return results;
  }

  /**
   * Batch set multiple items
   */
  async setMany<T>(items: Array<{ key: string; data: T; ttl?: number }>): Promise<void> {
    const writes: Array<[string, string]> = [];

    for (const { key, data, ttl = this.DEFAULT_TTL } of items) {
      const cacheKey = this.CACHE_PREFIX + key;
      const size = this.estimateSize(data);

      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        ttl,
        accessCount: 1,
        lastAccess: Date.now(),
        size,
      };

      this.addToMemory(cacheKey, entry);
      writes.push([cacheKey, JSON.stringify(entry)]);
    }

    // Batch write to storage
    try {
      await AsyncStorage.multiSet(writes);
    } catch {}
  }

  /**
   * Remove item from cache
   */
  async remove(key: string): Promise<void> {
    const cacheKey = this.CACHE_PREFIX + key;
    this.removeFromMemory(cacheKey);
    try {
      await AsyncStorage.removeItem(cacheKey);
    } catch {}
  }

  /**
   * Remove multiple items
   */
  async removeMany(keys: string[]): Promise<void> {
    const cacheKeys = keys.map(k => this.CACHE_PREFIX + k);

    for (const cacheKey of cacheKeys) {
      this.removeFromMemory(cacheKey);
    }

    try {
      await AsyncStorage.multiRemove(cacheKeys);
    } catch {}
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    // Clear memory
    this.memoryCache.clear();
    this.head = null;
    this.tail = null;
    this.currentMemorySize = 0;

    // Clear storage
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(k => k.startsWith(this.CACHE_PREFIX));
      await AsyncStorage.multiRemove(cacheKeys);
    } catch {}
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats & { hitRate: number; memoryItems: number } {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      memoryItems: this.memoryCache.size,
    };
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidatePattern(pattern: string): Promise<void> {
    const regex = new RegExp(pattern);

    // Invalidate memory cache
    const keysToRemove: string[] = [];
    for (const key of this.memoryCache.keys()) {
      if (regex.test(key)) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      this.removeFromMemory(key);
    }

    // Invalidate storage
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const matchingKeys = allKeys.filter(k =>
        k.startsWith(this.CACHE_PREFIX) && regex.test(k)
      );
      if (matchingKeys.length > 0) {
        await AsyncStorage.multiRemove(matchingKeys);
      }
    } catch {}
  }

  // ============================================================================
  // Private LRU operations
  // ============================================================================

  private addToMemory<T>(key: string, entry: CacheEntry<T>): void {
    // Check if already exists
    const existing = this.memoryCache.get(key);
    if (existing) {
      this.currentMemorySize -= existing.value.size;
      existing.value = entry;
      this.currentMemorySize += entry.size;
      this.moveToFront(existing);
      return;
    }

    // Evict if necessary
    while (
      this.memoryCache.size >= this.MAX_MEMORY_ITEMS ||
      this.currentMemorySize + entry.size > this.MAX_MEMORY_SIZE
    ) {
      this.evictLRU();
    }

    // Create new node
    const node: LRUNode<T> = {
      key,
      value: entry,
      prev: null,
      next: this.head,
    };

    if (this.head) {
      this.head.prev = node;
    }
    this.head = node;

    if (!this.tail) {
      this.tail = node;
    }

    this.memoryCache.set(key, node);
    this.currentMemorySize += entry.size;
  }

  private removeFromMemory(key: string): void {
    const node = this.memoryCache.get(key);
    if (!node) return;

    // Remove from linked list
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }

    this.currentMemorySize -= node.value.size;
    this.memoryCache.delete(key);
  }

  private moveToFront<T>(node: LRUNode<T>): void {
    if (node === this.head) return;

    // Remove from current position
    if (node.prev) {
      node.prev.next = node.next;
    }
    if (node.next) {
      node.next.prev = node.prev;
    }
    if (node === this.tail) {
      this.tail = node.prev;
    }

    // Move to front
    node.prev = null;
    node.next = this.head;
    if (this.head) {
      this.head.prev = node;
    }
    this.head = node;
  }

  private evictLRU(): void {
    if (!this.tail) return;

    const key = this.tail.key;
    this.removeFromMemory(key);
    this.stats.evictions++;
  }

  private estimateSize(data: any): number {
    // Rough estimation of object size in bytes
    const str = JSON.stringify(data);
    return str.length * 2; // UTF-16 characters
  }

  private queueWrite<T>(key: string, entry: CacheEntry<T>): void {
    this.pendingWrites.set(key, entry);

    // Debounce writes (batch every 100ms)
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
    }

    this.writeTimer = setTimeout(() => {
      this.flushWrites();
    }, 100);
  }

  private async flushWrites(): Promise<void> {
    if (this.pendingWrites.size === 0) return;

    const writes: Array<[string, string]> = [];
    for (const [key, entry] of this.pendingWrites) {
      writes.push([key, JSON.stringify(entry)]);
    }

    this.pendingWrites.clear();

    try {
      await AsyncStorage.multiSet(writes);
    } catch (error) {
      console.error("[OptimizedCache] Failed to flush writes:", error);
    }
  }

  private async warmUpCache(): Promise<void> {
    // Load frequently accessed keys into memory on startup
    const frequentKeys = [
      'current_user',
      'notification_preferences',
    ];

    try {
      const keys = frequentKeys.map(k => this.CACHE_PREFIX + k);
      const stored = await AsyncStorage.multiGet(keys);

      for (const [key, value] of stored) {
        if (value) {
          try {
            const entry = JSON.parse(value);
            if (Date.now() - entry.timestamp <= entry.ttl) {
              this.addToMemory(key, entry);
            }
          } catch {}
        }
      }
    } catch {}
  }
}

export const optimizedCache = OptimizedCacheService.getInstance();
export default optimizedCache;
