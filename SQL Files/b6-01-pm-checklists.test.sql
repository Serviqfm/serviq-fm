-- Verification harness for b6-01-pm-checklists.sql — OPTIONAL, safe.
-- Run AFTER the migration (and after t8-01 + sprint-k-03). Mutates NOTHING:
-- wrapped in BEGIN ... ROLLBACK. Read the NOTICEs: every line PASS.
--
-- Proves:
--   1. A calendar-due schedule with a checklist_template_id generates one WO and
--      stamps the template's items into work_order_tasks (FM-05).
--   2. The generated WO carries the schedule's priority, not the old hardcoded
--      'medium' (1C-12); a schedule with NULL priority still yields 'medium'.
--   3. The one-open-WO de-dupe still holds (re-run does not double-stamp).
--
-- Needs one org. Uses the FIRST org found.

BEGIN;
DO $$
DECLARE
  v_org   uuid;
  v_tpl   uuid;
  v_pm    uuid;
  v_pm2   uuid;
  v_wo    uuid;
  v_gen   integer;
  v_tasks integer;
  v_prio  text;
BEGIN
  SELECT id INTO v_org FROM public.organisations LIMIT 1;
  IF v_org IS NULL THEN RAISE NOTICE 'SKIP: need one org'; RETURN; END IF;

  -- A 2-item checklist template (one row blank -> must be skipped).
  INSERT INTO public.checklist_templates (organisation_id, name, items)
  VALUES (v_org, 'harness checklist',
    '[{"title":"Check filter","title_ar":"افحص الفلتر"},{"title":"Log reading"},{"title":"  "}]'::jsonb)
  RETURNING id INTO v_tpl;

  -- Calendar-due, high priority, with the checklist attached.
  INSERT INTO public.pm_schedules
    (organisation_id, title, frequency, is_active, next_due_at,
     checklist_template_id, priority)
  VALUES
    (v_org, 'harness checklist PM', 'monthly', true, now() - interval '1 day',
     v_tpl, 'high')
  RETURNING id INTO v_pm;

  v_gen := public.generate_due_pm_work_orders();

  SELECT id, priority INTO v_wo, v_prio
    FROM public.work_orders WHERE pm_schedule_id = v_pm
    ORDER BY created_at DESC LIMIT 1;
  SELECT count(*) INTO v_tasks FROM public.work_order_tasks WHERE work_order_id = v_wo;

  -- 2 non-blank items expected (the "  " row is dropped).
  IF v_tasks = 2 THEN RAISE NOTICE 'PASS 1: checklist stamped 2 tasks (blank row skipped)';
  ELSE RAISE WARNING 'FAIL 1: expected 2 tasks, got %', v_tasks; END IF;

  IF v_prio = 'high' THEN RAISE NOTICE 'PASS 2: WO carries schedule priority high';
  ELSE RAISE WARNING 'FAIL 2: expected priority high, got %', v_prio; END IF;

  -- 3) Re-run: open WO exists -> no second WO, no duplicate tasks.
  v_gen := public.generate_due_pm_work_orders();
  SELECT count(*) INTO v_tasks FROM public.work_order_tasks
    WHERE work_order_id IN (SELECT id FROM public.work_orders WHERE pm_schedule_id = v_pm);
  IF v_tasks = 2 THEN RAISE NOTICE 'PASS 3: de-dupe held, no duplicate stamping';
  ELSE RAISE WARNING 'FAIL 3: expected 2 tasks after re-run, got %', v_tasks; END IF;

  -- 4) NULL priority -> 'medium' default on the WO.
  INSERT INTO public.pm_schedules
    (organisation_id, title, frequency, is_active, next_due_at, priority)
  VALUES (v_org, 'harness no-prio PM', 'monthly', true, now() - interval '1 day', NULL)
  RETURNING id INTO v_pm2;
  v_gen := public.generate_due_pm_work_orders();
  SELECT priority INTO v_prio FROM public.work_orders
    WHERE pm_schedule_id = v_pm2 ORDER BY created_at DESC LIMIT 1;
  IF v_prio = 'medium' THEN RAISE NOTICE 'PASS 4: NULL priority defaults to medium';
  ELSE RAISE WARNING 'FAIL 4: expected medium, got %', v_prio; END IF;
END $$;
ROLLBACK;
