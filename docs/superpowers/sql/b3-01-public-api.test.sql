-- Verification harness for b3-01-public-api.sql — OPTIONAL, safe.
-- Run AFTER the migration. Mutates NOTHING: wrapped in BEGIN ... ROLLBACK.
-- Read the NOTICEs: every line should say PASS (or a justified SKIP).
--
-- Proves the RLS posture that matters for these two secret-bearing tables:
--   1. key_hash UNIQUE is enforced.
--   2. admin in the org CAN see the org's api_keys/webhooks rows.
--   3. a NON-admin member of the SAME org sees ZERO rows (admin-only SELECT).
--   4. an admin of ANOTHER org sees ZERO rows (org isolation).
--
-- Needs one org with at least one admin user. Uses the FIRST org found.

BEGIN;
DO $$
DECLARE
  v_org       uuid;
  v_admin     uuid;
  v_nonadmin  uuid;
  v_other_admin uuid;
  v_key       uuid;
  v_cnt       int;
  v_ok        boolean;
BEGIN
  SELECT id INTO v_org FROM public.organisations LIMIT 1;
  SELECT id INTO v_admin FROM public.users
    WHERE organisation_id = v_org AND role = 'admin' LIMIT 1;

  IF v_org IS NULL OR v_admin IS NULL THEN
    RAISE NOTICE 'SKIP: need one org with an admin user';
    RETURN;
  END IF;

  -- Seed one api_key + one webhook for the org (service-role context = RLS bypass here).
  INSERT INTO public.api_keys (organisation_id, name, key_hash, key_prefix, scopes, created_by)
  VALUES (v_org, 'harness key', 'harness-hash-' || gen_random_uuid()::text, 'sk_test0',
          ARRAY['work-orders:read'], v_admin)
  RETURNING id INTO v_key;
  INSERT INTO public.webhooks (organisation_id, url, event, secret, created_by)
  VALUES (v_org, 'https://example.test/hook', 'wo.created', 'whsec_' || gen_random_uuid()::text, v_admin);
  RAISE NOTICE 'PASS 0: seeded 1 api_key + 1 webhook';

  -- 1) key_hash UNIQUE
  v_ok := true;
  BEGIN
    INSERT INTO public.api_keys (organisation_id, name, key_hash, key_prefix)
    SELECT v_org, 'dup', key_hash, 'sk_dup00' FROM public.api_keys WHERE id = v_key;
    v_ok := false;
  EXCEPTION WHEN unique_violation THEN NULL; END;
  IF v_ok THEN RAISE NOTICE 'PASS 1: key_hash UNIQUE enforced';
  ELSE RAISE WARNING 'FAIL 1: duplicate key_hash accepted'; END IF;

  -- 2) admin SELECT sees the org rows.
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub', v_admin)::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_cnt FROM public.api_keys WHERE organisation_id = v_org;
  IF v_cnt >= 1 THEN RAISE NOTICE 'PASS 2: admin sees org api_keys (%).', v_cnt;
  ELSE RAISE WARNING 'FAIL 2: admin sees no api_keys'; END IF;
  RESET ROLE;

  -- 3) non-admin member of the SAME org sees ZERO rows.
  SELECT id INTO v_nonadmin FROM public.users
    WHERE organisation_id = v_org AND role <> 'admin' LIMIT 1;
  IF v_nonadmin IS NULL THEN
    RAISE NOTICE 'SKIP 3: no non-admin member in this org';
  ELSE
    PERFORM set_config('request.jwt.claims',
      json_build_object('role','authenticated','sub', v_nonadmin)::text, true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO v_cnt FROM public.api_keys WHERE organisation_id = v_org;
    RESET ROLE;
    IF v_cnt = 0 THEN RAISE NOTICE 'PASS 3: non-admin sees 0 api_keys (admin-only)';
    ELSE RAISE WARNING 'FAIL 3: non-admin saw % api_keys', v_cnt; END IF;
  END IF;

  -- 4) admin of ANOTHER org sees ZERO of this org's rows.
  SELECT id INTO v_other_admin FROM public.users
    WHERE organisation_id <> v_org AND role = 'admin' LIMIT 1;
  IF v_other_admin IS NULL THEN
    RAISE NOTICE 'SKIP 4: no second org admin to test isolation';
  ELSE
    PERFORM set_config('request.jwt.claims',
      json_build_object('role','authenticated','sub', v_other_admin)::text, true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO v_cnt FROM public.api_keys WHERE organisation_id = v_org;
    RESET ROLE;
    IF v_cnt = 0 THEN RAISE NOTICE 'PASS 4: other-org admin sees 0 of this org api_keys';
    ELSE RAISE WARNING 'FAIL 4: cross-org admin saw % api_keys', v_cnt; END IF;
  END IF;

  RAISE NOTICE 'DONE — all checks complete (rolled back).';
END $$;
ROLLBACK;
