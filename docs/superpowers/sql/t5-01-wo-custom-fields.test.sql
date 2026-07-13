-- Verification harness for t5-01-wo-custom-fields.sql — OPTIONAL, safe.
-- Run AFTER the migration. Mutates NOTHING: wrapped in BEGIN ... ROLLBACK.
-- Read the NOTICEs: every line should say PASS.
--
-- Proves the RLS cross-tenant guard that the Wave-1 asset-log review flagged:
--   1. an authenticated member of org A can INSERT a definition into org A.
--   2. the same member CANNOT move that row into org B (UPDATE WITH CHECK rejects
--      the org swap) — this is the missing-UPDATE-WITH-CHECK hole, closed.
--   3. the same member CANNOT INSERT a definition for org B (INSERT WITH CHECK).
--
-- Needs two orgs, each with at least one user. Uses the first two orgs found.

BEGIN;
DO $$
DECLARE
  v_org_a  uuid;
  v_org_b  uuid;
  v_user_a uuid;
  v_def    uuid;
  v_ok     boolean;
BEGIN
  SELECT id INTO v_org_a FROM public.organisations ORDER BY created_at LIMIT 1;
  SELECT id INTO v_org_b FROM public.organisations WHERE id <> v_org_a LIMIT 1;
  SELECT id INTO v_user_a FROM public.users WHERE organisation_id = v_org_a LIMIT 1;

  IF v_org_a IS NULL OR v_org_b IS NULL OR v_user_a IS NULL THEN
    RAISE NOTICE 'SKIP: need two orgs and a user in the first org';
    RETURN;
  END IF;

  -- Simulate an authenticated session for a member of org A.
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub', v_user_a)::text, true);
  PERFORM set_config('role', 'authenticated', true);

  -- 1) INSERT into own org succeeds.
  INSERT INTO public.custom_field_definitions (organisation_id, key, label, type)
  VALUES (v_org_a, 'harness_key', 'Harness', 'text')
  RETURNING id INTO v_def;
  RAISE NOTICE 'PASS 1: member inserted a definition into own org';

  -- 2) UPDATE that moves the row into org B must be rejected by WITH CHECK.
  v_ok := true;
  BEGIN
    UPDATE public.custom_field_definitions
      SET organisation_id = v_org_b WHERE id = v_def;
    v_ok := false; -- should not reach here
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- expected: RLS WITH CHECK rejection
  END;
  IF v_ok THEN RAISE NOTICE 'PASS 2: UPDATE org-swap into org B rejected';
  ELSE RAISE WARNING 'FAIL 2: UPDATE moved a definition into another org'; END IF;

  -- 3) INSERT for org B must be rejected by INSERT WITH CHECK.
  v_ok := true;
  BEGIN
    INSERT INTO public.custom_field_definitions (organisation_id, key, label, type)
    VALUES (v_org_b, 'harness_key_b', 'Harness B', 'text');
    v_ok := false;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- expected
  END;
  IF v_ok THEN RAISE NOTICE 'PASS 3: INSERT for foreign org rejected';
  ELSE RAISE WARNING 'FAIL 3: INSERT created a definition for another org'; END IF;
END $$;
ROLLBACK;
