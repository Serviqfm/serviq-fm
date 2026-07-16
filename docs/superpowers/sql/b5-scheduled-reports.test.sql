-- Verification harness for b5-scheduled-reports.sql — OPTIONAL, safe.
-- Run AFTER the migration. Mutates NOTHING: wrapped in BEGIN ... ROLLBACK.
-- Read the NOTICEs: every non-SKIP line should say PASS.
--
-- Proves:
--   1. an admin/manager of org A can INSERT a schedule into org A.
--   2. the same member CANNOT move that row into org B (UPDATE WITH CHECK).
--   3. the same member CANNOT INSERT a schedule for org B (INSERT WITH CHECK).
--   4. a technician CANNOT INSERT a schedule (role gate).
--
-- Needs two orgs; org A must have an admin/manager, and a technician for step 4.

BEGIN;
DO $$
DECLARE
  v_org_a   uuid;
  v_org_b   uuid;
  v_admin_a uuid;
  v_tech_a  uuid;
  v_row     uuid;
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
  INSERT INTO public.scheduled_reports (organisation_id, name, frequency)
  VALUES (v_org_a, 'Monthly pack test', 'monthly')
  RETURNING id INTO v_row;
  RAISE NOTICE 'PASS 1: admin/manager INSERT into own org succeeded';

  -- 2) UPDATE to move row into org B is blocked by WITH CHECK.
  v_ok := true;
  BEGIN
    UPDATE public.scheduled_reports SET organisation_id = v_org_b WHERE id = v_row;
    v_ok := false;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_ok := true;
  END;
  -- The RLS predicate may simply match zero rows rather than raise; re-check the row.
  IF (SELECT organisation_id FROM public.scheduled_reports WHERE id = v_row) = v_org_a THEN
    RAISE NOTICE 'PASS 2: cross-org UPDATE (org-swap) blocked';
  ELSE
    RAISE NOTICE 'FAIL 2: row was moved into org B';
  END IF;

  -- 3) INSERT for org B is blocked by WITH CHECK.
  v_ok := false;
  BEGIN
    INSERT INTO public.scheduled_reports (organisation_id, name, frequency)
    VALUES (v_org_b, 'cross-org', 'monthly');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_ok := true;
  END;
  IF v_ok THEN
    RAISE NOTICE 'PASS 3: cross-org INSERT blocked';
  ELSE
    RAISE NOTICE 'FAIL 3: cross-org INSERT was allowed';
  END IF;

  -- 4) technician cannot INSERT (role gate).
  IF v_tech_a IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims',
      json_build_object('role','authenticated','sub', v_tech_a)::text, true);
    v_ok := false;
    BEGIN
      INSERT INTO public.scheduled_reports (organisation_id, name, frequency)
      VALUES (v_org_a, 'tech attempt', 'monthly');
    EXCEPTION WHEN insufficient_privilege OR check_violation THEN
      v_ok := true;
    END;
    IF v_ok THEN
      RAISE NOTICE 'PASS 4: technician INSERT blocked (role gate)';
    ELSE
      RAISE NOTICE 'FAIL 4: technician INSERT was allowed';
    END IF;
  ELSE
    RAISE NOTICE 'SKIP 4: no technician in org A';
  END IF;
END $$;
ROLLBACK;
