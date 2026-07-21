-- Sprint I — Storage buckets + permissive RLS for authenticated uploads
-- Run in Supabase SQL editor. Idempotent.
--
-- The dashboard uploads close-out photos, asset photos, and request attachments to three
-- buckets. Default storage RLS denies INSERT, so authenticated uploads were failing with
-- "new row violates row-level security policy" on the work-order close flow.

-- 1. Buckets (idempotent: only inserts if missing)
INSERT INTO storage.buckets (id, name, public)
VALUES ('work-order-media', 'work-order-media', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

INSERT INTO storage.buckets (id, name, public)
VALUES ('requests', 'requests', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

INSERT INTO storage.buckets (id, name, public)
VALUES ('offboard-exports', 'offboard-exports', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- 2. RLS policies on storage.objects
-- Authenticated users can read/upload to work-order-media, requests, media buckets.
-- Anyone can read 'requests' (it's the public request portal target).
-- offboard-exports stays service-role only (no policies = denied to client).

DROP POLICY IF EXISTS "wo_media_authenticated_insert" ON storage.objects;
CREATE POLICY "wo_media_authenticated_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'work-order-media');

DROP POLICY IF EXISTS "wo_media_authenticated_update" ON storage.objects;
CREATE POLICY "wo_media_authenticated_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'work-order-media');

DROP POLICY IF EXISTS "wo_media_public_select" ON storage.objects;
CREATE POLICY "wo_media_public_select" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'work-order-media');

DROP POLICY IF EXISTS "media_authenticated_insert" ON storage.objects;
CREATE POLICY "media_authenticated_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'media');

DROP POLICY IF EXISTS "media_authenticated_update" ON storage.objects;
CREATE POLICY "media_authenticated_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'media');

DROP POLICY IF EXISTS "media_public_select" ON storage.objects;
CREATE POLICY "media_public_select" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'media');

-- Requests bucket: anyone (public, including anon) can INSERT (public request portal
-- uploads photos before sign-in) and SELECT.
DROP POLICY IF EXISTS "requests_public_insert" ON storage.objects;
CREATE POLICY "requests_public_insert" ON storage.objects
  FOR INSERT TO public
  WITH CHECK (bucket_id = 'requests');

DROP POLICY IF EXISTS "requests_public_select" ON storage.objects;
CREATE POLICY "requests_public_select" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'requests');
