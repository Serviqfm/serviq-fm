-- Verification harness for procurement-05-three-way.sql — OPTIONAL, safe.
-- Run AFTER the migration. Mutates NOTHING: wrapped in BEGIN ... ROLLBACK.
-- Read the NOTICEs: every non-SKIP line should say PASS.
--
-- Proves:
--   1. the three vendor_invoices columns exist, and match_status defaults to
--      'unmatched' on a new row.
--   2. the match_status CHECK rejects a value outside the vocabulary.
--   3. an invoice CANNOT be pointed at another org's purchase order
--      (org-bound composite FK).
--   4. invoice lines cascade away with their invoice.
--   5. a cross-org invoice-line INSERT is refused by RLS.
--
-- The matching LOGIC is not tested here — it lives in web/src/lib/threeWayMatch.ts
-- and is covered by 17 Vitest cases. This harness only proves the shape it runs on.
--
-- Needs two orgs; the first needs a user and a vendor.

BEGIN;
DO $harness$
DECLARE
  v_org_a  uuid;
  v_org_b  uuid;
  v_user   uuid;
  v_vendor uuid;
  v_po_b   uuid;
  v_inv    uuid;
  v_cols   int;
  v_match  text;
  v_n      int;
  v_ok     boolean;
BEGIN
  SELECT id INTO v_org_a FROM public.organisations ORDER BY created_at LIMIT 1;
  SELECT id INTO v_org_b FROM public.organisations WHERE id <> v_org_a LIMIT 1;
  SELECT id INTO v_user FROM public.users WHERE organisation_id = v_org_a LIMIT 1;
  SELECT id INTO v_vendor FROM public.vendors WHERE organisation_id = v_org_a LIMIT 1;

  IF v_org_a IS NULL OR v_org_b IS NULL OR v_user IS NULL OR v_vendor IS NULL THEN
    RAISE NOTICE 'SKIP: need two orgs, plus a user and a vendor in the first';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub', v_user)::text, true);
  PERFORM set_config('role', 'authenticated', true);

  -- 1) Columns exist, and a new invoice starts unmatched.
  SELECT count(*) INTO v_cols FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'vendor_invoices'
     AND column_name IN ('purchase_order_id','match_status','match_detail');

  INSERT INTO public.vendor_invoices (organisation_id, vendor_id, invoice_number, amount)
  VALUES (v_org_a, v_vendor, 'HARNESS-001', 1100)
  RETURNING id, match_status INTO v_inv, v_match;

  IF v_cols = 3 AND v_match = 'unmatched' THEN
    RAISE NOTICE 'PASS 1: all three columns exist and match_status defaults to unmatched';
  ELSE RAISE WARNING 'FAIL 1: % of 3 columns, default match_status = %', v_cols, v_match; END IF;

  -- 2) The CHECK holds the vocabulary.
  v_ok := true;
  BEGIN
    UPDATE public.vendor_invoices SET match_status = 'probably_fine' WHERE id = v_inv;
    v_ok := false;
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF v_ok THEN RAISE NOTICE 'PASS 2: an invalid match_status is rejected';
  ELSE RAISE WARNING 'FAIL 2: CHECK accepted a bogus match_status'; END IF;

  -- 3) Cross-org PO link refused by the composite FK.
  INSERT INTO public.purchase_orders (organisation_id, status)
    VALUES (v_org_b, 'sent') RETURNING id INTO v_po_b;
  v_ok := true;
  BEGIN
    UPDATE public.vendor_invoices SET purchase_order_id = v_po_b WHERE id = v_inv;
    v_ok := false;
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  IF v_ok THEN RAISE NOTICE 'PASS 3: an invoice cannot reference another org''s purchase order';
  ELSE RAISE WARNING 'FAIL 3: linked an invoice to a foreign org purchase order'; END IF;

  -- 4) Lines cascade with the invoice.
  INSERT INTO public.vendor_invoice_lines
    (organisation_id, vendor_invoice_id, description, quantity, unit_price)
  VALUES (v_org_a, v_inv, 'Harness line', 10, 100);

  DELETE FROM public.vendor_invoices WHERE id = v_inv;
  SELECT count(*) INTO v_n FROM public.vendor_invoice_lines WHERE vendor_invoice_id = v_inv;
  IF v_n = 0 THEN RAISE NOTICE 'PASS 4: invoice lines cascaded away with their invoice';
  ELSE RAISE WARNING 'FAIL 4: % orphaned line(s) left behind', v_n; END IF;

  -- 5) Cross-org line INSERT refused by RLS.
  INSERT INTO public.vendor_invoices (organisation_id, vendor_id, invoice_number, amount)
  VALUES (v_org_a, v_vendor, 'HARNESS-002', 50) RETURNING id INTO v_inv;
  v_ok := true;
  BEGIN
    INSERT INTO public.vendor_invoice_lines
      (organisation_id, vendor_invoice_id, description, quantity, unit_price)
    VALUES (v_org_b, v_inv, 'Foreign org line', 1, 1);
    v_ok := false;
  EXCEPTION WHEN insufficient_privilege OR foreign_key_violation THEN NULL; END;
  IF v_ok THEN RAISE NOTICE 'PASS 5: a cross-org invoice line is refused';
  ELSE RAISE WARNING 'FAIL 5: wrote an invoice line claiming another org'; END IF;
END $harness$;
ROLLBACK;
