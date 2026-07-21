-- Sprint L — Asset Log module (non-MEP register): foundation schema.
-- Run in the Supabase SQL editor BEFORE deploying the Asset Log routes/pages.
-- Idempotent. Safe to run twice. Styled after sprint-k-03-wo-tasks-checklists.sql.
--
-- Spaces-only, SEPARATE from MEP `assets` (zero shared tables/columns; only shared
-- FKs are sites/spaces/vendors/users/work_orders). All enums are CHECK constraints
-- (repo convention — no PG enum types). Every table gets the standard 4-policy org
-- RLS in the same file that creates it (this repo has shipped RLS-less tables before).
--
-- Security posture (adversarial review): UPDATE policies carry a WITH CHECK on
-- organisation_id so an authenticated caller cannot move a row into another org (the
-- cross-tenant escape core-20-23 backstops for `users`). All asset-log WRITES flow
-- through the service-role API routes under web/src/app/api/asset-log/, which scope
-- FK references (space/site/type/supplier/item) to the caller's org in app code.
-- Known low-risk residual: a direct-PostgREST INSERT could still reference another
-- org's space/type/item on its own row (integrity poisoning, NOT read exfiltration —
-- SELECT stays org-scoped). Close it with EXISTS-based WITH CHECK FK sub-conditions
-- when mobile gains direct asset-log writes (AG-8/9); until then no client writes
-- asset-log tables directly.
--
-- Acceptance (owner, after running):
--   * anon-key SELECT/INSERT on every asset_log_* table returns/denies cross-org.
--   * move_asset_log_item moves an item + writes a movement row atomically and
--     errors on a space belonging to another org.
--   * a tracking_mode='unit' row cannot have quantity > 1 (DB CHECK).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Shared 4-policy org RLS helper: enabling RLS + creating the four policies for a
-- table whose `organisation_id` column scopes rows to the caller's org.
-- (Inlined per table below — no function, keeps the migration flat and greppable.)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. asset_log_types (org-defined item types; 5 defaults seeded app-side on first use)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_log_types (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  name_ar         TEXT,
  icon            TEXT,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_log_types_org ON asset_log_types(organisation_id);

ALTER TABLE asset_log_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS asset_log_types_org_select ON asset_log_types;
CREATE POLICY asset_log_types_org_select ON asset_log_types
  FOR SELECT USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS asset_log_types_org_insert ON asset_log_types;
CREATE POLICY asset_log_types_org_insert ON asset_log_types
  FOR INSERT WITH CHECK (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS asset_log_types_org_update ON asset_log_types;
CREATE POLICY asset_log_types_org_update ON asset_log_types
  FOR UPDATE USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()))
  WITH CHECK (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS asset_log_types_org_delete ON asset_log_types;
CREATE POLICY asset_log_types_org_delete ON asset_log_types
  FOR DELETE USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. asset_log_items (the register)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_log_items (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id             UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  item_number                 BIGINT GENERATED ALWAYS AS IDENTITY,
  qr_token                    UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  -- Descriptive
  name                        TEXT NOT NULL,
  name_ar                     TEXT,
  description                 TEXT,
  type_id                     UUID REFERENCES asset_log_types(id) ON DELETE SET NULL,
  brand                       TEXT,
  model                       TEXT,
  serial_number               TEXT,
  photo_urls                  TEXT[] DEFAULT '{}',
  custom_fields               JSONB DEFAULT '{}'::jsonb,
  -- Quantity model
  tracking_mode               TEXT DEFAULT 'unit' CHECK (tracking_mode IN ('unit','bulk')),
  quantity                    INT NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  CONSTRAINT asset_log_items_unit_qty CHECK (
    (tracking_mode = 'unit' AND quantity = 1) OR tracking_mode = 'bulk'
  ),
  -- Location (current; denormalized from latest movement)
  site_id                     UUID REFERENCES sites(id) ON DELETE SET NULL,
  space_id                    UUID REFERENCES spaces(id) ON DELETE SET NULL,
  -- Status
  status                      TEXT DEFAULT 'in_storage'
                                CHECK (status IN ('in_storage','in_use','under_repair','damaged','disposed')),
  -- Lifecycle
  commissioned_at             DATE,
  commissioned_by             UUID REFERENCES users(id) ON DELETE SET NULL,
  decommissioned_at           DATE,
  decommissioned_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  decommission_reason         TEXT,
  disposal_notes              TEXT,
  -- Cost
  purchase_date               DATE,
  purchase_cost               NUMERIC(12,2),
  replacement_cost            NUMERIC(12,2),
  current_value_override      NUMERIC(12,2),
  expected_lifespan_years     INT,
  supplier_id                 UUID REFERENCES vendors(id) ON DELETE SET NULL,
  invoice_ref                 TEXT,
  -- Warranty
  warranty_provider           TEXT,
  warranty_expiry             DATE,
  warranty_alert_sent_at      TIMESTAMPTZ,
  -- Condition
  condition_rating            INT CHECK (condition_rating BETWEEN 1 AND 5),
  is_usable                   BOOLEAN DEFAULT true,
  condition_notes             TEXT,
  last_condition_review_at    TIMESTAMPTZ,
  condition_review_interval_months INT,
  -- Meta
  created_by                  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at                  TIMESTAMPTZ DEFAULT now(),
  updated_at                  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_log_items_org_status ON asset_log_items(organisation_id, status);
CREATE INDEX IF NOT EXISTS idx_asset_log_items_space      ON asset_log_items(space_id);
CREATE INDEX IF NOT EXISTS idx_asset_log_items_site       ON asset_log_items(site_id);
CREATE INDEX IF NOT EXISTS idx_asset_log_items_type       ON asset_log_items(type_id);
CREATE INDEX IF NOT EXISTS idx_asset_log_items_qr_token   ON asset_log_items(qr_token);
CREATE INDEX IF NOT EXISTS idx_asset_log_items_warranty   ON asset_log_items(warranty_expiry);

ALTER TABLE asset_log_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS asset_log_items_org_select ON asset_log_items;
CREATE POLICY asset_log_items_org_select ON asset_log_items
  FOR SELECT USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS asset_log_items_org_insert ON asset_log_items;
CREATE POLICY asset_log_items_org_insert ON asset_log_items
  FOR INSERT WITH CHECK (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS asset_log_items_org_update ON asset_log_items;
CREATE POLICY asset_log_items_org_update ON asset_log_items
  FOR UPDATE USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()))
  WITH CHECK (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS asset_log_items_org_delete ON asset_log_items;
CREATE POLICY asset_log_items_org_delete ON asset_log_items
  FOR DELETE USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. asset_log_movements (assignment history)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_log_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES asset_log_items(id) ON DELETE CASCADE,
  from_space_id   UUID REFERENCES spaces(id) ON DELETE SET NULL,
  to_space_id     UUID REFERENCES spaces(id) ON DELETE SET NULL,
  from_space_name TEXT,
  to_space_name   TEXT,
  quantity        INT DEFAULT 1,
  note            TEXT,
  moved_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  moved_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_log_movements_item ON asset_log_movements(item_id, moved_at DESC);
CREATE INDEX IF NOT EXISTS idx_asset_log_movements_org  ON asset_log_movements(organisation_id);

ALTER TABLE asset_log_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS asset_log_movements_org_select ON asset_log_movements;
CREATE POLICY asset_log_movements_org_select ON asset_log_movements
  FOR SELECT USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS asset_log_movements_org_insert ON asset_log_movements;
CREATE POLICY asset_log_movements_org_insert ON asset_log_movements
  FOR INSERT WITH CHECK (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS asset_log_movements_org_update ON asset_log_movements;
CREATE POLICY asset_log_movements_org_update ON asset_log_movements
  FOR UPDATE USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()))
  WITH CHECK (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS asset_log_movements_org_delete ON asset_log_movements;
CREATE POLICY asset_log_movements_org_delete ON asset_log_movements
  FOR DELETE USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. asset_log_repairs (damage/repair expense ledger)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_log_repairs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES asset_log_items(id) ON DELETE CASCADE,
  description     TEXT NOT NULL,
  cost            NUMERIC(12,2) NOT NULL DEFAULT 0,
  repaired_at     DATE DEFAULT current_date,
  vendor_id       UUID REFERENCES vendors(id) ON DELETE SET NULL,
  work_order_id   UUID REFERENCES work_orders(id) ON DELETE SET NULL,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_log_repairs_item ON asset_log_repairs(item_id);
CREATE INDEX IF NOT EXISTS idx_asset_log_repairs_org  ON asset_log_repairs(organisation_id);

ALTER TABLE asset_log_repairs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS asset_log_repairs_org_select ON asset_log_repairs;
CREATE POLICY asset_log_repairs_org_select ON asset_log_repairs
  FOR SELECT USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS asset_log_repairs_org_insert ON asset_log_repairs;
CREATE POLICY asset_log_repairs_org_insert ON asset_log_repairs
  FOR INSERT WITH CHECK (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS asset_log_repairs_org_update ON asset_log_repairs;
CREATE POLICY asset_log_repairs_org_update ON asset_log_repairs
  FOR UPDATE USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()))
  WITH CHECK (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS asset_log_repairs_org_delete ON asset_log_repairs;
CREATE POLICY asset_log_repairs_org_delete ON asset_log_repairs
  FOR DELETE USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. asset_log_condition_reviews (periodic review log)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_log_condition_reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES asset_log_items(id) ON DELETE CASCADE,
  rating          INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  is_usable       BOOLEAN NOT NULL,
  notes           TEXT,
  photo_urls      TEXT[] DEFAULT '{}',
  reviewed_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_log_reviews_item ON asset_log_condition_reviews(item_id);
CREATE INDEX IF NOT EXISTS idx_asset_log_reviews_org  ON asset_log_condition_reviews(organisation_id);

ALTER TABLE asset_log_condition_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS asset_log_reviews_org_select ON asset_log_condition_reviews;
CREATE POLICY asset_log_reviews_org_select ON asset_log_condition_reviews
  FOR SELECT USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS asset_log_reviews_org_insert ON asset_log_condition_reviews;
CREATE POLICY asset_log_reviews_org_insert ON asset_log_condition_reviews
  FOR INSERT WITH CHECK (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS asset_log_reviews_org_update ON asset_log_condition_reviews;
CREATE POLICY asset_log_reviews_org_update ON asset_log_condition_reviews
  FOR UPDATE USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()))
  WITH CHECK (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS asset_log_reviews_org_delete ON asset_log_condition_reviews;
CREATE POLICY asset_log_reviews_org_delete ON asset_log_condition_reviews
  FOR DELETE USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RPC move_asset_log_item — one atomic move path for web + mobile.
--    Org-verified internally (caller org must own the item AND the target space,
--    or the target space is null = unassigned/storage). SECURITY DEFINER so it can
--    write the movement row + update the item under one transaction; but it reads
--    auth.uid() itself, so it cannot be aimed at another org's data.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION move_asset_log_item(
  p_item_id     UUID,
  p_to_space_id UUID,
  p_note        TEXT DEFAULT NULL
)
RETURNS asset_log_movements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org        UUID;
  v_item       asset_log_items%ROWTYPE;
  v_from_space spaces%ROWTYPE;
  v_to_space   spaces%ROWTYPE;
  v_to_site    UUID;
  v_from_name  TEXT;
  v_to_name    TEXT;
  v_movement   asset_log_movements%ROWTYPE;
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

  -- Snapshot the current space name for history (survives space deletion).
  IF v_item.space_id IS NOT NULL THEN
    SELECT * INTO v_from_space FROM spaces WHERE id = v_item.space_id;
    v_from_name := v_from_space.name;
  END IF;

  INSERT INTO asset_log_movements (
    organisation_id, item_id, from_space_id, to_space_id,
    from_space_name, to_space_name, quantity, note, moved_by
  ) VALUES (
    v_org, p_item_id, v_item.space_id, p_to_space_id,
    v_from_name, v_to_name, v_item.quantity, p_note, auth.uid()
  )
  RETURNING * INTO v_movement;

  UPDATE asset_log_items
     SET space_id = p_to_space_id,
         site_id  = v_to_site,
         updated_at = now()
   WHERE id = p_item_id;

  RETURN v_movement;
END;
$$;

REVOKE ALL ON FUNCTION move_asset_log_item(UUID, UUID, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION move_asset_log_item(UUID, UUID, TEXT) TO authenticated;
