-- Phase B / WO-05 — Files module (global files + polymorphic attachments). Idempotent.
-- Run in the Supabase SQL editor BEFORE deploying (the Files page + WO Files tab read/write these).
--
-- A `files` row is the durable file record (metadata + public URL). `file_attachments`
-- links a file to any entity (a work order today; assets/sites later) — so detaching a
-- file from a WO removes only the attachment and keeps the global record.

CREATE TABLE IF NOT EXISTS public.files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  mime TEXT,
  size_bytes BIGINT,
  uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_files_org ON public.files(organisation_id);

CREATE TABLE IF NOT EXISTS public.file_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,   -- 'work_order' | 'asset' | 'site' | ...
  entity_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (file_id, entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_file_attachments_entity ON public.file_attachments(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_file_attachments_file ON public.file_attachments(file_id);

-- Org-scoped RLS, 4-policy pattern (same as checklist_templates / DV-01 tables).
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "files_org_select" ON public.files;
CREATE POLICY "files_org_select" ON public.files FOR SELECT
  USING (organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid()));
DROP POLICY IF EXISTS "files_org_insert" ON public.files;
CREATE POLICY "files_org_insert" ON public.files FOR INSERT
  WITH CHECK (organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid()));
DROP POLICY IF EXISTS "files_org_update" ON public.files;
CREATE POLICY "files_org_update" ON public.files FOR UPDATE
  USING (organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid()));
DROP POLICY IF EXISTS "files_org_delete" ON public.files;
CREATE POLICY "files_org_delete" ON public.files FOR DELETE
  USING (organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid()));

ALTER TABLE public.file_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "file_attachments_org_select" ON public.file_attachments;
CREATE POLICY "file_attachments_org_select" ON public.file_attachments FOR SELECT
  USING (organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid()));
DROP POLICY IF EXISTS "file_attachments_org_insert" ON public.file_attachments;
CREATE POLICY "file_attachments_org_insert" ON public.file_attachments FOR INSERT
  WITH CHECK (organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid()));
DROP POLICY IF EXISTS "file_attachments_org_delete" ON public.file_attachments;
CREATE POLICY "file_attachments_org_delete" ON public.file_attachments FOR DELETE
  USING (organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid()));
