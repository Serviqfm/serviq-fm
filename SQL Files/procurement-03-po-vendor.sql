-- P2 / Procurement — PO lifecycle + vendor upgrades (playbook §4 Batch P2).
-- Run in the Supabase SQL editor BEFORE deploying the PO detail page.
-- Idempotent. Safe to run twice.
--
-- No new tables and no new RLS: purchase_orders and vendors already carry the
-- 4-policy org RLS from w4-01-purchasing.sql and the vendors migration.
--
-- What changes:
--   1. purchase_orders.status widens to the real lifecycle
--      draft -> sent -> acknowledged -> in_transit -> received (+ cancelled).
--   2. purchase_orders gains delivery_address, sent_at, vendor_email_snapshot
--      (the address the goods go to, when the PO left, and the vendor address it
--      was mailed to — snapshotted so later vendor edits don't rewrite history).
--   3. vendors gains payment_terms, bank_name, bank_iban, contract_start,
--      contract_end. The bank fields are the ERP-sync placeholders (P7).
--   4. receive_purchase_order() is widened to accept the two NEW in-flight
--      states. This is REQUIRED, not cosmetic: the shipped function only receives
--      'draft'/'sent', so without this a PO advanced to acknowledged/in_transit
--      would silently return unchanged and could never be received. The body is
--      otherwise byte-for-byte the w4-01 original.
--
-- Forward-only transitions are enforced in the API route
-- (web/src/app/api/purchase-orders/[id]/status/route.ts), which owns the order;
-- the CHECK below only constrains the vocabulary.
--
-- Acceptance (owner, after running — see procurement-03-po-vendor.test.sql):
--   * a PO can be advanced to acknowledged / in_transit and still received.
--   * receiving from in_transit bumps stock and writes the ledger exactly once.
--   * the new vendor columns exist and default to NULL for every tenant.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. purchase_orders — widen the status vocabulary.
--    Drop + re-add so re-running is safe (the CHECK was created inline by
--    w4-01-purchasing.sql, so it carries the default name).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_status_check
  CHECK (status IN ('draft','sent','acknowledged','in_transit','received','cancelled'));

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS delivery_address      TEXT,
  ADD COLUMN IF NOT EXISTS sent_at               TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vendor_email_snapshot TEXT;

COMMENT ON COLUMN public.purchase_orders.vendor_email_snapshot IS
  'The vendor address this PO was actually emailed to, captured at send time so later vendor edits do not rewrite history.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. vendors — commercial terms + contract window.
--    All nullable: every existing vendor is unchanged and the UI treats NULL as
--    "not recorded" rather than as a missing requirement.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS payment_terms  TEXT,
  ADD COLUMN IF NOT EXISTS bank_name      TEXT,
  ADD COLUMN IF NOT EXISTS bank_iban      TEXT,
  ADD COLUMN IF NOT EXISTS contract_start DATE,
  ADD COLUMN IF NOT EXISTS contract_end   DATE;

COMMENT ON COLUMN public.vendors.bank_iban IS
  'ERP-sync placeholder (P7). Not used for payment execution anywhere in V1.';

-- Contract-expiry cron (/api/cron/compliance-expiry) filters on exactly this.
CREATE INDEX IF NOT EXISTS idx_vendors_contract_end ON public.vendors(contract_end)
  WHERE contract_end IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. receive_purchase_order — accept the new in-flight states.
--    Unchanged from w4-01-purchasing.sql apart from the status guard: a PO that
--    has been acknowledged or is in transit is exactly the PO you are most
--    likely to be receiving.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION receive_purchase_order(p_po_id UUID)
RETURNS purchase_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_org UUID;
  v_po  purchase_orders%ROWTYPE;
  v_line RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT organisation_id INTO v_org FROM users WHERE id = auth.uid();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'no organisation';
  END IF;

  SELECT * INTO v_po FROM purchase_orders
    WHERE id = p_po_id AND organisation_id = v_org
    FOR UPDATE;
  IF v_po.id IS NULL THEN
    RAISE EXCEPTION 'purchase order not found in your organisation';
  END IF;

  -- Idempotent: any state still in flight is receivable; received/cancelled are
  -- terminal and return unchanged.
  IF v_po.status NOT IN ('draft','sent','acknowledged','in_transit') THEN
    RETURN v_po;
  END IF;

  -- One ledger row + stock bump per line that maps to an IN-ORG inventory item.
  -- The JOIN drops any foreign-org / stale item_id, so the ledger can never record
  -- a stock-in that didn't actually land in inventory_items (ledger drift).
  FOR v_line IN
    SELECT poi.item_id, poi.quantity
      FROM purchase_order_items poi
      JOIN inventory_items ii ON ii.id = poi.item_id AND ii.organisation_id = v_org
     WHERE poi.purchase_order_id = p_po_id
  LOOP
    UPDATE inventory_items
       SET stock_quantity = COALESCE(stock_quantity, 0) + v_line.quantity
     WHERE id = v_line.item_id AND organisation_id = v_org;

    INSERT INTO stock_transactions
      (organisation_id, item_id, delta, reason, note, ref_po_id, created_by)
    VALUES
      (v_org, v_line.item_id, v_line.quantity, 'receive',
       'PO #' || v_po.po_number || ' received', p_po_id, auth.uid());
  END LOOP;

  UPDATE purchase_orders
     SET status = 'received', received_at = now(), received_by = auth.uid(), updated_at = now()
   WHERE id = p_po_id
   RETURNING * INTO v_po;

  RETURN v_po;
END;
$fn$;

REVOKE ALL ON FUNCTION receive_purchase_order(UUID) FROM public;
GRANT EXECUTE ON FUNCTION receive_purchase_order(UUID) TO authenticated;
