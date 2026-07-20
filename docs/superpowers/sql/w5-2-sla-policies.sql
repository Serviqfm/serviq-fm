-- FM-03 / W5-2 — SLA policy engine.
-- Run in the Supabase SQL editor BEFORE deploying the FM-03 SLA settings page + routes.
-- Idempotent. Safe to run twice. Org-RLS pattern copied EXACTLY from b2-wo-categories.sql.
--
-- Design: a per-org, per-priority target matrix (response + resolution minutes).
--   * On WO create the API auto-fills sla_response_due_at (response target) and due_at
--     (resolution target) from the matching policy when the caller left due_at empty.
--   * first_response_at / the on-hold pause clock are maintained by a BEFORE UPDATE
--     trigger (below), NOT route JS — status changes reach work_orders from several
--     write paths (API PATCH, the WO detail page's direct client update, the kanban
--     board), so a route-only hook would silently miss most transitions. The trigger
--     only writes SLA-clock columns and never blocks/rewrites status, so it composes
--     with the CORE-20/23 enforcement triggers and leaves the base status set intact.
--   * Resolution breach is DERIVED at read time (completed_at vs due_at + paused minutes).
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

-- SLA clock maintenance — DB-layer so it fires on EVERY write path that changes status
-- (API PATCH, WO detail page direct update, kanban board). Only writes SLA-clock columns
-- on NEW; never blocks or rewrites status, so it coexists with the CORE-20/23 enforcement
-- triggers. Not SECURITY DEFINER: it only touches the row the caller is already updating.
CREATE OR REPLACE FUNCTION public.maintain_wo_sla_clock() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- First response: stamp once, the first time the WO enters in_progress.
    IF NEW.status = 'in_progress' AND NEW.first_response_at IS NULL THEN
      NEW.first_response_at := now();
    END IF;
    -- Enter on-hold: start the pause clock.
    IF NEW.status = 'on_hold' AND OLD.status <> 'on_hold' THEN
      NEW.sla_paused_at := now();
    -- Leave on-hold: bank the elapsed paused minutes, clear the marker.
    ELSIF OLD.status = 'on_hold' AND NEW.status <> 'on_hold' AND OLD.sla_paused_at IS NOT NULL THEN
      NEW.sla_paused_total_minutes := COALESCE(OLD.sla_paused_total_minutes, 0)
        + CEIL(EXTRACT(EPOCH FROM (now() - OLD.sla_paused_at)) / 60.0)::int;
      NEW.sla_paused_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_maintain_wo_sla_clock ON public.work_orders;
CREATE TRIGGER trg_maintain_wo_sla_clock
  BEFORE UPDATE ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.maintain_wo_sla_clock();
