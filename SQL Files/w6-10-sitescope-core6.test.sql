-- Verification harness for w6-10-sitescope-core6.sql. Run AFTER both t9-01 and
-- this migration. Mutates NOTHING: everything runs inside BEGIN ... ROLLBACK.
--
-- Unlike the t9 test (which asserts the predicate), this drives the RESTRICTIVE
-- SELECT policy end-to-end through actual RLS-filtered SELECTs on `incidents`
-- (one of the Core 6), under the 'authenticated' role, proving:
--   * an UNSCOPED user sees every row (backward-compatible default), and
--   * a SCOPED user sees only their site's rows plus NULL-site rows.
--
-- Read the NOTICEs: every line should say PASS.

BEGIN;
DO $$
DECLARE
  v_org uuid;
  v_site1 uuid; v_site2 uuid;
  v_unscoped uuid; v_scoped uuid;
  v_seen int;
BEGIN
  -- --- isolated fixtures (owner role bypasses RLS on insert) ---------------
  INSERT INTO public.organisations (id, name) VALUES (gen_random_uuid(), 'W6-10 Org')
    RETURNING id INTO v_org;
  INSERT INTO public.sites (id, organisation_id, name) VALUES (gen_random_uuid(), v_org, 'W6-10 S1')
    RETURNING id INTO v_site1;
  INSERT INTO public.sites (id, organisation_id, name) VALUES (gen_random_uuid(), v_org, 'W6-10 S2')
    RETURNING id INTO v_site2;

  INSERT INTO public.users (id, organisation_id, role, full_name)
    VALUES (gen_random_uuid(), v_org, 'technician', 'W6-10 Unscoped')
    RETURNING id INTO v_unscoped;
  INSERT INTO public.users (id, organisation_id, role, full_name)
    VALUES (gen_random_uuid(), v_org, 'technician', 'W6-10 Scoped')
    RETURNING id INTO v_scoped;

  -- scope the scoped user to site1 only
  INSERT INTO public.user_site_scope (user_id, site_id, organisation_id)
    VALUES (v_scoped, v_site1, v_org);

  -- three incidents: site1, site2, and a NULL-site one
  INSERT INTO public.incidents (organisation_id, title, site_id) VALUES
    (v_org, 'inc-s1',   v_site1),
    (v_org, 'inc-s2',   v_site2),
    (v_org, 'inc-null', NULL);

  -- --- (a) UNSCOPED user sees all 3 rows ----------------------------------
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub', v_unscoped)::text, true);
  SET LOCAL role authenticated;
  SELECT count(*) INTO v_seen FROM public.incidents WHERE organisation_id = v_org;
  RESET role;
  IF v_seen = 3 THEN
    RAISE NOTICE 'PASS a: unscoped user sees all % incident rows', v_seen;
  ELSE
    RAISE WARNING 'FAIL a: unscoped user saw % rows (expected 3)', v_seen;
  END IF;

  -- --- (b) SCOPED user sees only site1 + NULL-site (2 rows), not site2 -----
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub', v_scoped)::text, true);
  SET LOCAL role authenticated;
  SELECT count(*) INTO v_seen FROM public.incidents WHERE organisation_id = v_org;
  RESET role;
  IF v_seen = 2 THEN
    RAISE NOTICE 'PASS b: scoped user sees only % rows (site1 + NULL-site)', v_seen;
  ELSE
    RAISE WARNING 'FAIL b: scoped user saw % rows (expected 2)', v_seen;
  END IF;

  -- --- (c) scoped user cannot see the site2 row specifically --------------
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub', v_scoped)::text, true);
  SET LOCAL role authenticated;
  SELECT count(*) INTO v_seen FROM public.incidents WHERE site_id = v_site2;
  RESET role;
  IF v_seen = 0 THEN
    RAISE NOTICE 'PASS c: scoped user cannot see out-of-scope site2 incident';
  ELSE
    RAISE WARNING 'FAIL c: scoped user saw % out-of-scope rows', v_seen;
  END IF;
END $$;
ROLLBACK;
