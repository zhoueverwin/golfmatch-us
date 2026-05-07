/**
 * Optimized API Client
 * Integrates caching, rate limiting, and request deduplication
 *
 * Use this client for all API calls to ensure optimal performance at scale
 */

import { optimizedCache } from './optimizedCacheService';
import { rateLimitService } from './rateLimitService';
import { requestDeduplication } from './requestDeduplicationService';
import { ServiceResponse } from '../types/dataModels';

interface ApiClientOptions {
  // Caching options
  cache?: boolean;
  cacheTtl?: number;
  cacheKey?: string;

  // Rate limiting
  rateLimit?: boolean;
  rateLimitEndpoint?: string;

  // Deduplication
  dedupe?: boolean;
  dedupeTtl?: number;

  // Retry options
  retry?: boolean;
  maxRetries?: number;
  retryDelay?: number;
}

const DEFAULT_OPTIONS: Required<ApiClientOptions> = {
  cache: true,
  cacheTtl: 5 * 60 * 1000, // 5 minutes
  cacheKey: '',
  rateLimit: true,
  rateLimitEndpoint: 'default',
  dedupe: true,
  dedupeTtl: 100,
  retry: true,
  maxRetries: 3,
  retryDelay: 1000,
};

class OptimizedApiClient {
  private static instance: OptimizedApiClient;

  // Performance metrics
  private metrics = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    rateLimited: 0,
    deduplicated: 0,
    retries: 0,
    errors: 0,
  };

  private constructor() {}

  static getInstance(): OptimizedApiClient {
    if (!OptimizedApiClient.instance) {
      OptimizedApiClient.instance = new OptimizedApiClient();
    }
    return OptimizedApiClient.instance;
  }

  /**
   * Execute an API request with optimizations
   */
  async execute<T>(
    executor: () => Promise<ServiceResponse<T>>,
    options: ApiClientOptions = {}
  ): Promise<ServiceResponse<T>> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    this.metrics.totalRequests++;

    // Generate cache key if not provided
    const cacheKey = opts.cacheKey || this.generateCacheKey(executor);

    // 1. Check cache first
    if (opts.cache) {
      const cached = await optimizedCache.get<ServiceResponse<T>>(cacheKey);
      if (cached && cached.success) {
        this.metrics.cacheHits++;
        return cached;
      }
      this.metrics.cacheMisses++;
    }

    // 2. Check rate limit
    if (opts.rateLimit) {
      const allowed = await rateLimitService.acquire(opts.rateLimitEndpoint, 5000);
      if (!allowed) {
        this.metrics.rateLimited++;
        return {
          success: false,
          error: 'Rate limit exceeded. Please try again later.',
        };
      }
    }

    // 3. Execute with deduplication
    let result: ServiceResponse<T>;

    if (opts.dedupe) {
      result = await requestDeduplication.dedupe(
        cacheKey,
        () => this.executeWithRetry(executor, opts),
        opts.dedupeTtl
      );
    } else {
      result = await this.executeWithRetry(executor, opts);
    }

    // 4. Cache successful results
    if (opts.cache && result.success) {
      await optimizedCache.set(cacheKey, result, opts.cacheTtl);
    }

    return result;
  }

  /**
   * Execute multiple requests in parallel with optimizations
   */
  async executeMany<T>(
    requests: Array<{
      executor: () => Promise<ServiceResponse<T>>;
      options?: ApiClientOptions;
    }>
  ): Promise<ServiceResponse<T>[]> {
    return Promise.all(
      requests.map(({ executor, options }) => this.execute(executor, options))
    );
  }

  /**
   * Invalidate cache for a specific pattern
   */
  async invalidateCache(pattern: string): Promise<void> {
    await optimizedCache.invalidatePattern(pattern);
  }

  /**
   * Get performance metrics
   */
  getMetrics(): typeof this.metrics & {
    cacheHitRate: number;
    errorRate: number;
  } {
    const total = this.metrics.totalRequests;
    const cacheAttempts = this.metrics.cacheHits + this.metrics.cacheMisses;

    return {
      ...this.metrics,
      cacheHitRate: cacheAttempts > 0 ? this.metrics.cacheHits / cacheAttempts : 0,
      errorRate: total > 0 ? this.metrics.errors / total : 0,
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      rateLimited: 0,
      deduplicated: 0,
      retries: 0,
      errors: 0,
    };
  }

  // ============================================================================
  // Private methods
  // ============================================================================

  private async executeWithRetry<T>(
    executor: () => Promise<ServiceResponse<T>>,
    opts: Required<ApiClientOptions>
  ): Promise<ServiceResponse<T>> {
    let lastError: string = 'Unknown error';

    for (let attempt = 0; attempt <= (opts.retry ? opts.maxRetries : 0); attempt++) {
      try {
        const result = await executor();

        // Report success to rate limiter
        rateLimitService.reportSuccess();

        if (!result.success) {
          lastError = result.error || 'Request failed';

          // Don't retry on client errors
          if (this.isClientError(lastError)) {
            this.metrics.errors++;
            return result;
          }

          // Retry on server errors
          if (attempt < opts.maxRetries) {
            this.metrics.retries++;
            await this.sleep(opts.retryDelay * Math.pow(2, attempt));
            continue;
          }
        }

        return result;
      } catch (error: any) {
        lastError = error.message || 'Network error';
        this.metrics.errors++;

        // Report error to rate limiter for backoff
        rateLimitService.reportError(500);

        if (attempt < opts.maxRetries) {
          this.metrics.retries++;
          await this.sleep(opts.retryDelay * Math.pow(2, attempt));
          continue;
        }
      }
    }

    return {
      success: false,
      error: lastError,
    };
  }

  private generateCacheKey(executor: Function): string {
    // Generate a hash-like key from the function
    const funcString = executor.toString().slice(0, 200);
    let hash = 0;
    for (let i = 0; i < funcString.length; i++) {
      const char = funcString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `api_${Math.abs(hash).toString(36)}`;
  }

  private isClientError(error: string): boolean {
    const clientErrors = [
      'not found',
      'unauthorized',
      'forbidden',
      'invalid',
      'bad request',
      'validation',
    ];
    const lowerError = error.toLowerCase();
    return clientErrors.some(e => lowerError.includes(e));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const optimizedApiClient = OptimizedApiClient.getInstance();
export default optimizedApiClient;

// ============================================================================
// Convenience wrappers for common operations
// ============================================================================

/**
 * Fetch with caching and optimizations
 */
export async function optimizedFetch<T>(
  executor: () => Promise<ServiceResponse<T>>,
  options?: ApiClientOptions
): Promise<ServiceResponse<T>> {
  return optimizedApiClient.execute(executor, options);
}

/**
 * Fetch without caching (for mutations)
 */
export async function mutate<T>(
  executor: () => Promise<ServiceResponse<T>>,
  invalidatePatterns?: string[]
): Promise<ServiceResponse<T>> {
  const result = await optimizedApiClient.execute(executor, {
    cache: false,
    dedupe: false,
  });

  // Invalidate related caches
  if (result.success && invalidatePatterns) {
    for (const pattern of invalidatePatterns) {
      await optimizedApiClient.invalidateCache(pattern);
    }
  }

  return result;
}
