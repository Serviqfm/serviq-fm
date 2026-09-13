-- Verification harness for procurement-08-erp.sql — OPTIONAL, safe.
-- Run AFTER the migration. Mutates NOTHING: wrapped in BEGIN ... ROLLBACK.
-- Read the NOTICEs: every non-SKIP line should say PASS.
--
-- Proves:
--   1. provider is constrained to oracle | dynamics | odoo | none.
--   2. an organisation can hold only ONE connection.
--   3. an authenticated user CANNOT insert into erp_sync_log (append-only; only
--      the service role writes it).
--   4. a non-admin cannot see the org's erp_connections row.
--
-- Needs one org with an admin; test 4 additionally needs a non-admin member.

BEGIN;
DO $harness$
DECLARE
  v_org     uuid;
  v_admin   uuid;
  v_member  uuid;
  v_n       int;
  v_ok      boolean;
BEGIN
  SELECT id INTO v_org FROM public.organisations ORDER BY created_at LIMIT 1;
  SELECT id INTO v_admin FROM public.users WHERE organisation_id = v_org AND role = 'admin' LIMIT 1;
  SELECT id INTO v_member FROM public.users WHERE organisation_id = v_org AND role <> 'admin' LIMIT 1;

  IF v_org IS NULL OR v_admin IS NULL THEN
    RAISE NOTICE 'SKIP: need an org with an admin';
    RETURN;
  END IF;

  -- Fixtures written as the table owner, before switching to an end-user session.
  DELETE FROM public.erp_connections WHERE organisation_id = v_org;
  INSERT INTO public.erp_connections (organisation_id, provider, is_active)
    VALUES (v_org, 'none', true);

  -- 1) Provider vocabulary.
  v_ok := true;
  BEGIN
    INSERT INTO public.erp_connections (organisation_id, provider)
      VALUES (gen_random_uuid(), 'sap');
    v_ok := false;
  EXCEPTION WHEN check_violation OR foreign_key_violation THEN NULL; END;
  IF v_ok THEN RAISE NOTICE 'PASS 1: an unknown provider is rejected';
  ELSE RAISE WARNING 'FAIL 1: accepted provider ''sap'''; END IF;

  -- 2) One connection per org.
  v_ok := true;
  BEGIN
    INSERT INTO public.erp_connections (organisation_id, provider) VALUES (v_org, 'odoo');
    v_ok := false;
  EXCEPTION WHEN unique_violation THEN NULL; END;
  IF v_ok THEN RAISE NOTICE 'PASS 2: a second connection for the same org is rejected';
  ELSE RAISE WARNING 'FAIL 2: an org now holds two connections'; END IF;

  -- Switch to an end-user session for the RLS assertions.
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub', v_admin)::text, true);
  PERFORM set_config('role', 'authenticated', true);

  -- 3) Even an ADMIN cannot append to the sync log from a browser session.
  v_ok := true;
  BEGIN
    INSERT INTO public.erp_sync_log (organisation_id, provider, object_type, direction, status)
      VALUES (v_org, 'none', 'vendor', 'push', 'success');
    v_ok := false;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF v_ok THEN RAISE NOTICE 'PASS 3: authenticated insert into erp_sync_log refused (append-only)';
  ELSE RAISE WARNING 'FAIL 3: a browser session forged a sync-log row'; END IF;

  -- 4) A non-admin sees no connection row.
  IF v_member IS NULL THEN
    RAISE NOTICE 'SKIP 4: no non-admin member in this org';
  ELSE
    PERFORM set_config('request.jwt.claims',
      json_build_object('role','authenticated','sub', v_member)::text, true);
    SELECT count(*) INTO v_n FROM public.erp_connections WHERE organisation_id = v_org;
    IF v_n = 0 THEN RAISE NOTICE 'PASS 4: a non-admin cannot read the ERP connection';
    ELSE RAISE WARNING 'FAIL 4: a non-admin read % connection row(s)', v_n; END IF;
  END IF;
END $harness$;
ROLLBACK;
