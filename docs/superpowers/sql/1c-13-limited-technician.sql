-- 1C-13 — "Limited Technician": org-level assigned-only technician visibility.
-- Idempotent, owner-run. Run in the Supabase SQL editor before flipping the toggle;
-- the app tolerates its absence (the flag reads as unset -> off, and the settings
-- page surfaces the save error).
--
-- WHAT THIS DOES
--   1. organisations.limit_technician_visibility BOOLEAN DEFAULT false — the
--      org-level toggle, edited from /dashboard/settings/access (admin-gated
--      API route; writes go through the service role, never client RLS).
--   2. ONE new AS RESTRICTIVE policy on work_orders FOR SELECT TO authenticated.
--      RESTRICTIVE policies AND with the existing PERMISSIVE org-isolation
--      policy, so this only ever NARROWS visibility — no existing policy is
--      touched, rewritten, or weakened, and cross-org isolation is unchanged.
--
-- SEMANTICS (matches the app-side CORE-21 scoping already unconditional on
-- web list/calendar/board and mobile — this makes it DURABLE at the DB layer
-- for direct PostgREST access):
--   * flag OFF (default) ......... policy passes every row: ZERO behavior change.
--   * caller not a technician .... unaffected (managers/admins/requesters see
--                                  whatever the permissive org policy allows).
--   * flag ON + technician ....... sees only WOs where they are the assignee,
--                                  an additional worker, or the creator.
--
-- The role/flag lookup runs under the caller's own RLS (users self-select and
-- organisations own-org select are app-wide invariants). If either row were
-- somehow invisible the predicate fails OPEN (flag treated as off) — i.e. it
-- degrades to today's behavior, never to a lockout.
--
-- SAFE TO RUN TWICE: ADD COLUMN IF NOT EXISTS + DROP POLICY IF EXISTS.

ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS limit_technician_visibility BOOLEAN DEFAULT false;

DROP POLICY IF EXISTS work_orders_limited_technician_select ON public.work_orders;
CREATE POLICY work_orders_limited_technician_select ON public.work_orders
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    -- Pass outright unless the caller is a technician in an org that turned
    -- the flag on (uncorrelated subquery -> planned once per statement).
    NOT EXISTS (
      SELECT 1
        FROM public.users u
        JOIN public.organisations o ON o.id = u.organisation_id
       WHERE u.id = auth.uid()
         AND u.role = 'technician'
         AND o.limit_technician_visibility IS TRUE
    )
    -- Limited technician: only their own work.
    OR assigned_to = auth.uid()
    OR auth.uid() = ANY (COALESCE(additional_workers, ARRAY[]::uuid[]))
    OR created_by = auth.uid()
  );
