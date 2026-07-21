-- B5 / WO-25 — Org-defined custom work-order statuses (display sub-states).
-- Run in the Supabase SQL editor BEFORE deploying the B5 statuses admin page.
-- Idempotent. Safe to run twice. Styled after b2-wo-categories.sql.
--
-- DESIGN (critical — do not "flatten" custom statuses onto work_orders.status):
--   work_orders.status MUST keep holding one of the 6 BASE statuses
--   (new/assigned/in_progress/on_hold/completed/closed) so the CORE-20 transition
--   trigger (core-20-23-role-aware-enforcement.sql) keeps seeing legal base
--   transitions. A custom status is a DISPLAY sub-state that MAPS to a base status:
--     * work_order_custom_statuses — org-scoped, admin/manager-managed. Each row has
--       maps_to_base_status CHECK-ed against the 6 base values.
--     * work_orders.custom_status_id — nullable FK. Setting a custom status ALSO sets
--       work_orders.status = that row's maps_to_base_status, so the trigger fires on a
--       legal base transition and reporting/notifications group by the base status.
--   The FK is ON DELETE SET NULL: deleting a custom status leaves the WO on its base
--   status (never orphaned, never blocked).
--
-- Security posture (matches b2-wo-categories.sql adversarial review):
--   * 4-policy org RLS. INSERT and UPDATE both carry WITH CHECK on organisation_id so
--     an authenticated caller cannot create/move a row into another org.
--   * Writes (INSERT/UPDATE/DELETE) are role-gated to admin/manager — the admin page
--     is admin/manager-gated in the app, RLS enforces it server-side.
--   * SELECT is any org member (technicians pick a custom status on the WO detail).
--
-- Acceptance (owner, after running):
--   * anon-key SELECT returns only own-org statuses; cross-org INSERT/UPDATE denied.
--   * a technician cannot INSERT/UPDATE/DELETE (role gate).
--   * an admin/manager of org A cannot move a status into org B (WITH CHECK).
--   * a base_status outside the 6 values is rejected by the CHECK.
--   * app `next build`s and runs WITHOUT this migration applied (table/column optional).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.work_order_custom_statuses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id     UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  name_ar             TEXT,
  color               TEXT,
  maps_to_base_status TEXT NOT NULL
    CHECK (maps_to_base_status IN ('new','assigned','in_progress','on_hold','completed','closed')),
  sort_order          INTEGER NOT NULL DEFAULT 0,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE (organisation_id, name)
);

CREATE INDEX IF NOT EXISTS idx_wocs_org ON public.work_order_custom_statuses(organisation_id);

-- Nullable display sub-state on the WO. Base `status` stays authoritative for the
-- lifecycle trigger; ON DELETE SET NULL so removing a custom status can never orphan
-- a work order or wedge its base status.
ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS custom_status_id UUID
    REFERENCES public.work_order_custom_statuses(id) ON DELETE SET NULL;

ALTER TABLE public.work_order_custom_statuses ENABLE ROW LEVEL SECURITY;

-- SELECT: any member of the org (technicians pick a custom status on WO detail).
DROP POLICY IF EXISTS wocs_org_select ON public.work_order_custom_statuses;
CREATE POLICY wocs_org_select ON public.work_order_custom_statuses
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  );

-- INSERT: own org + admin/manager only.
DROP POLICY IF EXISTS wocs_org_insert ON public.work_order_custom_statuses;
CREATE POLICY wocs_org_insert ON public.work_order_custom_statuses
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  );

-- UPDATE: own org + admin/manager only; WITH CHECK blocks org-swap.
DROP POLICY IF EXISTS wocs_org_update ON public.work_order_custom_statuses;
CREATE POLICY wocs_org_update ON public.work_order_custom_statuses
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  )
  WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  );

-- DELETE: own org + admin/manager only.
DROP POLICY IF EXISTS wocs_org_delete ON public.work_order_custom_statuses;
CREATE POLICY wocs_org_delete ON public.work_order_custom_statuses
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  );
