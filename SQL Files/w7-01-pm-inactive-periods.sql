-- W7-01 / 1C-27 — Multiple inactive periods per PM schedule.
-- Run in the Supabase SQL editor. Idempotent: safe to run twice.
--
-- Design:
--   * pm_schedule_inactive_periods — N recurring (every year) month/day windows per
--     schedule during which the PM generates NOTHING (e.g. "Ramadan", "Summer
--     shutdown"). A window may wrap the year end (e.g. Dec 20 -> Jan 5). Both ends
--     are inclusive. start == end is a single day.
--   * The legacy single seasonal ACTIVE window on pm_schedules (is_seasonal,
--     seasonal_start_month, seasonal_end_month — 1C-04) is UNTOUCHED and keeps
--     working. A schedule is inactive on a date if it is outside the legacy seasonal
--     window OR inside any of these periods.
--   * /api/cron/pm-generate loads these rows in one batched query and rolls
--     next_due_at past every period. If this migration has NOT been run the cron and
--     the PM forms treat every schedule as having no periods (no failure).
--
-- Security posture: 4-policy org RLS copied from w6-9-pm-groups.sql.
--   * SELECT: any org member.
--   * INSERT/UPDATE/DELETE: admin/manager only; WITH CHECK pins organisation_id to
--     the caller's org.
--   * Org-bound composite FK (pm_schedule_id, organisation_id) -> pm_schedules(id,
--     organisation_id) so a period can never be attached to another org's schedule
--     via a leaked UUID over direct PostgREST.
--
-- Acceptance (owner, after running):
--   * anon-key SELECT returns only own-org periods; cross-org INSERT/UPDATE denied.
--   * a technician cannot INSERT/UPDATE/DELETE a period (role gate).
--   * inserting a period with organisation_id = own org but pm_schedule_id of another
--     org's schedule is rejected by the composite FK.
--   * deleting a schedule deletes its periods (ON DELETE CASCADE).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Composite unique key on pm_schedules so the period -> schedule FK can be org-bound.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pm_schedules_id_org_key' AND conrelid = 'public.pm_schedules'::regclass
  ) THEN
    ALTER TABLE public.pm_schedules ADD CONSTRAINT pm_schedules_id_org_key UNIQUE (id, organisation_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.pm_schedule_inactive_periods (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  pm_schedule_id  UUID NOT NULL,
  label           TEXT,
  start_month     SMALLINT NOT NULL CHECK (start_month BETWEEN 1 AND 12),
  start_day       SMALLINT NOT NULL CHECK (start_day BETWEEN 1 AND 31),
  end_month       SMALLINT NOT NULL CHECK (end_month BETWEEN 1 AND 12),
  end_day         SMALLINT NOT NULL CHECK (end_day BETWEEN 1 AND 31),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Day must exist in its month (Feb allows 29; the app clamps it in non-leap years).
  CONSTRAINT pm_sip_start_day_valid CHECK (
    start_day <= CASE start_month WHEN 2 THEN 29 WHEN 4 THEN 30 WHEN 6 THEN 30 WHEN 9 THEN 30 WHEN 11 THEN 30 ELSE 31 END
  ),
  CONSTRAINT pm_sip_end_day_valid CHECK (
    end_day <= CASE end_month WHEN 2 THEN 29 WHEN 4 THEN 30 WHEN 6 THEN 30 WHEN 9 THEN 30 WHEN 11 THEN 30 ELSE 31 END
  )
);

-- Org-bound FK onto the schedule; deleting the schedule deletes its periods.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pm_sip_schedule_org_fkey' AND conrelid = 'public.pm_schedule_inactive_periods'::regclass
  ) THEN
    ALTER TABLE public.pm_schedule_inactive_periods
      ADD CONSTRAINT pm_sip_schedule_org_fkey
      FOREIGN KEY (pm_schedule_id, organisation_id)
      REFERENCES public.pm_schedules (id, organisation_id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pm_sip_org ON public.pm_schedule_inactive_periods(organisation_id);
CREATE INDEX IF NOT EXISTS idx_pm_sip_schedule ON public.pm_schedule_inactive_periods(pm_schedule_id);

ALTER TABLE public.pm_schedule_inactive_periods ENABLE ROW LEVEL SECURITY;

-- SELECT: any member of the org.
DROP POLICY IF EXISTS pm_sip_org_select ON public.pm_schedule_inactive_periods;
CREATE POLICY pm_sip_org_select ON public.pm_schedule_inactive_periods
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  );

-- INSERT: own org + admin/manager only.
DROP POLICY IF EXISTS pm_sip_org_insert ON public.pm_schedule_inactive_periods;
CREATE POLICY pm_sip_org_insert ON public.pm_schedule_inactive_periods
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  );

-- UPDATE: own org + admin/manager only; WITH CHECK blocks org-swap.
DROP POLICY IF EXISTS pm_sip_org_update ON public.pm_schedule_inactive_periods;
CREATE POLICY pm_sip_org_update ON public.pm_schedule_inactive_periods
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  )
  WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  );

-- DELETE: own org + admin/manager only.
DROP POLICY IF EXISTS pm_sip_org_delete ON public.pm_schedule_inactive_periods;
CREATE POLICY pm_sip_org_delete ON public.pm_schedule_inactive_periods
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  );
