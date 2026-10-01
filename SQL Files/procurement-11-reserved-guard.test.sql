-- Verification harness for procurement-11-reserved-guard.sql — OPTIONAL, safe.
-- Run AFTER the migration. Mutates NOTHING: wrapped in BEGIN ... ROLLBACK.
-- Read the NOTICEs: every non-SKIP line should say PASS.
--
-- Against an item with stock 10, of which 4 are held by a pending requisition:
--   1. adjusting down to 3 is REFUSED, and the message carries item/attempted/held.
--   2. adjusting down to 4 (exactly the held amount) is allowed.
--   3. adjusting UP is always allowed.
--   4. the issue at final approval still works — it lowers stock and the
--      reservation together, which the guard must not mistake for an adjustment.
--
-- Needs one org with an admin/manager.

BEGIN;
DO $harness$
DECLARE
  v_org   uuid;
  v_user  uuid;
  v_item  uuid;
  v_rule  uuid;
  v_req   uuid;
  v_stock numeric;
  v_res   numeric;
  v_msg   text;
  v_ok    boolean;
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

  UPDATE public.procurement_approval_rules SET is_active = false WHERE organisation_id = v_org;
  INSERT INTO public.procurement_approval_rules (organisation_id, min_amount, max_amount)
    VALUES (v_org, 0, NULL) RETURNING id INTO v_rule;
  INSERT INTO public.procurement_approval_rule_steps (organisation_id, rule_id, step_order, approver_user_id, label)
    VALUES (v_org, v_rule, 1, v_user, 'Harness');

  INSERT INTO public.inventory_items (organisation_id, name, stock_quantity, unit_cost)
    VALUES (v_org, 'Harness: mop heads', 10, 5) RETURNING id INTO v_item;

  INSERT INTO public.requisitions (organisation_id, title, created_by)
    VALUES (v_org, 'Harness: holds 4', v_user) RETURNING id INTO v_req;
  INSERT INTO public.requisition_items (organisation_id, requisition_id, item_id, line_type, quantity, unit_cost)
    VALUES (v_org, v_req, v_item, 'stock', 4, 5);
  PERFORM submit_requisition(v_req);

  -- 1) Down to 3 with 4 held => refused.
  v_msg := NULL;
  BEGIN
    UPDATE public.inventory_items SET stock_quantity = 3 WHERE id = v_item;
  EXCEPTION WHEN others THEN v_msg := SQLERRM; END;
  SELECT stock_quantity INTO v_stock FROM public.inventory_items WHERE id = v_item;
  IF v_msg LIKE 'STOCK_RESERVED|%|3%|4%' AND v_stock = 10 THEN
    RAISE NOTICE 'PASS 1: refused — %', v_msg;
  ELSE RAISE WARNING 'FAIL 1: message %, stock now %', v_msg, v_stock; END IF;

  -- 2) Down to exactly what is held => allowed.
  v_ok := true;
  BEGIN
    UPDATE public.inventory_items SET stock_quantity = 4 WHERE id = v_item;
  EXCEPTION WHEN others THEN v_ok := false; END;
  SELECT stock_quantity INTO v_stock FROM public.inventory_items WHERE id = v_item;
  IF v_ok AND v_stock = 4 THEN RAISE NOTICE 'PASS 2: down to the held quantity allowed';
  ELSE RAISE WARNING 'FAIL 2: ok %, stock %', v_ok, v_stock; END IF;

  -- 3) Up is always fine.
  UPDATE public.inventory_items SET stock_quantity = 12 WHERE id = v_item;
  SELECT stock_quantity INTO v_stock FROM public.inventory_items WHERE id = v_item;
  IF v_stock = 12 THEN RAISE NOTICE 'PASS 3: increases are never blocked';
  ELSE RAISE WARNING 'FAIL 3: stock %', v_stock; END IF;

  -- 4) The issue path lowers stock AND the reservation — must still pass.
  PERFORM decide_requisition(v_req, true, NULL);
  SELECT stock_quantity, reserved_quantity INTO v_stock, v_res FROM public.inventory_items WHERE id = v_item;
  IF v_stock = 8 AND v_res = 0 THEN RAISE NOTICE 'PASS 4: approval still issued 4 (stock 8, nothing held)';
  ELSE RAISE WARNING 'FAIL 4: stock %, reserved %', v_stock, v_res; END IF;
END;
$harness$;
ROLLBACK;
