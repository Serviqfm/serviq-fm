-- DV-16 (Track B2-B) — error_logs: central capture of unexpected server errors.
-- Idempotent. Run in the Supabase SQL editor. Safe to run twice.
--
-- Written by lib/errorLog.captureError() (service-role client) from the cron
-- routes and any other server path that catches an unexpected error. Read only
-- by the platform (service-role) — there is no per-tenant read path, so this is
-- a platform / service-role-only table exactly like batch-1's
-- platform_audit_logs / mrr_snapshots: RLS ON with NO authenticated policy =
-- deny all rows to anon + authenticated. service_role bypasses RLS, so inserts
-- from the service-role client keep working.
--
-- org_id is nullable: a cron failure is not always tied to a single org.
--
-- Acceptance (owner, after running):
--   * anon-key / authenticated select from error_logs returns 0 rows.
--   * the pm-generate / escalations crons, on a thrown error, write a row here
--     (visible to the service-role client / platform).

CREATE TABLE IF NOT EXISTS public.error_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID REFERENCES public.organisations(id) ON DELETE SET NULL,
  route       TEXT,
  message     TEXT NOT NULL,
  stack       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Newest-first scans for the platform.
CREATE INDEX IF NOT EXISTS error_logs_created_at_idx ON public.error_logs (created_at DESC);

-- Platform / service-role-only: RLS ON + zero policies = no rows for anon or
-- authenticated. service_role bypasses RLS. (Matches batch-1 platform tables.)
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;
