-- W6-7 / AL-06 — Asset check-in / check-out (tools & movable assets).
-- Run in the Supabase SQL editor BEFORE relying on the Checkouts page.
-- Idempotent. Safe to run twice. Styled after b8-asset-downtime.sql.
--
-- Design: one row per checkout event on an asset.
--   * checked_out_at .. checked_in_at; checked_in_at stays NULL while the
--     asset is OUT ("Check Out" opens a row, "Check In" closes it).
--   * An asset is "currently checked out" iff it has a row with
--     checked_in_at IS NULL. The page reads open rows to flag availability.
--   * expected_return_at is an optional due date (overdue = past + still open).
--   * Cascading (child assets follow the parent on checkout) is OUT of MVP
--     scope — each asset is checked out independently.
--
-- Security posture (4-policy org RLS, copied from asset_downtime):
--   * SELECT: any org member.
--   * INSERT/UPDATE: any org member — checking a tool in/out is a field
--     action. WITH CHECK on both pins organisation_id to the caller's org and
--     binds asset_id / checked_out_to / checked_out_by / checked_in_by to that
--     same org — no cross-org rows can be created or updated in.
--   * DELETE: admin/manager only (correcting bad log entries is admin work).
--
-- Acceptance (owner, after running):
--   * anon-key SELECT returns only own-org checkouts; cross-org INSERT denied.
--   * a member cannot reference an org-B asset or user (FK-to-org bind).
--   * a technician cannot DELETE; an admin can.
--   * checked_in_at earlier than checked_out_at is rejected by CHECK.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.asset_checkouts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id    UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  asset_id           UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  checked_out_to     UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  checked_out_by     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  checked_out_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expected_return_at TIMESTAMPTZ,          -- optional due date
  checked_in_at      TIMESTAMPTZ,          -- NULL while the asset is still OUT
  checked_in_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  notes              TEXT,
  created_at         TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT asset_checkouts_range_chk CHECK (checked_in_at IS NULL OR checked_in_at >= checked_out_at)
);

CREATE INDEX IF NOT EXISTS idx_asset_checkouts_org   ON public.asset_checkouts(organisation_id);
CREATE INDEX IF NOT EXISTS idx_asset_checkouts_asset ON public.asset_checkouts(asset_id, checked_out_at DESC);
-- "is this asset currently checked out?" lookup.
CREATE INDEX IF NOT EXISTS idx_asset_checkouts_open  ON public.asset_checkouts(asset_id) WHERE checked_in_at IS NULL;

ALTER TABLE public.asset_checkouts ENABLE ROW LEVEL SECURITY;

-- SELECT: any member of the org.
DROP POLICY IF EXISTS asset_checkouts_org_select ON public.asset_checkouts;
CREATE POLICY asset_checkouts_org_select ON public.asset_checkouts
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  );

-- INSERT: own org; asset / assignee / actor all bound to that org.
DROP POLICY IF EXISTS asset_checkouts_org_insert ON public.asset_checkouts;
CREATE POLICY asset_checkouts_org_insert ON public.asset_checkouts
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND asset_id IN (SELECT id FROM public.assets WHERE organisation_id = asset_checkouts.organisation_id)
    AND checked_out_to IN (SELECT id FROM public.users WHERE organisation_id = asset_checkouts.organisation_id)
    AND (checked_out_by IS NULL OR checked_out_by IN (SELECT id FROM public.users WHERE organisation_id = asset_checkouts.organisation_id))
    AND (checked_in_by IS NULL OR checked_in_by IN (SELECT id FROM public.users WHERE organisation_id = asset_checkouts.organisation_id))
  );

-- UPDATE: own org; WITH CHECK blocks org-swap and cross-org FKs.
DROP POLICY IF EXISTS asset_checkouts_org_update ON public.asset_checkouts;
CREATE POLICY asset_checkouts_org_update ON public.asset_checkouts
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  )
  WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND asset_id IN (SELECT id FROM public.assets WHERE organisation_id = asset_checkouts.organisation_id)
    AND checked_out_to IN (SELECT id FROM public.users WHERE organisation_id = asset_checkouts.organisation_id)
    AND (checked_out_by IS NULL OR checked_out_by IN (SELECT id FROM public.users WHERE organisation_id = asset_checkouts.organisation_id))
    AND (checked_in_by IS NULL OR checked_in_by IN (SELECT id FROM public.users WHERE organisation_id = asset_checkouts.organisation_id))
  );

-- DELETE: own org + admin/manager.
DROP POLICY IF EXISTS asset_checkouts_org_delete ON public.asset_checkouts;
CREATE POLICY asset_checkouts_org_delete ON public.asset_checkouts
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  );
