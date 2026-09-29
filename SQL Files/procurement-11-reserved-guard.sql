-- P11 / Procurement — stock that is promised cannot be adjusted away.
-- Run in the Supabase SQL editor AFTER procurement-10-stock-returns.sql.
-- Idempotent. Safe to run twice.
--
-- The last gap left by P9/P10: nothing stopped a stock adjustment from pushing
-- stock_quantity below reserved_quantity. The approval then failed with
-- STOCK_SHORT at the worst possible moment — after the approver had said yes,
-- for a requester who had been told the goods were held.
--
-- This refuses the adjustment instead, at the point where the mistake is made
-- and where it is still cheap to fix (cancel the requisition, or adjust less).
--
-- A DECREASE is refused only when it would land below what is reserved. Anything
-- that does not reduce stock is untouched, so:
--   * receiving a PO / goods receipt (stock up) is unaffected;
--   * the issue step, which lowers stock and the reservation together
--     (10 -> 6 while reserved 4 -> 0), still passes, because what it leaves
--     behind is consistent;
--   * an item already over-committed by older data can still be corrected
--     UPWARDS, just not pushed further down.
--
-- A CHECK constraint would have been shorter, but it would validate every
-- existing row on creation and could not name the item or the held quantity.
-- The message is machine-readable, like BUDGET_EXCEEDED and STOCK_SHORT:
--   STOCK_RESERVED|<item name>|<attempted stock>|<reserved>
--
-- Acceptance (owner, after running — see procurement-11-reserved-guard.test.sql).

CREATE OR REPLACE FUNCTION inventory_items_guard_reserved()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF NEW.stock_quantity < OLD.stock_quantity
     AND NEW.stock_quantity < NEW.reserved_quantity
  THEN
    RAISE EXCEPTION 'STOCK_RESERVED|%|%|%', NEW.name, NEW.stock_quantity, NEW.reserved_quantity;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_inventory_items_guard_reserved ON public.inventory_items;
CREATE TRIGGER trg_inventory_items_guard_reserved
  BEFORE UPDATE OF stock_quantity ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION inventory_items_guard_reserved();

COMMENT ON FUNCTION inventory_items_guard_reserved() IS
  'P11: refuses a stock decrease that would leave stock_quantity below reserved_quantity (raises STOCK_RESERVED|item|attempted|reserved).';
