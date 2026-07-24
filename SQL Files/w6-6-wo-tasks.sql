-- W6-6 — Work-order task upgrade (WO-20)
-- Run in Supabase SQL editor. Idempotent. Additive to sprint-k-03-wo-tasks-checklists.sql.
--
-- Adds per-task note, an attached image, a pass/flag/fail result, and a
-- "required" flag. Required tasks that are not done block WO close (enforced in
-- web/src/app/api/work-orders/[id]/close/route.ts).

ALTER TABLE work_order_tasks
  ADD COLUMN IF NOT EXISTS note        TEXT,
  ADD COLUMN IF NOT EXISTS image_url   TEXT,
  ADD COLUMN IF NOT EXISTS result      TEXT CHECK (result IN ('pass', 'flag', 'fail')),
  ADD COLUMN IF NOT EXISTS is_required BOOLEAN DEFAULT false;
