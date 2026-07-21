-- Verification harness for sprint-l-01-asset-log.sql — OPTIONAL, safe.
-- Run AFTER the migration. Mutates NOTHING: wrapped in BEGIN ... ROLLBACK with
-- inner savepoints around the expected-failure cases. Read the NOTICEs: every
-- line should say PASS.
--
-- Proves the two non-trivial DB behaviours:
--   1. the unit+quantity CHECK (tracking_mode='unit' cannot have quantity > 1)
--   2. move_asset_log_item: cross-org target space is rejected; a valid move is
--      atomic (movement row written + item.space_id/site_id updated).
--
-- Needs one org with at least one site and one space. Uses the FIRST org found.

BEGIN;
DO $$
DECLARE
  v_org   uuid;
  v_user  uuid;
  v_site  uuid;
  v_space uuid;
  v_item  uuid;
  v_moved record;
  v_ok    boolean;
BEGIN
  SELECT id INTO v_org FROM public.organisations LIMIT 1;
  SELECT id INTO v_user FROM public.users WHERE organisation_id = v_org LIMIT 1;
  SELECT s.id, sp.id INTO v_site, v_space
    FROM public.sites s JOIN public.spaces sp ON sp.site_id = s.id
   WHERE s.organisation_id = v_org LIMIT 1;

  IF v_org IS NULL OR v_user IS NULL OR v_space IS NULL THEN
    RAISE NOTICE 'SKIP: need one org with a site + space and a user';
    RETURN;
  END IF;

  -- 1) unit + quantity > 1 must be rejected by the CHECK.
  v_ok := true;
  BEGIN
    INSERT INTO public.asset_log_items (organisation_id, name, tracking_mode, quantity)
    VALUES (v_org, 'test-unit', 'unit', 5);
    v_ok := false; -- should not reach here
  EXCEPTION WHEN check_violation THEN
    NULL; -- expected
  END;
  IF v_ok THEN RAISE NOTICE 'PASS 1: unit+qty>1 rejected';
  ELSE RAISE WARNING 'FAIL 1: unit+qty>1 was accepted'; END IF;

  -- bulk + quantity > 1 is allowed.
  INSERT INTO public.asset_log_items (organisation_id, name, tracking_mode, quantity)
  VALUES (v_org, 'test-bulk', 'bulk', 40)
  RETURNING id INTO v_item;
  RAISE NOTICE 'PASS 2: bulk+qty=40 accepted';

  -- 2) move_asset_log_item under a simulated authenticated session for v_user.
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub', v_user)::text, true);

  v_moved := move_asset_log_item(v_item, v_space, 'harness move');
  IF v_moved.to_space_id = v_space AND v_moved.item_id = v_item THEN
    RAISE NOTICE 'PASS 3: move wrote a movement row to the target space';
  ELSE
    RAISE WARNING 'FAIL 3: movement row not as expected';
  END IF;

  -- item denormalized location updated atomically
  PERFORM 1 FROM public.asset_log_items
    WHERE id = v_item AND space_id = v_space AND site_id = v_site;
  IF FOUND THEN RAISE NOTICE 'PASS 4: item.space_id/site_id updated';
  ELSE RAISE WARNING 'FAIL 4: item location not updated'; END IF;

  -- cross-org space rejected: fabricate a space id from another org if one exists.
  DECLARE v_other_space uuid;
  BEGIN
    SELECT sp.id INTO v_other_space
      FROM public.spaces sp JOIN public.sites s ON s.id = sp.site_id
     WHERE s.organisation_id <> v_org LIMIT 1;
    IF v_other_space IS NULL THEN
      RAISE NOTICE 'SKIP 5: no second org space to test cross-org rejection';
    ELSE
      v_ok := true;
      BEGIN
        PERFORM move_asset_log_item(v_item, v_other_space, 'cross-org');
        v_ok := false;
      EXCEPTION WHEN OTHERS THEN NULL; END;
      IF v_ok THEN RAISE NOTICE 'PASS 5: cross-org target space rejected';
      ELSE RAISE WARNING 'FAIL 5: cross-org target space accepted'; END IF;
    END IF;
  END;
END $$;
ROLLBACK;
