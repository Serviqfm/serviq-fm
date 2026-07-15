-- Verification harness for b5-wo-custom-statuses.sql — OPTIONAL, safe.
-- Run AFTER the migration. Mutates NOTHING: wrapped in BEGIN ... ROLLBACK.
-- Read the NOTICEs: every non-SKIP line should say PASS.
--
-- Proves:
--   1. an admin/manager of org A can INSERT a custom status into org A.
--   2. the same member CANNOT move that row into org B (UPDATE WITH CHECK).
--   3. the same member CANNOT INSERT a status for org B (INSERT WITH CHECK).
--   4. a technician CANNOT INSERT a status (role gate).
--   5. a maps_to_base_status outside the 6 base values is rejected by the CHECK.
--
-- Needs two orgs; org A must have an admin/manager, and a technician for step 4.

BEGIN;
DO $$
DECLARE
  v_org_a   uuid;
  v_org_b   uuid;
  v_admin_a uuid;
  v_tech_a  uuid;
  v_st      uuid;
  v_ok      boolean;
BEGIN
  SELECT id INTO v_org_a FROM public.organisations ORDER BY created_at LIMIT 1;
  SELECT id INTO v_org_b FROM public.organisations WHERE id <> v_org_a LIMIT 1;
  SELECT id INTO v_admin_a FROM public.users
    WHERE organisation_id = v_org_a AND role IN ('admin','manager') LIMIT 1;
  SELECT id INTO v_tech_a FROM public.users
    WHERE organisation_id = v_org_a AND role NOT IN ('admin','manager') LIMIT 1;

  IF v_org_a IS NULL OR v_org_b IS NULL OR v_admin_a IS NULL THEN
    RAISE NOTICE 'SKIP: need two orgs and an admin/manager in the first org';
    RETURN;
  END IF;

  -- Session as an admin/manager of org A.
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub', v_admin_a)::text, true);
  PERFORM set_config('role', 'authenticated', true);

  -- 1) INSERT into own org succeeds.
  INSERT INTO public.work_order_custom_statuses (organisation_id, name, maps_to_base_status)
  VALUES (v_org_a, 'On Hold – Waiting for Parts', 'on_hold')
  RETURNING id INTO v_st;
  RAISE NOTICE 'PASS 1: admin/manager inserted a custom status into own org';

  -- 2) UPDATE that moves the row into org B must be rejected by WITH CHECK.
  v_ok := true;
  BEGIN
    UPDATE public.work_order_custom_statuses SET organisation_id = v_org_b WHERE id = v_st;
    v_ok := false;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF v_ok THEN RAISE NOTICE 'PASS 2: UPDATE org-swap into org B rejected';
  ELSE RAISE WARNING 'FAIL 2: UPDATE moved a status into another org'; END IF;

  -- 3) INSERT for org B must be rejected by INSERT WITH CHECK.
  v_ok := true;
  BEGIN
    INSERT INTO public.work_order_custom_statuses (organisation_id, name, maps_to_base_status)
    VALUES (v_org_b, 'Harness Foreign', 'new');
    v_ok := false;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF v_ok THEN RAISE NOTICE 'PASS 3: INSERT for foreign org rejected';
  ELSE RAISE WARNING 'FAIL 3: INSERT created a status for another org'; END IF;

  -- 5) A base_status outside the 6 values is rejected by the CHECK constraint.
  v_ok := true;
  BEGIN
    INSERT INTO public.work_order_custom_statuses (organisation_id, name, maps_to_base_status)
    VALUES (v_org_a, 'Bogus', 'archived');
    v_ok := false;
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF v_ok THEN RAISE NOTICE 'PASS 5: illegal base_status rejected by CHECK';
  ELSE RAISE WARNING 'FAIL 5: illegal base_status accepted'; END IF;

  -- 4) A technician cannot INSERT (role gate).
  IF v_tech_a IS NULL THEN
    RAISE NOTICE 'SKIP 4: no technician in org A to test the role gate';
  ELSE
    PERFORM set_config('request.jwt.claims',
      json_build_object('role','authenticated','sub', v_tech_a)::text, true);
    v_ok := true;
    BEGIN
      INSERT INTO public.work_order_custom_statuses (organisation_id, name, maps_to_base_status)
      VALUES (v_org_a, 'Tech Status', 'new');
      v_ok := false;
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    IF v_ok THEN RAISE NOTICE 'PASS 4: technician INSERT rejected by role gate';
    ELSE RAISE WARNING 'FAIL 4: technician created a status'; END IF;
  END IF;
END $$;
ROLLBACK;
