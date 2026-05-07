import { Video } from 'react-native-compressor';
import * as FileSystem from 'expo-file-system';

export interface CompressionResult {
  uri: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
}

export interface CompressionOptions {
  maxSize?: number; // Max dimension in pixels (default: 720)
  quality?: 'low' | 'medium' | 'high'; // Compression quality
}

/**
 * Compresses a video file to reduce file size while maintaining reasonable quality.
 * Uses react-native-compressor which provides WhatsApp-style compression.
 *
 * @param videoUri - Local URI of the video to compress
 * @param onProgress - Optional callback for progress updates (0-1)
 * @param options - Optional compression options
 * @returns Promise with compression result containing URIs and size info
 */
export const compressVideo = async (
  videoUri: string,
  onProgress?: (progress: number) => void,
  options?: CompressionOptions
): Promise<CompressionResult> => {
  const maxSize = options?.maxSize || 720;

  // Get original file size
  const originalInfo = await FileSystem.getInfoAsync(videoUri);
  const originalSize = (originalInfo as any).size || 0;

  // Compress video using react-native-compressor
  const compressedUri = await Video.compress(
    videoUri,
    {
      compressionMethod: 'auto',
      maxSize: maxSize,
      minimumFileSizeForCompress: 1, // Always compress
    },
    (progress) => {
      if (onProgress) {
        onProgress(progress);
      }
    }
  );

  // Get compressed file size
  const compressedInfo = await FileSystem.getInfoAsync(compressedUri);
  const compressedSize = (compressedInfo as any).size || 0;

  // Calculate compression ratio
  const compressionRatio = originalSize > 0
    ? (1 - compressedSize / originalSize)
    : 0;

  if (__DEV__) {
    console.log('[VideoCompression] Compression complete:', {
      original: `${(originalSize / (1024 * 1024)).toFixed(2)}MB`,
      compressed: `${(compressedSize / (1024 * 1024)).toFixed(2)}MB`,
      savings: `${(compressionRatio * 100).toFixed(1)}%`,
    });
  }

  return {
    uri: compressedUri,
    originalSize,
    compressedSize,
    compressionRatio,
  };
};

/**
 * Check if a video file needs compression based on size threshold.
 *
 * @param videoUri - Local URI of the video
 * @param thresholdMB - Size threshold in MB (default: 5MB)
 * @returns Promise<boolean> - true if video should be compressed
 */
export const shouldCompressVideo = async (
  videoUri: string,
  thresholdMB: number = 5
): Promise<boolean> => {
  try {
    const info = await FileSystem.getInfoAsync(videoUri);
    const sizeInMB = ((info as any).size || 0) / (1024 * 1024);
    return sizeInMB > thresholdMB;
  } catch {
    // If we can't get file info, compress anyway
    return true;
  }
};
