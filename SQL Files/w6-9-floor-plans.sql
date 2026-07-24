-- W6-9 / AL-17 — Floor plans with mapping pins (MVP)
-- Run in the Supabase SQL editor BEFORE deploying /dashboard/floor-plans.
-- Idempotent. Safe to run twice. Styled after w6-7-permits.sql.
--
-- A floor plan is an uploaded image (stored in the existing `media` bucket)
-- scoped to a site. Pins are placed on the image at x/y (percent of image
-- dimensions, 0–100) and each optionally links to a space or an asset.
--
-- Security posture (4-policy org RLS on both tables):
--   * SELECT: any org member.  INSERT/UPDATE/DELETE: admin/manager only.
--   * INSERT/UPDATE WITH CHECK pin organisation_id to the caller's org AND bind
--     every FK (site_id, floor_plan_id, space_id, asset_id) to a row in that
--     same org — no cross-org references can be created or updated in.
--
-- Acceptance (owner, after running):
--   * anon-key SELECT returns only own-org floor plans/pins; cross-org INSERT denied.
--   * a technician cannot INSERT/UPDATE/DELETE (role gate).
--   * an admin of org A cannot reference an org-B site/space/asset (FK-to-org bind).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.floor_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  site_id         UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  image_url       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_floor_plans_org  ON public.floor_plans(organisation_id);
CREATE INDEX IF NOT EXISTS idx_floor_plans_site ON public.floor_plans(site_id);

CREATE TABLE IF NOT EXISTS public.floor_plan_pins (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  floor_plan_id   UUID NOT NULL REFERENCES public.floor_plans(id) ON DELETE CASCADE,
  space_id        UUID REFERENCES public.spaces(id) ON DELETE SET NULL,
  asset_id        UUID REFERENCES public.assets(id) ON DELETE SET NULL,
  label           TEXT,
  x               NUMERIC NOT NULL,
  y               NUMERIC NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT floor_plan_pins_x_chk CHECK (x >= 0 AND x <= 100),
  CONSTRAINT floor_plan_pins_y_chk CHECK (y >= 0 AND y <= 100)
);

CREATE INDEX IF NOT EXISTS idx_floor_plan_pins_org  ON public.floor_plan_pins(organisation_id);
CREATE INDEX IF NOT EXISTS idx_floor_plan_pins_plan ON public.floor_plan_pins(floor_plan_id);

ALTER TABLE public.floor_plans     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.floor_plan_pins ENABLE ROW LEVEL SECURITY;

-- ─── floor_plans ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS floor_plans_org_select ON public.floor_plans;
CREATE POLICY floor_plans_org_select ON public.floor_plans
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS floor_plans_org_insert ON public.floor_plans;
CREATE POLICY floor_plans_org_insert ON public.floor_plans
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
    AND site_id IN (SELECT id FROM public.sites WHERE organisation_id = floor_plans.organisation_id)
  );

DROP POLICY IF EXISTS floor_plans_org_update ON public.floor_plans;
CREATE POLICY floor_plans_org_update ON public.floor_plans
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  )
  WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
    AND site_id IN (SELECT id FROM public.sites WHERE organisation_id = floor_plans.organisation_id)
  );

DROP POLICY IF EXISTS floor_plans_org_delete ON public.floor_plans;
CREATE POLICY floor_plans_org_delete ON public.floor_plans
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  );

-- ─── floor_plan_pins ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS floor_plan_pins_org_select ON public.floor_plan_pins;
CREATE POLICY floor_plan_pins_org_select ON public.floor_plan_pins
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS floor_plan_pins_org_insert ON public.floor_plan_pins;
CREATE POLICY floor_plan_pins_org_insert ON public.floor_plan_pins
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
    AND floor_plan_id IN (SELECT id FROM public.floor_plans WHERE organisation_id = floor_plan_pins.organisation_id)
    AND (space_id IS NULL OR space_id IN (SELECT id FROM public.spaces WHERE organisation_id = floor_plan_pins.organisation_id))
    AND (asset_id IS NULL OR asset_id IN (SELECT id FROM public.assets WHERE organisation_id = floor_plan_pins.organisation_id))
  );

DROP POLICY IF EXISTS floor_plan_pins_org_update ON public.floor_plan_pins;
CREATE POLICY floor_plan_pins_org_update ON public.floor_plan_pins
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  )
  WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
    AND floor_plan_id IN (SELECT id FROM public.floor_plans WHERE organisation_id = floor_plan_pins.organisation_id)
    AND (space_id IS NULL OR space_id IN (SELECT id FROM public.spaces WHERE organisation_id = floor_plan_pins.organisation_id))
    AND (asset_id IS NULL OR asset_id IN (SELECT id FROM public.assets WHERE organisation_id = floor_plan_pins.organisation_id))
  );

DROP POLICY IF EXISTS floor_plan_pins_org_delete ON public.floor_plan_pins;
CREATE POLICY floor_plan_pins_org_delete ON public.floor_plan_pins
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  );
