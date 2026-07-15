-- Track B4-B — PM completion (1C-09) + true calendar recurrence (1C-10).
-- Run in the Supabase SQL editor. Idempotent. Safe to run twice.
-- Builds on t8-01-meters-pm.sql (meters + hybrid generate_due_pm_work_orders()).
--
-- WHAT THIS ADDS
--   1. pm_schedules recurrence config (ADD COLUMN IF NOT EXISTS):
--        scheduling_mode  'fixed' (calendar-driven, current behaviour) |
--                         'floating' (1C-09: next due = last WO's completed_at + interval).
--        interval_count   1C-10: fire every N units (e.g. every 2). NULL = use the
--                         `frequency` preset (daily/weekly/... = the legacy day-count model).
--        interval_unit    'day' | 'week' | 'month' | 'year'. month/year use true
--                         calendar math (add_months, no 30d/365d drift).
--        anchor_day       1-31 day-of-month anchor for month/year units (e.g. always
--                         the 1st or 15th), clamped to the month length.
--   2. generate_due_pm_work_orders() rewritten to honour both:
--        * fixed schedules roll next_due_at by the interval config (falling back to the
--          frequency preset), keeping the W4.2 meter/hybrid + one-open-WO de-dupe intact.
--        * floating schedules generate the next WO only once the PREVIOUS one is completed,
--          anchoring next_due_at off its completed_at. First WO fires immediately.
--
-- Acceptance (owner, after running):
--   * a monthly-on-the-1st schedule (interval_unit='month', anchor_day=1) stays on the
--     1st across month lengths (Jan 31 base still lands Feb 1, Mar 1, ...).
--   * 'every 2 months' (interval_count=2, interval_unit='month') advances 2 real months.
--   * a floating schedule generates the next WO only after the previous WO completes,
--     due = completed_at + interval; fixed schedules unchanged.
--   * meter / hybrid arm and the one-open-WO de-dupe from t8-01 still hold.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Recurrence config columns
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE pm_schedules
  ADD COLUMN IF NOT EXISTS scheduling_mode TEXT NOT NULL DEFAULT 'fixed';
ALTER TABLE pm_schedules
  ADD COLUMN IF NOT EXISTS interval_count INTEGER;
ALTER TABLE pm_schedules
  ADD COLUMN IF NOT EXISTS interval_unit TEXT;   -- 'day' | 'week' | 'month' | 'year'
ALTER TABLE pm_schedules
  ADD COLUMN IF NOT EXISTS anchor_day INTEGER;   -- 1-31, month/year units only

-- Guard rails (idempotent): mode is one of the two known values; unit is one of four.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pm_schedules_scheduling_mode_chk') THEN
    ALTER TABLE pm_schedules ADD CONSTRAINT pm_schedules_scheduling_mode_chk
      CHECK (scheduling_mode IN ('fixed', 'floating'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pm_schedules_interval_unit_chk') THEN
    ALTER TABLE pm_schedules ADD CONSTRAINT pm_schedules_interval_unit_chk
      CHECK (interval_unit IS NULL OR interval_unit IN ('day', 'week', 'month', 'year'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pm_schedules_anchor_day_chk') THEN
    ALTER TABLE pm_schedules ADD CONSTRAINT pm_schedules_anchor_day_chk
      CHECK (anchor_day IS NULL OR (anchor_day >= 1 AND anchor_day <= 31));
  END IF;
END$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Shared roll-forward helper — one interval advance honouring interval config,
--    then the legacy frequency preset as a fallback. Mirrors pm-utils.ts rollNextDue.
--    IMMUTABLE + no table access, so it stays cheap inside the generate loop.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pm_roll_next_due(
  p_from          timestamptz,
  p_frequency     text,
  p_interval_count integer,
  p_interval_unit text,
  p_anchor_day    integer
) RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_next timestamptz;
  v_last_day integer;
BEGIN
  -- 1C-10 interval config takes precedence when fully specified.
  IF p_interval_count IS NOT NULL AND p_interval_count > 0 AND p_interval_unit IS NOT NULL THEN
    v_next := CASE p_interval_unit
      WHEN 'day'   THEN p_from + (p_interval_count || ' days')::interval
      WHEN 'week'  THEN p_from + (p_interval_count || ' weeks')::interval
      WHEN 'month' THEN p_from + (p_interval_count || ' months')::interval
      WHEN 'year'  THEN p_from + (p_interval_count || ' years')::interval
      ELSE NULL END;
    IF v_next IS NOT NULL THEN
      -- anchor_day forces day-of-month for month/year units, clamped to month length.
      IF p_interval_unit IN ('month', 'year') AND p_anchor_day IS NOT NULL
         AND p_anchor_day BETWEEN 1 AND 31 THEN
        v_last_day := EXTRACT(DAY FROM (date_trunc('month', v_next) + interval '1 month' - interval '1 day'))::int;
        v_next := date_trunc('day', v_next)
                  + ((LEAST(p_anchor_day, v_last_day) - 1) || ' days')::interval
                  + (v_next - date_trunc('day', v_next));  -- keep original time-of-day
      END IF;
      RETURN v_next;
    END IF;
  END IF;

  -- Fallback: legacy frequency day-count model.
  RETURN p_from + (CASE p_frequency
    WHEN 'daily' THEN 1 WHEN 'weekly' THEN 7 WHEN 'fortnightly' THEN 14
    WHEN 'monthly' THEN 30 WHEN 'quarterly' THEN 90 WHEN 'biannual' THEN 180
    WHEN 'annual' THEN 365 ELSE 30 END || ' days')::interval;
END;
$$;

REVOKE ALL ON FUNCTION pm_roll_next_due(timestamptz, text, integer, text, integer) FROM public;
GRANT EXECUTE ON FUNCTION pm_roll_next_due(timestamptz, text, integer, text, integer) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. generate_due_pm_work_orders() — extends t8-01 with fixed/floating modes and
--    interval-config roll. SECURITY DEFINER, search_path pinned, cron-only grants.
--    Keeps the meter/hybrid arm and one-open-WO de-dupe from t8-01 intact.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION generate_due_pm_work_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pm             RECORD;
  v_generated    integer := 0;
  v_next         timestamptz;
  v_base         timestamptz;
  v_calendar_due boolean;
  v_meter_due    boolean;
  v_reading      numeric;
  v_floating     boolean;
  v_prev         RECORD;
  v_due          timestamptz;  -- the generated WO's due date (may differ from the roll anchor)
BEGIN
  FOR pm IN
    SELECT * FROM pm_schedules
     WHERE is_active = true
       AND COALESCE(is_archived, false) = false
  LOOP
    v_floating := COALESCE(pm.scheduling_mode, 'fixed') = 'floating';

    -- Floating (1C-09): timing is driven by the PREVIOUS WO's completion, not the
    -- calendar. Look at the most recent WO for this schedule.
    IF v_floating THEN
      SELECT status, completed_at INTO v_prev
        FROM work_orders
       WHERE pm_schedule_id = pm.id
       ORDER BY created_at DESC
       LIMIT 1;
      IF v_prev.status IS NOT NULL THEN
        -- A prior WO exists: wait until it's completed, then wait one interval past it.
        IF v_prev.status NOT IN ('completed', 'closed') THEN CONTINUE; END IF;
        IF v_prev.completed_at IS NULL THEN CONTINUE; END IF;
        v_base := v_prev.completed_at;
        v_due  := pm_roll_next_due(v_base, pm.frequency, pm.interval_count, pm.interval_unit, pm.anchor_day);
        IF v_due > now() THEN CONTINUE; END IF;  -- not yet one interval past completion
        v_calendar_due := true;
      ELSE
        -- No prior WO → create the first one immediately, due on next_due_at.
        v_base := COALESCE(pm.next_due_at, now());
        v_due  := v_base;
        v_calendar_due := true;
      END IF;
    ELSE
      -- Fixed: calendar arm, due within this schedule's lead window (default 2 days).
      v_calendar_due := pm.next_due_at IS NOT NULL
        AND pm.next_due_at <= now() + (COALESCE(pm.lead_time_days, 2) || ' days')::interval;
      v_base := pm.next_due_at;
      v_due  := pm.next_due_at;
    END IF;

    -- Meter arm (fixed/hybrid only; floating is completion-driven): current reading
    -- has crossed last_trigger + interval.
    v_meter_due := false;
    v_reading   := NULL;
    IF NOT v_floating AND pm.meter_id IS NOT NULL AND pm.meter_interval IS NOT NULL AND pm.meter_interval > 0 THEN
      SELECT current_reading INTO v_reading FROM meters WHERE id = pm.meter_id;
      IF v_reading IS NOT NULL
         AND v_reading >= COALESCE(pm.last_trigger_reading, 0) + pm.meter_interval THEN
        v_meter_due := true;
      END IF;
    END IF;

    IF NOT (v_calendar_due OR v_meter_due) THEN
      CONTINUE;
    END IF;

    -- End date reached on a fixed calendar arm: deactivate instead of generating.
    IF NOT v_floating AND v_calendar_due AND pm.end_date IS NOT NULL AND pm.next_due_at > pm.end_date THEN
      UPDATE pm_schedules SET is_active = false WHERE id = pm.id;
      CONTINUE;
    END IF;

    -- De-dupe: at most one open PM WO per schedule (the floating branch already
    -- required the prior WO to be completed, so this only affects fixed/hybrid).
    IF EXISTS (
      SELECT 1 FROM work_orders
       WHERE pm_schedule_id = pm.id
         AND status NOT IN ('completed', 'closed')
       LIMIT 1
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO work_orders (
      organisation_id, title, description, priority, status, source,
      pm_schedule_id, asset_id, site_id, assigned_to, due_at, sla_hours
    ) VALUES (
      pm.organisation_id,
      'PM - ' || pm.title,
      pm.description,
      'medium',
      CASE WHEN pm.assigned_to IS NOT NULL THEN 'assigned' ELSE 'new' END,
      'pm_schedule',
      pm.id,
      pm.asset_id,
      pm.site_id,
      pm.assigned_to,
      COALESCE(v_due, now()),
      CASE WHEN pm.estimated_duration_minutes IS NOT NULL
           THEN CEIL(pm.estimated_duration_minutes / 60.0)::int ELSE NULL END
    );

    -- Roll next_due_at forward. Floating anchors off the base (completed_at, or now
    -- for the first WO); fixed rolls off the prior due date. Both honour interval config.
    IF v_calendar_due THEN
      v_next := pm_roll_next_due(v_base, pm.frequency, pm.interval_count, pm.interval_unit, pm.anchor_day);
      IF pm.end_date IS NOT NULL AND v_next > pm.end_date THEN
        UPDATE pm_schedules SET next_due_at = v_next, is_active = false WHERE id = pm.id;
      ELSE
        UPDATE pm_schedules SET next_due_at = v_next WHERE id = pm.id;
      END IF;
    END IF;
    -- Reset the usage clock whenever a meter fired/was consumed (hybrid, fixed only).
    IF NOT v_floating AND pm.meter_id IS NOT NULL AND v_reading IS NOT NULL THEN
      UPDATE pm_schedules SET last_trigger_reading = v_reading WHERE id = pm.id;
    END IF;

    v_generated := v_generated + 1;
  END LOOP;

  RETURN v_generated;
END;
$$;

REVOKE ALL ON FUNCTION generate_due_pm_work_orders() FROM public;
GRANT EXECUTE ON FUNCTION generate_due_pm_work_orders() TO service_role;
