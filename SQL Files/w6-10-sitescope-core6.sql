-- W6-10 / AL-16 — Extend per-user site scoping to the "Core 6" tables.
-- Idempotent, owner-run. Run in the Supabase SQL editor. ADDITIVE ONLY.
--
-- WHAT THIS DOES
--   For each of six tables that carry their own site_id column —
--     requests, pm_schedules, inspection_schedules, incidents,
--     compliance_certificates, purchase_orders —
--   it adds ONE standalone RESTRICTIVE SELECT policy that reuses the already-
--   shipped public.user_can_access_site() helper (from t9-01-site-scope.sql):
--
--       site_id IS NULL OR public.user_can_access_site(site_id)
--
--   No existing policy is edited, dropped, or rewritten. The org-isolation
--   PERMISSIVE policies on these tables keep doing cross-org isolation exactly
--   as before; this RESTRICTIVE policy is ANDed on top by Postgres, so a row is
--   visible only if BOTH the existing org policy AND this site check pass.
--
-- BACKWARD-COMPATIBLE DEFAULT (verified against the helper in t9-01):
--   user_can_access_site() returns TRUE for every site when the caller has NO
--   valid scope rows. So a user with zero user_site_scope rows stays UNRESTRICTED
--   (this RESTRICTIVE policy passes for every row), and a NULL-site row is visible
--   to everyone. Only users who HAVE scope rows get tightened to their own sites.
--   Shipping this locks nobody out.
--
-- WRITES ARE UNTOUCHED: FOR SELECT only, no WITH CHECK. INSERT/UPDATE/DELETE are
--   governed solely by the pre-existing policies.
--
-- SAFETY GUARDS
--   (a) Each table is wrapped in a DO block that verifies the table AND its own
--       site_id column exist via information_schema.columns; if either is absent
--       it RAISEs NOTICE and SKIPs — so the migration is safe even if a table
--       name or column differs in a given environment.
--   (b) DROP POLICY IF EXISTS before CREATE, so it is safe to run twice.
--
-- Depends on: t9-01-site-scope.sql (defines public.user_can_access_site(uuid)).

DO $$
DECLARE
  v_tables text[] := ARRAY[
    'requests', 'pm_schedules', 'inspection_schedules',
    'incidents', 'compliance_certificates', 'purchase_orders'
  ];
  v_table  text;
  v_policy text;
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = v_table
        AND column_name  = 'site_id'
    ) THEN
      RAISE NOTICE 'W6-10: skipping %.% — table or site_id column absent',
        'public', v_table;
      CONTINUE;
    END IF;

    v_policy := v_table || '_sitescope_select';

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_policy, v_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated '
      || 'USING (site_id IS NULL OR public.user_can_access_site(site_id))',
      v_policy, v_table
    );

    RAISE NOTICE 'W6-10: added RESTRICTIVE site-scope SELECT policy % on public.%',
      v_policy, v_table;
  END LOOP;
END
$$;
