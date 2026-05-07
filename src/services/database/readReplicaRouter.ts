/**
 * Read Replica Router
 * Routes read queries to replicas, writes to primary
 *
 * Improves scalability by distributing read load across multiple databases
 * Supports automatic failover to primary if replica is unavailable
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

type QueryType = 'read' | 'write';

interface ReplicaConfig {
  url: string;
  anonKey: string;
  weight?: number; // For load balancing (1-10)
  healthy?: boolean;
}

interface ReplicaStats {
  queries: number;
  errors: number;
  lastError: number | null;
  avgLatency: number;
}

class ReadReplicaRouter {
  private static instance: ReadReplicaRouter;

  private primaryClient: SupabaseClient | null = null;
  private replicaClients: Map<string, SupabaseClient> = new Map();
  private replicaStats: Map<string, ReplicaStats> = new Map();
  private replicaConfigs: ReplicaConfig[] = [];

  private currentReplicaIndex = 0;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.loadConfiguration();
    this.startHealthChecks();
  }

  static getInstance(): ReadReplicaRouter {
    if (!ReadReplicaRouter.instance) {
      ReadReplicaRouter.instance = new ReadReplicaRouter();
    }
    return ReadReplicaRouter.instance;
  }

  /**
   * Get appropriate client for query type
   */
  getClient(queryType: QueryType = 'read'): SupabaseClient {
    // Always use primary for writes
    if (queryType === 'write') {
      return this.getPrimaryClient();
    }

    // Use replica for reads if available
    const replica = this.getHealthyReplica();
    return replica || this.getPrimaryClient();
  }

  /**
   * Execute query with automatic routing
   */
  async executeQuery<T>(
    queryType: QueryType,
    executor: (client: SupabaseClient) => Promise<T>
  ): Promise<T> {
    const client = this.getClient(queryType);
    const startTime = Date.now();

    try {
      const result = await executor(client);

      // Track success
      this.recordQuerySuccess(client, Date.now() - startTime);

      return result;
    } catch (error) {
      // Track error
      this.recordQueryError(client);

      // Retry on primary if replica failed
      if (queryType === 'read' && client !== this.primaryClient) {
        console.warn('[ReadReplica] Replica failed, retrying on primary');
        return executor(this.getPrimaryClient());
      }

      throw error;
    }
  }

  /**
   * Get replica statistics
   */
  getStats(): Record<string, ReplicaStats> {
    const stats: Record<string, ReplicaStats> = {};

    for (const [name, stat] of this.replicaStats) {
      stats[name] = { ...stat };
    }

    return stats;
  }

  /**
   * Force health check on all replicas
   */
  async checkHealth(): Promise<void> {
    for (const [name, client] of this.replicaClients) {
      try {
        // Simple health check query
        await client.from('profiles').select('id').limit(1).single();

        // Mark as healthy
        const config = this.replicaConfigs.find(c => c.url === name);
        if (config) {
          config.healthy = true;
        }
      } catch (error) {
        console.error(`[ReadReplica] Health check failed for ${name}:`, error);

        // Mark as unhealthy
        const config = this.replicaConfigs.find(c => c.url === name);
        if (config) {
          config.healthy = false;
        }
      }
    }
  }

  // ============================================================================
  // Private methods
  // ============================================================================

  private loadConfiguration(): void {
    // Load primary client (always required)
    const primaryUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const primaryKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    if (!primaryUrl || !primaryKey) {
      throw new Error('Primary database configuration missing');
    }

    this.primaryClient = createClient(primaryUrl, primaryKey, {
      auth: {
        ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
        autoRefreshToken: true,
        persistSession: true,
      },
    });

    // Load replica configurations from environment
    // Format: EXPO_PUBLIC_REPLICA_1_URL, EXPO_PUBLIC_REPLICA_1_KEY, etc.
    for (let i = 1; i <= 5; i++) {
      const replicaUrl = process.env[`EXPO_PUBLIC_REPLICA_${i}_URL`];
      const replicaKey = process.env[`EXPO_PUBLIC_REPLICA_${i}_KEY`];

      if (replicaUrl && replicaKey) {
        this.replicaConfigs.push({
          url: replicaUrl,
          anonKey: replicaKey,
          weight: 1,
          healthy: true,
        });

        const client = createClient(replicaUrl, replicaKey, {
          auth: {
            ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
            autoRefreshToken: true,
            persistSession: true,
          },
        });

        this.replicaClients.set(replicaUrl, client);
        this.replicaStats.set(replicaUrl, {
          queries: 0,
          errors: 0,
          lastError: null,
          avgLatency: 0,
        });

        console.log(`[ReadReplica] Configured replica ${i}: ${replicaUrl}`);
      }
    }

    if (this.replicaClients.size === 0) {
      console.log('[ReadReplica] No replicas configured, using primary for all queries');
    }
  }

  private getPrimaryClient(): SupabaseClient {
    if (!this.primaryClient) {
      throw new Error('Primary client not initialized');
    }
    return this.primaryClient;
  }

  private getHealthyReplica(): SupabaseClient | null {
    const healthyReplicas = this.replicaConfigs.filter(r => r.healthy !== false);

    if (healthyReplicas.length === 0) {
      return null;
    }

    // Round-robin load balancing
    const config = healthyReplicas[this.currentReplicaIndex % healthyReplicas.length];
    this.currentReplicaIndex++;

    return this.replicaClients.get(config.url) || null;
  }


  private recordQuerySuccess(client: SupabaseClient, latencyMs: number): void {
    // Find which replica/primary was used
    for (const [url, replicaClient] of this.replicaClients) {
      if (replicaClient === client) {
        const stats = this.replicaStats.get(url);
        if (stats) {
          stats.queries++;
          stats.avgLatency = (stats.avgLatency * (stats.queries - 1) + latencyMs) / stats.queries;
        }
        return;
      }
    }
  }

  private recordQueryError(client: SupabaseClient): void {
    for (const [url, replicaClient] of this.replicaClients) {
      if (replicaClient === client) {
        const stats = this.replicaStats.get(url);
        if (stats) {
          stats.errors++;
          stats.lastError = Date.now();
        }

        // Mark as unhealthy if too many errors
        if (stats && stats.errors > 5) {
          const config = this.replicaConfigs.find(c => c.url === url);
          if (config) {
            config.healthy = false;
          }
        }
        return;
      }
    }
  }

  private startHealthChecks(): void {
    // Check replica health every 30 seconds
    this.healthCheckInterval = setInterval(() => {
      this.checkHealth();
    }, 30000);
  }

  /**
   * Cleanup (call on app unmount)
   */
  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }
}

export const readReplicaRouter = ReadReplicaRouter.getInstance();
export default readReplicaRouter;
