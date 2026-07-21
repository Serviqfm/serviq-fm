-- B2 / WO-04 — Org-managed work-order categories.
-- Run in the Supabase SQL editor BEFORE deploying the B2 settings tab / dropdowns.
-- Idempotent. Safe to run twice. Styled after t5-01-wo-custom-fields.sql.
--
-- Design: replace the hardcoded 12-category dropdown list with an org-scoped table.
--   * work_order_categories — org-scoped, admin/manager-managed category list.
--   * WO category stays a free TEXT string on work_orders (backward compatible):
--     deleting/renaming a category does NOT rewrite existing WOs.
--   * The web new/edit dropdowns read this table via an org-scoped client query and
--     fall back to the hardcoded defaults when the table is empty or absent, so
--     `next build` and the running app both work WITHOUT this migration applied.
--
-- Security posture (adversarial review, per Wave-1 asset-log finding):
--   * 4-policy org RLS. INSERT and UPDATE both carry a WITH CHECK on organisation_id
--     so an authenticated caller cannot create/move a row into another org.
--   * Writes (INSERT/UPDATE/DELETE) are additionally role-gated to admin/manager —
--     the UI hides the tab for other roles, RLS enforces it server-side.
--   * SELECT is any org member (technicians need the list to pick a category).
--
-- Acceptance (owner, after running):
--   * anon-key SELECT returns only own-org categories; cross-org INSERT/UPDATE denied.
--   * a technician cannot INSERT/UPDATE/DELETE (role gate).
--   * an admin/manager of org A cannot move a category into org B (WITH CHECK).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.work_order_categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  name_ar         TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (organisation_id, name)
);

CREATE INDEX IF NOT EXISTS idx_woc_org ON public.work_order_categories(organisation_id);

ALTER TABLE public.work_order_categories ENABLE ROW LEVEL SECURITY;

-- SELECT: any member of the org (technicians pick a category on WO create).
DROP POLICY IF EXISTS woc_org_select ON public.work_order_categories;
CREATE POLICY woc_org_select ON public.work_order_categories
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  );

-- INSERT: own org + admin/manager only.
DROP POLICY IF EXISTS woc_org_insert ON public.work_order_categories;
CREATE POLICY woc_org_insert ON public.work_order_categories
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  );

-- UPDATE: own org + admin/manager only; WITH CHECK blocks org-swap.
DROP POLICY IF EXISTS woc_org_update ON public.work_order_categories;
CREATE POLICY woc_org_update ON public.work_order_categories
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  )
  WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  );

-- DELETE: own org + admin/manager only.
DROP POLICY IF EXISTS woc_org_delete ON public.work_order_categories;
CREATE POLICY woc_org_delete ON public.work_order_categories
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  );

-- Optional seed: give every org the current hardcoded defaults so the dropdown is
-- populated immediately. Idempotent via the UNIQUE (organisation_id, name) key.
INSERT INTO public.work_order_categories (organisation_id, name, name_ar, sort_order)
SELECT o.id, d.name, d.name_ar, d.sort_order
FROM public.organisations o
CROSS JOIN (VALUES
  ('HVAC',             'تكييف',          0),
  ('Electrical',       'كهرباء',         1),
  ('Plumbing',         'سباكة',          2),
  ('Elevator / Lift',  'مصعد',           3),
  ('Fire Safety',      'السلامة من الحريق', 4),
  ('Furniture',        'أثاث',           5),
  ('Kitchen Equipment','معدات المطبخ',    6),
  ('Pool / Gym',       'مسبح / صالة رياضية', 7),
  ('IT Equipment',     'معدات تقنية',     8),
  ('Signage',          'لافتات',         9),
  ('Vehicle',          'مركبة',          10),
  ('Other',            'أخرى',           11)
) AS d(name, name_ar, sort_order)
ON CONFLICT (organisation_id, name) DO NOTHING;
