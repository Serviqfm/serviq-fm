-- W6-6 PDPL / data-protection posture.
-- Builds on account-deletion.sql (which created account_deletion_requests +
-- request_account_deletion()). Adds a processed marker so org admins can work
-- the queue, and closes the RLS hole: the table holds emails but was created
-- without RLS, leaving it readable by anon/authenticated via PostgREST.
--
-- Idempotent — safe to re-run.

-- 1. Processed marker (admin approves/erases -> stamps these).
alter table public.account_deletion_requests
  add column if not exists processed_at timestamptz;
alter table public.account_deletion_requests
  add column if not exists processed_by uuid;

-- 2. Deny-all to anon/authenticated; access is service-role only (the admin
-- API route holds the queue) and the request_account_deletion() SECURITY
-- DEFINER function still inserts fine (definer bypasses RLS). Enabling RLS with
-- no policy = deny all for non-service-role roles; service_role bypasses RLS.
alter table public.account_deletion_requests enable row level security;
-- ponytail: RLS-enabled + zero policies already denies anon/authenticated.
-- Reads/writes go through the service-role admin route, never the client key.
