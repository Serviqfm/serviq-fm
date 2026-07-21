-- Sprint K — UpKeep-parity columns on pm_schedules
-- Run in Supabase SQL editor. Idempotent.
--
-- is_archived:   permanent archive (distinct from delete; pause via is_active
--                remains the reversible option). Archived schedules are hidden
--                from the default list and skipped by /api/cron/pm-generate.
-- end_date:      optional stop date — no work orders are generated past it and
--                the schedule is deactivated once next_due_at rolls beyond it.
-- days_of_week:  weekly schedules only — int[] of weekdays (0=Sun .. 6=Sat).
--                The cron roll-forward lands on the next selected weekday.

ALTER TABLE pm_schedules
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;

ALTER TABLE pm_schedules
  ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ;

ALTER TABLE pm_schedules
  ADD COLUMN IF NOT EXISTS days_of_week INT[] DEFAULT NULL; -- 0=Sun .. 6=Sat, only for weekly

CREATE INDEX IF NOT EXISTS idx_pm_schedules_archived ON pm_schedules(is_archived);
