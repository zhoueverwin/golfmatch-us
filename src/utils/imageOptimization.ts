/**
 * Image Optimization Utilities
 * Optimizes image loading for better performance at scale
 *
 * Features:
 * - Automatic image resizing via Supabase Transform API
 * - WebP format conversion
 * - Responsive image sizes
 * - Preloading critical images
 * - Progressive loading
 */

import { Image } from 'react-native';

// Image size presets
export const IMAGE_SIZES = {
  thumbnail: { width: 100, height: 100 },
  small: { width: 200, height: 200 },
  medium: { width: 400, height: 400 },
  large: { width: 800, height: 800 },
  full: { width: 1200, height: 1200 },

  // Specific use cases
  avatar: { width: 80, height: 80 },
  avatarLarge: { width: 150, height: 150 },
  profileCard: { width: 200, height: 260 },
  postImage: { width: 600, height: 600 },
  postThumbnail: { width: 300, height: 300 },
  chatImage: { width: 400, height: 400 },
} as const;

type ImageSize = keyof typeof IMAGE_SIZES;

interface TransformOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'origin' | 'webp' | 'avif';
  resize?: 'cover' | 'contain' | 'fill';
}

/**
 * Get optimized image URL using Supabase Image Transform API
 * Automatically resizes and converts to WebP for better performance
 */
export function getOptimizedImageUrl(
  originalUrl: string | null | undefined,
  size: ImageSize | TransformOptions = 'medium'
): string {
  if (!originalUrl) {
    return getPlaceholderUrl(size);
  }

  // Skip optimization for non-Supabase URLs
  if (!originalUrl.includes('supabase')) {
    return originalUrl;
  }

  // Get size configuration
  const options: TransformOptions = typeof size === 'string'
    ? { ...IMAGE_SIZES[size], quality: 80, format: 'webp', resize: 'cover' }
    : { quality: 80, format: 'webp', resize: 'cover', ...size };

  // Build transform URL
  // Supabase storage transform: /storage/v1/render/image/public/bucket/path?width=X&height=Y
  try {
    const url = new URL(originalUrl);

    // Check if it's already a render URL
    if (url.pathname.includes('/render/image/')) {
      // Update existing transform parameters
      if (options.width) url.searchParams.set('width', options.width.toString());
      if (options.height) url.searchParams.set('height', options.height.toString());
      if (options.quality) url.searchParams.set('quality', options.quality.toString());
      if (options.format) url.searchParams.set('format', options.format);
      if (options.resize) url.searchParams.set('resize', options.resize);
      return url.toString();
    }

    // Convert to render URL
    // From: /storage/v1/object/public/bucket/path
    // To: /storage/v1/render/image/public/bucket/path
    const newPath = url.pathname.replace(
      '/storage/v1/object/public/',
      '/storage/v1/render/image/public/'
    );

    url.pathname = newPath;
    if (options.width) url.searchParams.set('width', options.width.toString());
    if (options.height) url.searchParams.set('height', options.height.toString());
    if (options.quality) url.searchParams.set('quality', options.quality.toString());
    if (options.format) url.searchParams.set('format', options.format);
    if (options.resize) url.searchParams.set('resize', options.resize);

    return url.toString();
  } catch {
    // If URL parsing fails, return original
    return originalUrl;
  }
}

/**
 * Get placeholder image URL
 */
export function getPlaceholderUrl(size: ImageSize | TransformOptions = 'medium'): string {
  const dimensions = typeof size === 'string' ? IMAGE_SIZES[size] : size;
  const width = dimensions.width || 200;
  const height = dimensions.height || 200;

  // Use a simple gray placeholder
  return `https://via.placeholder.com/${width}x${height}/CCCCCC/999999?text=`;
}

/**
 * Get srcSet for responsive images
 */
export function getResponsiveSrcSet(
  originalUrl: string | null | undefined,
  sizes: ImageSize[] = ['small', 'medium', 'large']
): string {
  if (!originalUrl) return '';

  return sizes
    .map(size => {
      const { width } = IMAGE_SIZES[size];
      const url = getOptimizedImageUrl(originalUrl, size);
      return `${url} ${width}w`;
    })
    .join(', ');
}

/**
 * Preload critical images
 * Call this for images that should be loaded immediately (above the fold)
 */
export function preloadImages(urls: string[]): void {
  urls.forEach(url => {
    if (url) {
      Image.prefetch(url).catch(() => {
        // Silently fail - preloading is best effort
      });
    }
  });
}

/**
 * Preload profile images for a list of users
 */
export function preloadProfileImages(
  users: Array<{ profile_pictures?: string[] }>,
  size: ImageSize = 'avatar'
): void {
  const urls = users
    .map(user => user.profile_pictures?.[0])
    .filter((url): url is string => !!url)
    .map(url => getOptimizedImageUrl(url, size));

  preloadImages(urls);
}

/**
 * Get blur hash placeholder (for progressive loading)
 * Returns a small base64 image that can be used as placeholder
 */
export function getBlurPlaceholder(
  _originalUrl: string | null | undefined
): string | null {
  // In production, you would store blur hashes with images
  // For now, return null to use default placeholder
  return null;
}

/**
 * Calculate optimal image dimensions based on container size
 */
export function calculateOptimalSize(
  containerWidth: number,
  containerHeight: number,
  pixelRatio: number = 2
): { width: number; height: number } {
  // Account for pixel density
  const targetWidth = Math.ceil(containerWidth * pixelRatio);
  const targetHeight = Math.ceil(containerHeight * pixelRatio);

  // Snap to nearest preset size for better caching
  const presetSizes = [100, 200, 300, 400, 600, 800, 1200];

  const snapToPreset = (value: number): number => {
    for (const preset of presetSizes) {
      if (value <= preset) return preset;
    }
    return presetSizes[presetSizes.length - 1];
  };

  return {
    width: snapToPreset(targetWidth),
    height: snapToPreset(targetHeight),
  };
}

/**
 * Image loading priorities
 */
export const IMAGE_PRIORITY = {
  HIGH: 'high',    // Above the fold, visible immediately
  NORMAL: 'normal', // Below the fold but likely to be seen
  LOW: 'low',       // Far below fold, lazy load
} as const;

export type ImagePriority = typeof IMAGE_PRIORITY[keyof typeof IMAGE_PRIORITY];

/**
 * Get loading strategy based on priority
 */
export function getLoadingStrategy(priority: ImagePriority): {
  loading: 'eager' | 'lazy';
  decoding: 'sync' | 'async' | 'auto';
  fetchPriority: 'high' | 'low' | 'auto';
} {
  switch (priority) {
    case 'high':
      return { loading: 'eager', decoding: 'sync', fetchPriority: 'high' };
    case 'normal':
      return { loading: 'lazy', decoding: 'async', fetchPriority: 'auto' };
    case 'low':
      return { loading: 'lazy', decoding: 'async', fetchPriority: 'low' };
  }
}
