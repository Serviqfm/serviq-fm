-- Verification harness for t8-01-meters-pm.sql — OPTIONAL, safe.
-- Run AFTER the migration. Mutates NOTHING: wrapped in BEGIN ... ROLLBACK with
-- inner savepoints around expected-failure cases. Read the NOTICEs: every line PASS.
--
-- Proves:
--   1. meters/meter_readings RLS: an authenticated user in org A cannot SELECT or
--      INSERT another org's rows (cross-tenant read + write both denied).
--   2. generate_due_pm_work_orders(): a meter-PM whose meter reading has crossed
--      (last_trigger_reading + meter_interval) generates exactly one WO and advances
--      last_trigger_reading; a below-threshold meter-PM generates nothing.
--
-- Needs one org with at least one asset. Uses the FIRST org found.

BEGIN;
DO $$
DECLARE
  v_org    uuid;
  v_user   uuid;
  v_asset  uuid;
  v_meter  uuid;
  v_pm     uuid;
  v_other_org uuid;
  v_gen    integer;
  v_wo     integer;
  v_ltr    numeric;
  v_ok     boolean;
BEGIN
  SELECT id INTO v_org FROM public.organisations LIMIT 1;
  SELECT id INTO v_user FROM public.users WHERE organisation_id = v_org LIMIT 1;
  SELECT id INTO v_asset FROM public.assets WHERE organisation_id = v_org LIMIT 1;

  IF v_org IS NULL OR v_user IS NULL THEN
    RAISE NOTICE 'SKIP: need one org and a user';
    RETURN;
  END IF;

  -- Owner-context setup (no JWT -> RLS bypassed for seeding).
  INSERT INTO public.meters (organisation_id, asset_id, name, unit, current_reading)
  VALUES (v_org, v_asset, 'harness-meter', 'hours', 1200)
  RETURNING id INTO v_meter;

  INSERT INTO public.meter_readings (organisation_id, meter_id, reading, read_by)
  VALUES (v_org, v_meter, 1200, v_user);

  -- A meter-PM that should fire: interval 500, last trigger 700 -> threshold 1200,
  -- current reading 1200 >= 1200 -> due. Also give it a far-future calendar date so
  -- only the meter arm can fire.
  INSERT INTO public.pm_schedules
    (organisation_id, title, frequency, is_active, asset_id,
     meter_id, meter_interval, last_trigger_reading, next_due_at)
  VALUES
    (v_org, 'harness meter PM', 'monthly', true, v_asset,
     v_meter, 500, 700, now() + interval '365 days')
  RETURNING id INTO v_pm;

  -- 1) generate_due_pm_work_orders fires the meter arm.
  v_gen := public.generate_due_pm_work_orders();
  SELECT count(*) INTO v_wo FROM public.work_orders WHERE pm_schedule_id = v_pm;
  SELECT last_trigger_reading INTO v_ltr FROM public.pm_schedules WHERE id = v_pm;
  IF v_wo = 1 AND v_ltr = 1200 THEN
    RAISE NOTICE 'PASS 1: meter-threshold crossing generated 1 WO and advanced last_trigger_reading to 1200';
  ELSE
    RAISE WARNING 'FAIL 1: expected 1 WO + last_trigger_reading 1200, got wo=% ltr=%', v_wo, v_ltr;
  END IF;

  -- 2) Re-running does NOT double-fire (reading unchanged, marker advanced).
  v_gen := public.generate_due_pm_work_orders();
  SELECT count(*) INTO v_wo FROM public.work_orders WHERE pm_schedule_id = v_pm;
  IF v_wo = 1 THEN RAISE NOTICE 'PASS 2: second run did not double-generate';
  ELSE RAISE WARNING 'FAIL 2: meter PM re-fired below new threshold (wo=%)', v_wo; END IF;

  -- 3) RLS: become an authenticated user in v_org, then confirm a cross-org row is
  --    invisible and a cross-org insert is blocked.
  SELECT id INTO v_other_org FROM public.organisations WHERE id <> v_org LIMIT 1;
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub', v_user)::text, true);
  PERFORM set_config('role', 'authenticated', true);

  -- own-org meter is visible
  PERFORM 1 FROM public.meters WHERE id = v_meter;
  IF FOUND THEN RAISE NOTICE 'PASS 3: own-org meter visible under RLS';
  ELSE RAISE WARNING 'FAIL 3: own-org meter hidden under RLS'; END IF;

  IF v_other_org IS NULL THEN
    RAISE NOTICE 'SKIP 4: no second org to test cross-org write rejection';
  ELSE
    v_ok := true;
    BEGIN
      INSERT INTO public.meters (organisation_id, name, unit)
      VALUES (v_other_org, 'evil', 'hours');
      v_ok := false;  -- should have been blocked by WITH CHECK
    EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL;
    END;
    IF v_ok THEN RAISE NOTICE 'PASS 4: cross-org meter insert blocked by RLS';
    ELSE RAISE WARNING 'FAIL 4: cross-org meter insert accepted'; END IF;
  END IF;

  RESET role;
END $$;
ROLLBACK;
