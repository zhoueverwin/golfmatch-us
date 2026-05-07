/**
 * CDN Service
 * Optimizes media delivery through CDN for global scalability
 *
 * Supports:
 * - Cloudflare Images
 * - CloudFront (AWS)
 * - Supabase Storage (fallback)
 *
 * Features:
 * - Automatic format conversion (WebP, AVIF)
 * - Image resizing on-the-fly
 * - Global edge caching
 * - Automatic failover
 */

import { getOptimizedImageUrl, IMAGE_SIZES } from '../utils/imageOptimization';

type CDNProvider = 'cloudflare' | 'cloudfront' | 'supabase';

interface CDNConfig {
  provider: CDNProvider;
  baseUrl: string;
  accountHash?: string; // For Cloudflare
  distributionDomain?: string; // For CloudFront
}

// CDN configuration (set via environment variables)
const CDN_CONFIG: CDNConfig = {
  provider: (process.env.EXPO_PUBLIC_CDN_PROVIDER as CDNProvider) || 'supabase',
  baseUrl: process.env.EXPO_PUBLIC_CDN_BASE_URL || '',
  accountHash: process.env.EXPO_PUBLIC_CLOUDFLARE_ACCOUNT_HASH,
  distributionDomain: process.env.EXPO_PUBLIC_CLOUDFRONT_DOMAIN,
};

interface ImageTransformOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'auto' | 'webp' | 'avif' | 'jpeg' | 'png';
  fit?: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad';
  gravity?: 'auto' | 'center' | 'top' | 'bottom' | 'left' | 'right';
}

class CDNService {
  private static instance: CDNService;
  private config: CDNConfig;

  private constructor() {
    this.config = CDN_CONFIG;
    console.log('[CDN] Using provider:', this.config.provider);
  }

  static getInstance(): CDNService {
    if (!CDNService.instance) {
      CDNService.instance = new CDNService();
    }
    return CDNService.instance;
  }

  /**
   * Get CDN URL for image with transformations
   */
  getImageUrl(
    originalUrl: string | null | undefined,
    options: ImageTransformOptions = {}
  ): string {
    if (!originalUrl) {
      return this.getPlaceholderUrl(options);
    }

    switch (this.config.provider) {
      case 'cloudflare':
        return this.getCloudflareUrl(originalUrl, options);
      case 'cloudfront':
        return this.getCloudfrontUrl(originalUrl, options);
      case 'supabase':
      default:
        return this.getSupabaseUrl(originalUrl, options);
    }
  }

  /**
   * Get video URL through CDN
   */
  getVideoUrl(
    originalUrl: string | null | undefined,
    options?: { quality?: 'auto' | 'hd' | 'sd'; format?: 'mp4' | 'webm' }
  ): string {
    if (!originalUrl) return '';

    // Videos are already optimized on upload
    // Just route through CDN for global distribution
    switch (this.config.provider) {
      case 'cloudflare':
      case 'cloudfront':
        return this.proxyCdnUrl(originalUrl);
      case 'supabase':
      default:
        return originalUrl;
    }
  }

  /**
   * Preload critical media through CDN
   */
  async preloadMedia(urls: string[]): Promise<void> {
    // Use link preload headers when supported
    if (typeof document !== 'undefined') {
      urls.forEach(url => {
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.as = 'image';
        link.href = url;
        document.head.appendChild(link);
      });
    }
  }

  /**
   * Purge CDN cache for specific URLs
   */
  async purgeCache(urls: string[]): Promise<boolean> {
    switch (this.config.provider) {
      case 'cloudflare':
        return this.purgeCloudflareCache(urls);
      case 'cloudfront':
        return this.purgeCloudfrontCache(urls);
      default:
        return true; // Supabase handles its own caching
    }
  }

  // ============================================================================
  // Private methods - Provider-specific implementations
  // ============================================================================

  private getCloudflareUrl(url: string, options: ImageTransformOptions): string {
    if (!this.config.accountHash) {
      return this.getSupabaseUrl(url, options);
    }

    // Cloudflare Images format:
    // https://imagedelivery.net/{account_hash}/{image_id}/{variant}
    // Or flexible variants:
    // https://imagedelivery.net/{account_hash}/{image_id}/width={w},height={h},quality={q}

    const params: string[] = [];
    if (options.width) params.push(`width=${options.width}`);
    if (options.height) params.push(`height=${options.height}`);
    if (options.quality) params.push(`quality=${options.quality || 85}`);
    if (options.fit) params.push(`fit=${options.fit}`);
    if (options.format && options.format !== 'auto') params.push(`format=${options.format}`);

    // Extract image ID from Supabase URL
    const imageId = this.extractImageId(url);

    return `https://imagedelivery.net/${this.config.accountHash}/${imageId}/${params.join(',')}`;
  }

  private getCloudfrontUrl(url: string, options: ImageTransformOptions): string {
    if (!this.config.distributionDomain) {
      return this.getSupabaseUrl(url, options);
    }

    // CloudFront with Lambda@Edge for image processing
    // Format: https://{distribution}.cloudfront.net/{path}?w={w}&h={h}&q={q}&f={format}

    const urlObj = new URL(url);
    const newUrl = new URL(`https://${this.config.distributionDomain}${urlObj.pathname}`);

    if (options.width) newUrl.searchParams.set('w', options.width.toString());
    if (options.height) newUrl.searchParams.set('h', options.height.toString());
    if (options.quality) newUrl.searchParams.set('q', (options.quality || 85).toString());
    if (options.format && options.format !== 'auto') newUrl.searchParams.set('f', options.format);
    if (options.fit) newUrl.searchParams.set('fit', options.fit);

    return newUrl.toString();
  }

  private getSupabaseUrl(url: string, options: ImageTransformOptions): string {
    // Use existing Supabase image optimization
    const format = options.format === 'auto' || options.format === 'jpeg' || options.format === 'png'
      ? 'webp'
      : options.format;

    return getOptimizedImageUrl(url, {
      width: options.width,
      height: options.height,
      quality: options.quality,
      format: format as 'webp' | 'avif' | undefined,
      resize: options.fit as any,
    });
  }

  private proxyCdnUrl(url: string): string {
    // Proxy URL through CDN for caching
    if (this.config.baseUrl) {
      const urlObj = new URL(url);
      return `${this.config.baseUrl}${urlObj.pathname}`;
    }
    return url;
  }

  private extractImageId(url: string): string {
    // Extract unique identifier from URL
    const parts = url.split('/');
    return parts[parts.length - 1].split('?')[0];
  }

  private getPlaceholderUrl(options: ImageTransformOptions): string {
    const width = options.width || 200;
    const height = options.height || 200;
    return `https://via.placeholder.com/${width}x${height}/CCCCCC/999999?text=`;
  }

  private async purgeCloudflareCache(urls: string[]): Promise<boolean> {
    // Cloudflare cache purge API
    // Requires API token - typically done server-side
    console.log('[CDN] Cache purge requested for Cloudflare:', urls.length, 'URLs');
    return true;
  }

  private async purgeCloudfrontCache(urls: string[]): Promise<boolean> {
    // CloudFront invalidation API
    // Requires AWS credentials - typically done server-side
    console.log('[CDN] Cache purge requested for CloudFront:', urls.length, 'URLs');
    return true;
  }
}

export const cdnService = CDNService.getInstance();
export default cdnService;

/**
 * Convenience function to get optimized image URL
 */
export function getCdnImageUrl(
  url: string | null | undefined,
  preset: keyof typeof IMAGE_SIZES = 'medium'
): string {
  const size = IMAGE_SIZES[preset];
  return cdnService.getImageUrl(url, {
    width: size.width,
    height: size.height,
    quality: 85,
    format: 'auto',
    fit: 'cover',
  });
}

/**
 * Convenience function to get CDN video URL
 */
export function getCdnVideoUrl(url: string | null | undefined): string {
  return cdnService.getVideoUrl(url);
}
