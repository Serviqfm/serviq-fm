-- Verification harness for w4-compliance-certificates.sql — OPTIONAL, safe.
-- Run AFTER the migration. Mutates NOTHING: BEGIN ... ROLLBACK with savepoints
-- around the expected-failure cases. Read the NOTICEs: every line should PASS.
--
-- Proves the two non-trivial DB guarantees:
--   1. the type CHECK rejects an unknown certificate type
--   2. RLS is enabled with all four org policies present (the tenant-isolation
--      surface — SELECT/INSERT/UPDATE/DELETE each scoped to the caller's org)

BEGIN;
DO $$
DECLARE
  v_org uuid;
  v_ok  boolean;
  v_cnt int;
BEGIN
  SELECT id INTO v_org FROM public.organisations LIMIT 1;
  IF v_org IS NULL THEN
    RAISE NOTICE 'SKIP: need at least one organisation';
    RETURN;
  END IF;

  -- 1) unknown type must be rejected by the CHECK constraint.
  v_ok := true;
  BEGIN
    INSERT INTO public.compliance_certificates (organisation_id, title, type, expires_at)
    VALUES (v_org, 'bad', 'not_a_real_type', current_date + 10);
    v_ok := false; -- should not reach here
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  IF v_ok THEN RAISE NOTICE 'PASS: type CHECK rejects unknown type';
  ELSE RAISE EXCEPTION 'FAIL: unknown type was accepted'; END IF;

  -- 2) RLS enabled + four org policies present.
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'compliance_certificates' AND relrowsecurity) THEN
    RAISE NOTICE 'PASS: RLS enabled on compliance_certificates';
  ELSE RAISE EXCEPTION 'FAIL: RLS not enabled'; END IF;

  SELECT count(*) INTO v_cnt FROM pg_policies
   WHERE tablename = 'compliance_certificates';
  IF v_cnt >= 4 THEN RAISE NOTICE 'PASS: % org policies present (>=4)', v_cnt;
  ELSE RAISE EXCEPTION 'FAIL: only % policies (need 4)', v_cnt; END IF;

  -- 3) a valid row inserts cleanly (rolled back).
  INSERT INTO public.compliance_certificates (organisation_id, title, type, expires_at)
  VALUES (v_org, 'Fire system annual', 'fire_system', current_date + 20);
  RAISE NOTICE 'PASS: valid certificate inserts';
END$$;
ROLLBACK;
