-- Verification harness for 1c-13-limited-technician.sql. Run AFTER the migration.
-- Mutates NOTHING: everything runs inside BEGIN ... ROLLBACK.
--
-- Builds two isolated orgs with their own users and work orders, then proves the
-- RESTRICTIVE policy end-to-end under the 'authenticated' role (simulated via
-- request.jwt.claims, the same technique as the core-20 / t9 harnesses):
--   a. flag OFF  -> technician sees unassigned org WOs (zero behavior change)
--   b. flag ON   -> technician sees ONLY assigned / additional-worker / created
--   c. flag ON   -> managers are unaffected
--   d. cross-org -> untouched in both states
--
-- Read the NOTICEs: every line should say PASS.

BEGIN;
DO $$
DECLARE
  v_orgA uuid; v_orgB uuid;
  v_techA1 uuid;  -- org A technician: assigned / additional worker on two WOs
  v_techA2 uuid;  -- org A technician: creator of one WO, otherwise uninvolved
  v_mgrA  uuid;   -- org A manager
  v_woAssigned uuid; v_woExtra uuid; v_woCreated uuid; v_woOther uuid;
  v_woB uuid;
  v_wosA uuid[];
  v_n int; v_n2 int;
BEGIN
  -- --- isolated fixtures (as owner; RLS not applied) ---------------------
  INSERT INTO public.organisations (id, name) VALUES (gen_random_uuid(), '1C13 Org A')
    RETURNING id INTO v_orgA;
  INSERT INTO public.organisations (id, name) VALUES (gen_random_uuid(), '1C13 Org B')
    RETURNING id INTO v_orgB;

  INSERT INTO public.users (id, organisation_id, role, full_name)
    VALUES (gen_random_uuid(), v_orgA, 'technician', '1C13 Tech A1')
    RETURNING id INTO v_techA1;
  INSERT INTO public.users (id, organisation_id, role, full_name)
    VALUES (gen_random_uuid(), v_orgA, 'technician', '1C13 Tech A2')
    RETURNING id INTO v_techA2;
  INSERT INTO public.users (id, organisation_id, role, full_name)
    VALUES (gen_random_uuid(), v_orgA, 'manager', '1C13 Mgr A')
    RETURNING id INTO v_mgrA;

  INSERT INTO public.work_orders (organisation_id, title, status, priority, created_by, assigned_to)
    VALUES (v_orgA, '1C13 assigned to A1', 'open', 'medium', v_mgrA, v_techA1)
    RETURNING id INTO v_woAssigned;
  INSERT INTO public.work_orders (organisation_id, title, status, priority, created_by, additional_workers)
    VALUES (v_orgA, '1C13 A1 additional worker', 'open', 'medium', v_mgrA, ARRAY[v_techA1])
    RETURNING id INTO v_woExtra;
  INSERT INTO public.work_orders (organisation_id, title, status, priority, created_by)
    VALUES (v_orgA, '1C13 created by A2, unassigned', 'open', 'medium', v_techA2)
    RETURNING id INTO v_woCreated;
  INSERT INTO public.work_orders (organisation_id, title, status, priority, created_by)
    VALUES (v_orgA, '1C13 unassigned, nobody''s', 'open', 'medium', v_mgrA)
    RETURNING id INTO v_woOther;
  INSERT INTO public.work_orders (organisation_id, title, status, priority)
    VALUES (v_orgB, '1C13 org B WO', 'open', 'medium')
    RETURNING id INTO v_woB;

  v_wosA := ARRAY[v_woAssigned, v_woExtra, v_woCreated, v_woOther];

  -- --- (a) flag OFF (default): technician sees ALL org WOs, incl. unassigned ---
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub', v_techA2)::text, true);
  SET LOCAL role authenticated;
  SELECT count(*) INTO v_n FROM public.work_orders WHERE id = ANY (v_wosA);
  RESET role;
  IF v_n = 4 THEN
    RAISE NOTICE 'PASS a: flag off -> technician sees all 4 org WOs (no behavior change)';
  ELSE
    RAISE WARNING 'FAIL a: flag off but technician sees % of 4 org WOs', v_n;
  END IF;

  -- --- turn the flag ON for org A (as owner) -----------------------------
  UPDATE public.organisations SET limit_technician_visibility = true WHERE id = v_orgA;

  -- --- (b) flag ON: uninvolved technician sees ONLY the WO they created ---
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub', v_techA2)::text, true);
  SET LOCAL role authenticated;
  SELECT count(*) INTO v_n FROM public.work_orders WHERE id = ANY (v_wosA);
  SELECT count(*) INTO v_n2 FROM public.work_orders WHERE id = v_woCreated;
  RESET role;
  IF v_n = 1 AND v_n2 = 1 THEN
    RAISE NOTICE 'PASS b: flag on -> technician sees only the WO they created (1 of 4)';
  ELSE
    RAISE WARNING 'FAIL b: flag on, technician sees % of 4 (created visible: %)', v_n, v_n2;
  END IF;

  -- --- (c) flag ON: assigned/additional-worker technician sees exactly those ---
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub', v_techA1)::text, true);
  SET LOCAL role authenticated;
  SELECT count(*) INTO v_n FROM public.work_orders WHERE id = ANY (v_wosA);
  SELECT count(*) INTO v_n2 FROM public.work_orders
    WHERE id IN (v_woAssigned, v_woExtra);
  RESET role;
  IF v_n = 2 AND v_n2 = 2 THEN
    RAISE NOTICE 'PASS c: flag on -> assignee + additional-worker WOs visible, others hidden';
  ELSE
    RAISE WARNING 'FAIL c: assigned technician sees % of 4 (own two visible: %)', v_n, v_n2;
  END IF;

  -- --- (d) flag ON: manager unaffected ------------------------------------
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub', v_mgrA)::text, true);
  SET LOCAL role authenticated;
  SELECT count(*) INTO v_n FROM public.work_orders WHERE id = ANY (v_wosA);
  RESET role;
  IF v_n = 4 THEN
    RAISE NOTICE 'PASS d: flag on -> manager still sees all 4 org WOs';
  ELSE
    RAISE WARNING 'FAIL d: manager sees % of 4 org WOs with flag on', v_n;
  END IF;

  -- --- (e) cross-org isolation untouched (both flag states already covered:
  --         org B flag is off, org A flag is on) ---------------------------
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub', v_techA1)::text, true);
  SET LOCAL role authenticated;
  SELECT count(*) INTO v_n FROM public.work_orders WHERE id = v_woB;
  RESET role;
  IF v_n = 0 THEN
    RAISE NOTICE 'PASS e: cross-org WO stays invisible (restrictive policy never widens)';
  ELSE
    RAISE WARNING 'FAIL e: cross-org leak — org A technician sees an org B WO';
  END IF;

  RESET role;
END $$;
ROLLBACK;
