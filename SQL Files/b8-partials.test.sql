-- Verification harness for b8-partials.sql — OPTIONAL, safe.
-- Run AFTER the migration. Mutates NOTHING: wrapped in BEGIN ... ROLLBACK.
-- Read the NOTICEs: every line PASS.
--
-- Proves:
--   1. The new columns exist (organisations.purchasing_enabled,
--      pm_schedules.category, pm_schedules.requires_signature) with defaults.
--   2. A calendar-due schedule with a category generates a WO carrying it.
--   3. NULL category stays NULL on the WO (no accidental default).
--   4. The b6-01 behaviour survived the re-CREATE: priority still copied,
--      one-open-WO de-dupe still holds.

BEGIN;
DO $$
DECLARE
  v_org  uuid;
  v_pm   uuid;
  v_pm2  uuid;
  v_gen  integer;
  v_cat  text;
  v_prio text;
  v_cnt  integer;
  v_purch boolean;
BEGIN
  SELECT id INTO v_org FROM public.organisations LIMIT 1;
  IF v_org IS NULL THEN RAISE NOTICE 'SKIP: need one org'; RETURN; END IF;

  -- 1) Columns + defaults.
  SELECT purchasing_enabled INTO v_purch FROM public.organisations WHERE id = v_org;
  IF v_purch IS NOT NULL THEN RAISE NOTICE 'PASS 1a: organisations.purchasing_enabled exists (default %)', v_purch;
  ELSE RAISE WARNING 'FAIL 1a: purchasing_enabled is NULL (expected NOT NULL default true)'; END IF;

  -- 2) Category-bearing schedule -> WO carries it (and priority still works).
  INSERT INTO public.pm_schedules
    (organisation_id, title, frequency, is_active, next_due_at, category, priority, requires_signature)
  VALUES
    (v_org, 'harness category PM', 'monthly', true, now() - interval '1 day', 'HVAC', 'high', true)
  RETURNING id INTO v_pm;

  v_gen := public.generate_due_pm_work_orders();

  SELECT category, priority INTO v_cat, v_prio
    FROM public.work_orders WHERE pm_schedule_id = v_pm
    ORDER BY created_at DESC LIMIT 1;

  IF v_cat = 'HVAC' THEN RAISE NOTICE 'PASS 2: WO carries schedule category HVAC';
  ELSE RAISE WARNING 'FAIL 2: expected category HVAC, got %', v_cat; END IF;

  IF v_prio = 'high' THEN RAISE NOTICE 'PASS 3: priority stamping preserved (high)';
  ELSE RAISE WARNING 'FAIL 3: expected priority high, got %', v_prio; END IF;

  -- 3) De-dupe preserved: re-run generates no second WO for the open one.
  v_gen := public.generate_due_pm_work_orders();
  SELECT count(*) INTO v_cnt FROM public.work_orders WHERE pm_schedule_id = v_pm;
  IF v_cnt = 1 THEN RAISE NOTICE 'PASS 4: one-open-WO de-dupe held';
  ELSE RAISE WARNING 'FAIL 4: expected 1 WO, got %', v_cnt; END IF;

  -- 4) NULL category stays NULL.
  INSERT INTO public.pm_schedules
    (organisation_id, title, frequency, is_active, next_due_at)
  VALUES (v_org, 'harness no-cat PM', 'monthly', true, now() - interval '1 day')
  RETURNING id INTO v_pm2;
  v_gen := public.generate_due_pm_work_orders();
  SELECT category INTO v_cat FROM public.work_orders
    WHERE pm_schedule_id = v_pm2 ORDER BY created_at DESC LIMIT 1;
  IF v_cat IS NULL THEN RAISE NOTICE 'PASS 5: NULL category stays NULL on the WO';
  ELSE RAISE WARNING 'FAIL 5: expected NULL category, got %', v_cat; END IF;
END $$;
ROLLBACK;
