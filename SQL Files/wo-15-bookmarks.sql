-- WO-15 — Per-user work-order bookmarks. Idempotent. Run BEFORE deploying the WO
-- list code (the list reads/writes this table). App still builds without it — the
-- bookmark query runs at request time and is caught, so an absent table just yields
-- zero bookmarks until the migration is applied.

CREATE TABLE IF NOT EXISTS public.wo_bookmarks (
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, work_order_id)
);
CREATE INDEX IF NOT EXISTS idx_wo_bookmarks_user ON public.wo_bookmarks(user_id);

-- Self-scoped RLS, mirroring saved_views: bookmarks are personal.
ALTER TABLE public.wo_bookmarks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wo_bookmarks_self" ON public.wo_bookmarks;
CREATE POLICY "wo_bookmarks_self" ON public.wo_bookmarks FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
