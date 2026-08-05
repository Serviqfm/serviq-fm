-- Verification harness for w6-9-automation.sql — OPTIONAL, safe.
-- Run AFTER the migration. Mutates NOTHING: wrapped in BEGIN ... ROLLBACK.
-- Read the NOTICEs: every line should say PASS.
--
-- Proves the non-trivial behaviours:
--   1. A matching active rule (wo_created + priority=critical + notify_role admin)
--      drops a user_notifications row for each admin when a critical WO is inserted.
--   2. A non-matching condition (priority=low) produces NO notification.
--   3. The trigger is NON-FATAL: even a deliberately broken rule (garbage action)
--      never blocks the work_orders insert.
--
-- Needs one org with at least one admin user. Uses the FIRST org found.

BEGIN;
DO $$
DECLARE
  v_org    uuid;
  v_admin  uuid;
  v_rule   uuid;
  v_wo     uuid;
  v_admins int;
  v_count  int;
BEGIN
  SELECT id INTO v_org FROM public.organisations LIMIT 1;
  SELECT id INTO v_admin FROM public.users WHERE organisation_id = v_org AND role = 'admin' LIMIT 1;
  SELECT count(*) INTO v_admins FROM public.users WHERE organisation_id = v_org AND role = 'admin';

  IF v_org IS NULL OR v_admin IS NULL THEN
    RAISE NOTICE 'SKIP: need one org with an admin user';
    RETURN;
  END IF;

  -- 1) matching rule → notifications for every admin.
  INSERT INTO public.automation_rules (organisation_id, name, trigger_event, condition, action, created_by)
  VALUES (v_org, 'test-critical', 'wo_created',
          '{"priority":"critical"}'::jsonb,
          '{"type":"notify_role","role":"admin"}'::jsonb, v_admin)
  RETURNING id INTO v_rule;

  INSERT INTO public.work_orders (organisation_id, title, priority, status)
  VALUES (v_org, 'AUTO-TEST critical WO', 'critical', 'open')
  RETURNING id INTO v_wo;

  SELECT count(*) INTO v_count FROM public.user_notifications
   WHERE dedupe_key = 'automation:' || v_rule || ':' || v_wo;
  IF v_count = v_admins THEN RAISE NOTICE 'PASS 1: matching rule notified all % admin(s)', v_admins;
  ELSE RAISE WARNING 'FAIL 1: expected % notifications, got %', v_admins, v_count; END IF;

  -- 2) non-matching condition → no notification.
  INSERT INTO public.work_orders (organisation_id, title, priority, status)
  VALUES (v_org, 'AUTO-TEST low WO', 'low', 'open')
  RETURNING id INTO v_wo;
  SELECT count(*) INTO v_count FROM public.user_notifications
   WHERE dedupe_key = 'automation:' || v_rule || ':' || v_wo;
  IF v_count = 0 THEN RAISE NOTICE 'PASS 2: non-matching WO produced no notification';
  ELSE RAISE WARNING 'FAIL 2: non-matching WO leaked % notification(s)', v_count; END IF;

  -- 3) non-fatal: a broken rule (unknown role) must not block the WO insert.
  --    The CHECK constraint blocks a truly garbage action type, so we exercise a
  --    rule that passes the constraint but has a role the trigger ignores.
  INSERT INTO public.automation_rules (organisation_id, name, trigger_event, condition, action, created_by)
  VALUES (v_org, 'test-bad-role', 'wo_created', '{}'::jsonb,
          '{"type":"notify_role","role":"nobody"}'::jsonb, v_admin);
  BEGIN
    INSERT INTO public.work_orders (organisation_id, title, priority, status)
    VALUES (v_org, 'AUTO-TEST resilient WO', 'high', 'open');
    RAISE NOTICE 'PASS 3: WO insert succeeded despite a rule with an ignored role';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'FAIL 3: a bad rule blocked the WO insert (%).', SQLERRM;
  END;
END $$;
ROLLBACK;
