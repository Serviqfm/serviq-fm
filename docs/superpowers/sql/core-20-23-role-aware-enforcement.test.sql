-- Verification harness for core-20-23-role-aware-enforcement.sql — OPTIONAL, safe.
-- Run this AFTER the migration. It mutates NOTHING: everything happens inside a
-- BEGIN ... ROLLBACK, and the test UPDATEs are caught by inner savepoints.
--
-- WHY THIS EXISTS: the triggers only enforce on the 'authenticated' (mobile /
-- direct-PostgREST) path. This SQL editor has no JWT, so a plain UPDATE here is
-- SKIPPED by the trigger — you cannot prove enforcement by hand. This harness
-- SIMULATES an authenticated user by setting request.jwt.claims, so each guard
-- actually fires. Read the NOTICEs: every line should say PASS.
--
-- Needs at least one technician, one manager, one requester, and one work order
-- in the DB; if any are missing it prints a skip line instead of failing.

BEGIN;
DO $$
DECLARE
  v_tech uuid; v_mgr uuid; v_req uuid; v_wo uuid;
BEGIN
  SELECT id INTO v_tech FROM public.users WHERE role = 'technician' LIMIT 1;
  SELECT id INTO v_mgr  FROM public.users WHERE role IN ('manager','admin') LIMIT 1;
  SELECT id INTO v_req  FROM public.users WHERE role = 'requester' LIMIT 1;
  SELECT id INTO v_wo   FROM public.work_orders LIMIT 1;

  IF v_tech IS NULL OR v_wo IS NULL THEN
    RAISE NOTICE 'SKIP: need at least one technician and one work order to run the WO tests';
  ELSE
    -- Setup as the DB owner (no JWT yet -> trigger is skipped): make the WO an
    -- UNASSIGNED, in_progress order the technician is not a worker on.
    UPDATE public.work_orders
       SET status = 'in_progress', assigned_to = NULL, additional_workers = '{}'
     WHERE id = v_wo;

    -- Become an authenticated technician for the remaining WO tests.
    PERFORM set_config('request.jwt.claims',
      json_build_object('role','authenticated','sub', v_tech)::text, true);

    -- 1) NULL-assignee hole: technician completes an unassigned WO -> BLOCK
    BEGIN
      UPDATE public.work_orders SET status = 'completed' WHERE id = v_wo;
      RAISE WARNING 'FAIL 1: technician completed an unassigned work order';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS 1: unassigned-complete blocked (NULL-assignee hole closed)';
    END;

    -- 2) Self-add to additional_workers (field-only edit) -> BLOCK
    BEGIN
      UPDATE public.work_orders
         SET additional_workers = array_append(COALESCE(additional_workers,'{}'), v_tech)
       WHERE id = v_wo;
      RAISE WARNING 'FAIL 2: technician self-added to additional_workers';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS 2: worker self-add blocked';
    END;

    -- 3) Self-assign -> BLOCK
    BEGIN
      UPDATE public.work_orders SET assigned_to = v_tech WHERE id = v_wo;
      RAISE WARNING 'FAIL 3: technician self-assigned a work order';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS 3: self-assign blocked';
    END;

    -- 4) Close by a technician -> BLOCK
    BEGIN
      UPDATE public.work_orders SET status = 'closed' WHERE id = v_wo;
      RAISE WARNING 'FAIL 4: technician closed a work order';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS 4: technician close blocked';
    END;

    -- 5) POSITIVE: a manager may drive the same WO -> PASS
    IF v_mgr IS NOT NULL THEN
      PERFORM set_config('request.jwt.claims',
        json_build_object('role','authenticated','sub', v_mgr)::text, true);
      BEGIN
        UPDATE public.work_orders SET status = 'on_hold' WHERE id = v_wo;
        RAISE NOTICE 'PASS 5: manager transition allowed';
      EXCEPTION WHEN insufficient_privilege THEN
        RAISE WARNING 'FAIL 5: manager transition was blocked';
      END;
    END IF;

    -- 6) Requester writes anything -> BLOCK
    IF v_req IS NOT NULL THEN
      PERFORM set_config('request.jwt.claims',
        json_build_object('role','authenticated','sub', v_req)::text, true);
      BEGIN
        UPDATE public.work_orders SET status = 'in_progress' WHERE id = v_wo;
        RAISE WARNING 'FAIL 6: requester modified a work order';
      EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'PASS 6: requester write blocked';
      END;
    END IF;
  END IF;

  -- users tests
  IF v_tech IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims',
      json_build_object('role','authenticated','sub', v_tech)::text, true);

    -- 7) Self-promotion to admin -> BLOCK
    BEGIN
      UPDATE public.users SET role = 'admin' WHERE id = v_tech;
      RAISE WARNING 'FAIL 7: technician self-promoted to admin';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS 7: self-promotion blocked';
    END;

    -- 8) POSITIVE: self-service account deletion (disabled false->true) -> PASS
    BEGIN
      UPDATE public.users SET disabled = true WHERE id = v_tech;
      RAISE NOTICE 'PASS 8: self-service account deletion (disabled=true) allowed';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE WARNING 'FAIL 8: account deletion was blocked';
    END;

    -- 9) Self re-enable (disabled true->false) -> BLOCK
    BEGIN
      UPDATE public.users SET disabled = false WHERE id = v_tech;
      RAISE WARNING 'FAIL 9: user re-enabled their own disabled account';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS 9: self re-enable blocked';
    END;
  END IF;
END $$;
ROLLBACK;
