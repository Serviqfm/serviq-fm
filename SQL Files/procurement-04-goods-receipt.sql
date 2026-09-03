-- P3 / Procurement — goods receipt & inspection (playbook §4 Batch P3).
-- Run in the Supabase SQL editor BEFORE deploying the per-line receive UI.
-- Idempotent. Safe to run twice. 4-policy org RLS, styled after w4-01-purchasing.sql.
--
-- What this replaces: receiving was ALL-OR-NOTHING. receive_purchase_order()
-- bumped every line by its full ordered quantity and flipped the PO to
-- 'received', so a half-delivered order could only be recorded as complete —
-- and damaged or wrong items still landed in stock.
--
-- What ships instead:
--   * goods_receipts       — one delivery event against a PO (partial | full)
--   * goods_receipt_lines  — per PO line: qty, condition, bin location, note
--   * stock_transactions.ref_goods_receipt_id — the ledger now points at the
--     receipt that caused it, not just the PO
--   * receive_purchase_order_lines(po, JSONB) — the real receive path
--   * receive_purchase_order(po) — kept working, now sugar for "receive all
--     remaining lines as ok". Every existing caller (the PO list button, the
--     /receive route with an empty body) keeps behaving exactly as before.
--
-- The rules that matter, all enforced in the RPC:
--   * ONLY 'ok' quantities move stock. damaged / wrong_item / short are recorded
--     against the receipt and deliberately never touch inventory.
--   * The PO flips to 'received' only when cumulative ok quantity covers the
--     ordered quantity on EVERY line; otherwise it stays where it is and can be
--     received again.
--   * Over-receipt is refused: cumulative ok qty may not exceed what was ordered.
--
-- The app degrades gracefully WITHOUT this migration: the PO detail page's
-- receive panel falls back to the all-or-nothing button, so `next build` and the
-- running app both work before this runs.
--
-- Acceptance (owner, after running — see procurement-04-goods-receipt.test.sql):
--   * a partial receipt leaves the PO open and bumps stock by exactly the ok qty.
--   * a second receipt that completes the order flips it to 'received'.
--   * damaged / short lines never move stock.
--   * ledger rows carry ref_goods_receipt_id.
--   * receiving another org's PO raises.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. goods_receipts — one delivery event.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.goods_receipts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id   UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  purchase_order_id UUID NOT NULL,
  receipt_number    BIGINT GENERATED ALWAYS AS IDENTITY,
  received_by       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  received_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes             TEXT,
  status            TEXT NOT NULL DEFAULT 'partial' CHECK (status IN ('partial','full')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Org-bound composite FK (cost-centers pattern): a receipt can only hang off a PO
-- in the SAME org. Needs purchase_orders to carry a (id, organisation_id) key.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_id_org_key') THEN
    ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_id_org_key UNIQUE (id, organisation_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goods_receipts_po_org_fk') THEN
    ALTER TABLE public.goods_receipts
      ADD CONSTRAINT goods_receipts_po_org_fk
      FOREIGN KEY (purchase_order_id, organisation_id)
      REFERENCES public.purchase_orders(id, organisation_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goods_receipts_id_org_key') THEN
    ALTER TABLE public.goods_receipts ADD CONSTRAINT goods_receipts_id_org_key UNIQUE (id, organisation_id);
  END IF;
END $do$;

CREATE INDEX IF NOT EXISTS idx_goods_receipts_po  ON public.goods_receipts(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_org ON public.goods_receipts(organisation_id, received_at DESC);

ALTER TABLE public.goods_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS goods_receipts_org_select ON public.goods_receipts;
CREATE POLICY goods_receipts_org_select ON public.goods_receipts
  FOR SELECT USING (organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid()));
DROP POLICY IF EXISTS goods_receipts_org_insert ON public.goods_receipts;
CREATE POLICY goods_receipts_org_insert ON public.goods_receipts
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','manager')
  );
DROP POLICY IF EXISTS goods_receipts_org_update ON public.goods_receipts;
CREATE POLICY goods_receipts_org_update ON public.goods_receipts
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','manager')
  )
  WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','manager')
  );
DROP POLICY IF EXISTS goods_receipts_org_delete ON public.goods_receipts;
CREATE POLICY goods_receipts_org_delete ON public.goods_receipts
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','manager')
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. goods_receipt_lines — what actually arrived, per PO line.
--    condition is the inspection verdict; only 'ok' moves stock.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.goods_receipt_lines (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id        UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  goods_receipt_id       UUID NOT NULL,
  purchase_order_item_id UUID NOT NULL REFERENCES public.purchase_order_items(id) ON DELETE CASCADE,
  qty_received           NUMERIC(12,2) NOT NULL CHECK (qty_received > 0),
  condition              TEXT NOT NULL DEFAULT 'ok'
                           CHECK (condition IN ('ok','damaged','wrong_item','short')),
  bin_location           TEXT,
  note                   TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goods_receipt_lines_receipt_org_fk') THEN
    ALTER TABLE public.goods_receipt_lines
      ADD CONSTRAINT goods_receipt_lines_receipt_org_fk
      FOREIGN KEY (goods_receipt_id, organisation_id)
      REFERENCES public.goods_receipts(id, organisation_id) ON DELETE CASCADE;
  END IF;
END $do$;

CREATE INDEX IF NOT EXISTS idx_gr_lines_receipt ON public.goods_receipt_lines(goods_receipt_id);
CREATE INDEX IF NOT EXISTS idx_gr_lines_po_item ON public.goods_receipt_lines(purchase_order_item_id);
CREATE INDEX IF NOT EXISTS idx_gr_lines_org     ON public.goods_receipt_lines(organisation_id);

ALTER TABLE public.goods_receipt_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gr_lines_org_select ON public.goods_receipt_lines;
CREATE POLICY gr_lines_org_select ON public.goods_receipt_lines
  FOR SELECT USING (organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid()));
DROP POLICY IF EXISTS gr_lines_org_insert ON public.goods_receipt_lines;
CREATE POLICY gr_lines_org_insert ON public.goods_receipt_lines
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','manager')
  );
DROP POLICY IF EXISTS gr_lines_org_update ON public.goods_receipt_lines;
CREATE POLICY gr_lines_org_update ON public.goods_receipt_lines
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','manager')
  )
  WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','manager')
  );
DROP POLICY IF EXISTS gr_lines_org_delete ON public.goods_receipt_lines;
CREATE POLICY gr_lines_org_delete ON public.goods_receipt_lines
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','manager')
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The ledger points at the receipt that caused it.
--    Nullable: every pre-P3 stock row keeps its NULL and stays valid.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.stock_transactions
  ADD COLUMN IF NOT EXISTS ref_goods_receipt_id UUID REFERENCES public.goods_receipts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stock_tx_receipt ON public.stock_transactions(ref_goods_receipt_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RPC receive_purchase_order_lines — the real receive path.
--
--    p_lines is a JSONB array of:
--      { "purchase_order_item_id": uuid,
--        "qty_received": number,
--        "condition": "ok" | "damaged" | "wrong_item" | "short",   (default 'ok')
--        "bin_location": text, "note": text }
--
--    p_lines NULL or '[]' means "receive everything still outstanding as ok",
--    which is what the old all-or-nothing call becomes.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION receive_purchase_order_lines(p_po_id UUID, p_lines JSONB DEFAULT NULL)
RETURNS purchase_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_org        UUID;
  v_po         purchase_orders%ROWTYPE;
  v_receipt    UUID;
  v_line       RECORD;
  v_item       UUID;
  v_ordered    NUMERIC(12,2);
  v_already    NUMERIC(12,2);
  v_outstanding INT;
  v_wrote      INT := 0;
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

  -- Idempotent: received / cancelled are terminal.
  IF v_po.status NOT IN ('draft','sent','acknowledged','in_transit') THEN
    RETURN v_po;
  END IF;

  INSERT INTO goods_receipts (organisation_id, purchase_order_id, received_by)
  VALUES (v_org, p_po_id, auth.uid())
  RETURNING id INTO v_receipt;

  -- Normalise the payload: an explicit list, or every line's outstanding balance.
  FOR v_line IN
    SELECT poi.id AS po_item_id,
           poi.item_id,
           poi.quantity AS ordered,
           COALESCE(l.qty, GREATEST(poi.quantity - COALESCE(prev.ok_qty, 0), 0)) AS qty,
           COALESCE(l.cond, 'ok') AS cond,
           l.bin, l.note
      FROM purchase_order_items poi
      LEFT JOIN LATERAL (
        SELECT (e ->> 'qty_received')::NUMERIC AS qty,
               COALESCE(e ->> 'condition', 'ok') AS cond,
               e ->> 'bin_location' AS bin,
               e ->> 'note' AS note
          FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) e
         WHERE (e ->> 'purchase_order_item_id')::uuid = poi.id
         LIMIT 1
      ) l ON true
      LEFT JOIN LATERAL (
        SELECT SUM(grl.qty_received) AS ok_qty
          FROM goods_receipt_lines grl
         WHERE grl.purchase_order_item_id = poi.id AND grl."condition" = 'ok'
      ) prev ON true
     WHERE poi.purchase_order_id = p_po_id
       AND poi.organisation_id = v_org
       -- With an explicit payload, only the lines it names are touched.
       AND (p_lines IS NULL OR jsonb_array_length(p_lines) = 0 OR l.qty IS NOT NULL)
  LOOP
    IF v_line.qty IS NULL OR v_line.qty <= 0 THEN
      CONTINUE;
    END IF;

    -- Over-receipt guard: cumulative ok quantity may never exceed the order.
    IF v_line.cond = 'ok' THEN
      SELECT COALESCE(SUM(qty_received), 0) INTO v_already
        FROM goods_receipt_lines
       WHERE purchase_order_item_id = v_line.po_item_id AND "condition" = 'ok';
      IF v_already + v_line.qty > v_line.ordered THEN
        RAISE EXCEPTION 'receiving % of line % exceeds the ordered quantity % (already received %)',
          v_line.qty, v_line.po_item_id, v_line.ordered, v_already;
      END IF;
    END IF;

    INSERT INTO goods_receipt_lines
      (organisation_id, goods_receipt_id, purchase_order_item_id, qty_received, "condition", bin_location, note)
    VALUES
      (v_org, v_receipt, v_line.po_item_id, v_line.qty, v_line.cond, v_line.bin, v_line.note);
    v_wrote := v_wrote + 1;

    -- ONLY 'ok' quantities move stock, and only for an in-org inventory item —
    -- the org check keeps the ledger from recording a stock-in that didn't land.
    IF v_line.cond = 'ok' AND v_line.item_id IS NOT NULL THEN
      SELECT id INTO v_item FROM inventory_items
       WHERE id = v_line.item_id AND organisation_id = v_org;
      IF v_item IS NOT NULL THEN
        UPDATE inventory_items
           SET stock_quantity = COALESCE(stock_quantity, 0) + v_line.qty
         WHERE id = v_item;

        INSERT INTO stock_transactions
          (organisation_id, item_id, delta, reason, note, ref_po_id, ref_goods_receipt_id, created_by)
        VALUES
          (v_org, v_item, v_line.qty, 'receive',
           'PO #' || v_po.po_number || ' received', p_po_id, v_receipt, auth.uid());
      END IF;
    END IF;
  END LOOP;

  IF v_wrote = 0 THEN
    -- Nothing to record: drop the empty receipt rather than leaving a ghost.
    DELETE FROM goods_receipts WHERE id = v_receipt;
    RETURN v_po;
  END IF;

  -- Complete only when EVERY line's cumulative ok quantity covers what was ordered.
  SELECT count(*) INTO v_outstanding
    FROM purchase_order_items poi
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(grl.qty_received), 0) AS ok_qty
        FROM goods_receipt_lines grl
       WHERE grl.purchase_order_item_id = poi.id AND grl."condition" = 'ok'
    ) got ON true
   WHERE poi.purchase_order_id = p_po_id
     AND poi.organisation_id = v_org
     AND got.ok_qty < poi.quantity;

  IF v_outstanding = 0 THEN
    UPDATE goods_receipts SET status = 'full' WHERE id = v_receipt;
    UPDATE purchase_orders
       SET status = 'received', received_at = now(), received_by = auth.uid(), updated_at = now()
     WHERE id = p_po_id
     RETURNING * INTO v_po;
  ELSE
    UPDATE purchase_orders SET updated_at = now() WHERE id = p_po_id
     RETURNING * INTO v_po;
  END IF;

  RETURN v_po;
END;
$fn$;

REVOKE ALL ON FUNCTION receive_purchase_order_lines(UUID, JSONB) FROM public;
GRANT EXECUTE ON FUNCTION receive_purchase_order_lines(UUID, JSONB) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. receive_purchase_order — now sugar for "receive everything outstanding".
--    Kept so every existing caller keeps working untouched: the PO list Receive
--    button and POST /api/purchase-orders/[id]/receive with an empty body both
--    behave exactly as before, and now write a proper goods receipt while doing it.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION receive_purchase_order(p_po_id UUID)
RETURNS purchase_orders
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT receive_purchase_order_lines(p_po_id, NULL);
$fn$;

REVOKE ALL ON FUNCTION receive_purchase_order(UUID) FROM public;
GRANT EXECUTE ON FUNCTION receive_purchase_order(UUID) TO authenticated;
