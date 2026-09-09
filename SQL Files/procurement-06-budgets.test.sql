-- Verification harness for procurement-06-budgets.sql — OPTIONAL, safe.
-- Run AFTER the migration. Mutates NOTHING: wrapped in BEGIN ... ROLLBACK.
-- Read the NOTICEs: every non-SKIP line should say PASS.
--
-- Proves, against a cost center with a 1000 budget for today:
--   1. a cost center with NO period is not budget-controlled — submit succeeds
--      (the permissive default; this is what every existing tenant sees).
--   2. a submit landing at 76% succeeds.
--   3. a submit that would land over 100% RAISES, and the message carries the
--      numbers (BUDGET_EXCEEDED|requested|reserved|actual|budget).
--   4. an approved requisition shows up in RESERVED, not in actual.
--   5. converting to a PO does not double-count: reserved stays put rather than
--      counting the requisition and its purchase order at once.
--
-- Needs one org with a user and a cost center.

BEGIN;
DO $harness$
DECLARE
  v_org      uuid;
  v_user     uuid;
  v_cc       uuid;
  v_req      uuid;
  v_po       uuid;
  v_reserved numeric;
  v_actual   numeric;
  v_status   text;
  v_msg      text;
  v_ok       boolean;
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

  -- Approval bands would add noise; this harness is about the budget only.
  UPDATE public.procurement_approval_rules SET is_active = false WHERE organisation_id = v_org;

  -- 1) No period yet => no budget control. A 5000 requisition sails through.
  INSERT INTO public.requisitions (organisation_id, title, cost_center_id, created_by)
    VALUES (v_org, 'Harness: no period', v_cc, v_user) RETURNING id INTO v_req;
  INSERT INTO public.requisition_items (organisation_id, requisition_id, description, quantity, unit_cost)
    VALUES (v_org, v_req, 'line', 1, 5000);
  PERFORM submit_requisition(v_req);
  SELECT status INTO v_status FROM public.requisitions WHERE id = v_req;
  IF v_status = 'approved' THEN RAISE NOTICE 'PASS 1: no period => not budget-controlled';
  ELSE RAISE WARNING 'FAIL 1: status % without any budget period', v_status; END IF;

  -- That 5000 is now approved spend, so start the budget on a clean slate by
  -- parking it outside the period we are about to create.
  UPDATE public.requisitions SET submitted_at = current_date - 400 WHERE id = v_req;

  -- A 1000 budget covering today.
  INSERT INTO public.budget_periods (organisation_id, cost_center_id, period, starts_on, ends_on, amount)
    VALUES (v_org, v_cc, 'annual', current_date - 30, current_date + 30, 1000);

  -- 2) 760 of 1000 = 76% — allowed.
  INSERT INTO public.requisitions (organisation_id, title, cost_center_id, created_by)
    VALUES (v_org, 'Harness: 76pct', v_cc, v_user) RETURNING id INTO v_req;
  INSERT INTO public.requisition_items (organisation_id, requisition_id, description, quantity, unit_cost)
    VALUES (v_org, v_req, 'line', 1, 760);
  PERFORM submit_requisition(v_req);
  SELECT status INTO v_status FROM public.requisitions WHERE id = v_req;
  IF v_status = 'approved' THEN RAISE NOTICE 'PASS 2: a submit landing at 76%% succeeded';
  ELSE RAISE WARNING 'FAIL 2: 76%% submit left status %', v_status; END IF;

  -- 4) That approved requisition is RESERVED, not actual.
  SELECT b.reserved, b.actual INTO v_reserved, v_actual
    FROM budget_spend(v_cc, current_date - 30, current_date + 30) b;
  IF v_reserved = 760 AND v_actual = 0 THEN
    RAISE NOTICE 'PASS 4: approved requisition counted as reserved 760, actual 0';
  ELSE RAISE WARNING 'FAIL 4: reserved %, actual % (expected 760 / 0)', v_reserved, v_actual; END IF;

  -- 3) Another 500 would land at 1260 of 1000 — refused, with the numbers.
  INSERT INTO public.requisitions (organisation_id, title, cost_center_id, created_by)
    VALUES (v_org, 'Harness: over', v_cc, v_user) RETURNING id INTO v_req;
  INSERT INTO public.requisition_items (organisation_id, requisition_id, description, quantity, unit_cost)
    VALUES (v_org, v_req, 'line', 1, 500);
  v_ok := true;
  BEGIN
    PERFORM submit_requisition(v_req);
    v_ok := false;
  EXCEPTION WHEN others THEN v_msg := SQLERRM; END;
  IF v_ok AND v_msg LIKE 'BUDGET_EXCEEDED|%' THEN
    RAISE NOTICE 'PASS 3: over-budget submit refused — %', v_msg;
  ELSIF v_ok THEN
    RAISE WARNING 'FAIL 3: refused, but not with the parseable message: %', v_msg;
  ELSE
    RAISE WARNING 'FAIL 3: an over-budget requisition was accepted';
  END IF;

  -- 5) Converting the 760 requisition to a PO must not count it twice.
  SELECT id INTO v_req FROM public.requisitions
   WHERE organisation_id = v_org AND title = 'Harness: 76pct' LIMIT 1;
  INSERT INTO public.purchase_orders (organisation_id, status, created_by, requisition_id)
    VALUES (v_org, 'draft', v_user, v_req) RETURNING id INTO v_po;
  INSERT INTO public.purchase_order_items (organisation_id, purchase_order_id, description, quantity, unit_cost)
    VALUES (v_org, v_po, 'line', 1, 760);
  PERFORM set_config('app.requisition_rpc', '1', true);
  UPDATE public.requisitions SET status = 'converted', purchase_order_id = v_po WHERE id = v_req;

  SELECT b.reserved, b.actual INTO v_reserved, v_actual
    FROM budget_spend(v_cc, current_date - 30, current_date + 30) b;
  IF v_reserved = 760 THEN
    RAISE NOTICE 'PASS 5: conversion handed reserved over to the PO — still 760, not 1520';
  ELSE RAISE WARNING 'FAIL 5: reserved % after conversion (expected 760)', v_reserved; END IF;
END $harness$;
ROLLBACK;
