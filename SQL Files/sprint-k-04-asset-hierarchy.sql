-- Sprint K — parent_asset_id on assets (parent-child asset hierarchy)
-- Run in Supabase SQL editor. Idempotent.
--
-- Enables UpKeep-style asset hierarchies (e.g. Building > AHU > Compressor > Motor).
-- The 4-level maximum depth and cycle prevention are enforced in app code
-- (web/src/app/api/assets/hierarchy.ts), not at the database level.
-- ON DELETE SET NULL: deleting a parent promotes its children to top-level.

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS parent_asset_id UUID REFERENCES assets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_assets_parent ON assets(parent_asset_id);
