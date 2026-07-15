-- Verification harness for b4-01-pm-completion-recurrence.sql — OPTIONAL, safe.
-- Run AFTER the migration. Mutates NOTHING: BEGIN ... ROLLBACK. Read the NOTICEs.
--
-- Proves:
--   1. pm_roll_next_due honours interval config with day-of-month anchoring:
--      Jan 31 + 1 month anchored to the 1st lands on Feb 1 (no 30d drift, clamps day).
--   2. 'every 2 months' advances two real calendar months.
--   3. Floating (1C-09): a floating schedule with an OPEN prior WO generates nothing;
--      once that WO is completed, generate_due_pm_work_orders() creates the next one and
--      sets next_due_at = completed_at + interval.
--
-- Needs one org with a user. Uses the FIRST org found.

BEGIN;
DO $$
DECLARE
  v_org   uuid;
  v_user  uuid;
  v_pm    uuid;
  v_wo    uuid;
  v_gen   integer;
  v_cnt   integer;
  v_next  timestamptz;
  v_r     timestamptz;
BEGIN
  SELECT id INTO v_org FROM public.organisations LIMIT 1;
  SELECT id INTO v_user FROM public.users WHERE organisation_id = v_org LIMIT 1;
  IF v_org IS NULL OR v_user IS NULL THEN
    RAISE NOTICE 'SKIP: need one org and a user';
    RETURN;
  END IF;

  -- 1) Anchored month roll: Jan 31 + 1 month, anchor day 1 -> Feb 1.
  v_r := public.pm_roll_next_due(TIMESTAMPTZ '2026-01-31 09:00+00', 'monthly', 1, 'month', 1);
  IF v_r::date = DATE '2026-02-01' THEN
    RAISE NOTICE 'PASS 1: Jan 31 + 1 month anchored to 1st -> %', v_r::date;
  ELSE
    RAISE WARNING 'FAIL 1: expected 2026-02-01, got %', v_r::date;
  END IF;

  -- 2) Every 2 months advances two real calendar months (no anchor).
  v_r := public.pm_roll_next_due(TIMESTAMPTZ '2026-01-15 00:00+00', 'monthly', 2, 'month', NULL);
  IF v_r::date = DATE '2026-03-15' THEN
    RAISE NOTICE 'PASS 2: every 2 months -> %', v_r::date;
  ELSE
    RAISE WARNING 'FAIL 2: expected 2026-03-15, got %', v_r::date;
  END IF;

  -- 3) Floating: first run creates the first WO immediately.
  INSERT INTO public.pm_schedules
    (organisation_id, title, frequency, is_active, scheduling_mode,
     interval_count, interval_unit, next_due_at)
  VALUES
    (v_org, 'harness floating PM', 'monthly', true, 'floating',
     7, 'day', now())
  RETURNING id INTO v_pm;

  v_gen := public.generate_due_pm_work_orders();
  SELECT count(*) INTO v_cnt FROM public.work_orders WHERE pm_schedule_id = v_pm;
  IF v_cnt = 1 THEN RAISE NOTICE 'PASS 3: floating schedule created first WO';
  ELSE RAISE WARNING 'FAIL 3: expected 1 WO, got %', v_cnt; END IF;

  SELECT id INTO v_wo FROM public.work_orders WHERE pm_schedule_id = v_pm LIMIT 1;

  -- 4) Prior WO still OPEN -> no new WO generated.
  v_gen := public.generate_due_pm_work_orders();
  SELECT count(*) INTO v_cnt FROM public.work_orders WHERE pm_schedule_id = v_pm;
  IF v_cnt = 1 THEN RAISE NOTICE 'PASS 4: open prior WO blocks next floating generation';
  ELSE RAISE WARNING 'FAIL 4: floating generated with open prior WO (count=%)', v_cnt; END IF;

  -- 5) Complete the prior WO 3 days ago -> now due (7-day interval already elapsed?
  --    No: completed 3 days ago + 7 days = due in 4 days -> NOT yet due).
  UPDATE public.work_orders
     SET status = 'completed', completed_at = now() - interval '3 days'
   WHERE id = v_wo;
  v_gen := public.generate_due_pm_work_orders();
  SELECT count(*) INTO v_cnt FROM public.work_orders WHERE pm_schedule_id = v_pm;
  IF v_cnt = 1 THEN RAISE NOTICE 'PASS 5: completed-3-days-ago + 7-day interval not yet due';
  ELSE RAISE WARNING 'FAIL 5: floating fired before interval elapsed (count=%)', v_cnt; END IF;

  -- 6) Backdate completion to 10 days ago (>7-day interval) -> next WO generated,
  --    due = completed_at + 7 days.
  UPDATE public.work_orders
     SET completed_at = now() - interval '10 days'
   WHERE id = v_wo;
  v_gen := public.generate_due_pm_work_orders();
  SELECT count(*) INTO v_cnt FROM public.work_orders WHERE pm_schedule_id = v_pm;
  SELECT next_due_at INTO v_next FROM public.pm_schedules WHERE id = v_pm;
  IF v_cnt = 2 AND v_next::date = (now() - interval '3 days')::date THEN
    RAISE NOTICE 'PASS 6: floating generated next WO after interval, next_due = completed + 7d (%)', v_next::date;
  ELSE
    RAISE WARNING 'FAIL 6: expected 2 WOs and next_due completed+7d, got count=% next=%', v_cnt, v_next::date;
  END IF;
END $$;
ROLLBACK;
