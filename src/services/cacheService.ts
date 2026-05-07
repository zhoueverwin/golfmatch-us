import AsyncStorage from "@react-native-async-storage/async-storage";

interface CacheItem<T> {
  data: T;
  timestamp: number;
  expiresIn: number;
}

export class CacheService {
  private static CACHE_PREFIX = "@golfmatch_cache:";

  static async set<T>(
    key: string,
    data: T,
    expiresIn: number = 5 * 60 * 1000,
  ): Promise<void> {
    try {
      const cacheItem: CacheItem<T> = {
        data,
        timestamp: Date.now(),
        expiresIn,
      };

      const cacheKey = this.CACHE_PREFIX + key;
      await AsyncStorage.setItem(cacheKey, JSON.stringify(cacheItem));
    } catch (error) {
      console.error("Error saving to cache:", error);
    }
  }

  static async get<T>(key: string): Promise<T | null> {
    try {
      const cacheKey = this.CACHE_PREFIX + key;
      const cached = await AsyncStorage.getItem(cacheKey);

      if (!cached || cached.trim() === '') {
        return null;
      }

      // Validate JSON before parsing
      let cacheItem: CacheItem<T>;
      try {
        cacheItem = JSON.parse(cached);
      } catch (parseError) {
        // Corrupted cache data - remove it
        console.warn(`Corrupted cache data for key "${key}", removing:`, parseError);
        await this.remove(key);
        return null;
      }

      // Validate cache item structure
      if (!cacheItem || typeof cacheItem !== 'object' || !cacheItem.data) {
        console.warn(`Invalid cache structure for key "${key}", removing`);
        await this.remove(key);
        return null;
      }

      const now = Date.now();
      const age = now - cacheItem.timestamp;

      if (age > cacheItem.expiresIn) {
        await this.remove(key);
        return null;
      }

      return cacheItem.data;
    } catch (error) {
      console.error("Error reading from cache:", error);
      return null;
    }
  }

  static async remove(key: string): Promise<void> {
    try {
      const cacheKey = this.CACHE_PREFIX + key;
      await AsyncStorage.removeItem(cacheKey);
    } catch (error) {
      console.error("Error removing from cache:", error);
    }
  }

  static async clear(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter((key) => key.startsWith(this.CACHE_PREFIX));
      await AsyncStorage.multiRemove(cacheKeys);
    } catch (error) {
      console.error("Error clearing cache:", error);
    }
  }

  static getCacheKey(operation: string, params?: any): string {
    if (!params) {
      return operation;
    }

    const sortedParams = Object.keys(params)
      .sort()
      .reduce((acc, key) => {
        acc[key] = params[key];
        return acc;
      }, {} as any);

    return `${operation}:${JSON.stringify(sortedParams)}`;
  }
}

export default CacheService;
