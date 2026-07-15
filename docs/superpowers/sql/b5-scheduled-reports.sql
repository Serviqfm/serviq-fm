-- B5 / MKT-08 + FM-11 — Scheduled report packs.
-- Run in the Supabase SQL editor BEFORE deploying the reports builder / cron.
-- Idempotent. Safe to run twice. Styled after b2-wo-categories.sql.
--
-- Design: a per-org schedule row that the /api/cron/scheduled-reports cron reads.
--   * scheduled_reports — org-scoped, admin/manager-managed schedule.
--   * config JSONB holds the report pack definition (which standard reports, the
--     builder query, etc.) — kept as JSONB so the shape can evolve without a
--     migration. recipients TEXT[] holds the email addresses to send to.
--   * frequency is 'weekly' | 'monthly'. next_run_at drives cron eligibility;
--     the cron advances it after a successful send.
--   * The app must `next build` and run WITHOUT this migration applied — the
--     builder page works standalone (client-side export) and the cron fails
--     closed with a clear error if the table is absent.
--
-- Security posture (adversarial review, per Wave-1 asset-log finding):
--   * 4-policy org RLS. INSERT and UPDATE both carry a WITH CHECK on
--     organisation_id so an authenticated caller cannot create/move a row into
--     another org.
--   * Writes (INSERT/UPDATE/DELETE) are role-gated to admin/manager — scheduling
--     org-wide report emails is an admin action. SELECT is any org member.
--   * The cron reads with the service-role key (bypasses RLS) but scopes every
--     query by organisation_id from the row it processes.
--
-- Acceptance (owner, after running):
--   * anon-key SELECT returns only own-org schedules; cross-org INSERT/UPDATE denied.
--   * a technician cannot INSERT/UPDATE/DELETE (role gate).
--   * an admin/manager of org A cannot move a schedule into org B (WITH CHECK).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.scheduled_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  config          JSONB NOT NULL DEFAULT '{}'::jsonb,
  recipients      TEXT[] NOT NULL DEFAULT '{}',
  frequency       TEXT NOT NULL DEFAULT 'monthly',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  next_run_at     TIMESTAMPTZ,
  last_run_at     TIMESTAMPTZ,
  created_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT scheduled_reports_frequency_chk CHECK (frequency IN ('weekly', 'monthly'))
);

-- ADD COLUMN IF NOT EXISTS guards for re-runs where an older table shape exists.
ALTER TABLE public.scheduled_reports ADD COLUMN IF NOT EXISTS config      JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.scheduled_reports ADD COLUMN IF NOT EXISTS recipients  TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.scheduled_reports ADD COLUMN IF NOT EXISTS is_active   BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.scheduled_reports ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ;
ALTER TABLE public.scheduled_reports ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_sched_reports_org ON public.scheduled_reports(organisation_id);
-- Cron scans active schedules whose next_run_at is due.
CREATE INDEX IF NOT EXISTS idx_sched_reports_due ON public.scheduled_reports(next_run_at) WHERE is_active;

ALTER TABLE public.scheduled_reports ENABLE ROW LEVEL SECURITY;

-- SELECT: any member of the org can see the schedules.
DROP POLICY IF EXISTS sched_reports_org_select ON public.scheduled_reports;
CREATE POLICY sched_reports_org_select ON public.scheduled_reports
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  );

-- INSERT: own org + admin/manager only.
DROP POLICY IF EXISTS sched_reports_org_insert ON public.scheduled_reports;
CREATE POLICY sched_reports_org_insert ON public.scheduled_reports
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  );

-- UPDATE: own org + admin/manager only; WITH CHECK blocks org-swap.
DROP POLICY IF EXISTS sched_reports_org_update ON public.scheduled_reports;
CREATE POLICY sched_reports_org_update ON public.scheduled_reports
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  )
  WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  );

-- DELETE: own org + admin/manager only.
DROP POLICY IF EXISTS sched_reports_org_delete ON public.scheduled_reports;
CREATE POLICY sched_reports_org_delete ON public.scheduled_reports
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  );
