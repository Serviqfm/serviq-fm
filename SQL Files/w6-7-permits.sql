-- W6-7 / FM-26 — Permit-to-work module (MVP)
-- Run in the Supabase SQL editor BEFORE deploying /dashboard/permits.
-- Idempotent. Safe to run twice. Styled after b7-inspection-schedules.sql.
--
-- A permit authorises hazardous work (hot work, confined space, electrical,
-- working at height, etc.), optionally tied to a work order. Lifecycle:
--   draft → requested → approved → active → closed   (rejected is terminal)
-- The app gates approve/reject/close to admin/manager in the UI; RLS gates
-- every write to admin/manager as well.
--
-- Security posture (4-policy org RLS):
--   * SELECT: any org member.  INSERT/UPDATE/DELETE: admin/manager only.
--   * INSERT and UPDATE WITH CHECK pin organisation_id to the caller's org AND
--     bind work_order_id (when set) to a WO in that same org — no cross-org
--     references can be created or updated in.
--
-- Acceptance (owner, after running):
--   * anon-key SELECT returns only own-org permits; cross-org INSERT denied.
--   * a technician cannot INSERT/UPDATE/DELETE (role gate).
--   * an admin of org A cannot reference an org-B work order (FK-to-org bind).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.work_permits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  work_order_id   UUID REFERENCES public.work_orders(id) ON DELETE SET NULL,
  permit_type     TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft',
  hazards         TEXT,
  controls        TEXT,
  valid_from      TIMESTAMPTZ,
  valid_to        TIMESTAMPTZ,
  requested_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_by     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT work_permits_status_chk CHECK (
    status IN ('draft', 'requested', 'approved', 'active', 'closed', 'rejected')
  )
);

CREATE INDEX IF NOT EXISTS idx_work_permits_org ON public.work_permits(organisation_id);
CREATE INDEX IF NOT EXISTS idx_work_permits_wo  ON public.work_permits(work_order_id)
  WHERE work_order_id IS NOT NULL;

ALTER TABLE public.work_permits ENABLE ROW LEVEL SECURITY;

-- SELECT: any member of the org.
DROP POLICY IF EXISTS work_permits_org_select ON public.work_permits;
CREATE POLICY work_permits_org_select ON public.work_permits
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  );

-- INSERT: own org + admin/manager; work_order_id bound to the caller's org.
DROP POLICY IF EXISTS work_permits_org_insert ON public.work_permits;
CREATE POLICY work_permits_org_insert ON public.work_permits
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
    AND (work_order_id IS NULL OR work_order_id IN (
      SELECT id FROM public.work_orders WHERE organisation_id = work_permits.organisation_id))
  );

-- UPDATE: own org + admin/manager; WITH CHECK blocks org-swap and cross-org FKs.
DROP POLICY IF EXISTS work_permits_org_update ON public.work_permits;
CREATE POLICY work_permits_org_update ON public.work_permits
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  )
  WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
    AND (work_order_id IS NULL OR work_order_id IN (
      SELECT id FROM public.work_orders WHERE organisation_id = work_permits.organisation_id))
  );

-- DELETE: own org + admin/manager.
DROP POLICY IF EXISTS work_permits_org_delete ON public.work_permits;
CREATE POLICY work_permits_org_delete ON public.work_permits
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  );

-- Server-side lifecycle guard: a permit authorises hazardous work, so it can only
-- walk draft → requested → approved → active → closed (rejected reachable from any
-- pre-active state; closed/rejected terminal). Stops a raw-API jump that would e.g.
-- activate a permit that was never approved. UI already renders only legal buttons.
CREATE OR REPLACE FUNCTION public.enforce_work_permit_transition() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'draft'     AND NEW.status IN ('requested','rejected'))
      OR (OLD.status = 'requested' AND NEW.status IN ('approved','rejected'))
      OR (OLD.status = 'approved'  AND NEW.status IN ('active','rejected'))
      OR (OLD.status = 'active'    AND NEW.status = 'closed')
    ) THEN
      RAISE EXCEPTION 'Illegal permit status transition: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_work_permit_transition ON public.work_permits;
CREATE TRIGGER trg_enforce_work_permit_transition
  BEFORE UPDATE ON public.work_permits
  FOR EACH ROW EXECUTE FUNCTION public.enforce_work_permit_transition();
