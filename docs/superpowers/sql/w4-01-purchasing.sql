-- Track W4-B — Purchase orders + inventory (stock) transaction ledger.
-- IDs: MKT-05 (PO + stock ledger), FM-10 (inventory transaction ledger), FM-17 (PO module).
-- Run in the Supabase SQL editor BEFORE deploying the /dashboard/purchase-orders routes.
-- Idempotent. Safe to run twice. Styled after sprint-l-01-asset-log.sql (4-policy org RLS).
--
-- Three tables, all org-scoped with the standard 4-policy RLS (SELECT/INSERT/UPDATE/DELETE),
-- WITH CHECK on both INSERT and UPDATE so an authenticated caller cannot move a row into
-- another org:
--   * purchase_orders       — header (vendor-linked, draft→sent→received/cancelled)
--   * purchase_order_items  — line items (item_id → inventory_items, qty, unit_cost)
--   * stock_transactions    — the immutable ledger: (item_id, delta, reason, ref, note, who)
--
-- All WRITES flow through the service-role API routes under web/src/app/api/purchase-orders/,
-- which scope FK references (vendor/item) to the caller's org in app code. Receiving a PO goes
-- through receive_purchase_order() (SECURITY DEFINER, org-verified internally) so the stock
-- bump + ledger rows + status flip happen in ONE transaction.
--
-- Known residual (same posture as sprint-l): a direct PostgREST INSERT could reference another
-- org's vendor/inventory item on its own row (integrity poisoning, NOT read exfiltration — SELECT
-- stays org-scoped). No client writes these tables directly today; close with EXISTS WITH CHECK
-- if mobile/direct writes are added.
--
-- Acceptance (owner, after running):
--   * anon-key SELECT/INSERT on each table returns/denies cross-org.
--   * receive_purchase_order marks the PO received, writes one stock_transactions row per line,
--     and increments inventory_items.stock_quantity; a second call is a no-op (already received).
--   * receiving a PO that belongs to another org raises.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. purchase_orders (header)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  po_number       BIGINT GENERATED ALWAYS AS IDENTITY,
  vendor_id       UUID REFERENCES vendors(id) ON DELETE SET NULL,
  site_id         UUID REFERENCES sites(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','sent','received','cancelled')),
  notes           TEXT,
  expected_at     DATE,
  received_at     TIMESTAMPTZ,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  received_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_org_status ON purchase_orders(organisation_id, status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_vendor     ON purchase_orders(vendor_id);

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS purchase_orders_org_select ON purchase_orders;
CREATE POLICY purchase_orders_org_select ON purchase_orders
  FOR SELECT USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS purchase_orders_org_insert ON purchase_orders;
CREATE POLICY purchase_orders_org_insert ON purchase_orders
  FOR INSERT WITH CHECK (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS purchase_orders_org_update ON purchase_orders;
CREATE POLICY purchase_orders_org_update ON purchase_orders
  FOR UPDATE USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()))
  WITH CHECK (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS purchase_orders_org_delete ON purchase_orders;
CREATE POLICY purchase_orders_org_delete ON purchase_orders
  FOR DELETE USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. purchase_order_items (line items)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id   UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_id           UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
  description       TEXT,          -- snapshot / free-text line (survives item deletion)
  quantity          NUMERIC(12,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_cost         NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_items_po   ON purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_po_items_item ON purchase_order_items(item_id);
CREATE INDEX IF NOT EXISTS idx_po_items_org  ON purchase_order_items(organisation_id);

ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS po_items_org_select ON purchase_order_items;
CREATE POLICY po_items_org_select ON purchase_order_items
  FOR SELECT USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS po_items_org_insert ON purchase_order_items;
CREATE POLICY po_items_org_insert ON purchase_order_items
  FOR INSERT WITH CHECK (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS po_items_org_update ON purchase_order_items;
CREATE POLICY po_items_org_update ON purchase_order_items
  FOR UPDATE USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()))
  WITH CHECK (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS po_items_org_delete ON purchase_order_items;
CREATE POLICY po_items_org_delete ON purchase_order_items
  FOR DELETE USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. stock_transactions (the immutable inventory ledger — FM-10 / MKT-05)
--    delta > 0 = stock in (PO receipt, positive adjustment); delta < 0 = out
--    (WO consumption, negative adjustment). reason categorises; ref_* links source.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id   UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  item_id           UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  delta             NUMERIC(12,2) NOT NULL,   -- signed; the change applied to stock_quantity
  reason            TEXT NOT NULL DEFAULT 'adjust'
                      CHECK (reason IN ('adjust','receive','consume_wo')),
  note              TEXT,
  ref_po_id         UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  ref_work_order_id UUID REFERENCES work_orders(id) ON DELETE SET NULL,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_tx_item ON stock_transactions(item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_tx_org  ON stock_transactions(organisation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_tx_po   ON stock_transactions(ref_po_id);

ALTER TABLE stock_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stock_tx_org_select ON stock_transactions;
CREATE POLICY stock_tx_org_select ON stock_transactions
  FOR SELECT USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS stock_tx_org_insert ON stock_transactions;
CREATE POLICY stock_tx_org_insert ON stock_transactions
  FOR INSERT WITH CHECK (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS stock_tx_org_update ON stock_transactions;
CREATE POLICY stock_tx_org_update ON stock_transactions
  FOR UPDATE USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()))
  WITH CHECK (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS stock_tx_org_delete ON stock_transactions;
CREATE POLICY stock_tx_org_delete ON stock_transactions
  FOR DELETE USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RPC receive_purchase_order — one atomic receive path.
--    Org-verified internally (caller org must own the PO). SECURITY DEFINER so it can
--    flip status + bump stock + write ledger rows in one transaction; reads auth.uid()
--    itself so it cannot be aimed at another org's PO. Idempotent: a PO already in a
--    terminal state (received/cancelled) is left untouched and returns unchanged.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION receive_purchase_order(p_po_id UUID)
RETURNS purchase_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Idempotent: only draft/sent POs are receivable.
  IF v_po.status NOT IN ('draft','sent') THEN
    RETURN v_po;
  END IF;

  -- One ledger row + stock bump per line that maps to an inventory item.
  FOR v_line IN
    SELECT item_id, quantity FROM purchase_order_items
     WHERE purchase_order_id = p_po_id AND item_id IS NOT NULL
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
$$;

REVOKE ALL ON FUNCTION receive_purchase_order(UUID) FROM public;
GRANT EXECUTE ON FUNCTION receive_purchase_order(UUID) TO authenticated;
