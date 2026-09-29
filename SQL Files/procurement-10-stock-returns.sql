-- P10 / Procurement — returning issued stock on cancel, and charging issued
-- consumables to the cost center.
-- Run in the Supabase SQL editor AFTER procurement-09-stock-requisitions.sql.
-- Idempotent. Safe to run twice.
--
-- Two gaps left open by P9, both listed there as known limits:
--
--   1. Cancelling an ALREADY-approved requisition left the issued stock gone.
--      requisitions_stock_effects() now handles approved/converted -> cancelled
--      by putting the issued quantity back and writing a 'return_requisition'
--      ledger row. The issue row stays in the ledger, so the round trip is
--      visible rather than erased.
--
--   2. Consumables taken off the shelf were invisible to the budget. budget_spend()
--      now counts ISSUED stock lines as ACTUAL spend for their cost center —
--      the money left the organisation when the item was bought, but the cost
--      belongs to whoever consumed it.
--
--      *** THIS CHANGES EXISTING BUDGET NUMBERS. *** A cost center whose
--      requisitions draw a lot of stock will read higher than it did yesterday,
--      and submits can hit the P5 hard block sooner. Nothing outside this file
--      changes, so not running it keeps today's behaviour exactly.
--      Only lines with issued_qty set are counted, so a cancelled-and-returned
--      requisition drops back out on its own.
--
-- Acceptance (owner, after running — see procurement-10-stock-returns.test.sql).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The ledger gains the other direction.
-- ─────────────────────────────────────────────────────────────────────────────
DO $do$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.stock_transactions'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%reason%'
  LOOP
    EXECUTE format('ALTER TABLE public.stock_transactions DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $do$;

ALTER TABLE public.stock_transactions
  ADD CONSTRAINT stock_transactions_reason_check
  CHECK (reason IN ('adjust','receive','consume_wo','issue_requisition','return_requisition'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. requisitions_stock_effects — P9's body plus the return branch.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION requisitions_stock_effects()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r       RECORD;
  v_name  TEXT;
  v_stock NUMERIC;
  v_avail NUMERIC;
BEGIN
  -- RELEASE: a pending requisition deleted outright. BEFORE DELETE, so the lines
  -- are still there to read (the cascade would remove them otherwise).
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'pending_approval' THEN
      UPDATE inventory_items ii
         SET reserved_quantity = GREATEST(ii.reserved_quantity - x.qty, 0)
        FROM (SELECT item_id, SUM(reserved_qty) AS qty FROM requisition_items
               WHERE requisition_id = OLD.id AND reserved_qty IS NOT NULL AND item_id IS NOT NULL
               GROUP BY item_id) x
       WHERE ii.id = x.item_id AND ii.organisation_id = OLD.organisation_id;
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- RESERVE: entering approval (or skipping straight to approved).
  IF OLD.status IN ('draft','rejected') AND NEW.status IN ('pending_approval','approved') THEN
    FOR r IN
      SELECT item_id, SUM(quantity) AS qty FROM requisition_items
       WHERE requisition_id = NEW.id AND line_type = 'stock'
       GROUP BY item_id ORDER BY item_id
    LOOP
      SELECT name, COALESCE(stock_quantity, 0) - reserved_quantity INTO v_name, v_avail
        FROM inventory_items
       WHERE id = r.item_id AND organisation_id = NEW.organisation_id
         FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'STOCK_ITEM_MISSING|%', r.item_id;
      END IF;
      IF v_avail < r.qty THEN
        RAISE EXCEPTION 'STOCK_SHORT|%|%|%', v_name, r.qty, GREATEST(v_avail, 0);
      END IF;
      UPDATE inventory_items SET reserved_quantity = reserved_quantity + r.qty WHERE id = r.item_id;
    END LOOP;

    UPDATE requisition_items SET reserved_qty = quantity
     WHERE requisition_id = NEW.id AND line_type = 'stock';
  END IF;

  -- ISSUE: final approval hands the reserved quantity out.
  IF NEW.status = 'approved' THEN
    FOR r IN
      SELECT id, item_id, reserved_qty FROM requisition_items
       WHERE requisition_id = NEW.id AND line_type = 'stock'
         AND reserved_qty IS NOT NULL AND item_id IS NOT NULL
       ORDER BY item_id
    LOOP
      SELECT name, COALESCE(stock_quantity, 0) INTO v_name, v_stock
        FROM inventory_items
       WHERE id = r.item_id AND organisation_id = NEW.organisation_id
         FOR UPDATE;
      IF NOT FOUND THEN
        CONTINUE;
      END IF;
      IF v_stock < r.reserved_qty THEN
        RAISE EXCEPTION 'STOCK_SHORT|%|%|%', v_name, r.reserved_qty, GREATEST(v_stock, 0);
      END IF;

      UPDATE inventory_items
         SET stock_quantity    = v_stock - r.reserved_qty,
             reserved_quantity = GREATEST(reserved_quantity - r.reserved_qty, 0)
       WHERE id = r.item_id;

      INSERT INTO stock_transactions
        (organisation_id, item_id, delta, reason, note, ref_requisition_id, created_by)
      VALUES
        (NEW.organisation_id, r.item_id, -r.reserved_qty, 'issue_requisition',
         'Requisition #' || NEW.requisition_number || ' issued', NEW.id, auth.uid());

      UPDATE requisition_items SET issued_qty = r.reserved_qty, reserved_qty = NULL WHERE id = r.id;
    END LOOP;
  END IF;

  -- RELEASE: leaving approval without being approved.
  IF OLD.status = 'pending_approval' AND NEW.status IN ('rejected','cancelled','draft') THEN
    UPDATE inventory_items ii
       SET reserved_quantity = GREATEST(ii.reserved_quantity - x.qty, 0)
      FROM (SELECT item_id, SUM(reserved_qty) AS qty FROM requisition_items
             WHERE requisition_id = NEW.id AND reserved_qty IS NOT NULL AND item_id IS NOT NULL
             GROUP BY item_id) x
     WHERE ii.id = x.item_id AND ii.organisation_id = NEW.organisation_id;

    UPDATE requisition_items SET reserved_qty = NULL
     WHERE requisition_id = NEW.id AND reserved_qty IS NOT NULL;
  END IF;

  -- P10 RETURN: cancelling after the goods were handed out puts them back.
  -- issued_qty is cleared, so the line reads as "not issued" again and
  -- budget_spend stops counting it; the two ledger rows keep the history.
  IF OLD.status IN ('approved','converted') AND NEW.status = 'cancelled' THEN
    FOR r IN
      SELECT id, item_id, issued_qty FROM requisition_items
       WHERE requisition_id = NEW.id AND line_type = 'stock'
         AND issued_qty IS NOT NULL AND item_id IS NOT NULL
       ORDER BY item_id
    LOOP
      UPDATE inventory_items
         SET stock_quantity = COALESCE(stock_quantity, 0) + r.issued_qty
       WHERE id = r.item_id AND organisation_id = NEW.organisation_id;
      IF NOT FOUND THEN
        CONTINUE;  -- item deleted since: nothing to put back
      END IF;

      INSERT INTO stock_transactions
        (organisation_id, item_id, delta, reason, note, ref_requisition_id, created_by)
      VALUES
        (NEW.organisation_id, r.item_id, r.issued_qty, 'return_requisition',
         'Requisition #' || NEW.requisition_number || ' cancelled — stock returned', NEW.id, auth.uid());

      UPDATE requisition_items SET issued_qty = NULL WHERE id = r.id;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION requisitions_stock_effects() FROM public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. budget_spend — P9's body plus issued consumables in ACTUAL.
--    Attributed like every other requisition figure: to the submitted date.
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
                AND ri.line_type = 'purchase'
           ), 0) AS total,
           COALESCE((
             SELECT SUM(ri.issued_qty * ri.unit_cost)
               FROM requisition_items ri
              WHERE ri.requisition_id = r.id
                AND ri.line_type = 'stock'
                AND ri.issued_qty IS NOT NULL
           ), 0) AS issued
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
    COALESCE((SELECT SUM(total) FROM req WHERE status = 'approved'), 0)
      + COALESCE((SELECT SUM(total) FROM po
                   WHERE status IN ('draft','sent','acknowledged','in_transit')), 0),
    COALESCE((SELECT SUM(COALESCE(invoiced, total)) FROM po WHERE status = 'received'), 0)
      -- P10: consumables already handed out are spent, whatever the header status.
      + COALESCE((SELECT SUM(issued) FROM req), 0);
$fn$;

REVOKE ALL ON FUNCTION budget_spend(UUID, DATE, DATE) FROM public;
GRANT EXECUTE ON FUNCTION budget_spend(UUID, DATE, DATE) TO authenticated;
