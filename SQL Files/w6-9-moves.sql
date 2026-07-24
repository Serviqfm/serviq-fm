-- W6-9 / MKT-25 — Space & move management (MVP)
-- Run in the Supabase SQL editor BEFORE deploying /dashboard/moves.
-- Idempotent. Safe to run twice. Styled after w6-7-permits.sql.
--
-- A move request relocates an occupant or an asset between spaces. Lifecycle:
--   requested → approved → scheduled → completed   (rejected reachable pre-completion)
-- On completion of an asset move the app repoints assets.space_id/site_id to the
-- destination (org-scoped UPDATE via RLS). The UI gates approve/schedule/complete
-- to admin/manager; RLS gates every UPDATE/DELETE to admin/manager as well.
--
-- Security posture (4-policy org RLS):
--   * SELECT: any org member.  INSERT: any org member (files a request).
--     UPDATE/DELETE: admin/manager only.
--   * INSERT and UPDATE WITH CHECK pin organisation_id to the caller's org AND
--     bind asset_id / from_space_id / to_space_id (when set) to rows in that same
--     org — no cross-org references can be created or updated in.
--
-- Acceptance (owner, after running):
--   * anon-key SELECT returns only own-org moves; cross-org INSERT denied.
--   * a technician cannot UPDATE/DELETE (role gate) — cannot approve/complete.
--   * an admin of org A cannot reference an org-B space/asset (FK-to-org bind).
--   * a raw-API status jump (e.g. requested → completed) is rejected by the guard.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.space_moves (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  subject_type    TEXT NOT NULL,
  subject_label   TEXT,
  asset_id        UUID REFERENCES public.assets(id) ON DELETE SET NULL,
  from_space_id   UUID REFERENCES public.spaces(id) ON DELETE SET NULL,
  to_space_id     UUID REFERENCES public.spaces(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'requested',
  scheduled_for   TIMESTAMPTZ,
  requested_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_by     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  completed_at    TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT space_moves_subject_chk CHECK (subject_type IN ('occupant', 'asset')),
  CONSTRAINT space_moves_status_chk CHECK (
    status IN ('requested', 'approved', 'scheduled', 'completed', 'rejected')
  )
);

CREATE INDEX IF NOT EXISTS idx_space_moves_org   ON public.space_moves(organisation_id);
CREATE INDEX IF NOT EXISTS idx_space_moves_asset ON public.space_moves(asset_id)
  WHERE asset_id IS NOT NULL;

ALTER TABLE public.space_moves ENABLE ROW LEVEL SECURITY;

-- SELECT: any member of the org.
DROP POLICY IF EXISTS space_moves_org_select ON public.space_moves;
CREATE POLICY space_moves_org_select ON public.space_moves
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  );

-- INSERT: any org member files a request; FKs bound to the caller's org.
DROP POLICY IF EXISTS space_moves_org_insert ON public.space_moves;
CREATE POLICY space_moves_org_insert ON public.space_moves
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (asset_id IS NULL OR asset_id IN (
      SELECT id FROM public.assets WHERE organisation_id = space_moves.organisation_id))
    AND (from_space_id IS NULL OR from_space_id IN (
      SELECT s.id FROM public.spaces s JOIN public.sites si ON si.id = s.site_id
      WHERE si.organisation_id = space_moves.organisation_id))
    AND (to_space_id IS NULL OR to_space_id IN (
      SELECT s.id FROM public.spaces s JOIN public.sites si ON si.id = s.site_id
      WHERE si.organisation_id = space_moves.organisation_id))
  );

-- UPDATE: own org + admin/manager; WITH CHECK blocks org-swap and cross-org FKs.
DROP POLICY IF EXISTS space_moves_org_update ON public.space_moves;
CREATE POLICY space_moves_org_update ON public.space_moves
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  )
  WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
    AND (asset_id IS NULL OR asset_id IN (
      SELECT id FROM public.assets WHERE organisation_id = space_moves.organisation_id))
    AND (from_space_id IS NULL OR from_space_id IN (
      SELECT s.id FROM public.spaces s JOIN public.sites si ON si.id = s.site_id
      WHERE si.organisation_id = space_moves.organisation_id))
    AND (to_space_id IS NULL OR to_space_id IN (
      SELECT s.id FROM public.spaces s JOIN public.sites si ON si.id = s.site_id
      WHERE si.organisation_id = space_moves.organisation_id))
  );

-- DELETE: own org + admin/manager.
DROP POLICY IF EXISTS space_moves_org_delete ON public.space_moves;
CREATE POLICY space_moves_org_delete ON public.space_moves
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  );

-- Server-side lifecycle guard: a move only walks
--   requested → approved → scheduled → completed
-- with rejected reachable from any pre-completion state; completed/rejected are
-- terminal. Stops a raw-API jump that would e.g. complete a move that was never
-- approved (and thus relocate an asset without sign-off). UI renders only legal
-- buttons; this is the backstop.
CREATE OR REPLACE FUNCTION public.enforce_space_move_transition() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'requested' AND NEW.status IN ('approved','rejected'))
      OR (OLD.status = 'approved'  AND NEW.status IN ('scheduled','rejected'))
      OR (OLD.status = 'scheduled' AND NEW.status IN ('completed','rejected'))
    ) THEN
      RAISE EXCEPTION 'Illegal move status transition: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_space_move_transition ON public.space_moves;
CREATE TRIGGER trg_enforce_space_move_transition
  BEFORE UPDATE ON public.space_moves
  FOR EACH ROW EXECUTE FUNCTION public.enforce_space_move_transition();
