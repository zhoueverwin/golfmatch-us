/**
 * Sentry APM and Error Tracking Service
 * Production-grade monitoring for 100k+ users
 *
 * Features:
 * - Error tracking with context
 * - Performance monitoring (traces, transactions)
 * - User feedback
 * - Release tracking
 * - Breadcrumbs for debugging
 * - Custom performance metrics
 */

import * as Sentry from '@sentry/react-native';
import { User } from '../../types/dataModels';

// Environment detection
const isDevelopment = __DEV__;
const isProduction = !__DEV__;

/**
 * Initialize Sentry
 * Call this in App.tsx before rendering
 */
export function initializeSentry(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

  if (!dsn) {
    console.warn('[Sentry] DSN not configured. Error tracking disabled.');
    return;
  }

  Sentry.init({
    dsn,

    // Performance Monitoring
    tracesSampleRate: isProduction ? 0.2 : 1.0, // 20% in prod, 100% in dev

    // Enable profiling
    profilesSampleRate: isProduction ? 0.1 : 1.0,

    // Environment
    environment: isDevelopment ? 'development' : 'production',

    // Release tracking
    release: process.env.EXPO_PUBLIC_APP_VERSION,
    dist: process.env.EXPO_PUBLIC_BUILD_NUMBER,

    // Integrations are configured automatically in React Native

    // Before send hook - sanitize sensitive data
    beforeSend: (event, hint) => {
      // Remove sensitive data
      if (event.request?.headers) {
        delete event.request.headers['Authorization'];
        delete event.request.headers['apikey'];
      }

      // Add custom context
      event.contexts = {
        ...event.contexts,
        app: {
          name: 'Golfmatch',
          version: process.env.EXPO_PUBLIC_APP_VERSION,
        },
      };

      return event;
    },

    // Sample rate for errors
    sampleRate: 1.0,

    // Enable auto session tracking
    enableAutoSessionTracking: true,

    // Session timeout
    sessionTrackingIntervalMillis: 10000,
  });

  console.log('[Sentry] Initialized successfully');
}

/**
 * Set user context for error tracking
 */
export function setUser(user: User | null): void {
  if (user) {
    Sentry.setUser({
      id: user.id,
      username: user.name,
      email: user.user_id, // Don't expose actual email
      segment: user.is_premium ? 'premium' : 'free',
    });
  } else {
    Sentry.setUser(null);
  }
}

/**
 * Track custom performance metric
 */
export function trackPerformance(
  operation: string,
  durationMs: number,
  data?: Record<string, any>
): void {
  Sentry.addBreadcrumb({
    category: 'performance',
    message: operation,
    level: 'info',
    data: {
      duration_ms: durationMs,
      ...data,
    },
  });
}

/**
 * Track API call performance
 */
export async function trackApiCall<T>(
  endpoint: string,
  method: string,
  fn: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();

  try {
    const result = await fn();

    // Log successful API call
    Sentry.addBreadcrumb({
      category: 'http',
      message: `${method} ${endpoint}`,
      level: 'info',
      data: {
        duration: Date.now() - startTime,
        status: 'success',
      },
    });

    return result;
  } catch (error: any) {
    // Capture error with context
    Sentry.captureException(error, {
      tags: {
        endpoint,
        method,
      },
      contexts: {
        api: {
          endpoint,
          method,
          duration: Date.now() - startTime,
        },
      },
    });

    throw error;
  }
}

/**
 * Track database query performance
 */
export function trackDatabaseQuery(
  table: string,
  operation: 'select' | 'insert' | 'update' | 'delete',
  durationMs: number,
  rowCount?: number
): void {
  Sentry.addBreadcrumb({
    category: 'database',
    message: `${operation.toUpperCase()} ${table}`,
    level: 'info',
    data: {
      table,
      operation,
      duration_ms: durationMs,
      row_count: rowCount,
    },
  });

  // Alert on slow queries (> 1 second)
  if (durationMs > 1000) {
    Sentry.captureMessage(`Slow database query: ${operation} ${table}`, {
      level: 'warning',
      tags: {
        table,
        operation,
      },
      extra: {
        duration_ms: durationMs,
        row_count: rowCount,
      },
    });
  }
}

/**
 * Track custom event
 */
export function trackEvent(
  category: string,
  action: string,
  label?: string,
  value?: number
): void {
  Sentry.addBreadcrumb({
    category,
    message: action,
    level: 'info',
    data: {
      label,
      value,
    },
  });
}

/**
 * Capture error with context
 */
export function captureError(
  error: Error | string,
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, any>;
    level?: 'fatal' | 'error' | 'warning' | 'info';
  }
): void {
  if (typeof error === 'string') {
    Sentry.captureMessage(error, context?.level || 'error');
  } else {
    Sentry.captureException(error, {
      tags: context?.tags,
      extra: context?.extra,
      level: context?.level,
    });
  }
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(
  message: string,
  category: string = 'custom',
  data?: Record<string, any>
): void {
  Sentry.addBreadcrumb({
    message,
    category,
    level: 'info',
    data,
  });
}

/**
 * Set custom tag
 */
export function setTag(key: string, value: string): void {
  Sentry.setTag(key, value);
}

/**
 * Set custom context
 */
export function setContext(name: string, context: Record<string, any>): void {
  Sentry.setContext(name, context);
}

/**
 * Wrap component with Sentry error boundary
 */
export const ErrorBoundary = Sentry.ErrorBoundary;

/**
 * Get Sentry for advanced usage
 */
export { Sentry };

export default {
  initialize: initializeSentry,
  setUser,
  trackPerformance,
  trackApiCall,
  trackDatabaseQuery,
  trackEvent,
  captureError,
  addBreadcrumb,
  setTag,
  setContext,
  ErrorBoundary,
};
