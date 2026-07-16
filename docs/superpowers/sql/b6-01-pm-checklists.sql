-- Track B6 — FM-05 (attach a checklist to a PM schedule and stamp it onto every
-- generated WO) + 1C-12 priority parity. Run in the Supabase SQL editor.
-- Idempotent. Safe to run twice. Depends on:
--   * sprint-k-03-wo-tasks-checklists.sql (work_order_tasks, checklist_templates)
--   * b4-01-pm-completion-recurrence.sql (current generate_due_pm body + pm_roll_next_due + floating/interval cols)
--
-- WHAT THIS ADDS
--   1. pm_schedules.checklist_template_id — the checklist a schedule carries; its
--      items are expanded into work_order_tasks on every generated WO (FM-05).
--   2. pm_schedules.priority             — copied onto generated WOs instead of the
--      hardcoded 'medium' (1C-12; COALESCE keeps old rows at 'medium').
--   3. generate_due_pm_work_orders()     — re-CREATEd preserving ALL b4-01/t8-01
--      logic (one-open-WO de-dupe with NO marker-advance-on-skip, meter/hybrid arm,
--      fixed calendar roll-forward, end-date deactivation) and ONLY adding:
--        * priority = COALESCE(pm.priority,'medium') on the WO
--        * after the WO INSERT, copy the template's items into work_order_tasks.
--      The Node cron (/api/cron/pm-generate) is the primary path and stamps the
--      same rows — the two are kept in sync.
--
-- Acceptance (owner, after running):
--   * a schedule with checklist_template_id set generates a WO whose Tasks tab
--     lists the template's items (done_by/done_at fill in as techs tick them).
--   * a high-priority schedule yields a high-priority WO; a schedule with no
--     priority still yields 'medium'.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. pm_schedules columns
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE pm_schedules
  ADD COLUMN IF NOT EXISTS checklist_template_id UUID REFERENCES checklist_templates(id) ON DELETE SET NULL;
ALTER TABLE pm_schedules
  ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. generate_due_pm_work_orders() — copy of t8-01's body, + priority + checklist
--    stamping. Everything between BEGIN and the checklist block is unchanged from
--    t8-01; do not drop the de-dupe / meter arm / roll-forward when editing.
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
  v_due          timestamptz;
  v_wo_id        uuid;
BEGIN
  FOR pm IN
    SELECT * FROM pm_schedules
     WHERE is_active = true
       AND COALESCE(is_archived, false) = false
  LOOP
    v_floating := COALESCE(pm.scheduling_mode, 'fixed') = 'floating';

    -- Floating (1C-09): timing driven by the PREVIOUS WO's completion, not the calendar.
    IF v_floating THEN
      SELECT status, completed_at INTO v_prev
        FROM work_orders WHERE pm_schedule_id = pm.id ORDER BY created_at DESC LIMIT 1;
      IF v_prev.status IS NOT NULL THEN
        IF v_prev.status NOT IN ('completed', 'closed') THEN CONTINUE; END IF;
        IF v_prev.completed_at IS NULL THEN CONTINUE; END IF;
        v_base := v_prev.completed_at;
        v_due  := pm_roll_next_due(v_base, pm.frequency, pm.interval_count, pm.interval_unit, pm.anchor_day);
        IF v_due > now() THEN CONTINUE; END IF;
        v_calendar_due := true;
      ELSE
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

    -- Meter arm (fixed/hybrid only; floating is completion-driven).
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

    -- De-dupe: at most one open PM WO per schedule. Do NOT advance any marker here —
    -- advancing the meter marker on the mere presence of a (possibly calendar-sourced)
    -- open WO would silently swallow a real meter crossing (the service never fires).
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
      COALESCE(pm.priority, 'medium'),
      CASE WHEN pm.assigned_to IS NOT NULL THEN 'assigned' ELSE 'new' END,
      'pm_schedule',
      pm.id,
      pm.asset_id,
      pm.site_id,
      pm.assigned_to,
      COALESCE(v_due, now()),
      CASE WHEN pm.estimated_duration_minutes IS NOT NULL
           THEN CEIL(pm.estimated_duration_minutes / 60.0)::int ELSE NULL END
    )
    RETURNING id INTO v_wo_id;

    -- FM-05: stamp the schedule's checklist onto the new WO. items is a jsonb array
    -- of {title, title_ar}; skip blank rows (work_order_tasks.title is NOT NULL).
    IF pm.checklist_template_id IS NOT NULL THEN
      INSERT INTO work_order_tasks (organisation_id, work_order_id, title, title_ar, sort_order)
      SELECT pm.organisation_id, v_wo_id,
             COALESCE(NULLIF(TRIM(item->>'title'), ''), TRIM(item->>'title_ar')),
             NULLIF(TRIM(COALESCE(item->>'title_ar', '')), ''),
             (ord - 1)::int
        FROM checklist_templates ct,
             jsonb_array_elements(ct.items) WITH ORDINALITY AS t(item, ord)
       WHERE ct.id = pm.checklist_template_id
         AND COALESCE(NULLIF(TRIM(item->>'title'), ''), NULLIF(TRIM(item->>'title_ar'), '')) IS NOT NULL;
    END IF;

    -- Roll next_due_at forward via the interval config (b4-01: floating anchors off
    -- completed_at, fixed off the prior due; both honour interval_count/unit + anchor).
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

-- Cron-only: no client should call this. service_role (the API cron route) or a
-- pg_cron owner job invokes it. authenticated/anon get nothing.
REVOKE ALL ON FUNCTION generate_due_pm_work_orders() FROM public;
GRANT EXECUTE ON FUNCTION generate_due_pm_work_orders() TO service_role;
