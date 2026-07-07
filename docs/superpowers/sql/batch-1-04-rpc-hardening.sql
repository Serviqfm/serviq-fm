-- Batch 1 / DV-04 (DB half) — Lock down the get_dau_mau / get_users_with_login
-- SECURITY DEFINER RPCs. Idempotent. Run in the Supabase SQL editor.
-- (The edge-function half of DV-04 is code: supabase/functions/send-push is deleted
--  and web/src/lib/push.ts is retargeted to the authenticated /api/push route.)
--
-- Problems (from sprint-f-02): both functions are SECURITY DEFINER with
--   (1) no `SET search_path` — the unqualified `users` reference resolves via the
--       caller-influenced search_path, a search_path-injection surface; and
--   (2) no EXECUTE grant, so the Postgres default (EXECUTE to PUBLIC) applies — any
--       anon/authenticated caller can invoke them over PostgREST. get_users_with_login
--       even takes an arbitrary org_id and, being DEFINER, bypasses RLS, so any signed-
--       in user could read ANY org's users + last-sign-in times.
--
-- Fix: pin search_path = public, REVOKE EXECUTE from PUBLIC, and GRANT EXECUTE only to
-- service_role — the sole caller (both platform routes invoke via the service-role
-- admin client after a platform_admins gate). Function bodies are unchanged from
-- sprint-f-02.
--
-- Acceptance (owner): a tenant user's supabase.rpc('get_users_with_login', {...})
-- fails with permission denied; the platform dashboard (DAU/MAU) and the tenant
-- detail Users tab still render.

CREATE OR REPLACE FUNCTION get_dau_mau() RETURNS TABLE(dau INT, mau INT)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (SELECT COUNT(DISTINCT au.id) FROM auth.users au JOIN users u ON u.id = au.id
      WHERE au.last_sign_in_at > now() - INTERVAL '1 day')::INT,
    (SELECT COUNT(DISTINCT au.id) FROM auth.users au JOIN users u ON u.id = au.id
      WHERE au.last_sign_in_at > now() - INTERVAL '30 days')::INT
$$;

REVOKE ALL ON FUNCTION get_dau_mau() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_dau_mau() TO service_role;

CREATE OR REPLACE FUNCTION get_users_with_login(org_id UUID) RETURNS TABLE(
  id UUID,
  full_name TEXT,
  email TEXT,
  role TEXT,
  is_active BOOLEAN,
  disabled BOOLEAN,
  last_sign_in_at TIMESTAMPTZ
) LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.full_name, u.email, u.role, u.is_active, u.disabled, au.last_sign_in_at
  FROM users u JOIN auth.users au ON au.id = u.id
  WHERE u.organisation_id = org_id
  ORDER BY u.full_name
$$;

REVOKE ALL ON FUNCTION get_users_with_login(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_users_with_login(UUID) TO service_role;
