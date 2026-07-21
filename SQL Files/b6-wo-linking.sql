-- B6 / WO-24 — Work-order to work-order linking.
-- Run in the Supabase SQL editor BEFORE deploying the "Related work orders"
-- section on the WO detail page. Idempotent. Safe to run twice.
--
-- Design: one directed row per link (from_wo_id --link_type--> to_wo_id).
--   * link_type is one of blocks / duplicate_of / related.
--   * The detail page reads links in BOTH directions for a given WO and renders
--     the inverse label for incoming rows (A "blocks" B => B shows "blocked by A").
--   * Informational only — no auto-actions, matching the gap-analysis doc.
--   * The app degrades gracefully without this table: the section and the
--     /api/work-orders/[id]/links route just return empty, so `next build`
--     and the running app both work WITHOUT this migration applied.
--
-- Security posture (4-policy org RLS):
--   * SELECT / DELETE: any member of the caller's org (they manage links on WOs
--     they can already see via work_orders RLS).
--   * INSERT / UPDATE carry a WITH CHECK that pins organisation_id to the caller's
--     org AND requires BOTH endpoint WOs to live in that org — a caller cannot
--     link into or out of another org.
--   * UPDATE is present for the 4-policy standard; links are immutable in the UI.
--
-- Acceptance (owner, after running):
--   * anon-key SELECT returns only own-org links; cross-org INSERT denied.
--   * a member of org A cannot link a WO of org A to a WO of org B (WITH CHECK).
--   * self-links and duplicates are rejected by table constraints.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.work_order_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  from_wo_id      UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  to_wo_id        UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  link_type       TEXT NOT NULL CHECK (link_type IN ('blocks', 'duplicate_of', 'related')),
  created_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT wol_no_self_link CHECK (from_wo_id <> to_wo_id),
  UNIQUE (from_wo_id, to_wo_id, link_type)
);

CREATE INDEX IF NOT EXISTS idx_wol_org  ON public.work_order_links(organisation_id);
CREATE INDEX IF NOT EXISTS idx_wol_from ON public.work_order_links(from_wo_id);
CREATE INDEX IF NOT EXISTS idx_wol_to   ON public.work_order_links(to_wo_id);

ALTER TABLE public.work_order_links ENABLE ROW LEVEL SECURITY;

-- SELECT: any member of the caller's org.
DROP POLICY IF EXISTS wol_org_select ON public.work_order_links;
CREATE POLICY wol_org_select ON public.work_order_links
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  );

-- INSERT: own org, and BOTH endpoint WOs must live in the caller's org.
DROP POLICY IF EXISTS wol_org_insert ON public.work_order_links;
CREATE POLICY wol_org_insert ON public.work_order_links
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND from_wo_id IN (
      SELECT id FROM public.work_orders
      WHERE organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    )
    AND to_wo_id IN (
      SELECT id FROM public.work_orders
      WHERE organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    )
  );

-- UPDATE: present for the 4-policy standard; same guard on both sides.
DROP POLICY IF EXISTS wol_org_update ON public.work_order_links;
CREATE POLICY wol_org_update ON public.work_order_links
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  )
  WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND from_wo_id IN (
      SELECT id FROM public.work_orders
      WHERE organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    )
    AND to_wo_id IN (
      SELECT id FROM public.work_orders
      WHERE organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    )
  );

-- DELETE: any member of the caller's org.
DROP POLICY IF EXISTS wol_org_delete ON public.work_order_links;
CREATE POLICY wol_org_delete ON public.work_order_links
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  );
