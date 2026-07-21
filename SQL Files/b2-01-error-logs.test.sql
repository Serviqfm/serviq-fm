-- Verification harness for b2-01-error-logs.sql — OPTIONAL, safe.
-- Run AFTER the migration. Mutates NOTHING: wrapped in BEGIN ... ROLLBACK.
-- Read the NOTICEs: every line should say PASS.
--
-- Proves the platform / service-role-only guarantee: RLS is ON and there is no
-- authenticated policy, so a simulated authenticated session reads zero rows
-- even though a row exists.

BEGIN;
DO $$
DECLARE
  v_count int;
  v_rls   boolean;
BEGIN
  -- RLS must be enabled on the table.
  SELECT relrowsecurity INTO v_rls
  FROM pg_class WHERE oid = 'public.error_logs'::regclass;
  IF v_rls THEN RAISE NOTICE 'PASS 1: RLS is enabled on error_logs';
  ELSE RAISE WARNING 'FAIL 1: RLS is NOT enabled on error_logs'; END IF;

  -- There must be no policy granting authenticated any access (deny-all).
  SELECT count(*) INTO v_count FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'error_logs';
  IF v_count = 0 THEN RAISE NOTICE 'PASS 2: no policies (deny-all to authenticated)';
  ELSE RAISE WARNING 'FAIL 2: unexpected policies present (%).', v_count; END IF;

  -- Seed a row as the table owner (service-role/bypass equivalent here).
  INSERT INTO public.error_logs (route, message) VALUES ('/api/cron/test', 'boom');

  -- Under a simulated authenticated session, the row must be invisible.
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub', gen_random_uuid())::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.error_logs;
  IF v_count = 0 THEN RAISE NOTICE 'PASS 3: authenticated sees zero rows';
  ELSE RAISE WARNING 'FAIL 3: authenticated leaked % row(s)', v_count; END IF;

  RESET ROLE;
END $$;
ROLLBACK;
