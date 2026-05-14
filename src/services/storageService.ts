import { supabase } from './supabase';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';

/**
 * Service to handle file uploads to Supabase Storage
 */

const MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  qt: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  '3gp': 'video/3gpp',
};

const resolveContentType = (
  fileExt: string,
  fileType: 'image' | 'video',
): string => {
  const ext = fileExt.toLowerCase();
  const mapped = MIME_TYPES[ext];
  if (mapped) return mapped;
  return fileType === 'video' ? 'video/mp4' : 'image/jpeg';
};

class StorageService {
  private readonly BUCKET_NAME = 'user-uploads';

  /**
   * Upload an image file to Supabase Storage
   * @param fileUri Local file URI
   * @param userId User ID for organizing files
   * @param fileType 'image' or 'video'
   * @returns Public URL of uploaded file
   */
  async uploadFile(
    fileUri: string,
    userId: string,
    fileType: 'image' | 'video' = 'image'
  ): Promise<{ url: string | null; error: string | null }> {
    try {
      console.log('Uploading file:', { fileUri, userId, fileType });

      // Read file as base64
      const base64 = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Generate unique filename
      const fileExt = fileUri.split('.').pop() || 'jpg';
      const fileName = `${userId}/${fileType}s/${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      console.log('Uploading to path:', filePath);

      // Decode base64 to array buffer
      const arrayBuffer = decode(base64);

      // Determine content type from a known MIME map so Supabase/CDN serve
      // the right Content-Type header (e.g. .mov → video/quicktime, not video/mov).
      const contentType = resolveContentType(fileExt, fileType);

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from(this.BUCKET_NAME)
        .upload(filePath, arrayBuffer, {
          contentType,
          cacheControl: '3600',
          upsert: false,
        });

      if (error) {
        console.error('Upload error:', error);
        return { url: null, error: error.message };
      }

      console.log('Upload successful:', data);

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from(this.BUCKET_NAME)
        .getPublicUrl(filePath);

      console.log('Public URL:', publicUrl);

      return { url: publicUrl, error: null };
    } catch (error: any) {
      console.error('Error uploading file:', error);
      return { url: null, error: error.message || 'Unknown upload error' };
    }
  }

  /**
   * Upload multiple images
   */
  async uploadImages(
    imageUris: string[],
    userId: string
  ): Promise<{ urls: string[]; errors: string[] }> {
    const urls: string[] = [];
    const errors: string[] = [];

    for (const uri of imageUris) {
      const { url, error } = await this.uploadFile(uri, userId, 'image');
      
      if (url) {
        urls.push(url);
      } else if (error) {
        errors.push(error);
      }
    }

    return { urls, errors };
  }

  /**
   * Upload a video
   */
  async uploadVideo(
    videoUri: string,
    userId: string
  ): Promise<{ url: string | null; error: string | null }> {
    return this.uploadFile(videoUri, userId, 'video');
  }

  /**
   * Delete a file from storage
   */
  async deleteFile(fileUrl: string): Promise<{ success: boolean; error: string | null }> {
    try {
      // Extract file path from public URL
      const url = new URL(fileUrl);
      const pathParts = url.pathname.split(`/${this.BUCKET_NAME}/`);
      
      if (pathParts.length < 2) {
        return { success: false, error: 'Invalid file URL' };
      }

      const filePath = pathParts[1];

      const { error } = await supabase.storage
        .from(this.BUCKET_NAME)
        .remove([filePath]);

      if (error) {
        console.error('Delete error:', error);
        return { success: false, error: error.message };
      }

      return { success: true, error: null };
    } catch (error: any) {
      console.error('Error deleting file:', error);
      return { success: false, error: error.message || 'Unknown delete error' };
    }
  }

  /**
   * Check if storage bucket exists, create if not
   */
  async ensureBucketExists(): Promise<void> {
    try {
      const { data: buckets, error: listError } = await supabase.storage.listBuckets();

      if (listError) {
        console.error('Error listing buckets:', listError);
        return;
      }

      const bucketExists = buckets?.some(b => b.name === this.BUCKET_NAME);

      if (!bucketExists) {
        console.log('Creating storage bucket:', this.BUCKET_NAME);
        
        const { error: createError } = await supabase.storage.createBucket(this.BUCKET_NAME, {
          public: true,
          fileSizeLimit: 52428800, // 50MB
          allowedMimeTypes: ['image/*', 'video/*'],
        });

        if (createError) {
          console.error('Error creating bucket:', createError);
        } else {
          console.log('Bucket created successfully');
        }
      }
    } catch (error) {
      console.error('Error ensuring bucket exists:', error);
    }
  }
}

export const storageService = new StorageService();
export default storageService;

