-- Verification harness for w6-9-moves.sql — OPTIONAL, safe.
-- Run AFTER the migration. Mutates NOTHING: wrapped in BEGIN ... ROLLBACK.
-- Read the NOTICEs: every non-SKIP line should say PASS.
--
-- Proves:
--   1. an org-A member can INSERT a move request for org A.
--   2. the same member CANNOT INSERT a row claiming org B (INSERT WITH CHECK).
--   3. a technician CANNOT UPDATE (admin/manager gate) — cannot approve.
--   4. an admin walks the legal lifecycle requested → approved → scheduled → completed.
--   5. an illegal jump (approved → completed) is rejected by the transition guard.
--
-- Needs two orgs; org A needs any member, an admin, and a technician.

BEGIN;
DO $$
DECLARE
  v_org_a    uuid;
  v_org_b    uuid;
  v_member_a uuid;
  v_admin_a  uuid;
  v_tech_a   uuid;
  v_move     uuid;
  v_ok       boolean;
BEGIN
  SELECT id INTO v_org_a FROM public.organisations ORDER BY created_at LIMIT 1;
  SELECT id INTO v_org_b FROM public.organisations WHERE id <> v_org_a LIMIT 1;
  SELECT id INTO v_member_a FROM public.users WHERE organisation_id = v_org_a LIMIT 1;
  SELECT id INTO v_admin_a FROM public.users
    WHERE organisation_id = v_org_a AND role IN ('admin','manager') LIMIT 1;
  SELECT id INTO v_tech_a FROM public.users
    WHERE organisation_id = v_org_a AND role NOT IN ('admin','manager') LIMIT 1;

  IF v_org_a IS NULL OR v_org_b IS NULL OR v_member_a IS NULL OR v_admin_a IS NULL THEN
    RAISE NOTICE 'SKIP: need two orgs, plus a member and an admin/manager in the first org';
    RETURN;
  END IF;

  -- Session as a member of org A.
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub', v_member_a)::text, true);
  PERFORM set_config('role', 'authenticated', true);

  -- 1) INSERT a request for own org succeeds.
  INSERT INTO public.space_moves (organisation_id, subject_type, subject_label, requested_by)
  VALUES (v_org_a, 'occupant', 'Harness: Desk 12 → Desk 30', v_member_a)
  RETURNING id INTO v_move;
  RAISE NOTICE 'PASS 1: member filed a move request for own org';

  -- 2) INSERT claiming org B must be rejected by INSERT WITH CHECK.
  v_ok := true;
  BEGIN
    INSERT INTO public.space_moves (organisation_id, subject_type)
    VALUES (v_org_b, 'occupant');
    v_ok := false;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF v_ok THEN RAISE NOTICE 'PASS 2: INSERT for foreign org rejected';
  ELSE RAISE WARNING 'FAIL 2: INSERT created a move for another org'; END IF;

  -- 3) A technician cannot UPDATE (approve) — role gate filters the row.
  IF v_tech_a IS NULL THEN
    RAISE NOTICE 'SKIP 3: no technician in org A to test the update gate';
  ELSE
    PERFORM set_config('request.jwt.claims',
      json_build_object('role','authenticated','sub', v_tech_a)::text, true);
    UPDATE public.space_moves SET status = 'approved' WHERE id = v_move;
    IF FOUND THEN RAISE WARNING 'FAIL 3: technician approved a move';
    ELSE RAISE NOTICE 'PASS 3: technician UPDATE silently filtered by role gate'; END IF;
  END IF;

  -- 4) An admin walks the legal lifecycle.
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub', v_admin_a)::text, true);
  UPDATE public.space_moves SET status = 'approved', approved_by = v_admin_a WHERE id = v_move;
  UPDATE public.space_moves SET status = 'scheduled', scheduled_for = now() WHERE id = v_move;
  UPDATE public.space_moves SET status = 'completed', completed_at = now() WHERE id = v_move;
  IF (SELECT status FROM public.space_moves WHERE id = v_move) = 'completed'
    THEN RAISE NOTICE 'PASS 4: admin walked requested → approved → scheduled → completed';
  ELSE RAISE WARNING 'FAIL 4: lifecycle did not reach completed'; END IF;

  -- 5) An illegal jump is rejected by the transition guard.
  INSERT INTO public.space_moves (organisation_id, subject_type, status, requested_by)
  VALUES (v_org_a, 'occupant', 'approved', v_admin_a) RETURNING id INTO v_move;
  v_ok := true;
  BEGIN
    UPDATE public.space_moves SET status = 'completed' WHERE id = v_move;
    v_ok := false;
  EXCEPTION WHEN others THEN NULL; END;
  IF v_ok THEN RAISE NOTICE 'PASS 5: approved → completed jump rejected by guard';
  ELSE RAISE WARNING 'FAIL 5: illegal status jump accepted'; END IF;
END $$;
ROLLBACK;
