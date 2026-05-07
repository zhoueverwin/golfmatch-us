/**
 * Cache Abstraction Layer
 * Supports multiple backends: Local (AsyncStorage), Redis, or Hybrid
 *
 * This abstraction allows seamless switching from local cache to Redis
 * when scaling to 100k+ users without changing application code
 */

import { optimizedCache } from '../optimizedCacheService';

export interface CacheBackend {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  getMany<T>(keys: string[]): Promise<Map<string, T>>;
  setMany<T>(items: Array<{ key: string; data: T; ttl?: number }>): Promise<void>;
  remove(key: string): Promise<void>;
  removeMany(keys: string[]): Promise<void>;
  invalidatePattern(pattern: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Local cache backend (current implementation)
 */
class LocalCacheBackend implements CacheBackend {
  async get<T>(key: string): Promise<T | null> {
    return optimizedCache.get<T>(key);
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    return optimizedCache.set(key, value, ttlMs);
  }

  async getMany<T>(keys: string[]): Promise<Map<string, T>> {
    return optimizedCache.getMany<T>(keys);
  }

  async setMany<T>(items: Array<{ key: string; data: T; ttl?: number }>): Promise<void> {
    return optimizedCache.setMany(items);
  }

  async remove(key: string): Promise<void> {
    return optimizedCache.remove(key);
  }

  async removeMany(keys: string[]): Promise<void> {
    return optimizedCache.removeMany(keys);
  }

  async invalidatePattern(pattern: string): Promise<void> {
    return optimizedCache.invalidatePattern(pattern);
  }

  async clear(): Promise<void> {
    return optimizedCache.clear();
  }
}

/**
 * Redis cache backend (for server-side deployment)
 * Uncomment and configure when Redis is available
 */
/*
class RedisCacheBackend implements CacheBackend {
  private client: any; // Redis client

  constructor(redisUrl: string) {
    // Initialize Redis client
    // Example with ioredis:
    // this.client = new Redis(redisUrl);
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    return value ? JSON.parse(value) : null;
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttlMs) {
      await this.client.set(key, serialized, 'PX', ttlMs);
    } else {
      await this.client.set(key, serialized);
    }
  }

  async getMany<T>(keys: string[]): Promise<Map<string, T>> {
    const values = await this.client.mget(...keys);
    const result = new Map<string, T>();

    keys.forEach((key, index) => {
      if (values[index]) {
        result.set(key, JSON.parse(values[index]));
      }
    });

    return result;
  }

  async setMany<T>(items: Array<{ key: string; data: T; ttl?: number }>): Promise<void> {
    const pipeline = this.client.pipeline();

    for (const item of items) {
      const serialized = JSON.stringify(item.data);
      if (item.ttl) {
        pipeline.set(item.key, serialized, 'PX', item.ttl);
      } else {
        pipeline.set(item.key, serialized);
      }
    }

    await pipeline.exec();
  }

  async remove(key: string): Promise<void> {
    await this.client.del(key);
  }

  async removeMany(keys: string[]): Promise<void> {
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }

  async invalidatePattern(pattern: string): Promise<void> {
    const keys = await this.client.keys(pattern);
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }

  async clear(): Promise<void> {
    await this.client.flushdb();
  }
}
*/

/**
 * Hybrid cache backend (Local + Redis)
 * Uses local cache as L1, Redis as L2
 */
/*
class HybridCacheBackend implements CacheBackend {
  private local: LocalCacheBackend;
  private redis: RedisCacheBackend;

  constructor(redisUrl: string) {
    this.local = new LocalCacheBackend();
    this.redis = new RedisCacheBackend(redisUrl);
  }

  async get<T>(key: string): Promise<T | null> {
    // Try L1 (local) first
    const localValue = await this.local.get<T>(key);
    if (localValue) return localValue;

    // Try L2 (Redis)
    const redisValue = await this.redis.get<T>(key);
    if (redisValue) {
      // Populate L1 for next access
      await this.local.set(key, redisValue);
    }

    return redisValue;
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    // Write to both layers
    await Promise.all([
      this.local.set(key, value, ttlMs),
      this.redis.set(key, value, ttlMs),
    ]);
  }

  async getMany<T>(keys: string[]): Promise<Map<string, T>> {
    const localResults = await this.local.getMany<T>(keys);
    const missingKeys = keys.filter(k => !localResults.has(k));

    if (missingKeys.length === 0) {
      return localResults;
    }

    const redisResults = await this.redis.getMany<T>(missingKeys);

    // Populate L1 with Redis results
    if (redisResults.size > 0) {
      const items = Array.from(redisResults.entries()).map(([key, data]) => ({
        key,
        data,
      }));
      await this.local.setMany(items);
    }

    // Combine results
    return new Map([...localResults, ...redisResults]);
  }

  async setMany<T>(items: Array<{ key: string; data: T; ttl?: number }>): Promise<void> {
    await Promise.all([
      this.local.setMany(items),
      this.redis.setMany(items),
    ]);
  }

  async remove(key: string): Promise<void> {
    await Promise.all([
      this.local.remove(key),
      this.redis.remove(key),
    ]);
  }

  async removeMany(keys: string[]): Promise<void> {
    await Promise.all([
      this.local.removeMany(keys),
      this.redis.removeMany(keys),
    ]);
  }

  async invalidatePattern(pattern: string): Promise<void> {
    await Promise.all([
      this.local.invalidatePattern(pattern),
      this.redis.invalidatePattern(pattern),
    ]);
  }

  async clear(): Promise<void> {
    await Promise.all([
      this.local.clear(),
      this.redis.clear(),
    ]);
  }
}
*/

/**
 * Cache factory - creates appropriate backend based on configuration
 */
export function createCacheBackend(): CacheBackend {
  const redisUrl = process.env.EXPO_PUBLIC_REDIS_URL;

  if (redisUrl) {
    console.log('[Cache] Using Redis backend:', redisUrl);
    // return new RedisCacheBackend(redisUrl);
    // For now, fall back to local until Redis is deployed
  }

  console.log('[Cache] Using local backend');
  return new LocalCacheBackend();
}

// Export singleton cache backend
export const cacheBackend = createCacheBackend();

/**
 * Unified cache interface
 * Use this throughout the app for all caching needs
 */
export class UnifiedCache {
  private backend: CacheBackend;

  constructor(backend: CacheBackend) {
    this.backend = backend;
  }

  async get<T>(key: string): Promise<T | null> {
    return this.backend.get<T>(key);
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    return this.backend.set(key, value, ttlMs);
  }

  async getMany<T>(keys: string[]): Promise<Map<string, T>> {
    return this.backend.getMany<T>(keys);
  }

  async setMany<T>(items: Array<{ key: string; data: T; ttl?: number }>): Promise<void> {
    return this.backend.setMany(items);
  }

  async remove(key: string): Promise<void> {
    return this.backend.remove(key);
  }

  async removeMany(keys: string[]): Promise<void> {
    return this.backend.removeMany(keys);
  }

  async invalidatePattern(pattern: string): Promise<void> {
    return this.backend.invalidatePattern(pattern);
  }

  async clear(): Promise<void> {
    return this.backend.clear();
  }

  /**
   * Convenience: Cache with automatic serialization
   */
  async remember<T>(
    key: string,
    ttlMs: number,
    fetcher: () => Promise<T>
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const fresh = await fetcher();
    await this.set(key, fresh, ttlMs);
    return fresh;
  }
}

export const unifiedCache = new UnifiedCache(cacheBackend);
export default unifiedCache;
