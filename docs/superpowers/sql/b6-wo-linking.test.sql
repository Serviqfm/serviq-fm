-- Verification harness for b6-wo-linking.sql — OPTIONAL, safe.
-- Run AFTER the migration. Mutates NOTHING: wrapped in BEGIN ... ROLLBACK.
-- Read the NOTICEs: every non-SKIP line should say PASS.
--
-- Proves:
--   1. a member of org A can INSERT a link between two org-A WOs.
--   2. the same member CANNOT link an org-A WO to an org-B WO (WITH CHECK).
--   3. self-links are rejected (CHECK from_wo_id <> to_wo_id).
--   4. duplicate links are rejected (UNIQUE from_wo_id,to_wo_id,link_type).
--
-- Needs two orgs; org A must have >=2 WOs and a member; org B must have >=1 WO.

BEGIN;
DO $$
DECLARE
  v_org_a   uuid;
  v_org_b   uuid;
  v_user_a  uuid;
  v_wo_a1   uuid;
  v_wo_a2   uuid;
  v_wo_b1   uuid;
  v_link    uuid;
  v_ok      boolean;
BEGIN
  SELECT id INTO v_org_a FROM public.organisations ORDER BY created_at LIMIT 1;
  SELECT id INTO v_org_b FROM public.organisations WHERE id <> v_org_a LIMIT 1;
  SELECT id INTO v_user_a FROM public.users WHERE organisation_id = v_org_a LIMIT 1;
  SELECT id INTO v_wo_a1 FROM public.work_orders WHERE organisation_id = v_org_a LIMIT 1;
  SELECT id INTO v_wo_a2 FROM public.work_orders WHERE organisation_id = v_org_a AND id <> v_wo_a1 LIMIT 1;
  SELECT id INTO v_wo_b1 FROM public.work_orders WHERE organisation_id = v_org_b LIMIT 1;

  IF v_org_a IS NULL OR v_org_b IS NULL OR v_user_a IS NULL
     OR v_wo_a1 IS NULL OR v_wo_a2 IS NULL OR v_wo_b1 IS NULL THEN
    RAISE NOTICE 'SKIP: need two orgs, a member + 2 WOs in org A, and 1 WO in org B';
    RETURN;
  END IF;

  -- Session as a member of org A.
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub', v_user_a)::text, true);
  PERFORM set_config('role', 'authenticated', true);

  -- 1) INSERT a valid same-org link succeeds.
  INSERT INTO public.work_order_links (organisation_id, from_wo_id, to_wo_id, link_type, created_by)
  VALUES (v_org_a, v_wo_a1, v_wo_a2, 'blocks', v_user_a)
  RETURNING id INTO v_link;
  RAISE NOTICE 'PASS 1: member linked two own-org WOs';

  -- 2) INSERT linking to an org-B WO must be rejected by WITH CHECK.
  v_ok := true;
  BEGIN
    INSERT INTO public.work_order_links (organisation_id, from_wo_id, to_wo_id, link_type, created_by)
    VALUES (v_org_a, v_wo_a1, v_wo_b1, 'related', v_user_a);
    v_ok := false;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF v_ok THEN RAISE NOTICE 'PASS 2: cross-org link rejected';
  ELSE RAISE WARNING 'FAIL 2: cross-org link was created'; END IF;

  -- 3) Self-link rejected by CHECK constraint (fires before RLS as a table check).
  v_ok := true;
  BEGIN
    INSERT INTO public.work_order_links (organisation_id, from_wo_id, to_wo_id, link_type, created_by)
    VALUES (v_org_a, v_wo_a1, v_wo_a1, 'related', v_user_a);
    v_ok := false;
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF v_ok THEN RAISE NOTICE 'PASS 3: self-link rejected';
  ELSE RAISE WARNING 'FAIL 3: self-link was created'; END IF;

  -- 4) Duplicate of the row from step 1 rejected by UNIQUE.
  v_ok := true;
  BEGIN
    INSERT INTO public.work_order_links (organisation_id, from_wo_id, to_wo_id, link_type, created_by)
    VALUES (v_org_a, v_wo_a1, v_wo_a2, 'blocks', v_user_a);
    v_ok := false;
  EXCEPTION WHEN unique_violation THEN NULL; END;
  IF v_ok THEN RAISE NOTICE 'PASS 4: duplicate link rejected';
  ELSE RAISE WARNING 'FAIL 4: duplicate link was created'; END IF;
END $$;
ROLLBACK;
