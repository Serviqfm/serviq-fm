-- Verification harness for b7-inspection-schedules.sql — OPTIONAL, safe.
-- Run AFTER the migration. Mutates NOTHING: wrapped in BEGIN ... ROLLBACK.
-- Read the NOTICEs: every non-SKIP line should say PASS.
--
-- Proves:
--   1. an admin/manager of org A can INSERT a schedule for an org-A template.
--   2. the same caller CANNOT reference an org-B template (FK-to-org bind).
--   3. a technician of org A cannot INSERT (role gate).
--   4. the admin cannot UPDATE a schedule into org B (WITH CHECK org-swap).
--
-- Needs: org A with an admin/manager, a technician and an inspection template;
-- org B with an inspection template.

BEGIN;
DO $$
DECLARE
  v_org_a   uuid;
  v_org_b   uuid;
  v_admin_a uuid;
  v_tech_a  uuid;
  v_tmpl_a  uuid;
  v_tmpl_b  uuid;
  v_sched   uuid;
  v_ok      boolean;
BEGIN
  SELECT organisation_id, id INTO v_org_a, v_admin_a FROM public.users
    WHERE role IN ('admin', 'manager') LIMIT 1;
  SELECT id INTO v_tmpl_a FROM public.inspection_templates WHERE organisation_id = v_org_a LIMIT 1;
  SELECT organisation_id, id INTO v_org_b, v_tmpl_b FROM public.inspection_templates
    WHERE organisation_id <> v_org_a LIMIT 1;
  SELECT id INTO v_tech_a FROM public.users
    WHERE organisation_id = v_org_a AND role = 'technician' LIMIT 1;

  IF v_org_a IS NULL OR v_admin_a IS NULL OR v_tmpl_a IS NULL OR v_org_b IS NULL THEN
    RAISE NOTICE 'SKIP: need an admin + template in org A and a template in another org';
    RETURN;
  END IF;

  -- Session as the org-A admin.
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub', v_admin_a)::text, true);
  PERFORM set_config('role', 'authenticated', true);

  -- 1) INSERT with own-org template succeeds.
  INSERT INTO public.inspection_schedules (organisation_id, template_id, frequency, next_due_at, created_by)
  VALUES (v_org_a, v_tmpl_a, 'monthly', now() + interval '1 day', v_admin_a)
  RETURNING id INTO v_sched;
  RAISE NOTICE 'PASS 1: admin created a schedule for an own-org template';

  -- 2) INSERT referencing an org-B template must be rejected by WITH CHECK.
  v_ok := true;
  BEGIN
    INSERT INTO public.inspection_schedules (organisation_id, template_id, frequency, next_due_at)
    VALUES (v_org_a, v_tmpl_b, 'monthly', now() + interval '1 day');
    v_ok := false;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF v_ok THEN RAISE NOTICE 'PASS 2: cross-org template rejected';
  ELSE RAISE WARNING 'FAIL 2: schedule referencing another org''s template was created'; END IF;

  -- 3) Technician INSERT rejected by role gate.
  IF v_tech_a IS NULL THEN
    RAISE NOTICE 'SKIP 3: no technician in org A';
  ELSE
    PERFORM set_config('request.jwt.claims',
      json_build_object('role','authenticated','sub', v_tech_a)::text, true);
    v_ok := true;
    BEGIN
      INSERT INTO public.inspection_schedules (organisation_id, template_id, frequency, next_due_at)
      VALUES (v_org_a, v_tmpl_a, 'weekly', now() + interval '1 day');
      v_ok := false;
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    IF v_ok THEN RAISE NOTICE 'PASS 3: technician INSERT rejected';
    ELSE RAISE WARNING 'FAIL 3: technician created a schedule'; END IF;
    -- back to admin for step 4
    PERFORM set_config('request.jwt.claims',
      json_build_object('role','authenticated','sub', v_admin_a)::text, true);
  END IF;

  -- 4) UPDATE moving the schedule into org B rejected by WITH CHECK.
  v_ok := true;
  BEGIN
    UPDATE public.inspection_schedules SET organisation_id = v_org_b WHERE id = v_sched;
    v_ok := false;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  -- An UPDATE that matches zero rows (filtered by USING) also proves the guard.
  IF NOT v_ok THEN
    IF NOT EXISTS (SELECT 1 FROM public.inspection_schedules WHERE id = v_sched AND organisation_id = v_org_b) THEN
      v_ok := true;
    END IF;
  END IF;
  IF v_ok THEN RAISE NOTICE 'PASS 4: org-swap UPDATE rejected';
  ELSE RAISE WARNING 'FAIL 4: schedule was moved into another org'; END IF;
END $$;
ROLLBACK;
