-- FM-27 — Incident / emergency log (MVP).
-- Run in the Supabase SQL editor BEFORE deploying the /dashboard/incidents pages.
-- Idempotent. Safe to run twice. Styled after b7-inspection-schedules.sql.
--
-- Design: a per-org incident row with a lifecycle:
--   open → investigating → resolved → closed
--   * severity: low / medium / high / critical.
--   * site_id / asset_id are optional org-bound context.
--   * reported_by is the org member who logged it (nullable — SET NULL on user delete).
--   * resolution_notes + resolved_at are filled when the incident is resolved.
--   * A corrective work order is raised by DEEP-LINKING to the WO create page
--     (/dashboard/work-orders/new?asset_id=…&site_id=…) — no FK, no WO-page edit.
--   * The app must `next build` and run WITHOUT this migration applied — the
--     incidents pages show an empty list / a clear error if the table is absent.
--
-- Security posture (4-policy org RLS):
--   * SELECT: any org member.
--   * INSERT: any org member (frontline staff must be able to report emergencies);
--     organisation_id + every FK pinned to the caller's org.
--   * UPDATE / DELETE: admin/manager only (lifecycle + resolution are supervisory);
--     WITH CHECK blocks org-swap and cross-org FKs.
--
-- Acceptance (owner, after running):
--   * anon-key SELECT returns only own-org incidents; cross-org INSERT denied.
--   * a technician CAN INSERT (report) but CANNOT UPDATE/DELETE (role gate).
--   * an admin of org A cannot reference an org-B site/asset (FK-to-org bind).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.incidents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  description      TEXT,
  severity         TEXT NOT NULL DEFAULT 'medium',
  status           TEXT NOT NULL DEFAULT 'open',
  site_id          UUID REFERENCES public.sites(id)  ON DELETE SET NULL,
  asset_id         UUID REFERENCES public.assets(id) ON DELETE SET NULL,
  reported_by      UUID REFERENCES public.users(id)  ON DELETE SET NULL,
  occurred_at      TIMESTAMPTZ,
  resolved_at      TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT incidents_severity_chk CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT incidents_status_chk   CHECK (status   IN ('open', 'investigating', 'resolved', 'closed'))
);

-- Re-run guard for older table shapes.
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS resolution_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_incidents_org      ON public.incidents(organisation_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status   ON public.incidents(organisation_id, status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON public.incidents(organisation_id, severity);

ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;

-- SELECT: any member of the org.
DROP POLICY IF EXISTS incidents_org_select ON public.incidents;
CREATE POLICY incidents_org_select ON public.incidents
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  );

-- INSERT: any org member; org + every FK bound to the caller's org.
DROP POLICY IF EXISTS incidents_org_insert ON public.incidents;
CREATE POLICY incidents_org_insert ON public.incidents
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (site_id  IS NULL OR site_id  IN (SELECT id FROM public.sites  WHERE organisation_id = incidents.organisation_id))
    AND (asset_id IS NULL OR asset_id IN (SELECT id FROM public.assets WHERE organisation_id = incidents.organisation_id))
    AND (reported_by IS NULL OR reported_by IN (SELECT id FROM public.users WHERE organisation_id = incidents.organisation_id))
  );

-- UPDATE: admin/manager only; WITH CHECK blocks org-swap and cross-org FKs.
DROP POLICY IF EXISTS incidents_org_update ON public.incidents;
CREATE POLICY incidents_org_update ON public.incidents
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  )
  WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
    AND (site_id  IS NULL OR site_id  IN (SELECT id FROM public.sites  WHERE organisation_id = incidents.organisation_id))
    AND (asset_id IS NULL OR asset_id IN (SELECT id FROM public.assets WHERE organisation_id = incidents.organisation_id))
    AND (reported_by IS NULL OR reported_by IN (SELECT id FROM public.users WHERE organisation_id = incidents.organisation_id))
  );

-- DELETE: admin/manager only.
DROP POLICY IF EXISTS incidents_org_delete ON public.incidents;
CREATE POLICY incidents_org_delete ON public.incidents
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  );
