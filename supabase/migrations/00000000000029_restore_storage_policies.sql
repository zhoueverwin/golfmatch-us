-- Restore storage.objects RLS policies after region move.
--
-- WHY THIS MIGRATION EXISTS:
-- Same root cause as migration 28 (auth.users trigger). The Tokyo→us-east-2
-- region move on 2026-05-22 dropped ALL policies on storage.objects, even
-- though storage.buckets rows survived. profile-pictures uploads failed
-- with "new row violates row-level security policy" because RLS was on
-- but no INSERT policy existed for the authenticated role.
--
-- This is migration 4 reapplied. If you're seeing this error post-region-
-- move, check pg_policies for tablename='objects' in schema='storage'.
-- If empty, your policies were dropped during the copy.
--
-- Detected and patched 2026-05-23.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('profile-pictures', 'profile-pictures', true,  NULL, NULL),
  ('post-media',       'post-media',       true,  NULL, NULL),
  ('message-media',    'message-media',    true,  NULL, NULL),
  ('user-uploads',     'user-uploads',     true,  NULL, NULL),
  ('blog-images',      'blog-images',      true,  5242880, '{image/jpeg,image/png,image/webp,image/gif}'),
  ('admin-assets',     'admin-assets',     true,  NULL, NULL),
  ('kyc-verification', 'kyc-verification', false, 10485760, '{image/jpeg,image/png,image/webp}')
ON CONFLICT (id) DO NOTHING;

-- profile-pictures
DROP POLICY IF EXISTS "Profile pictures are publicly accessible" ON storage.objects;
CREATE POLICY "Profile pictures are publicly accessible"
  ON storage.objects FOR SELECT USING (bucket_id = 'profile-pictures');

DROP POLICY IF EXISTS "Users can upload profile pictures" ON storage.objects;
CREATE POLICY "Users can upload profile pictures"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'profile-pictures'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can update own profile pictures" ON storage.objects;
CREATE POLICY "Users can update own profile pictures"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'profile-pictures'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can delete own profile pictures" ON storage.objects;
CREATE POLICY "Users can delete own profile pictures"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'profile-pictures'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

-- post-media
DROP POLICY IF EXISTS "Post media is publicly accessible" ON storage.objects;
CREATE POLICY "Post media is publicly accessible"
  ON storage.objects FOR SELECT USING (bucket_id = 'post-media');

DROP POLICY IF EXISTS "Authenticated users can upload post media" ON storage.objects;
CREATE POLICY "Authenticated users can upload post media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'post-media');

-- message-media
DROP POLICY IF EXISTS "Authenticated users can upload message media" ON storage.objects;
CREATE POLICY "Authenticated users can upload message media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'message-media');

DROP POLICY IF EXISTS "Message media accessible to chat participants" ON storage.objects;
CREATE POLICY "Message media accessible to chat participants"
  ON storage.objects FOR SELECT USING (bucket_id = 'message-media');

-- user-uploads
DROP POLICY IF EXISTS "Public can read all files yfngw_0" ON storage.objects;
CREATE POLICY "Public can read all files yfngw_0"
  ON storage.objects FOR SELECT USING (bucket_id = 'user-uploads');

DROP POLICY IF EXISTS "Users can upload to own folder yfngw_0" ON storage.objects;
CREATE POLICY "Users can upload to own folder yfngw_0"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'user-uploads'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

DROP POLICY IF EXISTS "Users can update own files yfngw_0" ON storage.objects;
CREATE POLICY "Users can update own files yfngw_0"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'user-uploads'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

DROP POLICY IF EXISTS "Users can delete own files yfngw_0" ON storage.objects;
CREATE POLICY "Users can delete own files yfngw_0"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'user-uploads'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

-- kyc-verification
DROP POLICY IF EXISTS "Users can upload own KYC images" ON storage.objects;
CREATE POLICY "Users can upload own KYC images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'kyc-verification'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

DROP POLICY IF EXISTS "Users can view own KYC images" ON storage.objects;
CREATE POLICY "Users can view own KYC images"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'kyc-verification'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

-- blog-images
DROP POLICY IF EXISTS "Public read access for blog images" ON storage.objects;
CREATE POLICY "Public read access for blog images"
  ON storage.objects FOR SELECT USING (bucket_id = 'blog-images');

DROP POLICY IF EXISTS "Authenticated can upload blog images" ON storage.objects;
CREATE POLICY "Authenticated can upload blog images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'blog-images');

DROP POLICY IF EXISTS "Authenticated can update blog images" ON storage.objects;
CREATE POLICY "Authenticated can update blog images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'blog-images');

DROP POLICY IF EXISTS "Authenticated can delete blog images" ON storage.objects;
CREATE POLICY "Authenticated can delete blog images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'blog-images');

-- admin-assets
DROP POLICY IF EXISTS "Public read access for admin-assets" ON storage.objects;
CREATE POLICY "Public read access for admin-assets"
  ON storage.objects FOR SELECT USING (bucket_id = 'admin-assets');
