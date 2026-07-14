-- Track T8 — Meters foundation + hybrid (calendar OR meter) PM triggers.
-- Run in the Supabase SQL editor BEFORE deploying the meters routes/pages.
-- Idempotent. Safe to run twice. Styled after sprint-l-01-asset-log.sql.
--
-- WHAT THIS ADDS
--   1. meters            — one per tracked quantity on an asset/space (runtime hours,
--                          km, cycles, kWh...). Holds the cached current_reading.
--   2. meter_readings    — append-only ledger; each insert bumps meters.current_reading
--                          (app writes both; the cached value is a denormalized latest).
--   3. pm_schedules.*     — meter-trigger columns so a schedule can fire on usage,
--                          calendar, or BOTH (hybrid = whichever comes first).
--   4. generate_due_pm_work_orders() — SECURITY DEFINER function a nightly cron calls
--                          to create WOs for calendar-due OR meter-threshold-crossed
--                          schedules. Mirrors /api/cron/pm-generate's calendar logic
--                          and adds the meter arm. The Node cron remains the primary
--                          path; this function is the DB-native option (pg_cron snippet
--                          at the bottom) for owners who prefer scheduling in Postgres.
--
-- Both new tables get the standard 4-policy org RLS with a WITH CHECK on BOTH insert
-- AND update (the asset-log review caught a cross-tenant hole from a missing UPDATE
-- WITH CHECK — not repeated here).
--
-- Acceptance (owner, after running):
--   * anon-key SELECT/INSERT on meters + meter_readings denies cross-org.
--   * inserting a reading past a meter-PM's (last_trigger_reading + meter_interval)
--     and calling generate_due_pm_work_orders() creates exactly one WO and advances
--     last_trigger_reading.
--   * a hybrid schedule fires on whichever of calendar-due / meter-threshold hits first.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. meters
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meters (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  asset_id        UUID REFERENCES assets(id) ON DELETE CASCADE,
  space_id        UUID REFERENCES spaces(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  name_ar         TEXT,
  unit            TEXT NOT NULL DEFAULT 'hours',   -- hours, km, cycles, kWh, L, ...
  current_reading NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_active       BOOLEAN DEFAULT true,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meters_org   ON meters(organisation_id);
CREATE INDEX IF NOT EXISTS idx_meters_asset ON meters(asset_id);

ALTER TABLE meters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meters_org_select ON meters;
CREATE POLICY meters_org_select ON meters
  FOR SELECT USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS meters_org_insert ON meters;
CREATE POLICY meters_org_insert ON meters
  FOR INSERT WITH CHECK (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS meters_org_update ON meters;
CREATE POLICY meters_org_update ON meters
  FOR UPDATE USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()))
  WITH CHECK (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS meters_org_delete ON meters;
CREATE POLICY meters_org_delete ON meters
  FOR DELETE USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. meter_readings (append-only ledger)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meter_readings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  meter_id        UUID NOT NULL REFERENCES meters(id) ON DELETE CASCADE,
  reading         NUMERIC(14,2) NOT NULL,
  note            TEXT,
  read_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meter_readings_meter ON meter_readings(meter_id, read_at DESC);
CREATE INDEX IF NOT EXISTS idx_meter_readings_org   ON meter_readings(organisation_id);

ALTER TABLE meter_readings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meter_readings_org_select ON meter_readings;
CREATE POLICY meter_readings_org_select ON meter_readings
  FOR SELECT USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS meter_readings_org_insert ON meter_readings;
CREATE POLICY meter_readings_org_insert ON meter_readings
  FOR INSERT WITH CHECK (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS meter_readings_org_update ON meter_readings;
CREATE POLICY meter_readings_org_update ON meter_readings
  FOR UPDATE USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()))
  WITH CHECK (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS meter_readings_org_delete ON meter_readings;
CREATE POLICY meter_readings_org_delete ON meter_readings
  FOR DELETE USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. pm_schedules meter-trigger columns (idempotent ADD COLUMN IF NOT EXISTS)
--    meter_id             — the meter this schedule watches (NULL = pure calendar).
--    meter_interval       — fire every N units of usage (e.g. every 500 hours).
--    last_trigger_reading — the meter value at which we last generated a WO; the next
--                           meter WO fires when current_reading >= this + meter_interval.
--    A schedule with BOTH next_due_at and meter_id set is HYBRID: whichever fires first.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE pm_schedules
  ADD COLUMN IF NOT EXISTS meter_id UUID REFERENCES meters(id) ON DELETE SET NULL;
ALTER TABLE pm_schedules
  ADD COLUMN IF NOT EXISTS meter_interval NUMERIC(14,2);
ALTER TABLE pm_schedules
  ADD COLUMN IF NOT EXISTS last_trigger_reading NUMERIC(14,2);

CREATE INDEX IF NOT EXISTS idx_pm_schedules_meter ON pm_schedules(meter_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. generate_due_pm_work_orders() — nightly hybrid trigger.
--    SECURITY DEFINER so a cron role with no table grants can still create WOs and
--    roll schedules under one transaction; search_path pinned; REVOKE public /
--    GRANT service_role only (never exposed to authenticated/anon).
--
--    For each active, non-archived schedule it generates AT MOST ONE WO per call when
--    EITHER arm fires:
--      calendar arm — next_due_at is within lead_time_days of now (default 2).
--      meter arm    — meter_id set AND meter.current_reading >= last_trigger_reading
--                     (COALESCE 0) + meter_interval.
--    Hybrid (both set) = whichever condition is true first. A calendar fire rolls
--    next_due_at forward; a meter fire advances last_trigger_reading to the current
--    reading. Seasonal / days-of-week nuances stay in the Node cron (this is the
--    simpler DB-native path); calendar roll-forward here uses the same day-count model.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION generate_due_pm_work_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pm          RECORD;
  v_generated integer := 0;
  v_days      integer;
  v_next      timestamptz;
  v_calendar_due boolean;
  v_meter_due    boolean;
  v_reading   numeric;
BEGIN
  FOR pm IN
    SELECT * FROM pm_schedules
     WHERE is_active = true
       AND COALESCE(is_archived, false) = false
  LOOP
    -- Calendar arm: due within this schedule's lead window (default 2 days).
    v_calendar_due := pm.next_due_at IS NOT NULL
      AND pm.next_due_at <= now() + (COALESCE(pm.lead_time_days, 2) || ' days')::interval;

    -- Meter arm: current reading has crossed last_trigger + interval.
    v_meter_due := false;
    v_reading   := NULL;
    IF pm.meter_id IS NOT NULL AND pm.meter_interval IS NOT NULL AND pm.meter_interval > 0 THEN
      SELECT current_reading INTO v_reading FROM meters WHERE id = pm.meter_id;
      IF v_reading IS NOT NULL
         AND v_reading >= COALESCE(pm.last_trigger_reading, 0) + pm.meter_interval THEN
        v_meter_due := true;
      END IF;
    END IF;

    IF NOT (v_calendar_due OR v_meter_due) THEN
      CONTINUE;
    END IF;

    -- End date reached on the calendar arm: deactivate instead of generating.
    IF v_calendar_due AND pm.end_date IS NOT NULL AND pm.next_due_at > pm.end_date THEN
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
      'medium',
      CASE WHEN pm.assigned_to IS NOT NULL THEN 'assigned' ELSE 'new' END,
      'pm_schedule',
      pm.id,
      pm.asset_id,
      pm.site_id,
      pm.assigned_to,
      COALESCE(pm.next_due_at, now()),
      CASE WHEN pm.estimated_duration_minutes IS NOT NULL
           THEN CEIL(pm.estimated_duration_minutes / 60.0)::int ELSE NULL END
    );

    -- One service resets BOTH configured clocks (hybrid = whichever fired first).
    IF v_calendar_due THEN
      v_days := CASE pm.frequency
        WHEN 'daily' THEN 1 WHEN 'weekly' THEN 7 WHEN 'fortnightly' THEN 14
        WHEN 'monthly' THEN 30 WHEN 'quarterly' THEN 90 WHEN 'biannual' THEN 180
        WHEN 'annual' THEN 365 ELSE 30 END;
      v_next := pm.next_due_at + (v_days || ' days')::interval;
      IF pm.end_date IS NOT NULL AND v_next > pm.end_date THEN
        UPDATE pm_schedules SET next_due_at = v_next, is_active = false WHERE id = pm.id;
      ELSE
        UPDATE pm_schedules SET next_due_at = v_next WHERE id = pm.id;
      END IF;
    END IF;
    -- Reset the usage clock whenever a meter is configured and a WO was generated, so a
    -- calendar-triggered service also consumes the current meter crossing (no double-fire).
    IF pm.meter_id IS NOT NULL AND v_reading IS NOT NULL THEN
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

-- ─────────────────────────────────────────────────────────────────────────────
-- OPTIONAL: nightly pg_cron schedule. pg_cron is NOT assumed enabled — run these
-- as the DB owner only if you want Postgres (not Vercel cron) to drive generation.
-- Nightly at 02:00 UTC. Comment left inert on purpose.
-- ─────────────────────────────────────────────────────────────────────────────
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule(
--   'generate-due-pm-work-orders',
--   '0 2 * * *',
--   $$ SELECT public.generate_due_pm_work_orders(); $$
-- );
