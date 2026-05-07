/**
 * Rate Limiting Service
 * Prevents API abuse and ensures fair usage at scale
 *
 * Features:
 * - Token bucket algorithm for smooth rate limiting
 * - Per-endpoint rate limits
 * - Request queuing for burst handling
 * - Automatic backoff on server errors
 */

interface RateLimitConfig {
  maxTokens: number;      // Maximum tokens in bucket
  refillRate: number;     // Tokens added per second
  refillInterval: number; // Interval in ms
}

interface RateLimitBucket {
  tokens: number;
  lastRefill: number;
  queue: Array<{
    resolve: (value: boolean) => void;
    timestamp: number;
  }>;
}

interface RequestStats {
  total: number;
  allowed: number;
  throttled: number;
  queued: number;
}

// Default rate limits per endpoint category
const DEFAULT_LIMITS: Record<string, RateLimitConfig> = {
  // High frequency endpoints (feed scrolling)
  posts: { maxTokens: 30, refillRate: 10, refillInterval: 1000 },

  // Medium frequency (interactions)
  reactions: { maxTokens: 20, refillRate: 5, refillInterval: 1000 },
  likes: { maxTokens: 15, refillRate: 3, refillInterval: 1000 },
  messages: { maxTokens: 30, refillRate: 10, refillInterval: 1000 },

  // Low frequency (profile updates)
  profile: { maxTokens: 10, refillRate: 2, refillInterval: 1000 },
  upload: { maxTokens: 5, refillRate: 1, refillInterval: 1000 },

  // Default for unspecified endpoints
  default: { maxTokens: 20, refillRate: 5, refillInterval: 1000 },
};

class RateLimitService {
  private static instance: RateLimitService;
  private buckets: Map<string, RateLimitBucket> = new Map();
  private stats: Map<string, RequestStats> = new Map();
  private backoffUntil: number = 0;
  private backoffMultiplier: number = 1;

  private constructor() {
    // Start refill interval
    setInterval(() => this.refillAllBuckets(), 1000);
  }

  static getInstance(): RateLimitService {
    if (!RateLimitService.instance) {
      RateLimitService.instance = new RateLimitService();
    }
    return RateLimitService.instance;
  }

  /**
   * Check if request is allowed (non-blocking)
   */
  isAllowed(endpoint: string): boolean {
    // Check global backoff
    if (Date.now() < this.backoffUntil) {
      this.recordStat(endpoint, 'throttled');
      return false;
    }

    const bucket = this.getOrCreateBucket(endpoint);
    this.refillBucket(bucket, endpoint);

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      this.recordStat(endpoint, 'allowed');
      return true;
    }

    this.recordStat(endpoint, 'throttled');
    return false;
  }

  /**
   * Acquire permission to make request (blocking with queue)
   * Returns true when allowed, false if timeout exceeded
   */
  async acquire(endpoint: string, timeoutMs: number = 5000): Promise<boolean> {
    // Check global backoff
    if (Date.now() < this.backoffUntil) {
      const waitTime = this.backoffUntil - Date.now();
      if (waitTime > timeoutMs) {
        this.recordStat(endpoint, 'throttled');
        return false;
      }
      await this.sleep(waitTime);
    }

    const bucket = this.getOrCreateBucket(endpoint);
    this.refillBucket(bucket, endpoint);

    // If tokens available, consume and return
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      this.recordStat(endpoint, 'allowed');
      return true;
    }

    // Queue the request
    return new Promise((resolve) => {
      const request = {
        resolve,
        timestamp: Date.now(),
      };

      bucket.queue.push(request);
      this.recordStat(endpoint, 'queued');

      // Set timeout
      setTimeout(() => {
        const index = bucket.queue.indexOf(request);
        if (index !== -1) {
          bucket.queue.splice(index, 1);
          this.recordStat(endpoint, 'throttled');
          resolve(false);
        }
      }, timeoutMs);
    });
  }

  /**
   * Report server error for backoff calculation
   */
  reportError(statusCode: number): void {
    if (statusCode === 429 || statusCode >= 500) {
      // Exponential backoff
      const backoffTime = Math.min(1000 * this.backoffMultiplier, 30000);
      this.backoffUntil = Date.now() + backoffTime;
      this.backoffMultiplier = Math.min(this.backoffMultiplier * 2, 32);

      console.warn(`[RateLimit] Backing off for ${backoffTime}ms due to ${statusCode}`);
    }
  }

  /**
   * Report successful request (reset backoff)
   */
  reportSuccess(): void {
    this.backoffMultiplier = 1;
  }

  /**
   * Get rate limit stats for monitoring
   */
  getStats(): Record<string, RequestStats> {
    const result: Record<string, RequestStats> = {};
    for (const [endpoint, stats] of this.stats) {
      result[endpoint] = { ...stats };
    }
    return result;
  }

  /**
   * Get current token count for endpoint
   */
  getTokens(endpoint: string): number {
    const bucket = this.buckets.get(endpoint);
    return bucket?.tokens ?? this.getConfig(endpoint).maxTokens;
  }

  /**
   * Reset all rate limits (for testing)
   */
  reset(): void {
    this.buckets.clear();
    this.stats.clear();
    this.backoffUntil = 0;
    this.backoffMultiplier = 1;
  }

  // ============================================================================
  // Private methods
  // ============================================================================

  private getOrCreateBucket(endpoint: string): RateLimitBucket {
    let bucket = this.buckets.get(endpoint);
    if (!bucket) {
      const config = this.getConfig(endpoint);
      bucket = {
        tokens: config.maxTokens,
        lastRefill: Date.now(),
        queue: [],
      };
      this.buckets.set(endpoint, bucket);
    }
    return bucket;
  }

  private getConfig(endpoint: string): RateLimitConfig {
    // Find matching config
    for (const [key, config] of Object.entries(DEFAULT_LIMITS)) {
      if (endpoint.includes(key)) {
        return config;
      }
    }
    return DEFAULT_LIMITS.default;
  }

  private refillBucket(bucket: RateLimitBucket, endpoint: string): void {
    const config = this.getConfig(endpoint);
    const now = Date.now();
    const timePassed = now - bucket.lastRefill;
    const tokensToAdd = (timePassed / 1000) * config.refillRate;

    if (tokensToAdd >= 1) {
      bucket.tokens = Math.min(bucket.tokens + Math.floor(tokensToAdd), config.maxTokens);
      bucket.lastRefill = now;

      // Process queued requests
      while (bucket.queue.length > 0 && bucket.tokens >= 1) {
        const request = bucket.queue.shift();
        if (request) {
          bucket.tokens -= 1;
          this.recordStat(endpoint, 'allowed');
          request.resolve(true);
        }
      }
    }
  }

  private refillAllBuckets(): void {
    for (const [endpoint, bucket] of this.buckets) {
      this.refillBucket(bucket, endpoint);
    }
  }

  private recordStat(endpoint: string, type: 'allowed' | 'throttled' | 'queued'): void {
    let stats = this.stats.get(endpoint);
    if (!stats) {
      stats = { total: 0, allowed: 0, throttled: 0, queued: 0 };
      this.stats.set(endpoint, stats);
    }

    stats.total++;
    stats[type]++;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const rateLimitService = RateLimitService.getInstance();
export default rateLimitService;
