-- Verification harness for w5-2-dashboard-stats.sql — OPTIONAL, safe.
-- Run AFTER the migration. Mutates NOTHING (no INSERTs, no ROLLBACK needed).
-- Read the NOTICEs: every line should say PASS or SKIP.
--
-- Proves get_dashboard_stats():
--   1. takes NO argument — the org is derived from auth.uid(), never passed in;
--   2. scopes to the caller's org and its open-WO count matches an independent
--      direct aggregation over the SAME org (completed/closed excluded).

DO $$
DECLARE
  v_org     uuid;
  v_user    uuid;
  v_stats   json;
  v_rpc_open  int;
  v_direct_open int;
BEGIN
  SELECT id INTO v_org FROM public.organisations LIMIT 1;
  SELECT id INTO v_user FROM public.users WHERE organisation_id = v_org LIMIT 1;
  IF v_user IS NULL THEN RAISE NOTICE 'SKIP: need one org with a user'; RETURN; END IF;

  -- The function must NOT accept an org argument (org comes from auth.uid() only).
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'get_dashboard_stats' AND pronargs > 0
  ) THEN
    RAISE NOTICE 'PASS 1: get_dashboard_stats takes no arguments';
  ELSE
    RAISE WARNING 'FAIL 1: an overload with arguments exists';
  END IF;

  -- Simulate the authenticated caller so auth.uid() resolves to v_user.
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub', v_user)::text, true);

  v_stats := get_dashboard_stats();
  v_rpc_open := (v_stats->>'totalOpenWOs')::int;

  SELECT COUNT(*) INTO v_direct_open
    FROM public.work_orders
   WHERE organisation_id = v_org
     AND status NOT IN ('completed', 'closed');

  IF v_rpc_open = v_direct_open THEN
    RAISE NOTICE 'PASS 2: RPC open-WO count (%) matches direct aggregation for the org', v_rpc_open;
  ELSE
    RAISE WARNING 'FAIL 2: RPC=% direct=%', v_rpc_open, v_direct_open;
  END IF;
END $$;
