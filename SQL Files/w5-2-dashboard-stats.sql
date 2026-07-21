-- W5 / DV-20 — Dashboard aggregation performance.
-- Idempotent. Run in the Supabase SQL editor.
--
-- Problem: DashboardOverviewPage pulled every work_orders + pm_schedules row for
-- the caller's org (select id,status,priority,due_at / id,is_active,next_due_at,
-- last_completed_at) and aggregated client-side — O(n) rows over the wire, slow at
-- real data sizes.
--
-- Fix: one SECURITY INVOKER function that returns all dashboard aggregates as a
-- single json object, scoped to the CALLER's org via auth.uid(). It takes NO org
-- argument — the org is derived from the JWT, never trusted from the client.
-- INVOKER (not DEFINER) is deliberate and load-bearing: the aggregates run with the
-- caller's RLS predicates ANDed in, so intra-org narrowing policies still apply —
-- a limited-technician (1c-13) or site-scoped (t9-01) user counts only the WOs RLS
-- lets them SELECT, exactly as the old client-side select() did. A DEFINER context
-- would bypass those policies and leak org-wide counts to scoped users. auth.uid()
-- reads the JWT GUC and works under INVOKER; the users self/org RLS still lets the
-- caller read their own organisation_id. search_path is pinned (injection hardening)
-- and EXECUTE is granted only to authenticated (needs auth.uid(); anon can't call).
--
-- Aggregates mirror the former client-side logic exactly:
--   totalOpenWOs        — WOs with status NOT IN ('completed','closed')
--   overdueWOs          — open WOs with due_at in the past
--   pmDueToday          — active PM schedules due by end of today
--   pmCompliancePercent — % of active PMs with a last_completed_at, 1 decimal
--   openByStatus        — {status: count} over open WOs
-- (totalOpenForStatus in the UI == totalOpenWOs; the web code reuses that field.)
--
-- Acceptance (owner): supabase.rpc('get_dashboard_stats') from a tenant user returns
-- their org's numbers; the dashboard renders identical KPI values to before.

CREATE OR REPLACE FUNCTION get_dashboard_stats() RETURNS json
LANGUAGE sql SECURITY INVOKER SET search_path = public, pg_temp AS $$
  WITH org AS (
    SELECT organisation_id AS id FROM users WHERE id = auth.uid()
  ),
  wo AS (
    SELECT status, due_at
    FROM work_orders
    WHERE organisation_id = (SELECT id FROM org)
      AND status NOT IN ('completed', 'closed')
  ),
  pm AS (
    SELECT is_active, next_due_at, last_completed_at
    FROM pm_schedules
    WHERE organisation_id = (SELECT id FROM org)
  )
  SELECT json_build_object(
    'totalOpenWOs', (SELECT COUNT(*) FROM wo),
    'overdueWOs',   (SELECT COUNT(*) FROM wo WHERE due_at IS NOT NULL AND due_at < now()),
    -- ponytail: end-of-today in the DB timezone (UTC on Supabase); matches the
    -- former client's local 23:59:59 cutoff to the day. Add an org-timezone column
    -- and use it here if per-tenant day boundaries ever matter.
    'pmDueToday', (
      SELECT COUNT(*) FROM pm
      WHERE is_active AND next_due_at IS NOT NULL
        AND next_due_at <= date_trunc('day', now()) + interval '1 day' - interval '1 second'
    ),
    'pmCompliancePercent', (
      SELECT CASE WHEN COUNT(*) FILTER (WHERE is_active) > 0
        THEN round(
               COUNT(*) FILTER (WHERE is_active AND last_completed_at IS NOT NULL)::numeric
               * 1000 / COUNT(*) FILTER (WHERE is_active)
             ) / 10
        ELSE 0 END
      FROM pm
    ),
    'openByStatus', COALESCE(
      (SELECT jsonb_object_agg(status, cnt)
         FROM (SELECT status, COUNT(*) AS cnt FROM wo GROUP BY status) s),
      '{}'::jsonb
    )
  )
$$;

REVOKE ALL ON FUNCTION get_dashboard_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_dashboard_stats() TO authenticated;
