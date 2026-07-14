-- T9 / 1C-14 + MKT-11 — Per-user site scoping (location-based permissions).
-- Idempotent, owner-run. Run in the Supabase SQL editor before deploying.
-- The app tolerates its absence: the user-edit site-scope UI degrades gracefully
-- (an empty/absent user_site_scope table means everyone stays unscoped), and the
-- policy rewrites below only tighten visibility for users who HAVE scope rows.
--
-- WHAT THIS DOES
--   1. user_site_scope (user_id, site_id, organisation_id) join table + 4-policy
--      org RLS (the repo's standard pattern, WITH CHECK on INSERT and UPDATE).
--   2. user_can_access_site(p_site_id) SECURITY DEFINER helper, search_path pinned.
--      BACKWARD-COMPATIBLE DEFAULT: a caller with ZERO scope rows is UNRESTRICTED
--      (returns TRUE for every site) — nobody gets locked out by merely shipping
--      this. A caller WITH scope rows is restricted to those sites.
--   3. Extends the EXISTING org-isolation SELECT/UPDATE/ALL policies on
--      work_orders and assets to ALSO require the site check, by ANDing
--      `(site_id IS NULL OR public.user_can_access_site(site_id))` into each
--      policy's existing USING expression. The exact org expression and any
--      WITH CHECK are preserved verbatim (read straight from pg_policies), so
--      org isolation is NOT weakened and the CORE-20 triggers are untouched
--      (RLS filters visible rows; the triggers still enforce transitions).
--
-- WOs/assets with a NULL site_id stay visible to everyone in the org (per the
-- 1C-14 spec: "WOs with no site stay visible to all").
--
-- SAFE TO RUN TWICE: the join table/policies use CREATE ... IF NOT EXISTS /
-- DROP ... IF EXISTS, and the policy-rewrite step is a no-op once the site check
-- is already present in a policy's expression.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. user_site_scope join table + org RLS (4-policy pattern)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_site_scope (
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  site_id         UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, site_id)
);

CREATE INDEX IF NOT EXISTS idx_user_site_scope_user ON public.user_site_scope(user_id);
CREATE INDEX IF NOT EXISTS idx_user_site_scope_site ON public.user_site_scope(site_id);

ALTER TABLE public.user_site_scope ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_site_scope_org_select ON public.user_site_scope;
CREATE POLICY user_site_scope_org_select ON public.user_site_scope
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS user_site_scope_org_insert ON public.user_site_scope;
CREATE POLICY user_site_scope_org_insert ON public.user_site_scope
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS user_site_scope_org_update ON public.user_site_scope;
CREATE POLICY user_site_scope_org_update ON public.user_site_scope
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  ) WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS user_site_scope_org_delete ON public.user_site_scope;
CREATE POLICY user_site_scope_org_delete ON public.user_site_scope
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 2. user_can_access_site() — SECURITY DEFINER, search_path pinned.
--    Unscoped caller (no rows) -> TRUE for all sites (backward-compatible).
--    Scoped caller -> TRUE only for their own sites.
--    NULL site -> TRUE (unsited rows are visible to everyone, per spec).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_can_access_site(p_site_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    p_site_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.user_site_scope WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.user_site_scope
      WHERE user_id = auth.uid() AND site_id = p_site_id
    );
$$;

REVOKE ALL ON FUNCTION public.user_can_access_site(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_access_site(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Extend existing org-isolation policies on work_orders + assets to ALSO
--    require the site check. We read each policy's existing USING (qual) and
--    WITH CHECK straight from pg_policies and rebuild it, ANDing the site guard
--    into USING only. This preserves the exact org expression (never guessed)
--    and never touches WITH CHECK — org isolation is not weakened.
--
--    Scope: FOR SELECT / UPDATE / ALL policies (those with a USING qual) that
--    do NOT already mention user_can_access_site. INSERT-only policies have no
--    USING clause and are skipped (a NULL-site or scoped-site insert is fine;
--    cross-site writes are blocked by the SELECT/UPDATE guard + org WITH CHECK).
-- ---------------------------------------------------------------------------
DO $rewrite$
DECLARE
  r          record;
  v_site_expr text := '(site_id IS NULL OR public.user_can_access_site(site_id))';
  v_cmd      text;
  v_using    text;
  v_check    text;
  v_roles    text;
BEGIN
  FOR r IN
    SELECT p.schemaname, p.tablename, p.policyname, p.permissive, p.roles,
           p.cmd, p.qual, p.with_check
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename IN ('work_orders', 'assets')
      AND p.qual IS NOT NULL                       -- has a USING clause to extend
      AND p.qual NOT LIKE '%user_can_access_site%' -- not already extended
  LOOP
    -- Map pg_policies.cmd ('SELECT'/'UPDATE'/'ALL'/...) to a FOR clause.
    v_cmd := CASE r.cmd
      WHEN 'SELECT' THEN 'SELECT'
      WHEN 'UPDATE' THEN 'UPDATE'
      WHEN 'DELETE' THEN 'DELETE'
      WHEN 'ALL'    THEN 'ALL'
      ELSE NULL   -- INSERT (no USING) or unknown: skip
    END;
    CONTINUE WHEN v_cmd IS NULL;

    v_using := '(' || r.qual || ') AND ' || v_site_expr;
    v_roles := array_to_string(r.roles, ', ');

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
                   r.policyname, r.schemaname, r.tablename);

    v_check := CASE WHEN r.with_check IS NOT NULL
                    THEN ' WITH CHECK (' || r.with_check || ')' ELSE '' END;

    EXECUTE format(
      'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s USING (%s)%s',
      r.policyname, r.schemaname, r.tablename,
      CASE WHEN r.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
      v_cmd, v_roles, v_using, v_check
    );

    RAISE NOTICE 'T9: extended policy % on %.% with site check',
      r.policyname, r.schemaname, r.tablename;
  END LOOP;
END
$rewrite$;
