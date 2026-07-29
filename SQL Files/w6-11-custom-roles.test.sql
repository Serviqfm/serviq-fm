-- Verification harness for w6-11-custom-roles.sql — OPTIONAL, safe.
-- Run AFTER the migration. Mutates NOTHING: wrapped in BEGIN ... ROLLBACK.
-- Read the NOTICEs: every non-SKIP line should say PASS.
--
-- Proves:
--   1. an ADMIN of org A can INSERT a custom role into org A.
--   2. the same admin CANNOT move that row into org B (UPDATE WITH CHECK).
--   3. a NON-admin member of org A CANNOT INSERT a custom role (admin-only gate).
--   4. a base_role outside the 4 base values is rejected by the CHECK.
--   5. a user CANNOT set their OWN users.custom_role_id from the authenticated
--      path (privilege lock) — assignment is service_role-only.
--   6. users.custom_role_id cannot point at ANOTHER org's custom role (composite FK).
--
-- Needs two orgs; org A must have an admin and one non-admin member.

BEGIN;
DO $$
DECLARE
  v_org_a   uuid;
  v_org_b   uuid;
  v_admin_a uuid;
  v_other_a uuid;
  v_role_a  uuid;
  v_role_b  uuid;
  v_ok      boolean;
BEGIN
  SELECT id INTO v_org_a FROM public.organisations ORDER BY created_at LIMIT 1;
  SELECT id INTO v_org_b FROM public.organisations WHERE id <> v_org_a LIMIT 1;
  SELECT id INTO v_admin_a FROM public.users
    WHERE organisation_id = v_org_a AND role = 'admin' LIMIT 1;
  SELECT id INTO v_other_a FROM public.users
    WHERE organisation_id = v_org_a AND role <> 'admin' LIMIT 1;

  IF v_org_a IS NULL OR v_org_b IS NULL OR v_admin_a IS NULL THEN
    RAISE NOTICE 'SKIP: need two orgs and an admin in the first org';
    RETURN;
  END IF;

  -- A custom role in org B, created as the table owner (bypasses RLS) so step 6
  -- has a genuine cross-org target.
  INSERT INTO public.custom_roles (organisation_id, name, base_role, permissions)
  VALUES (v_org_b, 'W6-11 probe org B', 'admin', '{"can_manage_users": false}'::jsonb)
  RETURNING id INTO v_role_b;

  -- Session as an ADMIN of org A.
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub', v_admin_a)::text, true);
  PERFORM set_config('role', 'authenticated', true);

  -- 1) INSERT into own org succeeds.
  INSERT INTO public.custom_roles (organisation_id, name, base_role, permissions)
  VALUES (v_org_a, 'W6-11 probe', 'manager', '{"can_view_financials": false}'::jsonb)
  RETURNING id INTO v_role_a;
  RAISE NOTICE 'PASS 1: admin inserted a custom role into own org';

  -- 2) Moving the row into org B is blocked by the UPDATE WITH CHECK.
  BEGIN
    UPDATE public.custom_roles SET organisation_id = v_org_b WHERE id = v_role_a;
    RAISE NOTICE 'FAIL 2: admin moved a custom role into another org';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    RAISE NOTICE 'PASS 2: cross-org UPDATE denied';
  END;

  -- 3) A non-admin member cannot INSERT.
  IF v_other_a IS NULL THEN
    RAISE NOTICE 'SKIP 3: no non-admin member in org A';
  ELSE
    PERFORM set_config('request.jwt.claims',
      json_build_object('role','authenticated','sub', v_other_a)::text, true);
    BEGIN
      INSERT INTO public.custom_roles (organisation_id, name, base_role)
      VALUES (v_org_a, 'W6-11 probe non-admin', 'technician');
      RAISE NOTICE 'FAIL 3: a non-admin inserted a custom role';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS 3: non-admin INSERT denied';
    END;

    -- 5) A user cannot self-assign a custom role (privilege lock).
    BEGIN
      UPDATE public.users SET custom_role_id = v_role_a WHERE id = v_other_a;
      RAISE NOTICE 'FAIL 5: a user self-assigned a custom role';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS 5: self-assignment of custom_role_id denied';
    END;
  END IF;

  -- Back to the owner session for the constraint-level checks.
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('role', 'postgres', true);

  -- 4) base_role CHECK.
  BEGIN
    INSERT INTO public.custom_roles (organisation_id, name, base_role)
    VALUES (v_org_a, 'W6-11 probe bad base', 'superuser');
    RAISE NOTICE 'FAIL 4: an invalid base_role was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS 4: invalid base_role rejected by CHECK';
  END;

  -- 6) Composite FK blocks pointing a user at another org's custom role.
  BEGIN
    UPDATE public.users SET custom_role_id = v_role_b WHERE id = v_admin_a;
    RAISE NOTICE 'FAIL 6: a user was assigned another org''s custom role';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'PASS 6: cross-org custom_role_id rejected by the composite FK';
  END;

  -- Same-org assignment via service_role/owner still works.
  UPDATE public.users SET custom_role_id = v_role_a WHERE id = v_admin_a;
  SELECT custom_role_id = v_role_a INTO v_ok FROM public.users WHERE id = v_admin_a;
  IF v_ok THEN
    RAISE NOTICE 'PASS 7: same-org assignment succeeds on the server-side path';
  ELSE
    RAISE NOTICE 'FAIL 7: same-org assignment did not stick';
  END IF;
END $$;
ROLLBACK;
