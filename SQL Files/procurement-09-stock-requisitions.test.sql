-- Verification harness for procurement-09-stock-requisitions.sql — OPTIONAL, safe.
-- Run AFTER the migration. Mutates NOTHING: wrapped in BEGIN ... ROLLBACK.
-- Read the NOTICEs: every non-SKIP line should say PASS.
--
-- Against a fresh inventory item with stock 10:
--   1. submitting a stock line of 4 into an approval chain RESERVES 4 (stock stays 10).
--   2. a second requisition for 7 RAISES STOCK_SHORT (only 6 available).
--   3. a reserved line cannot be edited directly.
--   4. rejecting RELEASES the reservation.
--   5. resubmit + final approval ISSUES: stock 6, reserved 0, one ledger row of -4.
--   6. a stock-only, zero-cost requisition submits (no more "no priced lines").
--   7. deleting a pending requisition releases its reservation.
--   8. budget_spend ignores stock lines.
--   9. submit_portal_requisition is NOT callable by an authenticated user.
--
-- Needs one org with an admin/manager.

BEGIN;
DO $harness$
DECLARE
  v_org    uuid;
  v_user   uuid;
  v_item   uuid;
  v_rule   uuid;
  v_req    uuid;
  v_req2   uuid;
  v_cc     uuid;
  v_stock  numeric;
  v_res    numeric;
  v_status text;
  v_n      int;
  v_msg    text;
  v_ok     boolean;
BEGIN
  SELECT id INTO v_org FROM public.organisations ORDER BY created_at LIMIT 1;
  SELECT id INTO v_user FROM public.users
    WHERE organisation_id = v_org AND role IN ('admin','manager') LIMIT 1;
  IF v_org IS NULL OR v_user IS NULL THEN
    RAISE NOTICE 'SKIP: need an org with an admin/manager';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub', v_user)::text, true);
  PERFORM set_config('role', 'authenticated', true);

  -- A one-step chain the harness user approves, so requisitions sit in pending.
  UPDATE public.procurement_approval_rules SET is_active = false WHERE organisation_id = v_org;
  INSERT INTO public.procurement_approval_rules (organisation_id, min_amount, max_amount)
    VALUES (v_org, 0, NULL) RETURNING id INTO v_rule;
  INSERT INTO public.procurement_approval_rule_steps (organisation_id, rule_id, step_order, approver_user_id, label)
    VALUES (v_org, v_rule, 1, v_user, 'Harness');

  INSERT INTO public.inventory_items (organisation_id, name, stock_quantity, unit_cost)
    VALUES (v_org, 'Harness: A4 paper', 10, 0) RETURNING id INTO v_item;

  -- 1) Reserve at submit.
  INSERT INTO public.requisitions (organisation_id, title, created_by)
    VALUES (v_org, 'Harness: stock 4', v_user) RETURNING id INTO v_req;
  INSERT INTO public.requisition_items (organisation_id, requisition_id, item_id, line_type, quantity, unit_cost)
    VALUES (v_org, v_req, v_item, 'stock', 4, 0);
  PERFORM submit_requisition(v_req);
  SELECT stock_quantity, reserved_quantity INTO v_stock, v_res FROM public.inventory_items WHERE id = v_item;
  SELECT status INTO v_status FROM public.requisitions WHERE id = v_req;
  IF v_status = 'pending_approval' AND v_stock = 10 AND v_res = 4 THEN
    RAISE NOTICE 'PASS 1: submit reserved 4, stock untouched (and PASS 6: zero-cost stock-only submits)';
  ELSE RAISE WARNING 'FAIL 1: status % stock % reserved %', v_status, v_stock, v_res; END IF;

  -- 2) Over-asking for what is left raises STOCK_SHORT and holds nothing.
  INSERT INTO public.requisitions (organisation_id, title, created_by)
    VALUES (v_org, 'Harness: stock 7', v_user) RETURNING id INTO v_req2;
  INSERT INTO public.requisition_items (organisation_id, requisition_id, item_id, line_type, quantity, unit_cost)
    VALUES (v_org, v_req2, v_item, 'stock', 7, 0);
  v_msg := NULL;
  BEGIN
    PERFORM submit_requisition(v_req2);
  EXCEPTION WHEN others THEN v_msg := SQLERRM; END;
  SELECT reserved_quantity INTO v_res FROM public.inventory_items WHERE id = v_item;
  IF v_msg LIKE 'STOCK_SHORT|%|7.00|6.00' AND v_res = 4 THEN RAISE NOTICE 'PASS 2: %', v_msg;
  ELSE RAISE WARNING 'FAIL 2: message % reserved %', v_msg, v_res; END IF;

  -- 3) A reserved line is frozen.
  v_ok := true;
  BEGIN
    UPDATE public.requisition_items SET quantity = 1 WHERE requisition_id = v_req;
    v_ok := false;
  EXCEPTION WHEN others THEN NULL; END;
  IF v_ok THEN RAISE NOTICE 'PASS 3: reserved line edit refused';
  ELSE RAISE WARNING 'FAIL 3: edited a line holding reserved stock'; END IF;

  -- 4) Reject releases.
  PERFORM decide_requisition(v_req, false, 'harness reject');
  SELECT reserved_quantity INTO v_res FROM public.inventory_items WHERE id = v_item;
  IF v_res = 0 THEN RAISE NOTICE 'PASS 4: reject released the reservation';
  ELSE RAISE WARNING 'FAIL 4: reserved % after reject', v_res; END IF;

  -- 5) Resubmit, approve => issued.
  PERFORM submit_requisition(v_req);
  PERFORM decide_requisition(v_req, true, NULL);
  SELECT stock_quantity, reserved_quantity INTO v_stock, v_res FROM public.inventory_items WHERE id = v_item;
  SELECT count(*) INTO v_n FROM public.stock_transactions
   WHERE ref_requisition_id = v_req AND reason = 'issue_requisition' AND delta = -4;
  IF v_stock = 6 AND v_res = 0 AND v_n = 1 THEN RAISE NOTICE 'PASS 5: approval issued 4 (stock 6, one ledger row)';
  ELSE RAISE WARNING 'FAIL 5: stock % reserved % ledger rows %', v_stock, v_res, v_n; END IF;

  -- 7) Delete while pending releases.
  UPDATE public.requisition_items SET quantity = 2 WHERE requisition_id = v_req2;
  PERFORM submit_requisition(v_req2);
  SELECT reserved_quantity INTO v_res FROM public.inventory_items WHERE id = v_item;
  DELETE FROM public.requisitions WHERE id = v_req2;
  SELECT reserved_quantity INTO v_stock FROM public.inventory_items WHERE id = v_item;
  IF v_res = 2 AND v_stock = 0 THEN RAISE NOTICE 'PASS 7: deleting a pending requisition released its hold';
  ELSE RAISE WARNING 'FAIL 7: reserved % before delete, % after', v_res, v_stock; END IF;

  -- 8) budget_spend counts the purchase line only.
  SELECT id INTO v_cc FROM public.cost_centers WHERE organisation_id = v_org LIMIT 1;
  IF v_cc IS NULL THEN
    RAISE NOTICE 'SKIP 8: no cost center in this org';
  ELSE
    INSERT INTO public.requisitions (organisation_id, title, cost_center_id, created_by)
      VALUES (v_org, 'Harness: mixed', v_cc, v_user) RETURNING id INTO v_req2;
    INSERT INTO public.requisition_items (organisation_id, requisition_id, item_id, line_type, quantity, unit_cost)
      VALUES (v_org, v_req2, v_item, 'stock', 1, 999),
             (v_org, v_req2, NULL, 'purchase', 1, 100);
    SELECT reserved INTO v_res FROM budget_spend(v_cc, current_date - 1, current_date + 1);
    PERFORM submit_requisition(v_req2);
    PERFORM decide_requisition(v_req2, true, NULL);
    SELECT reserved - v_res INTO v_stock FROM budget_spend(v_cc, current_date - 1, current_date + 1);
    IF v_stock = 100 THEN RAISE NOTICE 'PASS 8: budget reserved grew by the purchase line only';
    ELSE RAISE WARNING 'FAIL 8: reserved grew by %', v_stock; END IF;
  END IF;

  -- 9) The portal submit is service-role only.
  v_ok := true;
  BEGIN
    PERFORM submit_portal_requisition(v_req);
    v_ok := false;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF v_ok THEN RAISE NOTICE 'PASS 9: authenticated cannot call submit_portal_requisition';
  ELSE RAISE WARNING 'FAIL 9: authenticated called the portal submit'; END IF;
END;
$harness$;
ROLLBACK;
