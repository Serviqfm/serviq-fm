-- W6-1 / MKT-15 — Org-managed failure codes applied at WO closure.
-- Run in the Supabase SQL editor BEFORE deploying the W6-1 settings tab / close dialog.
-- Idempotent. Safe to run twice. Styled after b2-wo-categories.sql.
--
-- Design:
--   * failure_codes — org-scoped, admin/manager-managed list of failure codes
--     (code + bilingual label) used for reliability reporting.
--   * work_orders.failure_code_id — nullable FK, optionally set when a WO is
--     closed via the close route. Deleting a code is blocked while referenced
--     (default RESTRICT) — deactivate via is_active instead.
--
-- Security posture: 4-policy org RLS copied from work_order_categories.
--   * SELECT: any org member (technicians see the code on a WO).
--   * INSERT/UPDATE/DELETE: admin/manager only; WITH CHECK on organisation_id
--     blocks creating/moving a row into another org.
--
-- Acceptance (owner, after running):
--   * anon-key SELECT returns only own-org codes; cross-org INSERT/UPDATE denied.
--   * a technician cannot INSERT/UPDATE/DELETE (role gate).
--   * closing a WO with a failure code from another org is rejected by the route.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.failure_codes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  code            TEXT NOT NULL,
  label           TEXT NOT NULL,
  label_ar        TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (organisation_id, code)
);

CREATE INDEX IF NOT EXISTS idx_failure_codes_org ON public.failure_codes(organisation_id);

ALTER TABLE public.failure_codes ENABLE ROW LEVEL SECURITY;

-- SELECT: any member of the org.
DROP POLICY IF EXISTS fc_org_select ON public.failure_codes;
CREATE POLICY fc_org_select ON public.failure_codes
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  );

-- INSERT: own org + admin/manager only.
DROP POLICY IF EXISTS fc_org_insert ON public.failure_codes;
CREATE POLICY fc_org_insert ON public.failure_codes
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  );

-- UPDATE: own org + admin/manager only; WITH CHECK blocks org-swap.
DROP POLICY IF EXISTS fc_org_update ON public.failure_codes;
CREATE POLICY fc_org_update ON public.failure_codes
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  )
  WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  );

-- DELETE: own org + admin/manager only.
DROP POLICY IF EXISTS fc_org_delete ON public.failure_codes;
CREATE POLICY fc_org_delete ON public.failure_codes
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  );

-- Optional failure code captured at WO closure (nullable — not required to close).
ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS failure_code_id UUID REFERENCES public.failure_codes(id);
