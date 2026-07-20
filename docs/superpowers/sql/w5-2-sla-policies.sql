-- FM-03 / W5-2 — SLA policy engine.
-- Run in the Supabase SQL editor BEFORE deploying the FM-03 SLA settings page + routes.
-- Idempotent. Safe to run twice. Org-RLS pattern copied EXACTLY from b2-wo-categories.sql.
--
-- Design: a per-org, per-priority target matrix (response + resolution minutes).
--   * On WO create the API auto-fills sla_response_due_at (response target) and due_at
--     (resolution target) from the matching policy when the caller left due_at empty.
--   * first_response_at is captured the first time a WO enters in_progress.
--   * The on-hold clock stops the resolution SLA: sla_paused_at marks when a WO went
--     on_hold; leaving on_hold banks the elapsed minutes into sla_paused_total_minutes.
--   * Resolution breach is DERIVED at read time (completed_at vs due_at + paused minutes) —
--     no trigger here, and the work_orders base status set / constraints are untouched.
--
-- Security posture: 4-policy org RLS. INSERT and UPDATE both carry a WITH CHECK on
--   organisation_id so an authenticated caller cannot create/move a row into another org.
--   Writes are role-gated to admin/manager; SELECT is any org member (routes read targets).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.sla_policies (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id     UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  priority            TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  response_minutes    INTEGER,
  resolution_minutes  INTEGER,
  created_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE (organisation_id, priority)
);

CREATE INDEX IF NOT EXISTS idx_sla_policies_org ON public.sla_policies(organisation_id);

ALTER TABLE public.sla_policies ENABLE ROW LEVEL SECURITY;

-- SELECT: any member of the org (WO create/patch routes read the targets server-side).
DROP POLICY IF EXISTS sla_policies_org_select ON public.sla_policies;
CREATE POLICY sla_policies_org_select ON public.sla_policies
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  );

-- INSERT: own org + admin/manager only.
DROP POLICY IF EXISTS sla_policies_org_insert ON public.sla_policies;
CREATE POLICY sla_policies_org_insert ON public.sla_policies
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  );

-- UPDATE: own org + admin/manager only; WITH CHECK blocks org-swap.
DROP POLICY IF EXISTS sla_policies_org_update ON public.sla_policies;
CREATE POLICY sla_policies_org_update ON public.sla_policies
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  )
  WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  );

-- DELETE: own org + admin/manager only.
DROP POLICY IF EXISTS sla_policies_org_delete ON public.sla_policies;
CREATE POLICY sla_policies_org_delete ON public.sla_policies
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  );

-- Work-order SLA-clock columns. Additive only — no existing columns/constraints touched.
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS first_response_at         TIMESTAMPTZ;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS sla_response_due_at       TIMESTAMPTZ;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS sla_paused_total_minutes  INTEGER DEFAULT 0;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS sla_paused_at             TIMESTAMPTZ;
