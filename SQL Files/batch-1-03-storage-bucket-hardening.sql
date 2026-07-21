-- Batch 1 / DV-03 — Harden the `work-order-media` and `requests` storage buckets.
-- Idempotent. Run in the Supabase SQL editor. Mirrors the sprint-k-01 hardening
-- already applied to the `media` bucket.
--
-- Problems (from sprint-i-01):
--   work-order-media:
--     * wo_media_public_select    — SELECT TO public: anon can LIST/enumerate the
--       whole bucket via the storage API (leaks every tenant's object paths).
--     * wo_media_authenticated_update — UPDATE TO authenticated with no owner check:
--       ANY authenticated user of ANY tenant can overwrite ANY object.
--   requests:
--     * requests_public_select    — SELECT TO public: same anon enumeration leak.
--     * requests_public_insert     — INSERT TO public with no size/type bound.
--
-- Fixes:
--   * Drop the public SELECT (listing) on both buckets. Buckets stay public = true,
--     so existing public object URLs (known path) keep resolving — only the
--     list/search API is closed, which stops anonymous enumeration. Same documented
--     trade-off as sprint-k-01: an object is reachable only if you already know its
--     exact (unguessable) path.
--   * work-order-media UPDATE -> restricted to the uploader (owner = auth.uid());
--     add an owner-scoped DELETE. Legitimate WO-media writes go through the
--     service-role /api/upload route (bypasses RLS), so these policies only constrain
--     direct client access — which is exactly the cross-tenant-overwrite hole.
--   * requests bucket: KEEP the anon INSERT (the public portal uploads photos before
--     sign-in) but bound it with a bucket-level file_size_limit and an image + PDF
--     MIME allowlist, which Supabase enforces on every upload regardless of client.
--
-- Acceptance (owner): anon listing of BOTH buckets fails; a cross-tenant authenticated
-- overwrite of a work-order photo fails; a public request PHOTO upload via the portal
-- still succeeds.

-- ===== work-order-media =====
DROP POLICY IF EXISTS "wo_media_public_select" ON storage.objects;

DROP POLICY IF EXISTS "wo_media_authenticated_insert" ON storage.objects;
CREATE POLICY "wo_media_authenticated_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'work-order-media');

DROP POLICY IF EXISTS "wo_media_authenticated_update" ON storage.objects;
DROP POLICY IF EXISTS "wo_media_owner_update" ON storage.objects;
CREATE POLICY "wo_media_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'work-order-media' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'work-order-media' AND owner = auth.uid());

DROP POLICY IF EXISTS "wo_media_owner_delete" ON storage.objects;
CREATE POLICY "wo_media_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'work-order-media' AND owner = auth.uid());

-- Keep the bucket public so existing public object URLs continue to resolve.
UPDATE storage.buckets SET public = true WHERE id = 'work-order-media';

-- ===== requests =====
DROP POLICY IF EXISTS "requests_public_select" ON storage.objects;

-- Keep anon INSERT (public portal uploads pre-sign-in) — recreate for determinism.
DROP POLICY IF EXISTS "requests_public_insert" ON storage.objects;
CREATE POLICY "requests_public_insert" ON storage.objects
  FOR INSERT TO public
  WITH CHECK (bucket_id = 'requests');

-- Bound the anon INSERT: 25 MiB cap + image/PDF MIME allowlist at the bucket level.
-- Deliberate behaviour change: the portal's generic attachment field now only accepts
-- images and PDFs. If a tenant legitimately needs more types (e.g. video), widen
-- allowed_mime_types here.
UPDATE storage.buckets
  SET public = true,
      file_size_limit = 26214400,  -- 25 MiB
      allowed_mime_types = ARRAY[
        'image/jpeg', 'image/png', 'image/webp', 'image/gif',
        'image/heic', 'image/heif', 'application/pdf'
      ]
  WHERE id = 'requests';
