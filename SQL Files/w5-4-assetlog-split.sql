-- AG-12 — Asset Log batch split: partial-quantity move/transfer.
-- Run in the Supabase SQL editor AFTER sprint-l-01-asset-log.sql. Idempotent.
--
-- Problem: a bulk (tracking_mode='bulk', quantity>1) Asset Log batch could only be
-- moved as a whole via move_asset_log_item. This adds split_asset_log_item, which
-- moves FEWER than the full quantity to a new location by splitting the batch:
--   * decrement the source batch quantity by p_quantity (source stays put), AND
--   * insert a NEW asset_log_item (all descriptive/cost/warranty/condition
--     attributes copied, fresh qr_token/item_number) holding p_quantity at the
--     target space, AND
--   * write a movement row for the new batch (from source space -> target space).
-- All three happen in one function call = one transaction (atomic under RLS).
--
-- Guards (raise, so the whole tx rolls back — no partial split):
--   * caller must be authenticated and own the item's org (same as move RPC).
--   * p_quantity >= 1.
--   * p_quantity < source quantity (can't move more than available; moving the FULL
--     quantity is a plain move — callers use move_asset_log_item for that).
--   * target space (if not null) must belong to the caller's org.
--
-- Security posture mirrors move_asset_log_item: SECURITY DEFINER, reads auth.uid()
-- itself so it cannot be aimed at another org; the new row's organisation_id is the
-- caller's org, the target space is org-verified via its site.
--
-- Acceptance (owner, after running):
--   * split of qty 3 from a batch of 10 leaves source=7 and creates a new item=3 at
--     the target space with a movement row; source location unchanged.
--   * p_quantity >= source quantity errors; p_quantity < 1 errors.
--   * a target space in another org errors.

CREATE OR REPLACE FUNCTION split_asset_log_item(
  p_item_id     UUID,
  p_to_space_id UUID,
  p_quantity    INT,
  p_note        TEXT DEFAULT NULL
)
RETURNS asset_log_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org        UUID;
  v_item       asset_log_items%ROWTYPE;
  v_to_space   spaces%ROWTYPE;
  v_to_site    UUID;
  v_from_space spaces%ROWTYPE;
  v_from_name  TEXT;
  v_to_name    TEXT;
  v_new        asset_log_items%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT organisation_id INTO v_org FROM users WHERE id = auth.uid();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'no organisation';
  END IF;

  SELECT * INTO v_item FROM asset_log_items
    WHERE id = p_item_id AND organisation_id = v_org;
  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'item not found in your organisation';
  END IF;

  IF p_quantity IS NULL OR p_quantity < 1 THEN
    RAISE EXCEPTION 'split quantity must be at least 1';
  END IF;
  IF p_quantity >= v_item.quantity THEN
    RAISE EXCEPTION 'split quantity (%) must be less than available quantity (%); use move for the full batch',
      p_quantity, v_item.quantity;
  END IF;

  -- Resolve the target space (must be in the caller's org via its site) and its site.
  IF p_to_space_id IS NOT NULL THEN
    SELECT s.* INTO v_to_space
      FROM spaces s
      JOIN sites si ON si.id = s.site_id
     WHERE s.id = p_to_space_id AND si.organisation_id = v_org;
    IF v_to_space.id IS NULL THEN
      RAISE EXCEPTION 'target space not found in your organisation';
    END IF;
    v_to_site := v_to_space.site_id;
    v_to_name := v_to_space.name;
  END IF;

  -- Snapshot the source space name for movement history (survives space deletion).
  IF v_item.space_id IS NOT NULL THEN
    SELECT * INTO v_from_space FROM spaces WHERE id = v_item.space_id;
    v_from_name := v_from_space.name;
  END IF;

  -- Insert the new (split-off) batch: copy attributes, override quantity/location/meta.
  INSERT INTO asset_log_items (
    organisation_id, name, name_ar, description, type_id, brand, model,
    serial_number, photo_urls, custom_fields, tracking_mode, quantity,
    site_id, space_id, status,
    purchase_date, purchase_cost, replacement_cost, current_value_override,
    expected_lifespan_years, supplier_id, invoice_ref,
    warranty_provider, warranty_expiry,
    condition_rating, is_usable, condition_notes, condition_review_interval_months,
    created_by
  ) VALUES (
    v_org, v_item.name, v_item.name_ar, v_item.description, v_item.type_id,
    v_item.brand, v_item.model, v_item.serial_number, v_item.photo_urls,
    v_item.custom_fields, 'bulk', p_quantity,
    v_to_site, p_to_space_id, v_item.status,
    v_item.purchase_date, v_item.purchase_cost, v_item.replacement_cost,
    v_item.current_value_override, v_item.expected_lifespan_years,
    v_item.supplier_id, v_item.invoice_ref,
    v_item.warranty_provider, v_item.warranty_expiry,
    v_item.condition_rating, v_item.is_usable, v_item.condition_notes,
    v_item.condition_review_interval_months,
    auth.uid()
  )
  RETURNING * INTO v_new;

  -- Movement row for the split-off batch.
  INSERT INTO asset_log_movements (
    organisation_id, item_id, from_space_id, to_space_id,
    from_space_name, to_space_name, quantity, note, moved_by
  ) VALUES (
    v_org, v_new.id, v_item.space_id, p_to_space_id,
    v_from_name, v_to_name, p_quantity, p_note, auth.uid()
  );

  -- Decrement the source batch (it stays where it is).
  UPDATE asset_log_items
     SET quantity = quantity - p_quantity,
         updated_at = now()
   WHERE id = p_item_id;

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION split_asset_log_item(UUID, UUID, INT, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION split_asset_log_item(UUID, UUID, INT, TEXT) TO authenticated;
