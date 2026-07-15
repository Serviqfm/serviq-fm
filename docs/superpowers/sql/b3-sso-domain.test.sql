-- Verification harness for b3-sso-domain.sql — OPTIONAL, safe.
-- Run AFTER the migration. Mutates NOTHING: wrapped in BEGIN ... ROLLBACK.
-- Read the NOTICEs: every non-SKIP line should say PASS.
--
-- Proves:
--   1. an org row can record an sso_domain.
--   2. the CHECK rejects an upper-case domain.
--   3. the UNIQUE index rejects a second org claiming the same domain.
--
-- Note: this exercises the column constraints, not RLS — sso_domain rides on the
-- existing organisations RLS UPDATE policy already covered by prior migrations.

BEGIN;
DO $$
DECLARE
  v_org_a uuid;
  v_org_b uuid;
  v_ok    boolean;
BEGIN
  SELECT id INTO v_org_a FROM public.organisations ORDER BY created_at LIMIT 1;
  SELECT id INTO v_org_b FROM public.organisations WHERE id <> v_org_a LIMIT 1;

  IF v_org_a IS NULL THEN
    RAISE NOTICE 'SKIP: need at least one organisation';
    RETURN;
  END IF;

  -- 1) set a domain on org A.
  UPDATE public.organisations SET sso_domain = 'harness-sso.example' WHERE id = v_org_a;
  RAISE NOTICE 'PASS 1: recorded sso_domain on an org';

  -- 2) upper-case domain rejected by CHECK.
  v_ok := true;
  BEGIN
    UPDATE public.organisations SET sso_domain = 'HARNESS-SSO.EXAMPLE' WHERE id = v_org_a;
    v_ok := false;
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF v_ok THEN RAISE NOTICE 'PASS 2: upper-case sso_domain rejected';
  ELSE RAISE WARNING 'FAIL 2: upper-case sso_domain accepted'; END IF;

  -- 3) second org claiming the same domain rejected by UNIQUE index.
  IF v_org_b IS NULL THEN
    RAISE NOTICE 'SKIP 3: need a second org to test uniqueness';
  ELSE
    v_ok := true;
    BEGIN
      UPDATE public.organisations SET sso_domain = 'harness-sso.example' WHERE id = v_org_b;
      v_ok := false;
    EXCEPTION WHEN unique_violation THEN NULL; END;
    IF v_ok THEN RAISE NOTICE 'PASS 3: duplicate sso_domain across orgs rejected';
    ELSE RAISE WARNING 'FAIL 3: two orgs claimed the same sso_domain'; END IF;
  END IF;
END $$;
ROLLBACK;
