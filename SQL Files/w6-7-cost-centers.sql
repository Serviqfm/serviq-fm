-- W6-7 / FM-29 — Cost centers & budget-vs-actual.
-- Run in the Supabase SQL editor BEFORE deploying the Cost Centers page.
-- Idempotent. Safe to run twice.
--
-- Design:
--   * cost_centers — a budget bucket (name, code, annual_budget) per org.
--   * work_orders gets a nullable cost_center_id so a WO's spend (labor + parts
--     + additional costs, from the WO-06/07 tables) rolls up to a cost center.
--   * The app degrades gracefully without this migration: the Cost Centers page
--     just shows an empty list and the WO cost_center_id write is a no-op, so
--     `next build` and the running app both work WITHOUT this migration applied.
--
-- Security posture (4-policy org RLS, mirrored from w5-2-wo-labor-costs.sql):
--   * SELECT / DELETE: any member of the caller's org.
--   * INSERT / UPDATE carry a WITH CHECK that pins organisation_id to the
--     caller's org. Write-role gating (admin/manager) is enforced in the UI;
--     the FK-to-org check keeps cross-tenant writes impossible either way.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.cost_centers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  name_ar         TEXT,
  code            TEXT,
  annual_budget   NUMERIC NOT NULL DEFAULT 0 CHECK (annual_budget >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cost_centers_org ON public.cost_centers(organisation_id);

ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cost_centers_org_select ON public.cost_centers;
CREATE POLICY cost_centers_org_select ON public.cost_centers
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  );

-- Budget CRUD is admin/manager only (UI gating is not a security boundary) —
-- parity with b5-wo-custom-statuses.sql and the other privileged config tables.
DROP POLICY IF EXISTS cost_centers_org_insert ON public.cost_centers;
CREATE POLICY cost_centers_org_insert ON public.cost_centers
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','manager')
  );

DROP POLICY IF EXISTS cost_centers_org_update ON public.cost_centers;
CREATE POLICY cost_centers_org_update ON public.cost_centers
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','manager')
  )
  WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','manager')
  );

DROP POLICY IF EXISTS cost_centers_org_delete ON public.cost_centers;
CREATE POLICY cost_centers_org_delete ON public.cost_centers
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','manager')
  );

-- Composite unique key so the WO link can be org-bound (a plain FK on id alone
-- would let a raw PostgREST UPDATE point an own-org WO at another tenant's center).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cost_centers_id_org_key') THEN
    ALTER TABLE public.cost_centers ADD CONSTRAINT cost_centers_id_org_key UNIQUE (id, organisation_id);
  END IF;
END $$;

-- Link column on work_orders. ON DELETE SET NULL: dropping a cost center leaves
-- its work orders intact, just un-assigned. Does NOT touch statuses/constraints.
ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS cost_center_id UUID;

-- Org-bound composite FK: (cost_center_id, organisation_id) must match a center in
-- the SAME org. NULL cost_center_id is unconstrained (MATCH SIMPLE).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_orders_cost_center_org_fk') THEN
    ALTER TABLE public.work_orders
      ADD CONSTRAINT work_orders_cost_center_org_fk
      FOREIGN KEY (cost_center_id, organisation_id)
      REFERENCES public.cost_centers(id, organisation_id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_work_orders_cost_center ON public.work_orders(cost_center_id);
