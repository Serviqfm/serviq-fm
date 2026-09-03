-- Verification harness for procurement-04-goods-receipt.sql — OPTIONAL, safe.
-- Run AFTER the migration. Mutates NOTHING: wrapped in BEGIN ... ROLLBACK.
-- Read the NOTICEs: every non-SKIP line should say PASS.
--
-- Proves:
--   1. a PARTIAL receipt bumps stock by exactly the ok qty and leaves the PO OPEN.
--   2. damaged / short lines are recorded but NEVER move stock.
--   3. ledger rows carry ref_goods_receipt_id.
--   4. a second receipt that completes the order flips the PO to 'received'.
--   5. over-receipt (more than ordered) raises.
--   6. receiving another org's PO raises.
--   7. the old all-or-nothing receive_purchase_order() still works and now
--      writes a real goods receipt.
--
-- Needs two orgs; the first needs a user and at least one inventory item.

BEGIN;
DO $harness$
DECLARE
  v_org_a   uuid;
  v_org_b   uuid;
  v_user    uuid;
  v_item    uuid;
  v_po      uuid;
  v_po2     uuid;
  v_po_b    uuid;
  v_poi     uuid;
  v_poi2    uuid;
  v_stock0  numeric;
  v_stock   numeric;
  v_status  text;
  v_n       int;
  v_ok      boolean;
BEGIN
  SELECT id INTO v_org_a FROM public.organisations ORDER BY created_at LIMIT 1;
  SELECT id INTO v_org_b FROM public.organisations WHERE id <> v_org_a LIMIT 1;
  SELECT id INTO v_user FROM public.users WHERE organisation_id = v_org_a LIMIT 1;
  SELECT id, COALESCE(stock_quantity, 0) INTO v_item, v_stock0
    FROM public.inventory_items WHERE organisation_id = v_org_a LIMIT 1;

  IF v_org_a IS NULL OR v_org_b IS NULL OR v_user IS NULL OR v_item IS NULL THEN
    RAISE NOTICE 'SKIP: need two orgs, plus a user and an inventory item in the first';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub', v_user)::text, true);
  PERFORM set_config('role', 'authenticated', true);

  -- A PO for 10 of the item, plus a second line of 4 to exercise partial completion.
  INSERT INTO public.purchase_orders (organisation_id, status, created_by)
    VALUES (v_org_a, 'in_transit', v_user) RETURNING id INTO v_po;
  INSERT INTO public.purchase_order_items (organisation_id, purchase_order_id, item_id, quantity, unit_cost)
    VALUES (v_org_a, v_po, v_item, 10, 5) RETURNING id INTO v_poi;
  INSERT INTO public.purchase_order_items (organisation_id, purchase_order_id, item_id, quantity, unit_cost)
    VALUES (v_org_a, v_po, v_item, 4, 5) RETURNING id INTO v_poi2;

  -- 1 + 2) Partial: 6 ok of line 1, and 2 DAMAGED of line 2. Only the 6 move.
  PERFORM receive_purchase_order_lines(v_po, jsonb_build_array(
    jsonb_build_object('purchase_order_item_id', v_poi,  'qty_received', 6, 'condition', 'ok', 'bin_location', 'A-01'),
    jsonb_build_object('purchase_order_item_id', v_poi2, 'qty_received', 2, 'condition', 'damaged')
  ));

  SELECT COALESCE(stock_quantity, 0) INTO v_stock FROM public.inventory_items WHERE id = v_item;
  SELECT status INTO v_status FROM public.purchase_orders WHERE id = v_po;
  IF v_stock = v_stock0 + 6 THEN RAISE NOTICE 'PASS 1a: stock moved by exactly the ok qty (% -> %)', v_stock0, v_stock;
  ELSE RAISE WARNING 'FAIL 1a: stock % -> % (expected +6)', v_stock0, v_stock; END IF;

  IF v_status = 'in_transit' THEN RAISE NOTICE 'PASS 1b: a partial receipt left the PO open';
  ELSE RAISE WARNING 'FAIL 1b: PO went to % on a partial receipt', v_status; END IF;

  SELECT count(*) INTO v_n FROM public.stock_transactions WHERE ref_po_id = v_po;
  IF v_n = 1 THEN RAISE NOTICE 'PASS 2: the damaged line wrote no ledger row';
  ELSE RAISE WARNING 'FAIL 2: % ledger rows, expected 1 (damaged qty moved stock)', v_n; END IF;

  -- 3) Ledger points at the receipt.
  SELECT count(*) INTO v_n FROM public.stock_transactions
   WHERE ref_po_id = v_po AND ref_goods_receipt_id IS NOT NULL;
  IF v_n = 1 THEN RAISE NOTICE 'PASS 3: ledger row references its goods receipt';
  ELSE RAISE WARNING 'FAIL 3: % ledger rows carry ref_goods_receipt_id', v_n; END IF;

  -- 5) Over-receipt on line 1: 6 already ok, ordered 10, asking for 5 more.
  v_ok := true;
  BEGIN
    PERFORM receive_purchase_order_lines(v_po, jsonb_build_array(
      jsonb_build_object('purchase_order_item_id', v_poi, 'qty_received', 5, 'condition', 'ok')));
    v_ok := false;
  EXCEPTION WHEN others THEN NULL; END;
  IF v_ok THEN RAISE NOTICE 'PASS 5: over-receipt refused';
  ELSE RAISE WARNING 'FAIL 5: accepted more than the ordered quantity'; END IF;

  -- 4) Complete it: the outstanding 4 of line 1 and all 4 of line 2.
  PERFORM receive_purchase_order_lines(v_po, jsonb_build_array(
    jsonb_build_object('purchase_order_item_id', v_poi,  'qty_received', 4, 'condition', 'ok'),
    jsonb_build_object('purchase_order_item_id', v_poi2, 'qty_received', 4, 'condition', 'ok')
  ));
  SELECT status INTO v_status FROM public.purchase_orders WHERE id = v_po;
  SELECT COALESCE(stock_quantity, 0) INTO v_stock FROM public.inventory_items WHERE id = v_item;
  IF v_status = 'received' AND v_stock = v_stock0 + 14 THEN
    RAISE NOTICE 'PASS 4: the completing receipt flipped the PO to received (stock +14)';
  ELSE RAISE WARNING 'FAIL 4: status %, stock % (expected received, %)', v_status, v_stock, v_stock0 + 14; END IF;

  -- 6) Cross-org receive raises.
  INSERT INTO public.purchase_orders (organisation_id, status)
    VALUES (v_org_b, 'sent') RETURNING id INTO v_po_b;
  v_ok := true;
  BEGIN
    PERFORM receive_purchase_order_lines(v_po_b, NULL);
    v_ok := false;
  EXCEPTION WHEN others THEN NULL; END;
  IF v_ok THEN RAISE NOTICE 'PASS 6: receiving another org''s PO raised';
  ELSE RAISE WARNING 'FAIL 6: received a PO belonging to another org'; END IF;

  -- 7) The legacy all-or-nothing entry point still works, via a real receipt.
  INSERT INTO public.purchase_orders (organisation_id, status, created_by)
    VALUES (v_org_a, 'sent', v_user) RETURNING id INTO v_po2;
  INSERT INTO public.purchase_order_items (organisation_id, purchase_order_id, item_id, quantity, unit_cost)
    VALUES (v_org_a, v_po2, v_item, 3, 5);
  PERFORM receive_purchase_order(v_po2);
  SELECT status INTO v_status FROM public.purchase_orders WHERE id = v_po2;
  SELECT count(*) INTO v_n FROM public.goods_receipts WHERE purchase_order_id = v_po2;
  SELECT COALESCE(stock_quantity, 0) INTO v_stock FROM public.inventory_items WHERE id = v_item;
  IF v_status = 'received' AND v_n = 1 AND v_stock = v_stock0 + 17 THEN
    RAISE NOTICE 'PASS 7: receive_purchase_order() still receives all, and wrote a goods receipt';
  ELSE RAISE WARNING 'FAIL 7: status %, % receipts, stock % (expected received, 1, %)',
    v_status, v_n, v_stock, v_stock0 + 17; END IF;
END $harness$;
ROLLBACK;
