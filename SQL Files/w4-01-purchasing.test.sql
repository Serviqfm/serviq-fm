-- Verification harness for w4-01-purchasing.sql — OPTIONAL, safe.
-- Run AFTER the migration. Mutates NOTHING: wrapped in BEGIN ... ROLLBACK with an
-- inner savepoint around the expected-failure case. Read the NOTICEs: every line
-- should say PASS (or SKIP when the fixture data isn't present).
--
-- Proves the non-trivial DB behaviour:
--   1. receive_purchase_order flips status→received, writes one stock_transactions
--      row per line, and increments inventory_items.stock_quantity.
--   2. a second receive is a no-op (idempotent) — stock is not double-counted.
--   3. receiving another org's PO is rejected.
--
-- Needs one org with a user and at least one inventory item. Uses the FIRST org found.

BEGIN;
DO $$
DECLARE
  v_org    uuid;
  v_user   uuid;
  v_item   uuid;
  v_qty0   numeric;
  v_po     uuid;
  v_res    record;
  v_txcount int;
  v_qty1   numeric;
  v_ok     boolean;
BEGIN
  SELECT id INTO v_org FROM public.organisations LIMIT 1;
  SELECT id INTO v_user FROM public.users WHERE organisation_id = v_org LIMIT 1;
  SELECT id, COALESCE(stock_quantity,0) INTO v_item, v_qty0
    FROM public.inventory_items WHERE organisation_id = v_org LIMIT 1;

  IF v_org IS NULL OR v_user IS NULL OR v_item IS NULL THEN
    RAISE NOTICE 'SKIP: need one org with a user and an inventory item';
    RETURN;
  END IF;

  -- Simulate an authenticated session for v_user (so auth.uid() resolves).
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub', v_user)::text, true);

  -- Build a draft PO with one line of qty 7 against v_item.
  INSERT INTO public.purchase_orders (organisation_id, status, created_by)
  VALUES (v_org, 'draft', v_user) RETURNING id INTO v_po;
  INSERT INTO public.purchase_order_items (organisation_id, purchase_order_id, item_id, quantity, unit_cost)
  VALUES (v_org, v_po, v_item, 7, 10);

  -- 1) Receive it.
  v_res := receive_purchase_order(v_po);
  IF v_res.status = 'received' THEN RAISE NOTICE 'PASS 1: PO marked received';
  ELSE RAISE WARNING 'FAIL 1: PO status is %', v_res.status; END IF;

  SELECT COUNT(*) INTO v_txcount FROM public.stock_transactions WHERE ref_po_id = v_po;
  IF v_txcount = 1 THEN RAISE NOTICE 'PASS 2: one ledger row written';
  ELSE RAISE WARNING 'FAIL 2: expected 1 ledger row, got %', v_txcount; END IF;

  SELECT COALESCE(stock_quantity,0) INTO v_qty1 FROM public.inventory_items WHERE id = v_item;
  IF v_qty1 = v_qty0 + 7 THEN RAISE NOTICE 'PASS 3: stock incremented by 7';
  ELSE RAISE WARNING 'FAIL 3: stock % expected %', v_qty1, v_qty0 + 7; END IF;

  -- 2) Second receive is a no-op: stock unchanged, no new ledger row.
  PERFORM receive_purchase_order(v_po);
  SELECT COALESCE(stock_quantity,0) INTO v_qty1 FROM public.inventory_items WHERE id = v_item;
  SELECT COUNT(*) INTO v_txcount FROM public.stock_transactions WHERE ref_po_id = v_po;
  IF v_qty1 = v_qty0 + 7 AND v_txcount = 1 THEN RAISE NOTICE 'PASS 4: re-receive is idempotent';
  ELSE RAISE WARNING 'FAIL 4: re-receive changed state (qty %, rows %)', v_qty1, v_txcount; END IF;

  -- 3) Cross-org PO rejected: fabricate a PO in another org if one exists.
  DECLARE v_other_org uuid; v_other_po uuid;
  BEGIN
    SELECT id INTO v_other_org FROM public.organisations WHERE id <> v_org LIMIT 1;
    IF v_other_org IS NULL THEN
      RAISE NOTICE 'SKIP 5: no second org to test cross-org rejection';
    ELSE
      INSERT INTO public.purchase_orders (organisation_id, status)
      VALUES (v_other_org, 'draft') RETURNING id INTO v_other_po;
      v_ok := true;
      BEGIN
        PERFORM receive_purchase_order(v_other_po);
        v_ok := false;
      EXCEPTION WHEN OTHERS THEN NULL; END;
      IF v_ok THEN RAISE NOTICE 'PASS 5: cross-org PO receive rejected';
      ELSE RAISE WARNING 'FAIL 5: cross-org PO receive accepted'; END IF;
    END IF;
  END;
END $$;
ROLLBACK;
