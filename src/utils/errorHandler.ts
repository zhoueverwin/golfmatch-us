/**
 * Utility functions for error handling throughout the app
 * Ensures all errors are caught and handled gracefully
 */

/**
 * Wraps an async function to catch any errors and prevent unhandled promise rejections
 * Use this for async event handlers (onPress, onClick, etc.)
 */
export function safeAsync<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  errorCallback?: (error: Error) => void
): T {
  return ((...args: Parameters<T>) => {
    const promise = fn(...args);
    promise.catch((error) => {
      console.error('[safeAsync] Unhandled error in async function:', error);
      errorCallback?.(error);
    });
    return promise;
  }) as T;
}

/**
 * Wraps a synchronous function to catch any errors
 * Use this for synchronous event handlers
 */
export function safeSync<T extends (...args: any[]) => any>(
  fn: T,
  errorCallback?: (error: Error) => void
): T {
  return ((...args: Parameters<T>) => {
    try {
      return fn(...args);
    } catch (error) {
      console.error('[safeSync] Unhandled error in sync function:', error);
      errorCallback?.(error as Error);
    }
  }) as T;
}

/**
 * Creates a safe async event handler wrapper
 * Automatically catches errors and logs them
 */
export function createSafeAsyncHandler<T extends (...args: any[]) => Promise<any>>(
  handler: T
): T {
  return safeAsync(handler);
}

/**
 * Creates a safe synchronous event handler wrapper
 * Automatically catches errors and logs them
 */
export function createSafeSyncHandler<T extends (...args: any[]) => any>(
  handler: T
): T {
  return safeSync(handler);
}

