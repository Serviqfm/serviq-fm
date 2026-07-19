-- B7 / CORE-26 — Recurring/scheduled inspections (incl. hotel room rotation).
-- Run in the Supabase SQL editor BEFORE deploying the schedules page / cron.
-- Idempotent. Safe to run twice. Styled after b5-scheduled-reports.sql.
--
-- Design: a per-org schedule row that /api/cron/inspection-generate reads daily.
--   * inspection_schedules — org-scoped, admin/manager-managed.
--   * frequency preset (daily..annual) or 'custom' + interval_days override.
--   * next_due_at drives cron eligibility; the cron rolls it forward after
--     generating a WO (source 'inspection') pointing at the template.
--   * rotation JSONB is an ORDERED array of space ids the schedule cycles
--     through (hotel every-room rotation); rotation_index is the cursor the
--     cron advances each generation (modulo the list length). When rotation is
--     non-empty it wins over the fixed space_id.
--   * work_orders.inspection_schedule_id links generated WOs back for de-dupe
--     and provenance (mirrors pm_schedule_id).
--   * The app must `next build` and run WITHOUT this migration applied — the
--     schedules page shows an empty list and the cron fails closed with a
--     clear error if the table is absent.
--
-- Security posture (4-policy org RLS):
--   * SELECT: any org member. INSERT/UPDATE/DELETE: admin/manager only.
--   * INSERT and UPDATE WITH CHECK pin organisation_id to the caller's org AND
--     bind every FK to that org: template_id (required), site_id / space_id /
--     assigned_to (when set) must all live in the caller's org — no
--     cross-org references can be created or updated in.
--
-- Acceptance (owner, after running):
--   * anon-key SELECT returns only own-org schedules; cross-org INSERT denied.
--   * a technician cannot INSERT/UPDATE/DELETE (role gate).
--   * an admin of org A cannot reference an org-B template (FK-to-org bind).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.inspection_schedules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  template_id     UUID NOT NULL REFERENCES public.inspection_templates(id) ON DELETE CASCADE,
  site_id         UUID REFERENCES public.sites(id) ON DELETE SET NULL,
  space_id        UUID REFERENCES public.spaces(id) ON DELETE SET NULL,
  frequency       TEXT NOT NULL DEFAULT 'monthly',
  interval_days   INTEGER,           -- custom interval; used when frequency = 'custom'
  next_due_at     TIMESTAMPTZ NOT NULL,
  assigned_to     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  rotation        JSONB NOT NULL DEFAULT '[]'::jsonb,  -- ordered array of space ids
  rotation_index  INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT insp_sched_frequency_chk CHECK (
    frequency IN ('daily', 'weekly', 'fortnightly', 'monthly', 'quarterly', 'biannual', 'annual', 'custom')
  ),
  CONSTRAINT insp_sched_interval_chk CHECK (interval_days IS NULL OR interval_days > 0)
);

-- Re-run guards for older table shapes.
ALTER TABLE public.inspection_schedules ADD COLUMN IF NOT EXISTS interval_days  INTEGER;
ALTER TABLE public.inspection_schedules ADD COLUMN IF NOT EXISTS rotation       JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.inspection_schedules ADD COLUMN IF NOT EXISTS rotation_index INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.inspection_schedules ADD COLUMN IF NOT EXISTS is_active      BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_insp_sched_org ON public.inspection_schedules(organisation_id);
-- Cron scans active schedules whose next_due_at is due.
CREATE INDEX IF NOT EXISTS idx_insp_sched_due ON public.inspection_schedules(next_due_at) WHERE is_active;

-- Provenance + de-dupe link on generated WOs (mirrors pm_schedule_id).
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS inspection_schedule_id
  UUID REFERENCES public.inspection_schedules(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_wo_insp_sched ON public.work_orders(inspection_schedule_id)
  WHERE inspection_schedule_id IS NOT NULL;

ALTER TABLE public.inspection_schedules ENABLE ROW LEVEL SECURITY;

-- SELECT: any member of the org.
DROP POLICY IF EXISTS insp_sched_org_select ON public.inspection_schedules;
CREATE POLICY insp_sched_org_select ON public.inspection_schedules
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  );

-- INSERT: own org + admin/manager; every FK bound to the caller's org.
DROP POLICY IF EXISTS insp_sched_org_insert ON public.inspection_schedules;
CREATE POLICY insp_sched_org_insert ON public.inspection_schedules
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
    AND template_id IN (SELECT id FROM public.inspection_templates WHERE organisation_id = inspection_schedules.organisation_id)
    AND (site_id IS NULL OR site_id IN (SELECT id FROM public.sites WHERE organisation_id = inspection_schedules.organisation_id))
    AND (space_id IS NULL OR space_id IN (SELECT id FROM public.spaces WHERE organisation_id = inspection_schedules.organisation_id))
    AND (assigned_to IS NULL OR assigned_to IN (SELECT id FROM public.users WHERE organisation_id = inspection_schedules.organisation_id))
  );

-- UPDATE: own org + admin/manager; WITH CHECK blocks org-swap and cross-org FKs.
DROP POLICY IF EXISTS insp_sched_org_update ON public.inspection_schedules;
CREATE POLICY insp_sched_org_update ON public.inspection_schedules
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  )
  WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
    AND template_id IN (SELECT id FROM public.inspection_templates WHERE organisation_id = inspection_schedules.organisation_id)
    AND (site_id IS NULL OR site_id IN (SELECT id FROM public.sites WHERE organisation_id = inspection_schedules.organisation_id))
    AND (space_id IS NULL OR space_id IN (SELECT id FROM public.spaces WHERE organisation_id = inspection_schedules.organisation_id))
    AND (assigned_to IS NULL OR assigned_to IN (SELECT id FROM public.users WHERE organisation_id = inspection_schedules.organisation_id))
  );

-- DELETE: own org + admin/manager.
DROP POLICY IF EXISTS insp_sched_org_delete ON public.inspection_schedules;
CREATE POLICY insp_sched_org_delete ON public.inspection_schedules
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- work_orders.source CHECK widening — the live DB constrains source to
-- ('manual','pm_schedule','requester') (out-of-repo constraint; documented in
-- api/work-orders/route.ts). The inspection cron inserts source='inspection',
-- which would violate it on every run. Widen the constraint to include
-- 'inspection'. Idempotent: skipped when the definition already allows it.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
     WHERE conrelid = 'public.work_orders'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%source%'
  LOOP
    IF r.def NOT ILIKE '%inspection%' THEN
      EXECUTE format('ALTER TABLE public.work_orders DROP CONSTRAINT %I', r.conname);
      EXECUTE 'ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_source_check
        CHECK (source IN (''manual'',''pm_schedule'',''requester'',''inspection''))';
      RAISE NOTICE 'B7: widened work_orders source CHECK (%) to include inspection', r.conname;
    END IF;
  END LOOP;
END $$;
