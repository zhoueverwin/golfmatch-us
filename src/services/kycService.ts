import { supabase } from './supabase';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { KycSubmission, KycSubmissionResponse, KycStatus } from '../types/dataModels';

/**
 * Service to handle KYC verification submissions
 */
class KycService {
  private readonly KYC_BUCKET_NAME = 'kyc-verification';
  private readonly KYC_TABLE_NAME = 'kyc_submissions';

  /**
   * Upload a KYC image to private storage
   * @param fileUri Local file URI
   * @param userId User ID
   * @param submissionId Submission ID for organizing files
   * @param imageType Type of image (id_photo, selfie, id_selfie)
   * @param upsert Whether to overwrite existing file (default: false, use true for retry uploads)
   * @returns Secure storage URL
   */
  async uploadKycImage(
    fileUri: string,
    userId: string,
    submissionId: string,
    imageType: 'id_photo' | 'id_back_photo' | 'selfie' | 'id_selfie' | 'golf_photo',
    upsert: boolean = false
  ): Promise<{ url: string | null; error: string | null }> {
    try {
      console.log('Uploading KYC image:', { fileUri, userId, submissionId, imageType });

      // Read file as base64
      const base64 = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Extract file extension and normalize to lowercase
      let fileExt = fileUri.split('.').pop()?.toLowerCase() || '';
      
      // Normalize jpg to jpeg and default to jpeg if extension is missing or unknown
      if (fileExt === 'jpg' || fileExt === 'jpeg' || fileExt === '') {
        fileExt = 'jpeg';
      } else if (fileExt !== 'png' && fileExt !== 'webp') {
        // For any other extension, default to jpeg
        fileExt = 'jpeg';
      }
      
      const fileName = `${imageType}.${fileExt}`;
      const filePath = `${userId}/${submissionId}/${fileName}`;

      console.log('Uploading to KYC bucket:', { filePath, fileExt });

      // Decode base64 to array buffer
      const arrayBuffer = decode(base64);

      // Determine content type based on normalized extension
      let contentType: string;
      if (fileExt === 'jpeg') {
        contentType = 'image/jpeg';
      } else if (fileExt === 'png') {
        contentType = 'image/png';
      } else if (fileExt === 'webp') {
        contentType = 'image/webp';
      } else {
        // This should never happen due to normalization above, but just in case
        contentType = 'image/jpeg';
      }
      
      console.log('Upload contentType:', contentType);

      // Upload to Supabase Storage (private bucket)
      const { data, error } = await supabase.storage
        .from(this.KYC_BUCKET_NAME)
        .upload(filePath, arrayBuffer, {
          contentType,
          cacheControl: '3600',
          upsert,
        });

      if (error) {
        console.error('KYC upload error:', error);
        return { url: null, error: error.message };
      }

      console.log('KYC upload successful:', data);

      // For private bucket, we store the path (not public URL)
      // Admin dashboard will use signed URLs to view
      const storagePath = `${this.KYC_BUCKET_NAME}/${filePath}`;

      return { url: storagePath, error: null };
    } catch (error: any) {
      console.error('Error uploading KYC image:', error);
      return { url: null, error: error.message || 'Unknown upload error' };
    }
  }

  /**
   * Create a new KYC submission
   * @param userId User ID
   * @param idImageUrl URL to ID photo (front) in storage
   * @param idBackImageUrl URL to ID photo (back) in storage
   * @param selfieImageUrl URL to selfie in storage
   * @param idSelfieImageUrl URL to combined photo in storage
   * @param golfPhotoUrl URL to golf activity photo in storage
   * @returns Submission record
   */
  async createSubmission(
    userId: string,
    idImageUrl: string,
    idBackImageUrl: string,
    selfieImageUrl: string,
    idSelfieImageUrl: string,
    golfPhotoUrl?: string
  ): Promise<KycSubmissionResponse> {
    try {
      // Check for existing pending submission
      const { data: existingSubmission, error: checkError } = await supabase
        .from(this.KYC_TABLE_NAME)
        .select('*')
        .eq('user_id', userId)
        .in('status', ['pending_review', 'retry'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        // PGRST116 means no rows found, which is fine
        console.error('Error checking existing submission:', checkError);
      }

      // Calculate retry count
      let retryCount = 0;
      if (existingSubmission && existingSubmission.status === 'retry') {
        retryCount = (existingSubmission.retry_count || 0) + 1;
      }

      // Create new submission
      const { data, error } = await supabase
        .from(this.KYC_TABLE_NAME)
        .insert({
          user_id: userId,
          id_image_url: idImageUrl,
          id_back_image_url: idBackImageUrl,
          selfie_image_url: selfieImageUrl,
          id_selfie_image_url: idSelfieImageUrl,
          golf_photo_url: golfPhotoUrl || null,
          status: 'pending_review' as KycStatus,
          submission_date: new Date().toISOString(),
          retry_count: retryCount,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating KYC submission:', error);
        return {
          success: false,
          error: error.message,
        };
      }

      // Update user profile with KYC status
      await this.updateUserKycStatus(userId, 'pending_review');

      console.log('KYC submission created:', data);

      return {
        success: true,
        data: data as KycSubmission,
      };
    } catch (error: any) {
      console.error('Error in createSubmission:', error);
      return {
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  }

  /**
   * Get the latest KYC submission for a user
   * @param userId User ID
   * @returns Latest submission or null
   */
  async getLatestSubmission(userId: string): Promise<KycSubmission | null> {
    try {
      const { data, error } = await supabase
        .from(this.KYC_TABLE_NAME)
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No submission found
          return null;
        }
        console.error('Error fetching KYC submission:', error);
        return null;
      }

      return data as KycSubmission;
    } catch (error) {
      console.error('Error in getLatestSubmission:', error);
      return null;
    }
  }

  /**
   * Update user's KYC status in profiles table
   * @param userId User ID
   * @param status New KYC status
   */
  async updateUserKycStatus(
    userId: string,
    status: KycStatus
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const updates: any = {
        kyc_status: status,
        updated_at: new Date().toISOString(),
      };

      if (status === 'pending_review') {
        updates.kyc_submitted_at = new Date().toISOString();
      } else if (status === 'approved') {
        updates.kyc_verified_at = new Date().toISOString();
        updates.is_verified = true;
      }

      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId);

      if (error) {
        console.error('Error updating user KYC status:', error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error: any) {
      console.error('Error in updateUserKycStatus:', error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  }

  /**
   * Get KYC submission status for a user
   * @param userId User ID
   * @returns KYC status
   */
  async getKycStatus(userId: string): Promise<KycStatus> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('kyc_status')
        .eq('id', userId)
        .single();

      if (error || !data) {
        return 'not_started';
      }

      return (data.kyc_status as KycStatus) || 'not_started';
    } catch (error) {
      console.error('Error fetching KYC status:', error);
      return 'not_started';
    }
  }

  /**
   * Ensure KYC bucket exists (for setup)
   */
  async ensureKycBucketExists(): Promise<void> {
    try {
      const { data: buckets, error: listError } = await supabase.storage.listBuckets();

      if (listError) {
        console.error('Error listing buckets:', listError);
        return;
      }

      const bucketExists = buckets?.some(b => b.name === this.KYC_BUCKET_NAME);

      if (!bucketExists) {
        console.log('Creating KYC storage bucket:', this.KYC_BUCKET_NAME);
        
        const { error: createError } = await supabase.storage.createBucket(this.KYC_BUCKET_NAME, {
          public: false, // Private bucket
          fileSizeLimit: 10485760, // 10MB
          allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
        });

        if (createError) {
          console.error('Error creating KYC bucket:', createError);
        } else {
          console.log('KYC bucket created successfully');
        }
      }
    } catch (error) {
      console.error('Error ensuring KYC bucket exists:', error);
    }
  }
}

export const kycService = new KycService();
export default kycService;
