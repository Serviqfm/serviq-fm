-- Phase B / WO-13 — Saved views. Idempotent. Run BEFORE deploying (the WO list
-- reads/writes this table). Per-user named filter sets, keyed by page.

CREATE TABLE IF NOT EXISTS public.saved_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  page TEXT NOT NULL,          -- 'work-orders' (other list pages later)
  name TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, page, name)
);
CREATE INDEX IF NOT EXISTS idx_saved_views_user_page ON public.saved_views(user_id, page);

-- Self-scoped RLS: views are personal (shareability comes from the filter URL itself).
ALTER TABLE public.saved_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saved_views_self" ON public.saved_views;
CREATE POLICY "saved_views_self" ON public.saved_views FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
