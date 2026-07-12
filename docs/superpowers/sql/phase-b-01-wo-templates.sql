-- Phase B / WO-08 — Work order templates. Idempotent. Run in the Supabase SQL editor
-- BEFORE deploying (the Templates page + "create from template" read/write this table).
-- Mirrors the checklist_templates shape (sprint-k-03): one org-scoped table + the
-- standard 4-policy org RLS. Templates are CRUD'd directly by the client under RLS.

CREATE TABLE IF NOT EXISTS public.work_order_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_ar TEXT,
  title TEXT,
  description TEXT,
  priority TEXT,
  category TEXT,
  asset_id UUID REFERENCES public.assets(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  estimated_duration_minutes INTEGER,
  tasks JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{ title, title_ar? }]
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wo_templates_org ON public.work_order_templates(organisation_id);

ALTER TABLE public.work_order_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wo_templates_org_select" ON public.work_order_templates;
CREATE POLICY "wo_templates_org_select" ON public.work_order_templates FOR SELECT
  USING (organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "wo_templates_org_insert" ON public.work_order_templates;
CREATE POLICY "wo_templates_org_insert" ON public.work_order_templates FOR INSERT
  WITH CHECK (organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "wo_templates_org_update" ON public.work_order_templates;
CREATE POLICY "wo_templates_org_update" ON public.work_order_templates FOR UPDATE
  USING (organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "wo_templates_org_delete" ON public.work_order_templates;
CREATE POLICY "wo_templates_org_delete" ON public.work_order_templates FOR DELETE
  USING (organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid()));
