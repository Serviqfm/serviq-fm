-- Verification harness for procurement-10-stock-returns.sql — OPTIONAL, safe.
-- Run AFTER the migration. Mutates NOTHING: wrapped in BEGIN ... ROLLBACK.
-- Read the NOTICEs: every non-SKIP line should say PASS.
--
-- Proves, against a fresh item with stock 10 and a cost center:
--   1. approving a stock requisition issues it AND charges the cost center's ACTUAL.
--   2. cancelling that approved requisition puts the stock back, writes a
--      'return_requisition' ledger row, and takes the money back off ACTUAL.
--   3. cancelling while still pending only releases the hold — no return row.
--
-- Needs one org with an admin/manager and a cost center.

BEGIN;
DO $harness$
DECLARE
  v_org     uuid;
  v_user    uuid;
  v_cc      uuid;
  v_item    uuid;
  v_rule    uuid;
  v_req     uuid;
  v_stock   numeric;
  v_res     numeric;
  v_actual0 numeric;
  v_actual1 numeric;
  v_actual2 numeric;
  v_n       int;
BEGIN
  SELECT id INTO v_org FROM public.organisations ORDER BY created_at LIMIT 1;
  SELECT id INTO v_user FROM public.users
    WHERE organisation_id = v_org AND role IN ('admin','manager') LIMIT 1;
  SELECT id INTO v_cc FROM public.cost_centers WHERE organisation_id = v_org LIMIT 1;
  IF v_org IS NULL OR v_user IS NULL OR v_cc IS NULL THEN
    RAISE NOTICE 'SKIP: need an org with an admin/manager and a cost center';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub', v_user)::text, true);
  PERFORM set_config('role', 'authenticated', true);

  UPDATE public.procurement_approval_rules SET is_active = false WHERE organisation_id = v_org;
  INSERT INTO public.procurement_approval_rules (organisation_id, min_amount, max_amount)
    VALUES (v_org, 0, NULL) RETURNING id INTO v_rule;
  INSERT INTO public.procurement_approval_rule_steps (organisation_id, rule_id, step_order, approver_user_id, label)
    VALUES (v_org, v_rule, 1, v_user, 'Harness');

  INSERT INTO public.inventory_items (organisation_id, name, stock_quantity, unit_cost)
    VALUES (v_org, 'Harness: gloves', 10, 7) RETURNING id INTO v_item;

  SELECT actual INTO v_actual0 FROM budget_spend(v_cc, current_date - 1, current_date + 1);

  -- 1) Approve => issued, and charged to the cost center (3 x 7 = 21).
  INSERT INTO public.requisitions (organisation_id, title, cost_center_id, created_by)
    VALUES (v_org, 'Harness: issue + charge', v_cc, v_user) RETURNING id INTO v_req;
  INSERT INTO public.requisition_items (organisation_id, requisition_id, item_id, line_type, quantity, unit_cost)
    VALUES (v_org, v_req, v_item, 'stock', 3, 7);
  PERFORM submit_requisition(v_req);
  PERFORM decide_requisition(v_req, true, NULL);

  SELECT stock_quantity INTO v_stock FROM public.inventory_items WHERE id = v_item;
  SELECT actual INTO v_actual1 FROM budget_spend(v_cc, current_date - 1, current_date + 1);
  IF v_stock = 7 AND v_actual1 - v_actual0 = 21 THEN
    RAISE NOTICE 'PASS 1: issued 3, cost center actual grew by 21';
  ELSE RAISE WARNING 'FAIL 1: stock %, actual delta %', v_stock, v_actual1 - v_actual0; END IF;

  -- 2) Cancel the approved requisition => stock back, ledger row, charge reversed.
  --    The status guard means a workflow-less status change must come from a
  --    service-role caller, which is what the cancel API route is.
  PERFORM set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
  PERFORM set_config('role', 'service_role', true);
  UPDATE public.requisitions SET status = 'cancelled' WHERE id = v_req;
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub', v_user)::text, true);
  PERFORM set_config('role', 'authenticated', true);

  SELECT stock_quantity INTO v_stock FROM public.inventory_items WHERE id = v_item;
  SELECT actual INTO v_actual2 FROM budget_spend(v_cc, current_date - 1, current_date + 1);
  SELECT count(*) INTO v_n FROM public.stock_transactions
   WHERE ref_requisition_id = v_req AND reason = 'return_requisition' AND delta = 3;
  IF v_stock = 10 AND v_n = 1 AND v_actual2 = v_actual0 THEN
    RAISE NOTICE 'PASS 2: cancel returned 3, one return row, charge reversed';
  ELSE RAISE WARNING 'FAIL 2: stock %, return rows %, actual %', v_stock, v_n, v_actual2; END IF;

  -- 3) Cancel while pending => hold released, nothing returned.
  INSERT INTO public.requisitions (organisation_id, title, cost_center_id, created_by)
    VALUES (v_org, 'Harness: cancel pending', v_cc, v_user) RETURNING id INTO v_req;
  INSERT INTO public.requisition_items (organisation_id, requisition_id, item_id, line_type, quantity, unit_cost)
    VALUES (v_org, v_req, v_item, 'stock', 2, 7);
  PERFORM submit_requisition(v_req);

  PERFORM set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
  PERFORM set_config('role', 'service_role', true);
  UPDATE public.requisitions SET status = 'cancelled' WHERE id = v_req;
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub', v_user)::text, true);
  PERFORM set_config('role', 'authenticated', true);

  SELECT stock_quantity, reserved_quantity INTO v_stock, v_res FROM public.inventory_items WHERE id = v_item;
  SELECT count(*) INTO v_n FROM public.stock_transactions WHERE ref_requisition_id = v_req;
  IF v_stock = 10 AND v_res = 0 AND v_n = 0 THEN
    RAISE NOTICE 'PASS 3: cancelling a pending requisition only released the hold';
  ELSE RAISE WARNING 'FAIL 3: stock %, reserved %, ledger rows %', v_stock, v_res, v_n; END IF;
END;
$harness$;
ROLLBACK;
