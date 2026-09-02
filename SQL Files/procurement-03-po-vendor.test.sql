-- Verification harness for procurement-03-po-vendor.sql — OPTIONAL, safe.
-- Run AFTER the migration. Mutates NOTHING: wrapped in BEGIN ... ROLLBACK.
-- Read the NOTICEs: every non-SKIP line should say PASS.
--
-- Proves:
--   1. the widened status vocabulary accepts acknowledged / in_transit, and
--      still rejects a bogus value.
--   2. receive_purchase_order() receives a PO sitting in 'in_transit' — the
--      regression this migration exists to prevent (the shipped function only
--      accepted draft/sent, so an in-flight PO could never be received).
--   3. receiving bumps stock by exactly the ordered qty and writes ONE ledger row.
--   4. a second receive is a no-op (terminal state, idempotent).
--   5. the new vendors columns exist.
--
-- Needs one org with at least one user and one inventory item.

BEGIN;
DO $harness$
DECLARE
  v_org       uuid;
  v_user      uuid;
  v_item      uuid;
  v_po        uuid;
  v_stock0    numeric;
  v_stock1    numeric;
  v_ledger    int;
  v_status    text;
  v_cols      int;
  v_ok        boolean;
BEGIN
  SELECT id INTO v_org FROM public.organisations ORDER BY created_at LIMIT 1;
  SELECT id INTO v_user FROM public.users WHERE organisation_id = v_org LIMIT 1;
  SELECT id, COALESCE(stock_quantity, 0) INTO v_item, v_stock0
    FROM public.inventory_items WHERE organisation_id = v_org LIMIT 1;

  IF v_org IS NULL OR v_user IS NULL OR v_item IS NULL THEN
    RAISE NOTICE 'SKIP: need an org with a user and at least one inventory item';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub', v_user)::text, true);
  PERFORM set_config('role', 'authenticated', true);

  -- 5) New vendor columns.
  SELECT count(*) INTO v_cols FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'vendors'
     AND column_name IN ('payment_terms','bank_name','bank_iban','contract_start','contract_end');
  IF v_cols = 5 THEN RAISE NOTICE 'PASS 5: all five vendor columns exist';
  ELSE RAISE WARNING 'FAIL 5: found % of 5 new vendor columns', v_cols; END IF;

  -- 1) Widened vocabulary.
  INSERT INTO public.purchase_orders (organisation_id, status, created_by)
    VALUES (v_org, 'acknowledged', v_user) RETURNING id INTO v_po;
  UPDATE public.purchase_orders SET status = 'in_transit' WHERE id = v_po;
  SELECT status INTO v_status FROM public.purchase_orders WHERE id = v_po;
  IF v_status = 'in_transit' THEN RAISE NOTICE 'PASS 1a: acknowledged / in_transit accepted';
  ELSE RAISE WARNING 'FAIL 1a: status came back as %', v_status; END IF;

  v_ok := true;
  BEGIN
    UPDATE public.purchase_orders SET status = 'teleported' WHERE id = v_po;
    v_ok := false;
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF v_ok THEN RAISE NOTICE 'PASS 1b: a bogus status is still rejected by the CHECK';
  ELSE RAISE WARNING 'FAIL 1b: CHECK accepted a bogus status'; END IF;

  -- 2 + 3) Receive from in_transit: stock bumped by exactly 5, one ledger row.
  INSERT INTO public.purchase_order_items
    (organisation_id, purchase_order_id, item_id, quantity, unit_cost)
    VALUES (v_org, v_po, v_item, 5, 10);

  PERFORM receive_purchase_order(v_po);

  SELECT status INTO v_status FROM public.purchase_orders WHERE id = v_po;
  SELECT COALESCE(stock_quantity, 0) INTO v_stock1 FROM public.inventory_items WHERE id = v_item;
  SELECT count(*) INTO v_ledger FROM public.stock_transactions WHERE ref_po_id = v_po;

  IF v_status = 'received' THEN RAISE NOTICE 'PASS 2: an in_transit PO was received';
  ELSE RAISE WARNING 'FAIL 2: in_transit PO left at status % — the RPC was not widened', v_status; END IF;

  IF v_stock1 = v_stock0 + 5 AND v_ledger = 1 THEN
    RAISE NOTICE 'PASS 3: stock % -> % and exactly one ledger row', v_stock0, v_stock1;
  ELSE RAISE WARNING 'FAIL 3: stock % -> % (expected +5), % ledger rows (expected 1)',
    v_stock0, v_stock1, v_ledger; END IF;

  -- 4) Second receive is a no-op.
  PERFORM receive_purchase_order(v_po);
  SELECT COALESCE(stock_quantity, 0) INTO v_stock1 FROM public.inventory_items WHERE id = v_item;
  SELECT count(*) INTO v_ledger FROM public.stock_transactions WHERE ref_po_id = v_po;
  IF v_stock1 = v_stock0 + 5 AND v_ledger = 1 THEN
    RAISE NOTICE 'PASS 4: re-receiving a received PO changed nothing';
  ELSE RAISE WARNING 'FAIL 4: double receive drifted stock to % with % ledger rows', v_stock1, v_ledger; END IF;
END $harness$;
ROLLBACK;
