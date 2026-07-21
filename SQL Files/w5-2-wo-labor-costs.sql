-- W5 / WO-06 + WO-07 — Work-order labor time logs + additional costs.
-- Run in the Supabase SQL editor BEFORE deploying the Labor / Costs tabs on the
-- WO detail page. Idempotent. Safe to run twice.
--
-- Design:
--   * work_order_time_logs — one row per logged block of technician time.
--     hourly_rate is SNAPSHOTTED from users.hourly_rate at insert time so a later
--     rate change does not retroactively re-price historical labor. Line cost is
--     computed in the UI as minutes/60 * hourly_rate.
--   * work_order_costs — one row per additional (non-parts, non-labor) cost.
--   * The app degrades gracefully without these tables: the Labor/Costs tabs just
--     show empty lists, so `next build` and the running app both work WITHOUT this
--     migration applied.
--
-- Security posture (4-policy org RLS, mirrored EXACTLY from b6-wo-linking.sql):
--   * SELECT / DELETE: any member of the caller's org.
--   * INSERT / UPDATE carry a WITH CHECK that pins organisation_id to the caller's
--     org AND requires work_order_id to live in that org — a caller cannot write a
--     row onto another org's work order.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Labor time logs
CREATE TABLE IF NOT EXISTS public.work_order_time_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  work_order_id   UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES public.users(id) ON DELETE SET NULL,
  minutes         INTEGER NOT NULL CHECK (minutes > 0),
  hourly_rate     NUMERIC,
  note            TEXT,
  logged_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_wo_time_logs_wo  ON public.work_order_time_logs(work_order_id);
CREATE INDEX IF NOT EXISTS idx_wo_time_logs_org ON public.work_order_time_logs(organisation_id);

ALTER TABLE public.work_order_time_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wo_time_logs_org_select ON public.work_order_time_logs;
CREATE POLICY wo_time_logs_org_select ON public.work_order_time_logs
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS wo_time_logs_org_insert ON public.work_order_time_logs;
CREATE POLICY wo_time_logs_org_insert ON public.work_order_time_logs
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND work_order_id IN (
      SELECT id FROM public.work_orders
      WHERE organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS wo_time_logs_org_update ON public.work_order_time_logs;
CREATE POLICY wo_time_logs_org_update ON public.work_order_time_logs
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  )
  WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND work_order_id IN (
      SELECT id FROM public.work_orders
      WHERE organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS wo_time_logs_org_delete ON public.work_order_time_logs;
CREATE POLICY wo_time_logs_org_delete ON public.work_order_time_logs
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  );

-- 2. Additional costs
CREATE TABLE IF NOT EXISTS public.work_order_costs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  work_order_id   UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  description     TEXT NOT NULL,
  amount          NUMERIC NOT NULL CHECK (amount >= 0),
  category        TEXT,
  created_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wo_costs_wo  ON public.work_order_costs(work_order_id);
CREATE INDEX IF NOT EXISTS idx_wo_costs_org ON public.work_order_costs(organisation_id);

ALTER TABLE public.work_order_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wo_costs_org_select ON public.work_order_costs;
CREATE POLICY wo_costs_org_select ON public.work_order_costs
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS wo_costs_org_insert ON public.work_order_costs;
CREATE POLICY wo_costs_org_insert ON public.work_order_costs
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND work_order_id IN (
      SELECT id FROM public.work_orders
      WHERE organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS wo_costs_org_update ON public.work_order_costs;
CREATE POLICY wo_costs_org_update ON public.work_order_costs
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  )
  WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND work_order_id IN (
      SELECT id FROM public.work_orders
      WHERE organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS wo_costs_org_delete ON public.work_order_costs;
CREATE POLICY wo_costs_org_delete ON public.work_order_costs
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  );
