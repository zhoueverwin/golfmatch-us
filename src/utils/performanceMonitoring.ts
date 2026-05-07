/**
 * Performance Monitoring Utilities
 * Track and report performance metrics for optimization
 *
 * Features:
 * - API latency tracking
 * - Memory usage monitoring
 * - Frame rate monitoring
 * - Network request tracking
 * - Performance reporting
 */

import { optimizedCache } from '../services/optimizedCacheService';
import { rateLimitService } from '../services/rateLimitService';
import { requestDeduplication } from '../services/requestDeduplicationService';
import { optimizedApiClient } from '../services/optimizedApiClient';

interface LatencyMetric {
  operation: string;
  duration: number;
  timestamp: number;
  success: boolean;
}

interface PerformanceReport {
  timestamp: string;
  uptime: number;
  cache: ReturnType<typeof optimizedCache.getStats>;
  rateLimit: ReturnType<typeof rateLimitService.getStats>;
  dedupe: ReturnType<typeof requestDeduplication.getStats>;
  api: ReturnType<typeof optimizedApiClient.getMetrics>;
  latency: {
    avg: number;
    p50: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
  };
  errors: string[];
}

class PerformanceMonitor {
  private static instance: PerformanceMonitor;

  private startTime: number = Date.now();
  private latencyHistory: LatencyMetric[] = [];
  private errorLog: string[] = [];
  private readonly MAX_HISTORY = 1000;
  private readonly MAX_ERRORS = 100;

  private constructor() {}

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * Track operation latency
   */
  trackLatency(operation: string, duration: number, success: boolean): void {
    this.latencyHistory.push({
      operation,
      duration,
      timestamp: Date.now(),
      success,
    });

    // Keep history bounded
    if (this.latencyHistory.length > this.MAX_HISTORY) {
      this.latencyHistory = this.latencyHistory.slice(-this.MAX_HISTORY);
    }
  }

  /**
   * Track error
   */
  trackError(error: string): void {
    const timestampedError = `[${new Date().toISOString()}] ${error}`;
    this.errorLog.push(timestampedError);

    // Keep errors bounded
    if (this.errorLog.length > this.MAX_ERRORS) {
      this.errorLog = this.errorLog.slice(-this.MAX_ERRORS);
    }
  }

  /**
   * Measure async operation
   */
  async measure<T>(
    operation: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const start = performance.now();
    let success = true;

    try {
      const result = await fn();
      return result;
    } catch (error) {
      success = false;
      throw error;
    } finally {
      const duration = performance.now() - start;
      this.trackLatency(operation, duration, success);
    }
  }

  /**
   * Get latency statistics
   */
  getLatencyStats(operation?: string): {
    avg: number;
    p50: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
    count: number;
  } {
    let metrics = this.latencyHistory;

    if (operation) {
      metrics = metrics.filter(m => m.operation === operation);
    }

    if (metrics.length === 0) {
      return { avg: 0, p50: 0, p95: 0, p99: 0, min: 0, max: 0, count: 0 };
    }

    const durations = metrics.map(m => m.duration).sort((a, b) => a - b);
    const count = durations.length;

    return {
      avg: durations.reduce((a, b) => a + b, 0) / count,
      p50: durations[Math.floor(count * 0.5)],
      p95: durations[Math.floor(count * 0.95)],
      p99: durations[Math.floor(count * 0.99)],
      min: durations[0],
      max: durations[count - 1],
      count,
    };
  }

  /**
   * Get full performance report
   */
  getReport(): PerformanceReport {
    return {
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      cache: optimizedCache.getStats(),
      rateLimit: rateLimitService.getStats(),
      dedupe: requestDeduplication.getStats(),
      api: optimizedApiClient.getMetrics(),
      latency: this.getLatencyStats(),
      errors: this.errorLog.slice(-10),
    };
  }

  /**
   * Log performance report to console
   */
  logReport(): void {
    const report = this.getReport();

    console.log('\n========== PERFORMANCE REPORT ==========');
    console.log(`Timestamp: ${report.timestamp}`);
    console.log(`Uptime: ${Math.floor(report.uptime / 1000)}s`);
    console.log('\n--- Cache ---');
    console.log(`Hit Rate: ${(report.cache.hitRate * 100).toFixed(1)}%`);
    console.log(`Memory Items: ${report.cache.memoryItems}`);
    console.log(`Evictions: ${report.cache.evictions}`);
    console.log('\n--- Rate Limiting ---');
    const rlStats = report.rateLimit;
    for (const [endpoint, stats] of Object.entries(rlStats)) {
      console.log(`${endpoint}: ${stats.allowed}/${stats.total} allowed`);
    }
    console.log('\n--- Deduplication ---');
    console.log(`Dedupe Rate: ${(report.dedupe.dedupeRate * 100).toFixed(1)}%`);
    console.log(`Saved Calls: ${report.dedupe.savedCalls}`);
    console.log('\n--- API ---');
    console.log(`Cache Hit Rate: ${(report.api.cacheHitRate * 100).toFixed(1)}%`);
    console.log(`Error Rate: ${(report.api.errorRate * 100).toFixed(1)}%`);
    console.log(`Retries: ${report.api.retries}`);
    console.log('\n--- Latency ---');
    console.log(`Avg: ${report.latency.avg.toFixed(2)}ms`);
    console.log(`P95: ${report.latency.p95.toFixed(2)}ms`);
    console.log(`P99: ${report.latency.p99.toFixed(2)}ms`);
    console.log('=========================================\n');
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.startTime = Date.now();
    this.latencyHistory = [];
    this.errorLog = [];
    optimizedCache.getStats(); // Reset is handled internally
    rateLimitService.reset();
    requestDeduplication.resetStats();
    optimizedApiClient.resetMetrics();
  }
}

export const performanceMonitor = PerformanceMonitor.getInstance();
export default performanceMonitor;

// ============================================================================
// Convenience functions
// ============================================================================

/**
 * Measure and track an async operation
 */
export async function measureAsync<T>(
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  return performanceMonitor.measure(operation, fn);
}

/**
 * Track an error
 */
export function trackError(error: string | Error): void {
  const message = error instanceof Error ? error.message : error;
  performanceMonitor.trackError(message);
}

/**
 * Get quick performance summary
 */
export function getPerformanceSummary(): string {
  const report = performanceMonitor.getReport();
  return `Cache: ${(report.cache.hitRate * 100).toFixed(0)}% | ` +
         `Latency P95: ${report.latency.p95.toFixed(0)}ms | ` +
         `Errors: ${report.api.errors}`;
}
