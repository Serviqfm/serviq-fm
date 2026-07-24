-- W6-4 / AL-04 — Org-defined custom asset statuses (display sub-states).
-- Run in the Supabase SQL editor BEFORE deploying the W6-4 asset-statuses page.
-- Idempotent. Safe to run twice. Styled after b5-wo-custom-statuses.sql.
--
-- DESIGN (mirrors the shipped WO custom-statuses system): a custom status is a
-- DISPLAY sub-state that MAPS to one of the asset BASE statuses. The base
-- assets.status stays authoritative (active / under_maintenance / retired) — this
-- migration does NOT constrain or alter that column, per the W6-4 mandate.
--   * asset_statuses — org-scoped, admin/manager-managed. maps_to_base_status is
--     CHECK-ed against the three base asset states the app already uses.
--   * assets.custom_status_id — nullable FK, ON DELETE SET NULL so removing a
--     status can never orphan an asset or wedge its base status. Setting a custom
--     status ALSO sets assets.status = maps_to_base_status (done in the asset PATCH
--     route) so lists/reports keep grouping by the base status.
--
-- Security posture (matches b5-wo-custom-statuses.sql adversarial review):
--   * 4-policy org RLS. INSERT and UPDATE both carry WITH CHECK on organisation_id.
--   * Writes (INSERT/UPDATE/DELETE) are role-gated to admin/manager; SELECT is any
--     org member (the edit form shows the status select to everyone).
--
-- App `next build`s and runs WITHOUT this migration applied: the settings page
-- treats any query error as empty, and the asset pages read custom_status_id off
-- select('*') (absent pre-migration → no custom badge).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.asset_statuses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id     UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  label               TEXT NOT NULL,
  label_ar            TEXT,
  color               TEXT,
  maps_to_base_status TEXT NOT NULL
    CHECK (maps_to_base_status IN ('active','under_maintenance','retired')),
  sort_order          INTEGER NOT NULL DEFAULT 0,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE (organisation_id, label)
);

CREATE INDEX IF NOT EXISTS idx_asset_statuses_org ON public.asset_statuses(organisation_id);

-- Nullable display sub-state on the asset. Base `status` stays authoritative;
-- ON DELETE SET NULL so removing a custom status never orphans an asset.
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS custom_status_id UUID
    REFERENCES public.asset_statuses(id) ON DELETE SET NULL;

ALTER TABLE public.asset_statuses ENABLE ROW LEVEL SECURITY;

-- SELECT: any member of the org.
DROP POLICY IF EXISTS asset_statuses_org_select ON public.asset_statuses;
CREATE POLICY asset_statuses_org_select ON public.asset_statuses
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  );

-- INSERT: own org + admin/manager only.
DROP POLICY IF EXISTS asset_statuses_org_insert ON public.asset_statuses;
CREATE POLICY asset_statuses_org_insert ON public.asset_statuses
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  );

-- UPDATE: own org + admin/manager only; WITH CHECK blocks org-swap.
DROP POLICY IF EXISTS asset_statuses_org_update ON public.asset_statuses;
CREATE POLICY asset_statuses_org_update ON public.asset_statuses
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  )
  WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  );

-- DELETE: own org + admin/manager only.
DROP POLICY IF EXISTS asset_statuses_org_delete ON public.asset_statuses;
CREATE POLICY asset_statuses_org_delete ON public.asset_statuses
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  );
