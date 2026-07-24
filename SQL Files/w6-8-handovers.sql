-- CORE-30 — Compound unit-handover checklist (MVP).
-- Run in the Supabase SQL editor BEFORE deploying the /dashboard/handovers pages.
-- Idempotent. Safe to run twice. Styled after w6-7-incidents.sql.
--
-- Design: a per-org unit-handover row for compound / residential FM.
--   A unit is handed to (move_in) or taken back from (move_out) an occupant,
--   walked through a checklist, then completed.
--   Lifecycle:  draft → in_progress → completed
--   * direction: move_in / move_out.
--   * site_id / asset_id are optional org-bound context (the building / the unit asset).
--   * unit_label is free text (e.g. "Tower B — Apt 1204") since a unit may have no asset row.
--   * occupant_name is the tenant/occupant receiving or returning the unit.
--   * checklist is a jsonb array of { item, ok, note } walked on the detail page.
--   * completed_at + completed status are set when the handover is signed off.
--   * created_by is the org member who opened it (nullable — SET NULL on user delete).
--   * The app must `next build` and run WITHOUT this migration applied — the
--     handover pages show an empty list / a clear error if the table is absent.
--
-- Security posture (4-policy org RLS):
--   * SELECT: any org member.
--   * INSERT: any org member (site staff open handovers);
--     organisation_id + every FK pinned to the caller's org.
--   * UPDATE / DELETE: admin/manager only (sign-off is supervisory);
--     WITH CHECK blocks org-swap and cross-org FKs.
--
-- Acceptance (owner, after running):
--   * anon-key SELECT returns only own-org handovers; cross-org INSERT denied.
--   * a technician CAN INSERT but CANNOT UPDATE/DELETE (role gate).
--   * an admin of org A cannot reference an org-B site/asset (FK-to-org bind).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.unit_handovers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  site_id          UUID REFERENCES public.sites(id)  ON DELETE SET NULL,
  asset_id         UUID REFERENCES public.assets(id) ON DELETE SET NULL,
  unit_label       TEXT NOT NULL,
  occupant_name    TEXT,
  direction        TEXT NOT NULL DEFAULT 'move_in',
  status           TEXT NOT NULL DEFAULT 'draft',
  checklist        JSONB NOT NULL DEFAULT '[]'::jsonb,
  completed_at     TIMESTAMPTZ,
  created_by       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unit_handovers_direction_chk CHECK (direction IN ('move_in', 'move_out')),
  CONSTRAINT unit_handovers_status_chk    CHECK (status    IN ('draft', 'in_progress', 'completed'))
);

CREATE INDEX IF NOT EXISTS idx_unit_handovers_org       ON public.unit_handovers(organisation_id);
CREATE INDEX IF NOT EXISTS idx_unit_handovers_status    ON public.unit_handovers(organisation_id, status);
CREATE INDEX IF NOT EXISTS idx_unit_handovers_direction ON public.unit_handovers(organisation_id, direction);

ALTER TABLE public.unit_handovers ENABLE ROW LEVEL SECURITY;

-- SELECT: any member of the org.
DROP POLICY IF EXISTS unit_handovers_org_select ON public.unit_handovers;
CREATE POLICY unit_handovers_org_select ON public.unit_handovers
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  );

-- INSERT: any org member; org + every FK bound to the caller's org.
DROP POLICY IF EXISTS unit_handovers_org_insert ON public.unit_handovers;
CREATE POLICY unit_handovers_org_insert ON public.unit_handovers
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (site_id  IS NULL OR site_id  IN (SELECT id FROM public.sites  WHERE organisation_id = unit_handovers.organisation_id))
    AND (asset_id IS NULL OR asset_id IN (SELECT id FROM public.assets WHERE organisation_id = unit_handovers.organisation_id))
    AND (created_by IS NULL OR created_by = auth.uid())
  );

-- UPDATE: admin/manager only; WITH CHECK blocks org-swap and cross-org FKs.
DROP POLICY IF EXISTS unit_handovers_org_update ON public.unit_handovers;
CREATE POLICY unit_handovers_org_update ON public.unit_handovers
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  )
  WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
    AND (site_id  IS NULL OR site_id  IN (SELECT id FROM public.sites  WHERE organisation_id = unit_handovers.organisation_id))
    AND (asset_id IS NULL OR asset_id IN (SELECT id FROM public.assets WHERE organisation_id = unit_handovers.organisation_id))
    AND (created_by IS NULL OR created_by IN (SELECT id FROM public.users WHERE organisation_id = unit_handovers.organisation_id))
  );

-- DELETE: admin/manager only.
DROP POLICY IF EXISTS unit_handovers_org_delete ON public.unit_handovers;
CREATE POLICY unit_handovers_org_delete ON public.unit_handovers
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  );
