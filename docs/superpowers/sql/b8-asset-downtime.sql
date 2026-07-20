-- B8 / AL-03 — Asset downtime & reliability tracking (MEP assets).
-- Run in the Supabase SQL editor BEFORE relying on the Downtime tab.
-- Idempotent. Safe to run twice. Styled after b7-inspection-schedules.sql.
--
-- Design: one row per downtime period on an MEP asset.
--   * started_at .. ended_at; ended_at stays NULL while the asset is down
--     ("Mark Down" opens a row, "Mark Restored" closes it).
--   * cause is free text; work_order_id optionally links the failure WO.
--   * Manual-first: nothing auto-opens rows. Auto-opening a period when a
--     critical WO is created on the asset is a deliberate follow-up, not here.
--   * The asset detail page computes availability % / MTBF client-side from
--     these rows (web/src/lib/kpis.ts) — no RPC needed.
--   * The app must `next build` and run WITHOUT this migration: the Downtime
--     tab shows an empty list and Mark Down surfaces the insert error.
--
-- Security posture (4-policy org RLS):
--   * SELECT: any org member.
--   * INSERT/UPDATE: any org member — marking an asset down/restored is a
--     field action technicians perform (mirrors the ungated assets.status
--     quick-actions on the asset detail page). WITH CHECK on both pins
--     organisation_id to the caller's org and binds asset_id /
--     work_order_id / created_by to that same org — no cross-org rows can be
--     created or updated in.
--   * DELETE: admin/manager only (correcting bad log entries is admin work).
--
-- Acceptance (owner, after running):
--   * anon-key SELECT returns only own-org downtime; cross-org INSERT denied.
--   * a member cannot reference an org-B asset or WO (FK-to-org bind).
--   * a technician cannot DELETE; an admin can.
--   * ended_at earlier than started_at is rejected by CHECK.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.asset_downtime (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  asset_id        UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at        TIMESTAMPTZ,          -- NULL while the downtime is still open
  cause           TEXT,
  work_order_id   UUID REFERENCES public.work_orders(id) ON DELETE SET NULL,
  created_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT asset_downtime_range_chk CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE INDEX IF NOT EXISTS idx_asset_downtime_org   ON public.asset_downtime(organisation_id);
CREATE INDEX IF NOT EXISTS idx_asset_downtime_asset ON public.asset_downtime(asset_id, started_at DESC);
-- "is this asset currently down?" lookup.
CREATE INDEX IF NOT EXISTS idx_asset_downtime_open  ON public.asset_downtime(asset_id) WHERE ended_at IS NULL;

ALTER TABLE public.asset_downtime ENABLE ROW LEVEL SECURITY;

-- SELECT: any member of the org.
DROP POLICY IF EXISTS asset_downtime_org_select ON public.asset_downtime;
CREATE POLICY asset_downtime_org_select ON public.asset_downtime
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  );

-- INSERT: own org; asset / WO / creator all bound to that org.
DROP POLICY IF EXISTS asset_downtime_org_insert ON public.asset_downtime;
CREATE POLICY asset_downtime_org_insert ON public.asset_downtime
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND asset_id IN (SELECT id FROM public.assets WHERE organisation_id = asset_downtime.organisation_id)
    AND (work_order_id IS NULL OR work_order_id IN (SELECT id FROM public.work_orders WHERE organisation_id = asset_downtime.organisation_id))
    AND (created_by IS NULL OR created_by IN (SELECT id FROM public.users WHERE organisation_id = asset_downtime.organisation_id))
  );

-- UPDATE: own org; WITH CHECK blocks org-swap and cross-org FKs.
DROP POLICY IF EXISTS asset_downtime_org_update ON public.asset_downtime;
CREATE POLICY asset_downtime_org_update ON public.asset_downtime
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  )
  WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND asset_id IN (SELECT id FROM public.assets WHERE organisation_id = asset_downtime.organisation_id)
    AND (work_order_id IS NULL OR work_order_id IN (SELECT id FROM public.work_orders WHERE organisation_id = asset_downtime.organisation_id))
    AND (created_by IS NULL OR created_by IN (SELECT id FROM public.users WHERE organisation_id = asset_downtime.organisation_id))
  );

-- DELETE: own org + admin/manager.
DROP POLICY IF EXISTS asset_downtime_org_delete ON public.asset_downtime;
CREATE POLICY asset_downtime_org_delete ON public.asset_downtime
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  );
