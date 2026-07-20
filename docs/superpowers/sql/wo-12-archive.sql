-- WO-12: archive work orders.
-- Adds a nullable archived_at timestamp; archived WOs are excluded from the
-- default list/calendar/board fetches (the app filters .is('archived_at', null)).
-- Idempotent — safe to re-run. Run in the Supabase SQL editor before deploy.

alter table public.work_orders add column if not exists archived_at timestamptz;
