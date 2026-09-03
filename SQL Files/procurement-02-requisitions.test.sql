-- Verification harness for procurement-02-requisitions.sql — OPTIONAL, safe.
-- Run AFTER the migration. Mutates NOTHING: wrapped in BEGIN ... ROLLBACK.
-- Read the NOTICEs: every non-SKIP line should say PASS.
--
-- Proves:
--   1. an org-A member CANNOT insert a requisition claiming org B (INSERT WITH CHECK).
--   2. band selection matches the spec example: 300 -> 1 step, 1000 -> 2, 9000 -> 3.
--   3. approver #2 CANNOT act before approver #1 (the sequencing gate raises).
--   4. a second submit while pending is a no-op (idempotent).
--   5. reject without a comment raises; reject with one short-circuits the chain.
--   6. resubmit after a rejection rebuilds the chain from scratch (all pending).
--   7. no active band => auto-approve (the permissive default).
--   8. a direct PostgREST-style status UPDATE (self-approval) is refused by the
--      guard trigger. Runs FIRST, because app.requisition_rpc is transaction-
--      scoped: once any RPC has run in this transaction the guard stands down.
--
-- Needs two orgs; org A needs at least two distinct users.

BEGIN;
DO $harness$
DECLARE
  v_org_a  uuid;
  v_org_b  uuid;
  v_u1     uuid;
  v_u2     uuid;
  v_rule_a uuid;
  v_rule_b uuid;
  v_rule_c uuid;
  v_req    uuid;
  v_steps  int;
  v_status text;
  v_ok     boolean;
BEGIN
  SELECT id INTO v_org_a FROM public.organisations ORDER BY created_at LIMIT 1;
  SELECT id INTO v_org_b FROM public.organisations WHERE id <> v_org_a LIMIT 1;
  SELECT id INTO v_u1 FROM public.users WHERE organisation_id = v_org_a ORDER BY created_at LIMIT 1;
  SELECT id INTO v_u2 FROM public.users WHERE organisation_id = v_org_a AND id <> v_u1 LIMIT 1;

  IF v_org_a IS NULL OR v_org_b IS NULL OR v_u1 IS NULL OR v_u2 IS NULL THEN
    RAISE NOTICE 'SKIP: need two orgs and two distinct users in the first org';
    RETURN;
  END IF;

  -- Session as u1 of org A.
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub', v_u1)::text, true);
  PERFORM set_config('role', 'authenticated', true);

  -- 1) Cross-org INSERT must be rejected by INSERT WITH CHECK.
  v_ok := true;
  BEGIN
    INSERT INTO public.requisitions (organisation_id, title, created_by)
    VALUES (v_org_b, 'Harness: foreign org', v_u1);
    v_ok := false;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF v_ok THEN RAISE NOTICE 'PASS 1: requisition INSERT for a foreign org rejected';
  ELSE RAISE WARNING 'FAIL 1: created a requisition in another org'; END IF;

  -- 8) Self-approval by direct UPDATE is refused. MUST run before the first RPC
  --    call: set_config('app.requisition_rpc', ..., true) is transaction-scoped.
  INSERT INTO public.requisitions (organisation_id, title, created_by)
    VALUES (v_org_a, 'Harness: guard', v_u1) RETURNING id INTO v_req;
  v_ok := true;
  BEGIN
    UPDATE public.requisitions SET status = 'approved' WHERE id = v_req;
    v_ok := false;
  EXCEPTION WHEN others THEN NULL; END;
  IF v_ok THEN RAISE NOTICE 'PASS 8: direct status UPDATE refused by the guard trigger';
  ELSE RAISE WARNING 'FAIL 8: self-approved a requisition without the RPC'; END IF;

  -- Bands for org A: [0,500) = 1 step, [500,5000) = 2 steps, [5000,inf) = 3 steps.
  INSERT INTO public.procurement_approval_rules (organisation_id, min_amount, max_amount)
    VALUES (v_org_a, 0, 500) RETURNING id INTO v_rule_a;
  INSERT INTO public.procurement_approval_rules (organisation_id, min_amount, max_amount)
    VALUES (v_org_a, 500, 5000) RETURNING id INTO v_rule_b;
  INSERT INTO public.procurement_approval_rules (organisation_id, min_amount, max_amount)
    VALUES (v_org_a, 5000, NULL) RETURNING id INTO v_rule_c;

  INSERT INTO public.procurement_approval_rule_steps (organisation_id, rule_id, step_order, approver_user_id, label)
    VALUES (v_org_a, v_rule_a, 1, v_u1, 'Manager');
  INSERT INTO public.procurement_approval_rule_steps (organisation_id, rule_id, step_order, approver_user_id, label)
    VALUES (v_org_a, v_rule_b, 1, v_u1, 'Manager'), (v_org_a, v_rule_b, 2, v_u2, 'Finance');
  INSERT INTO public.procurement_approval_rule_steps (organisation_id, rule_id, step_order, approver_user_id, label)
    VALUES (v_org_a, v_rule_c, 1, v_u1, 'Manager'), (v_org_a, v_rule_c, 2, v_u2, 'Finance'),
           (v_org_a, v_rule_c, 3, v_u1, 'Director');

  -- 2) Band selection at 300 / 1000 / 9000.
  INSERT INTO public.requisitions (organisation_id, title, created_by)
    VALUES (v_org_a, 'Harness: 300', v_u1) RETURNING id INTO v_req;
  INSERT INTO public.requisition_items (organisation_id, requisition_id, description, quantity, unit_cost)
    VALUES (v_org_a, v_req, 'line', 3, 100);
  PERFORM submit_requisition(v_req);
  SELECT count(*) INTO v_steps FROM public.requisition_approvals WHERE requisition_id = v_req;
  IF v_steps = 1 THEN RAISE NOTICE 'PASS 2a: total 300 picked the 1-step band';
  ELSE RAISE WARNING 'FAIL 2a: total 300 built % steps, expected 1', v_steps; END IF;

  INSERT INTO public.requisitions (organisation_id, title, created_by)
    VALUES (v_org_a, 'Harness: 9000', v_u1) RETURNING id INTO v_req;
  INSERT INTO public.requisition_items (organisation_id, requisition_id, description, quantity, unit_cost)
    VALUES (v_org_a, v_req, 'line', 9, 1000);
  PERFORM submit_requisition(v_req);
  SELECT count(*) INTO v_steps FROM public.requisition_approvals WHERE requisition_id = v_req;
  IF v_steps = 3 THEN RAISE NOTICE 'PASS 2b: total 9000 picked the 3-step band';
  ELSE RAISE WARNING 'FAIL 2b: total 9000 built % steps, expected 3', v_steps; END IF;

  -- The 2-step requisition carries the rest of the lifecycle tests.
  INSERT INTO public.requisitions (organisation_id, title, created_by)
    VALUES (v_org_a, 'Harness: 1000', v_u1) RETURNING id INTO v_req;
  INSERT INTO public.requisition_items (organisation_id, requisition_id, description, quantity, unit_cost)
    VALUES (v_org_a, v_req, 'line', 10, 100);
  PERFORM submit_requisition(v_req);
  SELECT count(*) INTO v_steps FROM public.requisition_approvals WHERE requisition_id = v_req;
  SELECT status INTO v_status FROM public.requisitions WHERE id = v_req;
  IF v_steps = 2 AND v_status = 'pending_approval' THEN
    RAISE NOTICE 'PASS 2c: total 1000 picked the 2-step band and is pending_approval';
  ELSE RAISE WARNING 'FAIL 2c: got % steps, status %', v_steps, v_status; END IF;

  -- 3) Approver #2 cannot act before #1.
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub', v_u2)::text, true);
  v_ok := true;
  BEGIN
    PERFORM decide_requisition(v_req, true, NULL);
    v_ok := false;
  EXCEPTION WHEN others THEN NULL; END;
  IF v_ok THEN RAISE NOTICE 'PASS 3: approver #2 blocked from acting before #1';
  ELSE RAISE WARNING 'FAIL 3: approver #2 approved out of order'; END IF;

  -- 4) A second submit while pending is a no-op.
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub', v_u1)::text, true);
  PERFORM submit_requisition(v_req);
  SELECT count(*) INTO v_steps FROM public.requisition_approvals WHERE requisition_id = v_req;
  SELECT status INTO v_status FROM public.requisitions WHERE id = v_req;
  IF v_steps = 2 AND v_status = 'pending_approval' THEN
    RAISE NOTICE 'PASS 4: re-submitting a pending requisition changed nothing';
  ELSE RAISE WARNING 'FAIL 4: resubmit mutated the chain (% steps, status %)', v_steps, v_status; END IF;

  -- 5) Reject needs a comment; with one it short-circuits the chain.
  v_ok := true;
  BEGIN
    PERFORM decide_requisition(v_req, false, '   ');
    v_ok := false;
  EXCEPTION WHEN others THEN NULL; END;
  IF v_ok THEN RAISE NOTICE 'PASS 5a: reject without a comment raised';
  ELSE RAISE WARNING 'FAIL 5a: rejected with a blank comment'; END IF;

  PERFORM decide_requisition(v_req, false, 'Harness: over budget');
  SELECT status INTO v_status FROM public.requisitions WHERE id = v_req;
  SELECT count(*) INTO v_steps FROM public.requisition_approvals
    WHERE requisition_id = v_req AND status = 'approved';
  IF v_status = 'rejected' AND v_steps = 0 THEN
    RAISE NOTICE 'PASS 5b: reject short-circuited the chain, requisition is rejected';
  ELSE RAISE WARNING 'FAIL 5b: status %, % approved steps', v_status, v_steps; END IF;

  -- 6) Resubmit after rejection rebuilds a fresh chain.
  PERFORM submit_requisition(v_req);
  SELECT count(*) INTO v_steps FROM public.requisition_approvals
    WHERE requisition_id = v_req AND status = 'pending';
  SELECT status INTO v_status FROM public.requisitions WHERE id = v_req;
  IF v_steps = 2 AND v_status = 'pending_approval' THEN
    RAISE NOTICE 'PASS 6: resubmit after rejection rebuilt a fresh 2-step chain';
  ELSE RAISE WARNING 'FAIL 6: % pending steps, status %', v_steps, v_status; END IF;

  -- 7) No active band => auto-approve.
  UPDATE public.procurement_approval_rules SET is_active = false WHERE organisation_id = v_org_a;
  INSERT INTO public.requisitions (organisation_id, title, created_by)
    VALUES (v_org_a, 'Harness: no band', v_u1) RETURNING id INTO v_req;
  INSERT INTO public.requisition_items (organisation_id, requisition_id, description, quantity, unit_cost)
    VALUES (v_org_a, v_req, 'line', 1, 250);
  PERFORM submit_requisition(v_req);
  SELECT status INTO v_status FROM public.requisitions WHERE id = v_req;
  SELECT count(*) INTO v_steps FROM public.requisition_approvals WHERE requisition_id = v_req;
  IF v_status = 'approved' AND v_steps = 0 THEN
    RAISE NOTICE 'PASS 7: no matching band auto-approved with an empty chain';
  ELSE RAISE WARNING 'FAIL 7: status %, % steps', v_status, v_steps; END IF;
END $harness$;
ROLLBACK;
