-- Verification harness for t9-01-site-scope.sql. Run AFTER the migration.
-- Mutates NOTHING: everything runs inside BEGIN ... ROLLBACK.
--
-- It builds two isolated orgs (A, B) with two sites each and three users, then
-- proves the site-scope predicate directly. Because RLS SELECT filtering needs
-- the 'authenticated' role active, we assert against user_can_access_site()
-- (the load-bearing predicate the work_orders/assets policies AND in) and
-- against the org RLS on user_site_scope itself.
--
-- Read the NOTICEs: every line should say PASS.

BEGIN;
DO $$
DECLARE
  v_orgA uuid; v_orgB uuid;
  v_siteA1 uuid; v_siteA2 uuid; v_siteB1 uuid;
  v_unscoped uuid;  -- org A user, no scope rows
  v_scoped uuid;    -- org A user, scoped to siteA1 only
  v_ok boolean;
BEGIN
  -- --- isolated fixtures ------------------------------------------------
  INSERT INTO public.organisations (id, name) VALUES (gen_random_uuid(), 'T9 Org A')
    RETURNING id INTO v_orgA;
  INSERT INTO public.organisations (id, name) VALUES (gen_random_uuid(), 'T9 Org B')
    RETURNING id INTO v_orgB;

  INSERT INTO public.sites (id, organisation_id, name) VALUES (gen_random_uuid(), v_orgA, 'A-Site-1')
    RETURNING id INTO v_siteA1;
  INSERT INTO public.sites (id, organisation_id, name) VALUES (gen_random_uuid(), v_orgA, 'A-Site-2')
    RETURNING id INTO v_siteA2;
  INSERT INTO public.sites (id, organisation_id, name) VALUES (gen_random_uuid(), v_orgB, 'B-Site-1')
    RETURNING id INTO v_siteB1;

  INSERT INTO public.users (id, organisation_id, role, full_name)
    VALUES (gen_random_uuid(), v_orgA, 'technician', 'T9 Unscoped')
    RETURNING id INTO v_unscoped;
  INSERT INTO public.users (id, organisation_id, role, full_name)
    VALUES (gen_random_uuid(), v_orgA, 'technician', 'T9 Scoped')
    RETURNING id INTO v_scoped;

  -- Scope the scoped user to A-Site-1 only.
  INSERT INTO public.user_site_scope (user_id, site_id, organisation_id)
    VALUES (v_scoped, v_siteA1, v_orgA);

  -- --- (a) UNSCOPED user sees every site (backward-compatible default) ---
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub', v_unscoped)::text, true);

  IF public.user_can_access_site(v_siteA1)
     AND public.user_can_access_site(v_siteA2)
     AND public.user_can_access_site(v_siteB1)
     AND public.user_can_access_site(NULL) THEN
    RAISE NOTICE 'PASS a: unscoped user can access all sites incl. NULL-site rows';
  ELSE
    RAISE WARNING 'FAIL a: unscoped user was restricted';
  END IF;

  -- --- (b) SCOPED user sees only their site; NULL-site rows still visible ---
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub', v_scoped)::text, true);

  IF public.user_can_access_site(v_siteA1)
     AND NOT public.user_can_access_site(v_siteA2)
     AND public.user_can_access_site(NULL) THEN
    RAISE NOTICE 'PASS b: scoped user sees only granted site (+ NULL-site rows)';
  ELSE
    RAISE WARNING 'FAIL b: scoped-site visibility wrong (A1=% A2=% NULL=%)',
      public.user_can_access_site(v_siteA1),
      public.user_can_access_site(v_siteA2),
      public.user_can_access_site(NULL);
  END IF;

  -- --- (c) NO cross-tenant leak: scoped org-A user cannot access org-B site ---
  IF NOT public.user_can_access_site(v_siteB1) THEN
    RAISE NOTICE 'PASS c: scoped user cannot access another org''s site';
  ELSE
    RAISE WARNING 'FAIL c: cross-tenant site leak';
  END IF;

  -- --- (d) scoped user cannot GRANT themselves a site they lack via the
  --         org RLS WITH CHECK path. We test the user_site_scope INSERT policy
  --         under the authenticated role: an org-A user inserting an org-B row
  --         must be rejected by WITH CHECK (organisation mismatch), and an
  --         insert claiming org A for an org-B site is a foreign-org grant that
  --         the policy still blocks because organisation_id must be the caller's.
  --  (Row-level enforcement of the scope itself is by user_can_access_site;
  --   this proves the join table cannot be used to escalate across orgs.)
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub', v_scoped)::text, true);
  SET LOCAL role authenticated;

  BEGIN
    INSERT INTO public.user_site_scope (user_id, site_id, organisation_id)
      VALUES (v_scoped, v_siteB1, v_orgB);
    RESET role;
    RAISE WARNING 'FAIL d: scoped user inserted a cross-org scope row';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    RESET role;
    RAISE NOTICE 'PASS d: cross-org scope insert blocked by org RLS WITH CHECK';
  END;

  -- --- (e) A non-admin cannot self-grant scope even to a VALID same-org site
  --         (scope assignment is admin/manager-only per the tightened WITH CHECK) ---
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub', v_scoped)::text, true);
  SET LOCAL role authenticated;
  BEGIN
    INSERT INTO public.user_site_scope (user_id, site_id, organisation_id)
      VALUES (v_scoped, v_siteA2, v_orgA);
    RESET role;
    RAISE WARNING 'FAIL e: technician self-granted a scope row';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    RESET role;
    RAISE NOTICE 'PASS e: non-admin scope self-grant blocked (admin/manager only)';
  END;

  RESET role;
END $$;
ROLLBACK;
