-- Verification harness for b8-asset-downtime.sql — OPTIONAL, safe.
-- Run AFTER the migration. Mutates NOTHING: wrapped in BEGIN ... ROLLBACK.
-- Read the NOTICEs: every non-SKIP line should say PASS.
--
-- Proves:
--   1. an org-A member can INSERT a downtime row for an org-A asset.
--   2. the same member CANNOT move that row into org B (UPDATE WITH CHECK).
--   3. the same member CANNOT INSERT a row claiming org B (INSERT WITH CHECK).
--   4. the same member CANNOT reference an org-B asset (FK-to-org bind).
--   5. ended_at earlier than started_at is rejected by the range CHECK.
--   6. closing the row (Mark Restored) via UPDATE ended_at succeeds.
--   7. a technician CANNOT DELETE (admin/manager gate).
--
-- Needs two orgs, each with at least one asset; org A needs any member,
-- plus a technician for step 7.

BEGIN;
DO $$
DECLARE
  v_org_a    uuid;
  v_org_b    uuid;
  v_member_a uuid;
  v_tech_a   uuid;
  v_asset_a  uuid;
  v_asset_b  uuid;
  v_dt       uuid;
  v_ok       boolean;
BEGIN
  SELECT id INTO v_org_a FROM public.organisations ORDER BY created_at LIMIT 1;
  SELECT id INTO v_org_b FROM public.organisations WHERE id <> v_org_a LIMIT 1;
  SELECT id INTO v_member_a FROM public.users WHERE organisation_id = v_org_a LIMIT 1;
  SELECT id INTO v_tech_a FROM public.users
    WHERE organisation_id = v_org_a AND role NOT IN ('admin','manager') LIMIT 1;
  SELECT id INTO v_asset_a FROM public.assets WHERE organisation_id = v_org_a LIMIT 1;
  SELECT id INTO v_asset_b FROM public.assets WHERE organisation_id = v_org_b LIMIT 1;

  IF v_org_a IS NULL OR v_org_b IS NULL OR v_member_a IS NULL OR v_asset_a IS NULL THEN
    RAISE NOTICE 'SKIP: need two orgs, a member and an asset in the first org';
    RETURN;
  END IF;

  -- Session as a member of org A.
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub', v_member_a)::text, true);
  PERFORM set_config('role', 'authenticated', true);

  -- 1) INSERT for own org + own-org asset succeeds.
  INSERT INTO public.asset_downtime (organisation_id, asset_id, cause, created_by)
  VALUES (v_org_a, v_asset_a, 'Harness: compressor trip', v_member_a)
  RETURNING id INTO v_dt;
  RAISE NOTICE 'PASS 1: member opened a downtime row for an own-org asset';

  -- 2) UPDATE that moves the row into org B must be rejected by WITH CHECK.
  v_ok := true;
  BEGIN
    UPDATE public.asset_downtime SET organisation_id = v_org_b WHERE id = v_dt;
    v_ok := false;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF v_ok THEN RAISE NOTICE 'PASS 2: UPDATE org-swap into org B rejected';
  ELSE RAISE WARNING 'FAIL 2: UPDATE moved a downtime row into another org'; END IF;

  -- 3) INSERT claiming org B must be rejected by INSERT WITH CHECK.
  v_ok := true;
  BEGIN
    INSERT INTO public.asset_downtime (organisation_id, asset_id)
    VALUES (v_org_b, COALESCE(v_asset_b, v_asset_a));
    v_ok := false;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF v_ok THEN RAISE NOTICE 'PASS 3: INSERT for foreign org rejected';
  ELSE RAISE WARNING 'FAIL 3: INSERT created a downtime row for another org'; END IF;

  -- 4) INSERT for own org but an org-B asset must be rejected (FK-to-org bind).
  IF v_asset_b IS NULL THEN
    RAISE NOTICE 'SKIP 4: no asset in org B to test the FK-to-org bind';
  ELSE
    v_ok := true;
    BEGIN
      INSERT INTO public.asset_downtime (organisation_id, asset_id)
      VALUES (v_org_a, v_asset_b);
      v_ok := false;
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    IF v_ok THEN RAISE NOTICE 'PASS 4: cross-org asset_id rejected';
    ELSE RAISE WARNING 'FAIL 4: downtime row references an org-B asset'; END IF;
  END IF;

  -- 5) ended_at earlier than started_at is rejected by the range CHECK.
  v_ok := true;
  BEGIN
    UPDATE public.asset_downtime SET ended_at = started_at - interval '1 hour' WHERE id = v_dt;
    v_ok := false;
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF v_ok THEN RAISE NOTICE 'PASS 5: ended_at before started_at rejected by CHECK';
  ELSE RAISE WARNING 'FAIL 5: negative-duration downtime accepted'; END IF;

  -- 6) Closing the period (Mark Restored) succeeds.
  UPDATE public.asset_downtime SET ended_at = now() WHERE id = v_dt AND ended_at IS NULL;
  IF FOUND THEN RAISE NOTICE 'PASS 6: member closed the open downtime row';
  ELSE RAISE WARNING 'FAIL 6: member could not close the downtime row'; END IF;

  -- 7) A technician cannot DELETE (admin/manager gate).
  IF v_tech_a IS NULL THEN
    RAISE NOTICE 'SKIP 7: no technician in org A to test the delete gate';
  ELSE
    PERFORM set_config('request.jwt.claims',
      json_build_object('role','authenticated','sub', v_tech_a)::text, true);
    DELETE FROM public.asset_downtime WHERE id = v_dt;
    IF FOUND THEN RAISE WARNING 'FAIL 7: technician deleted a downtime row';
    ELSE RAISE NOTICE 'PASS 7: technician DELETE silently filtered by role gate'; END IF;
  END IF;
END $$;
ROLLBACK;
