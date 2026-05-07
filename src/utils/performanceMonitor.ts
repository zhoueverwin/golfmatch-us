/**
 * Performance Monitoring Utility
 * 
 * Provides tools for tracking and logging performance metrics including:
 * - API response times
 * - Component render durations
 * - Query cache hit/miss rates
 * - Memory usage tracking
 */

interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: number;
  metadata?: Record<string, any>;
}

interface QueryCacheMetrics {
  hits: number;
  misses: number;
  hitRate: number;
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private queryCacheHits: number = 0;
  private queryCacheMisses: number = 0;
  private isEnabled: boolean = __DEV__; // Only enable in development by default

  /**
   * Enable or disable performance monitoring
   */
  setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
  }

  /**
   * Start tracking a performance metric
   * Returns a function to call when the operation completes
   */
  startTracking(name: string, metadata?: Record<string, any>): () => void {
    if (!this.isEnabled) {
      return () => {}; // No-op if disabled
    }

    const startTime = performance.now();
    const timestamp = Date.now();

    return () => {
      const duration = performance.now() - startTime;
      this.recordMetric({
        name,
        duration,
        timestamp,
        metadata,
      });
    };
  }

  /**
   * Record a performance metric
   */
  private recordMetric(metric: PerformanceMetric) {
    this.metrics.push(metric);

    // Log to console in development
    if (__DEV__) {
      console.log(
        `[Performance] ${metric.name}: ${metric.duration.toFixed(2)}ms`,
        metric.metadata || ''
      );
    }

    // Keep only last 100 metrics to avoid memory issues
    if (this.metrics.length > 100) {
      this.metrics.shift();
    }
  }

  /**
   * Track React Query cache hit
   */
  recordCacheHit() {
    if (!this.isEnabled) return;
    this.queryCacheHits++;
    if (__DEV__) {
      console.log(`[Performance] Query Cache Hit (Total: ${this.queryCacheHits})`);
    }
  }

  /**
   * Track React Query cache miss
   */
  recordCacheMiss() {
    if (!this.isEnabled) return;
    this.queryCacheMisses++;
    if (__DEV__) {
      console.log(`[Performance] Query Cache Miss (Total: ${this.queryCacheMisses})`);
    }
  }

  /**
   * Get query cache metrics
   */
  getQueryCacheMetrics(): QueryCacheMetrics {
    const total = this.queryCacheHits + this.queryCacheMisses;
    const hitRate = total > 0 ? (this.queryCacheHits / total) * 100 : 0;

    return {
      hits: this.queryCacheHits,
      misses: this.queryCacheMisses,
      hitRate,
    };
  }

  /**
   * Get all recorded metrics
   */
  getMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  /**
   * Get average duration for a specific metric name
   */
  getAverageDuration(name: string): number {
    const filtered = this.metrics.filter(m => m.name === name);
    if (filtered.length === 0) return 0;

    const total = filtered.reduce((sum, m) => sum + m.duration, 0);
    return total / filtered.length;
  }

  /**
   * Get metrics summary
   */
  getSummary(): {
    totalMetrics: number;
    averages: Record<string, number>;
    cacheMetrics: QueryCacheMetrics;
  } {
    const uniqueNames = Array.from(new Set(this.metrics.map(m => m.name)));
    const averages: Record<string, number> = {};

    uniqueNames.forEach(name => {
      averages[name] = this.getAverageDuration(name);
    });

    return {
      totalMetrics: this.metrics.length,
      averages,
      cacheMetrics: this.getQueryCacheMetrics(),
    };
  }

  /**
   * Log performance summary to console
   */
  logSummary() {
    if (!this.isEnabled) return;

    const summary = this.getSummary();
    console.log('=== Performance Summary ===');
    console.log(`Total Metrics: ${summary.totalMetrics}`);
    console.log('\nAverage Durations:');
    Object.entries(summary.averages).forEach(([name, avg]) => {
      console.log(`  ${name}: ${avg.toFixed(2)}ms`);
    });
    console.log('\nQuery Cache Metrics:');
    console.log(`  Hits: ${summary.cacheMetrics.hits}`);
    console.log(`  Misses: ${summary.cacheMetrics.misses}`);
    console.log(`  Hit Rate: ${summary.cacheMetrics.hitRate.toFixed(2)}%`);
    console.log('=========================');
  }

  /**
   * Clear all metrics
   */
  clear() {
    this.metrics = [];
    this.queryCacheHits = 0;
    this.queryCacheMisses = 0;
  }

  /**
   * Track API request performance
   */
  trackApiRequest(endpoint: string, method: string = 'GET'): () => void {
    return this.startTracking('API Request', {
      endpoint,
      method,
    });
  }

  /**
   * Track component render performance
   */
  trackComponentRender(componentName: string): () => void {
    return this.startTracking('Component Render', {
      component: componentName,
    });
  }

  /**
   * Track image loading performance
   */
  trackImageLoad(imageUrl: string): () => void {
    return this.startTracking('Image Load', {
      url: imageUrl,
    });
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Export helper functions for easier use
export const trackApiRequest = (endpoint: string, method?: string) =>
  performanceMonitor.trackApiRequest(endpoint, method);

export const trackComponentRender = (componentName: string) =>
  performanceMonitor.trackComponentRender(componentName);

export const trackImageLoad = (imageUrl: string) =>
  performanceMonitor.trackImageLoad(imageUrl);

export const logPerformanceSummary = () =>
  performanceMonitor.logSummary();

export default performanceMonitor;

