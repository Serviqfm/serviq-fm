-- P5 / Procurement — budget periods, reserved-vs-actual, and the hard block.
-- Run in the Supabase SQL editor AFTER procurement-01 … procurement-05.
-- (budget_spend() reads vendor_invoices.match_status from P4 and
--  purchase_orders.requisition_id from P1, so those must exist first.)
-- Idempotent. Safe to run twice.
--
-- What ships:
--   * budget_periods  — a dated budget for one cost center (monthly/quarterly/annual)
--   * budget_spend()  — RESERVED vs ACTUAL for a cost center over a date range
--   * submit_requisition() gains the 100% HARD BLOCK
--
-- RESERVED = money promised but not yet spent:
--     approved requisitions (not yet converted) + open purchase orders
-- ACTUAL   = money spent:
--     received purchase orders, valued at the matched invoice where one exists,
--     otherwise at the ordered amount
--
-- DEVIATION FROM THE PLAYBOOK, and why:
-- the playbook defines reserved as "approved/converted requisition totals + open
-- PO totals". A CONVERTED requisition has become a purchase order, so counting
-- both would double-count the same money and block budgets that are not actually
-- full. Reserved therefore counts a requisition only while it is 'approved', and
-- hands over to the PO once it converts. Same reasoning for actual: a received PO
-- with a matched invoice is counted ONCE, at the invoice amount (the real cost).
--
-- KNOWN LIMITATION, documented rather than hidden: a purchase order raised
-- directly — never through a requisition — has no cost center (purchase_orders
-- has no cost_center_id) and is invisible to budgets. Requisitions are the
-- budget-bearing document in V1. Closing this needs a cost_center_id on
-- purchase_orders plus a PO-time block, which is not in P5's scope.
--
-- Permissive default, house philosophy: a cost center with NO period covering
-- today is not budget-controlled at all, so nothing is blocked and every existing
-- tenant behaves exactly as before.
--
-- Acceptance (owner, after running — see procurement-06-budgets.test.sql):
--   * a submit that lands over 100% raises, naming the numbers.
--   * a submit at 76% succeeds.
--   * a cost center with no period behaves exactly as before.
--   * reserved and actual do not double-count a converted requisition.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. budget_periods — a dated budget for one cost center.
--    cost_centers.annual_budget stays untouched as the legacy display figure.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.budget_periods (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  cost_center_id  UUID NOT NULL,
  period          TEXT NOT NULL DEFAULT 'annual' CHECK (period IN ('monthly','quarterly','annual')),
  starts_on       DATE NOT NULL,
  ends_on         DATE NOT NULL,
  amount          NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT budget_periods_dates_ordered CHECK (ends_on >= starts_on)
);

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budget_periods_cc_org_fk')
     AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cost_centers_id_org_key') THEN
    ALTER TABLE public.budget_periods
      ADD CONSTRAINT budget_periods_cc_org_fk
      FOREIGN KEY (cost_center_id, organisation_id)
      REFERENCES public.cost_centers(id, organisation_id) ON DELETE CASCADE;
  END IF;
END $do$;

CREATE INDEX IF NOT EXISTS idx_budget_periods_cc  ON public.budget_periods(cost_center_id, starts_on, ends_on);
CREATE INDEX IF NOT EXISTS idx_budget_periods_org ON public.budget_periods(organisation_id);

ALTER TABLE public.budget_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS budget_periods_org_select ON public.budget_periods;
CREATE POLICY budget_periods_org_select ON public.budget_periods
  FOR SELECT USING (organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid()));
DROP POLICY IF EXISTS budget_periods_org_insert ON public.budget_periods;
CREATE POLICY budget_periods_org_insert ON public.budget_periods
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','manager')
  );
DROP POLICY IF EXISTS budget_periods_org_update ON public.budget_periods;
CREATE POLICY budget_periods_org_update ON public.budget_periods
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','manager')
  )
  WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','manager')
  );
DROP POLICY IF EXISTS budget_periods_org_delete ON public.budget_periods;
CREATE POLICY budget_periods_org_delete ON public.budget_periods
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','manager')
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. budget_spend — reserved vs actual for one cost center over a date range.
--
--    SECURITY INVOKER on purpose: called from the app it runs under the caller's
--    RLS, so it can only ever total that caller's own organisation. Inside
--    submit_requisition() (SECURITY DEFINER) it runs as owner, but only after the
--    requisition — and therefore its cost center — has been org-verified.
--
--    Spend is attributed to WHEN THE COMMITMENT WAS MADE: a requisition by its
--    submitted date, a purchase order by its creation date.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION budget_spend(p_cost_center UUID, p_from DATE, p_to DATE)
RETURNS TABLE (reserved NUMERIC, actual NUMERIC)
LANGUAGE sql
STABLE
AS $fn$
  WITH req AS (
    SELECT r.status,
           COALESCE((
             SELECT SUM(ri.quantity * ri.unit_cost)
               FROM requisition_items ri
              WHERE ri.requisition_id = r.id
           ), 0) AS total
      FROM requisitions r
     WHERE r.cost_center_id = p_cost_center
       AND COALESCE(r.submitted_at::date, r.created_at::date) BETWEEN p_from AND p_to
  ),
  po AS (
    SELECT p.status,
           COALESCE((
             SELECT SUM(poi.quantity * poi.unit_cost)
               FROM purchase_order_items poi
              WHERE poi.purchase_order_id = p.id
           ), 0) AS total,
           (
             SELECT SUM(vi.amount)
               FROM vendor_invoices vi
              WHERE vi.purchase_order_id = p.id
                AND vi.match_status IN ('matched','approved_for_payment')
           ) AS invoiced
      FROM purchase_orders p
      JOIN requisitions r2
        ON r2.id = p.requisition_id
       AND r2.cost_center_id = p_cost_center
     WHERE p.created_at::date BETWEEN p_from AND p_to
  )
  SELECT
    -- Reserved: approved requisitions that have NOT yet become a PO, plus every
    -- PO still in flight. A converted requisition is represented by its PO only.
    COALESCE((SELECT SUM(total) FROM req WHERE status = 'approved'), 0)
      + COALESCE((SELECT SUM(total) FROM po
                   WHERE status IN ('draft','sent','acknowledged','in_transit')), 0),
    -- Actual: received POs, valued at the matched invoice when there is one.
    COALESCE((SELECT SUM(COALESCE(invoiced, total)) FROM po WHERE status = 'received'), 0);
$fn$;

REVOKE ALL ON FUNCTION budget_spend(UUID, DATE, DATE) FROM public;
GRANT EXECUTE ON FUNCTION budget_spend(UUID, DATE, DATE) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. submit_requisition — unchanged from P1 except for the budget block below.
--    The 75%/90% warning is NOT raised here: a warning must not roll back the
--    submit, and the notification belongs in the app layer that can actually
--    send it (the submit route re-reads budget_spend afterwards).
--
--    The exception message is machine-readable on purpose —
--      BUDGET_EXCEEDED|<requested>|<reserved>|<actual>|<budget>
--    so the API can render it bilingually with the real numbers instead of the
--    database carrying UI copy in two languages.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION submit_requisition(p_id UUID)
RETURNS requisitions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_org      UUID;
  v_req      requisitions%ROWTYPE;
  v_total    NUMERIC(14,2);
  v_rule_id  UUID;
  v_steps    INT;
  v_period   budget_periods%ROWTYPE;
  v_reserved NUMERIC(14,2);
  v_actual   NUMERIC(14,2);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Marks this transaction as "the status change is coming from the workflow",
  -- which is what requisitions_guard_status() looks for.
  PERFORM set_config('app.requisition_rpc', '1', true);

  SELECT organisation_id INTO v_org FROM users WHERE id = auth.uid();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'no organisation';
  END IF;

  SELECT * INTO v_req FROM requisitions
    WHERE id = p_id AND organisation_id = v_org
    FOR UPDATE;
  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'requisition not found in your organisation';
  END IF;

  -- Idempotent: only a draft or a rejected (revision loop) requisition submits.
  IF v_req.status NOT IN ('draft','rejected') THEN
    RETURN v_req;
  END IF;

  -- Only the creator resubmits their own work; admin/manager may submit any.
  IF v_req.created_by <> auth.uid()
     AND (SELECT role FROM users WHERE id = auth.uid()) NOT IN ('admin','manager') THEN
    RAISE EXCEPTION 'only the creator or an admin/manager may submit this requisition';
  END IF;

  SELECT COALESCE(SUM(quantity * unit_cost), 0) INTO v_total
    FROM requisition_items WHERE requisition_id = p_id AND organisation_id = v_org;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'requisition has no priced lines';
  END IF;

  -- P5: the hard block. Only bites when the cost center has a period covering
  -- today; no period means no budget control, exactly as before this migration.
  -- This requisition is still draft/rejected, so it is not already inside
  -- `reserved` and adding v_total cannot double-count it.
  IF v_req.cost_center_id IS NOT NULL THEN
    SELECT * INTO v_period FROM budget_periods
     WHERE cost_center_id = v_req.cost_center_id
       AND organisation_id = v_org
       AND current_date BETWEEN starts_on AND ends_on
     ORDER BY starts_on DESC
     LIMIT 1;

    IF v_period.id IS NOT NULL THEN
      SELECT b.reserved, b.actual INTO v_reserved, v_actual
        FROM budget_spend(v_req.cost_center_id, v_period.starts_on, v_period.ends_on) b;

      IF COALESCE(v_reserved, 0) + COALESCE(v_actual, 0) + v_total > v_period.amount THEN
        RAISE EXCEPTION 'BUDGET_EXCEEDED|%|%|%|%',
          v_total, COALESCE(v_reserved, 0), COALESCE(v_actual, 0), v_period.amount;
      END IF;
    END IF;
  END IF;

  -- A resubmit starts from a clean chain.
  DELETE FROM requisition_approvals WHERE requisition_id = p_id AND organisation_id = v_org;

  -- Band selection: [min_amount, max_amount), max NULL = and above. Overlapping
  -- bands are a config error; the highest min_amount wins so the pick is
  -- deterministic rather than arbitrary.
  SELECT id INTO v_rule_id
    FROM procurement_approval_rules
   WHERE organisation_id = v_org
     AND is_active
     AND v_total >= min_amount
     AND (max_amount IS NULL OR v_total < max_amount)
   ORDER BY min_amount DESC
   LIMIT 1;

  IF v_rule_id IS NOT NULL THEN
    INSERT INTO requisition_approvals
      (organisation_id, requisition_id, step_order, approver_user_id, label, status)
    SELECT v_org, p_id, s.step_order, s.approver_user_id, s.label, 'pending'
      FROM procurement_approval_rule_steps s
     WHERE s.rule_id = v_rule_id AND s.organisation_id = v_org
     ORDER BY s.step_order;
    GET DIAGNOSTICS v_steps = ROW_COUNT;
  ELSE
    v_steps := 0;
  END IF;

  IF v_steps = 0 THEN
    -- No band, or a band with no approvers configured: auto-approve.
    UPDATE requisitions
       SET status = 'approved', submitted_at = now(), decided_at = now(), updated_at = now()
     WHERE id = p_id
     RETURNING * INTO v_req;
  ELSE
    UPDATE requisitions
       SET status = 'pending_approval', submitted_at = now(), decided_at = NULL, updated_at = now()
     WHERE id = p_id
     RETURNING * INTO v_req;
  END IF;

  RETURN v_req;
END;
$fn$;

REVOKE ALL ON FUNCTION submit_requisition(UUID) FROM public;
GRANT EXECUTE ON FUNCTION submit_requisition(UUID) TO authenticated;
