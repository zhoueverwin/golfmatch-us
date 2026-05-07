/**
 * Background Job Queue
 * Handles asynchronous tasks without blocking the UI
 *
 * Features:
 * - Priority queue for job scheduling
 * - Retry with exponential backoff
 * - Job persistence across app restarts
 * - Concurrency control
 * - Dead letter queue for failed jobs
 *
 * Can be upgraded to server-side processing (BullMQ, Inngest) for 100k+ users
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureError } from './monitoring/sentryService';

export type JobPriority = 'critical' | 'high' | 'normal' | 'low';
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'dead';

export interface Job<T = any> {
  id: string;
  type: string;
  priority: JobPriority;
  data: T;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  processedAt: number | null;
  completedAt: number | null;
  error: string | null;
  nextRetryAt: number | null;
}

interface JobHandler<T = any> {
  (data: T, job: Job<T>): Promise<void>;
}

interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  dead: number;
  avgProcessingTime: number;
}

class BackgroundJobQueue {
  private static instance: BackgroundJobQueue;

  private readonly STORAGE_KEY = '@gm_jobs:queue';
  private readonly DEAD_LETTER_KEY = '@gm_jobs:dead';

  private jobs: Map<string, Job> = new Map();
  private handlers: Map<string, JobHandler> = new Map();
  private processing: Set<string> = new Set();

  private maxConcurrent = 3;
  private isProcessing = false;
  private processingInterval: NodeJS.Timeout | null = null;

  // Stats
  private stats = {
    totalProcessed: 0,
    totalFailed: 0,
    totalCompleted: 0,
    processingTimeSum: 0,
  };

  private constructor() {
    this.loadJobs();
    this.startProcessing();
  }

  static getInstance(): BackgroundJobQueue {
    if (!BackgroundJobQueue.instance) {
      BackgroundJobQueue.instance = new BackgroundJobQueue();
    }
    return BackgroundJobQueue.instance;
  }

  /**
   * Register a job handler
   */
  registerHandler<T = any>(jobType: string, handler: JobHandler<T>): void {
    this.handlers.set(jobType, handler);
  }

  /**
   * Add job to queue
   */
  async addJob<T = any>(
    type: string,
    data: T,
    options: {
      priority?: JobPriority;
      maxAttempts?: number;
      delayMs?: number;
    } = {}
  ): Promise<string> {
    const job: Job<T> = {
      id: this.generateId(),
      type,
      priority: options.priority || 'normal',
      data,
      status: 'pending',
      attempts: 0,
      maxAttempts: options.maxAttempts || 3,
      createdAt: Date.now(),
      processedAt: null,
      completedAt: null,
      error: null,
      nextRetryAt: options.delayMs ? Date.now() + options.delayMs : null,
    };

    this.jobs.set(job.id, job);
    await this.persistJobs();

    return job.id;
  }

  /**
   * Get job status
   */
  getJob(jobId: string): Job | null {
    return this.jobs.get(jobId) || null;
  }

  /**
   * Get queue statistics
   */
  getQueueStats(): QueueStats {
    const stats: QueueStats = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      dead: 0,
      avgProcessingTime: this.stats.totalProcessed > 0
        ? this.stats.processingTimeSum / this.stats.totalProcessed
        : 0,
    };

    for (const job of this.jobs.values()) {
      stats[job.status]++;
    }

    return stats;
  }

  /**
   * Clear completed jobs (cleanup)
   */
  async clearCompleted(): Promise<number> {
    const completedIds: string[] = [];

    for (const [id, job] of this.jobs) {
      if (job.status === 'completed' && job.completedAt) {
        // Keep jobs for 1 hour after completion
        if (Date.now() - job.completedAt > 3600000) {
          completedIds.push(id);
        }
      }
    }

    for (const id of completedIds) {
      this.jobs.delete(id);
    }

    if (completedIds.length > 0) {
      await this.persistJobs();
    }

    return completedIds.length;
  }

  /**
   * Get dead letter queue
   */
  async getDeadLetterQueue(): Promise<Job[]> {
    try {
      const stored = await AsyncStorage.getItem(this.DEAD_LETTER_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {}
    return [];
  }

  /**
   * Retry a dead job
   */
  async retryDeadJob(jobId: string): Promise<boolean> {
    const deadJobs = await this.getDeadLetterQueue();
    const jobIndex = deadJobs.findIndex(j => j.id === jobId);

    if (jobIndex === -1) return false;

    const job = deadJobs[jobIndex];
    job.status = 'pending';
    job.attempts = 0;
    job.error = null;
    job.nextRetryAt = null;

    this.jobs.set(job.id, job);
    deadJobs.splice(jobIndex, 1);

    await AsyncStorage.setItem(this.DEAD_LETTER_KEY, JSON.stringify(deadJobs));
    await this.persistJobs();

    return true;
  }

  // ============================================================================
  // Private processing methods
  // ============================================================================

  private startProcessing(): void {
    // Process jobs every 1 second
    this.processingInterval = setInterval(() => {
      this.processJobs();
    }, 1000);
  }

  private async processJobs(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Get jobs ready to process
      const readyJobs = this.getReadyJobs();

      // Process up to maxConcurrent jobs
      const jobsToProcess = readyJobs.slice(0, this.maxConcurrent - this.processing.size);

      await Promise.all(
        jobsToProcess.map(job => this.processJob(job))
      );
    } finally {
      this.isProcessing = false;
    }
  }

  private getReadyJobs(): Job[] {
    const now = Date.now();
    const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };

    return Array.from(this.jobs.values())
      .filter(job =>
        job.status === 'pending' &&
        !this.processing.has(job.id) &&
        (job.nextRetryAt === null || job.nextRetryAt <= now)
      )
      .sort((a, b) => {
        // Sort by priority first, then by creation time
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        return priorityDiff !== 0 ? priorityDiff : a.createdAt - b.createdAt;
      });
  }

  private async processJob(job: Job): Promise<void> {
    const handler = this.handlers.get(job.type);
    if (!handler) {
      console.error(`[JobQueue] No handler registered for job type: ${job.type}`);
      job.status = 'failed';
      job.error = 'No handler registered';
      await this.persistJobs();
      return;
    }

    this.processing.add(job.id);
    job.status = 'processing';
    job.processedAt = Date.now();
    job.attempts++;

    const startTime = Date.now();

    try {
      await handler(job.data, job);

      // Success
      job.status = 'completed';
      job.completedAt = Date.now();
      job.error = null;

      this.stats.totalCompleted++;
      this.stats.totalProcessed++;
      this.stats.processingTimeSum += Date.now() - startTime;
    } catch (error: any) {
      // Failure
      const errorMessage = error.message || 'Unknown error';
      job.error = errorMessage;

      // Retry or mark as dead
      if (job.attempts >= job.maxAttempts) {
        job.status = 'dead';
        await this.moveToDeadLetterQueue(job);
        this.stats.totalFailed++;

        // Report to Sentry
        captureError(error, {
          tags: { job_type: job.type, job_id: job.id },
          extra: { job_data: job.data, attempts: job.attempts },
          level: 'error',
        });
      } else {
        job.status = 'pending';
        // Exponential backoff
        const backoffMs = Math.min(1000 * Math.pow(2, job.attempts), 60000);
        job.nextRetryAt = Date.now() + backoffMs;

        this.stats.totalFailed++;
      }
    } finally {
      this.processing.delete(job.id);
      await this.persistJobs();
    }
  }

  private async moveToDeadLetterQueue(job: Job): Promise<void> {
    this.jobs.delete(job.id);

    try {
      const deadJobs = await this.getDeadLetterQueue();
      deadJobs.push(job);

      // Keep only last 100 dead jobs
      const trimmed = deadJobs.slice(-100);
      await AsyncStorage.setItem(this.DEAD_LETTER_KEY, JSON.stringify(trimmed));
    } catch (error) {
      console.error('[JobQueue] Failed to save to dead letter queue:', error);
    }
  }

  private async persistJobs(): Promise<void> {
    try {
      const jobsArray = Array.from(this.jobs.values());
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(jobsArray));
    } catch (error) {
      console.error('[JobQueue] Failed to persist jobs:', error);
    }
  }

  private async loadJobs(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const jobsArray: Job[] = JSON.parse(stored);
        for (const job of jobsArray) {
          // Reset processing jobs to pending
          if (job.status === 'processing') {
            job.status = 'pending';
          }
          this.jobs.set(job.id, job);
        }
        console.log(`[JobQueue] Loaded ${jobsArray.length} persisted jobs`);
      }
    } catch (error) {
      console.error('[JobQueue] Failed to load jobs:', error);
    }
  }

  private generateId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cleanup on app shutdown
   */
  async shutdown(): Promise<void> {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }

    // Wait for processing jobs to complete (with timeout)
    const timeout = Date.now() + 5000;
    while (this.processing.size > 0 && Date.now() < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    await this.persistJobs();
  }
}

export const backgroundJobQueue = BackgroundJobQueue.getInstance();
export default backgroundJobQueue;

// ============================================================================
// Common job types
// ============================================================================

/**
 * Register common job handlers
 */
export function registerCommonHandlers(): void {
  // Image upload job
  backgroundJobQueue.registerHandler('image_upload', async (data: {
    userId: string;
    fileUri: string;
    uploadType: 'profile' | 'post' | 'kyc';
  }) => {
    const { default: storageService } = await import('../services/storageService');
    await storageService.uploadFile(data.fileUri, data.userId, 'image');
  });

  // Video upload job
  backgroundJobQueue.registerHandler('video_upload', async (data: {
    userId: string;
    fileUri: string;
  }) => {
    const { default: storageService } = await import('../services/storageService');
    await storageService.uploadVideo(data.fileUri, data.userId);
  });

  // Cache warming job
  backgroundJobQueue.registerHandler('cache_warm', async (data: {
    keys: string[];
  }) => {
    // Warm up cache with frequently accessed data
    console.log('[JobQueue] Warming cache for keys:', data.keys);
  });

  // Analytics job
  backgroundJobQueue.registerHandler('analytics', async (data: {
    event: string;
    properties: Record<string, any>;
  }) => {
    // Send analytics event
    console.log('[JobQueue] Tracking analytics:', data.event);
  });
}
