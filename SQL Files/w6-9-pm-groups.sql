-- W6-9 / 1C-26 — PM schedule groups (organisational grouping for bulk management).
-- Run in the Supabase SQL editor BEFORE deploying the group filter / bulk actions on
-- the PM schedules list. Idempotent. Safe to run twice.
--
-- Design:
--   * pm_schedule_groups — an org-scoped label ("HVAC — Tower A", "Q3 Statutory",
--     …). Nothing more: this is a MANAGEMENT grouping so an admin can pause / resume
--     / delete a whole batch of schedules at once.
--   * pm_schedules.group_id — nullable FK onto a group. NULL = ungrouped (the
--     pre-existing behaviour). The generator is UNTOUCHED — group_id is never read by
--     /api/cron/pm-generate; one-trigger-generates-all stays a documented follow-up.
--   * The app degrades gracefully without this migration: the group filter shows only
--     "All", and `select *` still works (group_id is just absent), so `next build`
--     and the running app both work WITHOUT this migration applied.
--
-- Security posture: 4-policy org RLS copied from w6-1-failure-codes.sql.
--   * SELECT: any org member.
--   * INSERT/UPDATE/DELETE: admin/manager only; WITH CHECK pins organisation_id to
--     the caller's org so a row can't be created/moved into another org.
--
-- Acceptance (owner, after running):
--   * anon-key SELECT returns only own-org groups; cross-org INSERT/UPDATE denied.
--   * a technician cannot INSERT/UPDATE/DELETE a group (role gate).
--   * assigning a schedule to another org's group is rejected by the composite FK.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.pm_schedule_groups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, name)
);

CREATE INDEX IF NOT EXISTS idx_pm_schedule_groups_org ON public.pm_schedule_groups(organisation_id);

ALTER TABLE public.pm_schedule_groups ENABLE ROW LEVEL SECURITY;

-- SELECT: any member of the org.
DROP POLICY IF EXISTS psg_org_select ON public.pm_schedule_groups;
CREATE POLICY psg_org_select ON public.pm_schedule_groups
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  );

-- INSERT: own org + admin/manager only.
DROP POLICY IF EXISTS psg_org_insert ON public.pm_schedule_groups;
CREATE POLICY psg_org_insert ON public.pm_schedule_groups
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  );

-- UPDATE: own org + admin/manager only; WITH CHECK blocks org-swap.
DROP POLICY IF EXISTS psg_org_update ON public.pm_schedule_groups;
CREATE POLICY psg_org_update ON public.pm_schedule_groups
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  )
  WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  );

-- DELETE: own org + admin/manager only.
DROP POLICY IF EXISTS psg_org_delete ON public.pm_schedule_groups;
CREATE POLICY psg_org_delete ON public.pm_schedule_groups
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  );

-- Composite unique key so the schedule reference can be org-bound (a plain FK on id
-- alone would let a leaked cross-org group UUID be attached via direct PostgREST).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pm_schedule_groups_id_org_key') THEN
    ALTER TABLE public.pm_schedule_groups ADD CONSTRAINT pm_schedule_groups_id_org_key UNIQUE (id, organisation_id);
  END IF;
END $$;

-- Nullable group membership on the schedule. NULL = ungrouped.
ALTER TABLE public.pm_schedules
  ADD COLUMN IF NOT EXISTS group_id UUID;

CREATE INDEX IF NOT EXISTS idx_pm_schedules_group ON public.pm_schedules(group_id);

-- Org-bound composite FK: (group_id, organisation_id) must match a group in the SAME
-- org. NULL group_id is unconstrained (MATCH SIMPLE), so ungrouped schedules are
-- unaffected. Deleting a group SET NULLs the membership (the schedules survive
-- ungrouped) — the app's "delete group" action removes the schedules first, this FK
-- only guards a raw group-row delete.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pm_schedules_group_org_fkey') THEN
    ALTER TABLE public.pm_schedules
      ADD CONSTRAINT pm_schedules_group_org_fkey
      FOREIGN KEY (group_id, organisation_id)
      REFERENCES public.pm_schedule_groups (id, organisation_id)
      ON DELETE SET NULL;
  END IF;
END $$;
