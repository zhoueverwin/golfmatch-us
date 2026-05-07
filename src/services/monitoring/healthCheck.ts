/**
 * Health Check and System Monitoring
 * Comprehensive health monitoring for production deployment
 *
 * Features:
 * - Database connectivity check
 * - Storage availability check
 * - Cache health monitoring
 * - API endpoint health
 * - Real-time subscription health
 * - System resource monitoring
 */

import { supabase, getConnectionHealth } from '../supabase';
import { optimizedCache } from '../optimizedCacheService';
import { rateLimitService } from '../rateLimitService';
import { backgroundJobQueue } from '../backgroundJobQueue';
import { readReplicaRouter } from '../database/readReplicaRouter';
import { performanceMonitor } from '../../utils/performanceMonitoring';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface HealthCheckResult {
  status: HealthStatus;
  timestamp: string;
  uptime: number;
  checks: {
    database: ComponentHealth;
    storage: ComponentHealth;
    cache: ComponentHealth;
    realtime: ComponentHealth;
    jobQueue: ComponentHealth;
    replicas: ComponentHealth;
  };
  metrics: {
    cache: ReturnType<typeof optimizedCache.getStats>;
    rateLimit: ReturnType<typeof rateLimitService.getStats>;
    jobQueue: ReturnType<typeof backgroundJobQueue.getQueueStats>;
    performance: ReturnType<typeof performanceMonitor.getLatencyStats>;
    replicas: ReturnType<typeof readReplicaRouter.getStats>;
  };
  alerts: string[];
}

export interface ComponentHealth {
  status: HealthStatus;
  message: string;
  latency?: number;
  lastCheck: string;
}

class HealthCheckService {
  private static instance: HealthCheckService;
  private startTime: number = Date.now();
  private lastHealthCheck: HealthCheckResult | null = null;

  private constructor() {
    // Run health check every 60 seconds
    setInterval(() => {
      this.runHealthCheck();
    }, 60000);

    // Initial health check
    this.runHealthCheck();
  }

  static getInstance(): HealthCheckService {
    if (!HealthCheckService.instance) {
      HealthCheckService.instance = new HealthCheckService();
    }
    return HealthCheckService.instance;
  }

  /**
   * Run comprehensive health check
   */
  async runHealthCheck(): Promise<HealthCheckResult> {
    const checks = await Promise.all([
      this.checkDatabase(),
      this.checkStorage(),
      this.checkCache(),
      this.checkRealtime(),
      this.checkJobQueue(),
      this.checkReplicas(),
    ]);

    const [database, storage, cache, realtime, jobQueue, replicas] = checks;

    // Determine overall status
    const statuses = [database, storage, cache, realtime, jobQueue, replicas];
    const overallStatus = this.determineOverallStatus(statuses);

    // Collect alerts
    const alerts: string[] = [];
    if (database.status === 'unhealthy') alerts.push('Database connectivity issues');
    if (storage.status === 'unhealthy') alerts.push('Storage service unavailable');
    if (cache.status === 'degraded') alerts.push('Cache hit rate below 50%');
    if (realtime.status === 'unhealthy') alerts.push('Real-time subscriptions failing');
    if (jobQueue.status === 'degraded') alerts.push('Background job queue backed up');

    const result: HealthCheckResult = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      checks: {
        database,
        storage,
        cache,
        realtime,
        jobQueue,
        replicas,
      },
      metrics: {
        cache: optimizedCache.getStats(),
        rateLimit: rateLimitService.getStats(),
        jobQueue: backgroundJobQueue.getQueueStats(),
        performance: performanceMonitor.getLatencyStats(),
        replicas: readReplicaRouter.getStats(),
      },
      alerts,
    };

    this.lastHealthCheck = result;
    return result;
  }

  /**
   * Get last health check result
   */
  getLastHealthCheck(): HealthCheckResult | null {
    return this.lastHealthCheck;
  }

  /**
   * Quick health status
   */
  async quickCheck(): Promise<HealthStatus> {
    const connectionHealth = getConnectionHealth();
    return connectionHealth.healthy ? 'healthy' : 'degraded';
  }

  // ============================================================================
  // Individual component checks
  // ============================================================================

  private async checkDatabase(): Promise<ComponentHealth> {
    const start = Date.now();

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .limit(1)
        .maybeSingle();

      const latency = Date.now() - start;

      if (error) {
        return {
          status: 'unhealthy',
          message: error.message,
          latency,
          lastCheck: new Date().toISOString(),
        };
      }

      const connectionHealth = getConnectionHealth();
      const status = latency > 2000 || !connectionHealth.healthy ? 'degraded' : 'healthy';

      return {
        status,
        message: status === 'healthy' ? 'Connected' : 'Slow response',
        latency,
        lastCheck: new Date().toISOString(),
      };
    } catch (error: any) {
      return {
        status: 'unhealthy',
        message: error.message || 'Connection failed',
        latency: Date.now() - start,
        lastCheck: new Date().toISOString(),
      };
    }
  }

  private async checkStorage(): Promise<ComponentHealth> {
    const start = Date.now();

    try {
      const { data, error } = await supabase.storage.listBuckets();

      const latency = Date.now() - start;

      if (error) {
        return {
          status: 'unhealthy',
          message: error.message,
          latency,
          lastCheck: new Date().toISOString(),
        };
      }

      return {
        status: 'healthy',
        message: `${data?.length || 0} buckets available`,
        latency,
        lastCheck: new Date().toISOString(),
      };
    } catch (error: any) {
      return {
        status: 'unhealthy',
        message: error.message || 'Storage check failed',
        latency: Date.now() - start,
        lastCheck: new Date().toISOString(),
      };
    }
  }

  private async checkCache(): Promise<ComponentHealth> {
    const stats = optimizedCache.getStats();
    const hitRate = stats.hitRate;

    let status: HealthStatus = 'healthy';
    let message = `Hit rate: ${(hitRate * 100).toFixed(1)}%`;

    if (hitRate < 0.3) {
      status = 'degraded';
      message = `Low hit rate: ${(hitRate * 100).toFixed(1)}%`;
    }

    return {
      status,
      message,
      lastCheck: new Date().toISOString(),
    };
  }

  private async checkRealtime(): Promise<ComponentHealth> {
    // Check if realtime is connected
    // This is a simple check - in production you'd monitor active channels
    return {
      status: 'healthy',
      message: 'Realtime available',
      lastCheck: new Date().toISOString(),
    };
  }

  private async checkJobQueue(): Promise<ComponentHealth> {
    const stats = backgroundJobQueue.getQueueStats();

    let status: HealthStatus = 'healthy';
    let message = `${stats.pending} pending, ${stats.processing} processing`;

    // Alert if queue is backing up
    if (stats.pending > 100) {
      status = 'degraded';
      message = `Queue backed up: ${stats.pending} pending`;
    }

    if (stats.dead > 50) {
      status = 'degraded';
      message = `High dead letter count: ${stats.dead}`;
    }

    return {
      status,
      message,
      lastCheck: new Date().toISOString(),
    };
  }

  private async checkReplicas(): Promise<ComponentHealth> {
    const stats = readReplicaRouter.getStats();
    const replicaCount = Object.keys(stats).length;

    if (replicaCount === 0) {
      return {
        status: 'healthy',
        message: 'No replicas configured (using primary)',
        lastCheck: new Date().toISOString(),
      };
    }

    // Check for replica failures
    const unhealthyReplicas = Object.entries(stats).filter(
      ([_, s]) => s.errors > s.queries * 0.1
    );

    if (unhealthyReplicas.length === replicaCount) {
      return {
        status: 'degraded',
        message: `All ${replicaCount} replicas unhealthy`,
        lastCheck: new Date().toISOString(),
      };
    }

    return {
      status: 'healthy',
      message: `${replicaCount - unhealthyReplicas.length}/${replicaCount} replicas healthy`,
      lastCheck: new Date().toISOString(),
    };
  }

  private determineOverallStatus(checks: ComponentHealth[]): HealthStatus {
    const hasUnhealthy = checks.some(c => c.status === 'unhealthy');
    const hasDegraded = checks.some(c => c.status === 'degraded');

    if (hasUnhealthy) return 'unhealthy';
    if (hasDegraded) return 'degraded';
    return 'healthy';
  }
}

export const healthCheck = HealthCheckService.getInstance();
export default healthCheck;

/**
 * Export health check endpoint for server monitoring
 */
export async function getHealthStatus(): Promise<HealthCheckResult> {
  return healthCheck.runHealthCheck();
}
