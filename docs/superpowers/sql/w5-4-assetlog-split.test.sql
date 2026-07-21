-- Verification harness for w5-4-assetlog-split.sql — OPTIONAL, safe.
-- Run AFTER the migration. Mutates NOTHING: wrapped in BEGIN ... ROLLBACK.
-- Read the NOTICEs: every line should say PASS.
--
-- Proves split_asset_log_item:
--   * splits a bulk batch atomically (source decremented + new item with the moved
--     quantity + a movement row), source location unchanged.
--   * rejects p_quantity >= available and p_quantity < 1.
--   * rejects a target space in another org.
--
-- Needs one org with at least one site and one space. Uses the FIRST org found.

BEGIN;
DO $$
DECLARE
  v_org    uuid;
  v_user   uuid;
  v_site   uuid;
  v_space  uuid;
  v_item   uuid;
  v_new    asset_log_items%ROWTYPE;
  v_srcqty int;
  v_ok     boolean;
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

  -- bulk batch of 10, left in storage (space_id NULL).
  INSERT INTO public.asset_log_items (organisation_id, name, tracking_mode, quantity)
  VALUES (v_org, 'test-split-bulk', 'bulk', 10)
  RETURNING id INTO v_item;

  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub', v_user)::text, true);

  -- 1) split 3 of 10 to v_space.
  v_new := split_asset_log_item(v_item, v_space, 3, 'harness split');
  IF v_new.quantity = 3 AND v_new.space_id = v_space AND v_new.site_id = v_site THEN
    RAISE NOTICE 'PASS 1: new batch has qty 3 at the target space';
  ELSE
    RAISE WARNING 'FAIL 1: new batch not as expected (qty=%, space=%)', v_new.quantity, v_new.space_id;
  END IF;

  -- 2) source decremented to 7 and DID NOT move.
  SELECT quantity INTO v_srcqty FROM public.asset_log_items WHERE id = v_item AND space_id IS NULL;
  IF v_srcqty = 7 THEN RAISE NOTICE 'PASS 2: source decremented to 7, stayed put';
  ELSE RAISE WARNING 'FAIL 2: source qty=% (expected 7) or moved', v_srcqty; END IF;

  -- 3) movement row written for the new batch.
  PERFORM 1 FROM public.asset_log_movements
    WHERE item_id = v_new.id AND to_space_id = v_space AND quantity = 3;
  IF FOUND THEN RAISE NOTICE 'PASS 3: movement row written for the split batch';
  ELSE RAISE WARNING 'FAIL 3: no movement row for split batch'; END IF;

  -- 4) splitting the full remaining quantity is rejected (use move instead).
  v_ok := true;
  BEGIN
    PERFORM split_asset_log_item(v_item, v_space, 7, 'full');
    v_ok := false;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  IF v_ok THEN RAISE NOTICE 'PASS 4: p_quantity >= available rejected';
  ELSE RAISE WARNING 'FAIL 4: full-quantity split was accepted'; END IF;

  -- 5) zero/negative quantity rejected.
  v_ok := true;
  BEGIN
    PERFORM split_asset_log_item(v_item, v_space, 0, 'zero');
    v_ok := false;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  IF v_ok THEN RAISE NOTICE 'PASS 5: p_quantity < 1 rejected';
  ELSE RAISE WARNING 'FAIL 5: zero-quantity split was accepted'; END IF;

  -- 6) cross-org target space rejected.
  DECLARE v_other_space uuid;
  BEGIN
    SELECT sp.id INTO v_other_space
      FROM public.spaces sp JOIN public.sites s ON s.id = sp.site_id
     WHERE s.organisation_id <> v_org LIMIT 1;
    IF v_other_space IS NULL THEN
      RAISE NOTICE 'SKIP 6: no second org space to test cross-org rejection';
    ELSE
      v_ok := true;
      BEGIN
        PERFORM split_asset_log_item(v_item, v_other_space, 2, 'cross-org');
        v_ok := false;
      EXCEPTION WHEN OTHERS THEN NULL; END;
      IF v_ok THEN RAISE NOTICE 'PASS 6: cross-org target space rejected';
      ELSE RAISE WARNING 'FAIL 6: cross-org target space accepted'; END IF;
    END IF;
  END;
END $$;
ROLLBACK;
