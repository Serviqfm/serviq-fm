-- Batch 1 / DV-01 — Enable RLS on the 7 unprotected tables. Idempotent.
-- Run in the Supabase SQL editor. Safe to run twice.
--
-- Today none of these 7 tables have RLS, so an anon-key holder can read platform
-- financials, audit logs, and per-user notification data straight off PostgREST.
--
-- Per-table intent:
--   platform_audit_logs, mrr_snapshots, account_deletion_requests
--     -> platform / service-role only. Enable RLS with NO policy = deny all rows to
--        anon + authenticated. service_role bypasses RLS, so the platform routes
--        (service-role client) and the SECURITY DEFINER request_account_deletion()
--        function keep working.
--   tenant_feature_flags
--     -> read by the AUTHENTICATED browser client (lib/featureFlags.ts
--        useFeatureFlag). Needs an org-scoped SELECT policy, else every tenant's
--        flags read as false. Writes are service-role (platform routes) -> no
--        write policy needed.
--   user_notification_preferences
--     -> read + upsert by the AUTHENTICATED browser client (settings Notifications
--        tab). Self-scoped FOR ALL (user_id = auth.uid()). Server writes/deletes are
--        service-role and bypass RLS.
--   notification_log
--     -> read by the AUTHENTICATED browser client (settings Push Audit tab).
--        Self-scoped SELECT only; every write is service-role.
--   notification_types
--     -> global lookup (18 rows). Authenticated read-only.
--
-- Acceptance (owner, after running):
--   * anon-key select from each of the 7 tables returns 0 rows.
--   * an authenticated user sees only their org's tenant_feature_flags row and only
--     their own user_notification_preferences / notification_log rows.
--   * platform dashboard, settings Notifications tab, and Push Audit tab still load;
--     a mobile account-deletion request still succeeds (request_account_deletion RPC).

-- --- platform / service-role-only: deny all to anon + authenticated ---
-- (RLS on + zero policies = no rows for non-bypass roles. service_role bypasses RLS.)
ALTER TABLE public.platform_audit_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mrr_snapshots             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

-- --- tenant_feature_flags: authenticated members read their own org's row ---
ALTER TABLE public.tenant_feature_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "feature_flags_org_select" ON public.tenant_feature_flags;
CREATE POLICY "feature_flags_org_select" ON public.tenant_feature_flags
  FOR SELECT TO authenticated
  USING (organisation_id = (SELECT organisation_id FROM public.users WHERE id = auth.uid()));

-- --- user_notification_preferences: self-scoped read + upsert ---
ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_notif_prefs_self" ON public.user_notification_preferences;
CREATE POLICY "user_notif_prefs_self" ON public.user_notification_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- --- notification_log: self-scoped read only (all writes are service-role) ---
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notification_log_self_select" ON public.notification_log;
CREATE POLICY "notification_log_self_select" ON public.notification_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- --- notification_types: global lookup, authenticated read-only ---
ALTER TABLE public.notification_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notification_types_read" ON public.notification_types;
CREATE POLICY "notification_types_read" ON public.notification_types
  FOR SELECT TO authenticated
  USING (true);
