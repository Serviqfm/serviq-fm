-- Sprint K — Storage hardening for the `media` bucket (security fix H4, server side)
-- Run in Supabase SQL editor. Idempotent.
--
-- Problem: sprint-i-01 created the `media` bucket with very broad policies:
--   * "media_public_select"        — SELECT TO public, which allows anyone (including
--     anon) to LIST every object in the bucket via the storage API, not just fetch
--     known URLs. Listing leaks all tenants' filenames.
--   * "media_authenticated_insert" — any authenticated user could write any path.
--   * "media_authenticated_update" — any authenticated user could overwrite ANY
--     object, including other users'/tenants' files.
--
-- Fix:
--   * Drop the public SELECT (listing) policy and the unscoped INSERT/UPDATE policies.
--   * Recreate INSERT for authenticated users only.
--   * Recreate UPDATE and add DELETE scoped to the uploader (owner = auth.uid()),
--     so a user can only modify/remove objects they uploaded themselves.
--
-- TRADE-OFF (documented deliberately):
--   The bucket itself stays public = true, so existing public object URLs
--   (https://<project>.supabase.co/storage/v1/object/public/media/<path>) keep
--   working — the dashboard and mobile app embed these URLs directly and the
--   mobile team is separately making filenames unguessable (long random names).
--   Public-bucket reads of a KNOWN path do not go through RLS, but the storage
--   list/search API does — dropping the SELECT policy is what stops anonymous
--   bucket enumeration. Net result: objects are reachable only if you already
--   know the exact (unguessable) path.

-- 1. Drop the broad policies from sprint-i-01
DROP POLICY IF EXISTS "media_public_select" ON storage.objects;
DROP POLICY IF EXISTS "media_authenticated_insert" ON storage.objects;
DROP POLICY IF EXISTS "media_authenticated_update" ON storage.objects;

-- 2. INSERT: authenticated users only (anon may not upload to `media`)
CREATE POLICY "media_authenticated_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'media');

-- 3. UPDATE: only the original uploader may overwrite their own objects
DROP POLICY IF EXISTS "media_owner_update" ON storage.objects;
CREATE POLICY "media_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'media' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'media' AND owner = auth.uid());

-- 4. DELETE: only the original uploader may delete their own objects
DROP POLICY IF EXISTS "media_owner_delete" ON storage.objects;
CREATE POLICY "media_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'media' AND owner = auth.uid());

-- 5. Keep the bucket public so existing public URLs continue to resolve.
--    (No-op if already public; explicit so a re-run restores intent.)
UPDATE storage.buckets SET public = true WHERE id = 'media';
