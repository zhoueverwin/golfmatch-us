import { Image } from 'react-native';
import { KycImageValidationResult } from '../types/dataModels';

/**
 * Client-side image validation utility for KYC verification
 * Validates image quality before upload to minimize server load
 * Note: React Native has limited image analysis capabilities compared to web,
 * so we perform basic validation here and rely more on server-side checks.
 */

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MIN_WIDTH = 400;
const MIN_HEIGHT = 300;

/**
 * Validates an image file for KYC submission
 * @param file - The file to validate (from ImagePicker or Camera)
 * @returns Validation result with ok flag and message
 */
export async function validateKycImage(file: {
  uri: string;
  type?: string;
  size?: number;
  width?: number;
  height?: number;
}): Promise<KycImageValidationResult> {
  try {
    // Check file type
    if (file.type && !ALLOWED_MIME_TYPES.includes(file.type)) {
      return {
        ok: false,
        message: 'JPEG/PNG/WebP の画像をアップロードしてください。',
      };
    }

    // Check file size
    if (file.size && file.size > MAX_FILE_SIZE) {
      return {
        ok: false,
        message: 'ファイルサイズは10MB以下にしてください。',
      };
    }

    // Get image dimensions if not provided
    let width = file.width;
    let height = file.height;

    if (!width || !height) {
      const dimensions = await getImageDimensions(file.uri);
      width = dimensions.width;
      height = dimensions.height;
    }

    // Check dimensions
    if (width < MIN_WIDTH || height < MIN_HEIGHT) {
      return {
        ok: false,
        message: `画像の解像度が低すぎます。より鮮明な写真を使用してください（推奨: 幅 >= ${MIN_WIDTH}px, 高さ >= ${MIN_HEIGHT}px）。`,
      };
    }

    // Note: Advanced quality checks (brightness, sharpness) are difficult in React Native
    // without additional native modules. These should be performed server-side.
    // For now, we pass basic validation and rely on backend verification.

    return {
      ok: true,
      message: '基本的なチェックを通過しました。',
    };
  } catch (error) {
    console.error('Image validation error:', error);
    // Don't block on validation errors - let the upload proceed
    // Server will do final validation
    return {
      ok: true,
      message: '画像検証をスキップしました。',
    };
  }
}

/**
 * Get image dimensions from URI using React Native Image
 */
function getImageDimensions(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => {
        resolve({ width, height });
      },
      (error) => {
        console.error('Error getting image size:', error);
        // Return default dimensions on error to not block upload
        resolve({ width: MIN_WIDTH, height: MIN_HEIGHT });
      }
    );
  });
}
