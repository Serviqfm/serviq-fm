-- Sprint J — pm_schedule_id on work_orders + lead_time_days on pm_schedules
-- Run in Supabase SQL editor. Idempotent.
--
-- Required by /api/cron/pm-generate which creates a WO per due PM and uses
-- pm_schedule_id to dedupe (no double-generation for the same cycle).

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS pm_schedule_id UUID REFERENCES pm_schedules(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_work_orders_pm_schedule ON work_orders(pm_schedule_id);

ALTER TABLE pm_schedules
  ADD COLUMN IF NOT EXISTS lead_time_days INTEGER DEFAULT 2;
