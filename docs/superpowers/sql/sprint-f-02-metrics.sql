-- Sprint F Phase 2: Metrics support functions
--
-- get_dau_mau() — Returns daily and monthly active user counts across all tenant
-- (non-platform-admin) users. Defined SECURITY DEFINER because auth.users is
-- not readable via PostgREST and not exposed to the anon/service_role JWT
-- contexts without elevated privileges. The function is called via
-- supabase.rpc('get_dau_mau') from the platform metrics API route, which
-- already gates access on platform_admins membership.
--
-- DAU: distinct tenant users with auth.users.last_sign_in_at within the last 24h
-- MAU: distinct tenant users with auth.users.last_sign_in_at within the last 30d

CREATE OR REPLACE FUNCTION get_dau_mau() RETURNS TABLE(dau INT, mau INT) AS $$
  SELECT
    (SELECT COUNT(DISTINCT au.id) FROM auth.users au JOIN users u ON u.id = au.id
      WHERE au.last_sign_in_at > now() - INTERVAL '1 day')::INT,
    (SELECT COUNT(DISTINCT au.id) FROM auth.users au JOIN users u ON u.id = au.id
      WHERE au.last_sign_in_at > now() - INTERVAL '30 days')::INT
$$ LANGUAGE sql SECURITY DEFINER;
