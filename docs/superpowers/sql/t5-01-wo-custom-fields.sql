-- T5 / WO-26 + WO-31 — Work-order custom fields + planned start date.
-- Run in the Supabase SQL editor BEFORE deploying the T5 routes/pages.
-- Idempotent. Safe to run twice. Styled after sprint-l-01-asset-log.sql.
--
-- Design (adopted default): JSONB values + a field-definition table (NOT EAV).
--   * custom_field_definitions — org-scoped, admin-managed typed field defs.
--   * work_orders.custom_fields JSONB — free key→value map keyed by definition.key
--     (mirrors the existing assets.custom_fields precedent).
--   * work_orders.start_at (WO-31) — planned start, distinct from actual started_at.
--
-- The app reads custom_fields on every WO via select('*') and reads definitions
-- with an org-scoped client query (RLS below), so `next build` succeeds without
-- this migration applied — the columns/table simply don't exist until it runs.
--
-- Security posture (adversarial review, per Wave-1 asset-log finding): the UPDATE
-- policy carries a WITH CHECK on organisation_id so an authenticated caller cannot
-- move a definition row into another org. INSERT also has WITH CHECK. Definitions
-- are written client-side by admins (settings tab); RLS scopes every write to the
-- caller's org, and the settings tab is admin-gated in the UI.
--
-- Acceptance (owner, after running):
--   * anon-key SELECT/INSERT on custom_field_definitions returns/denies cross-org.
--   * an authenticated member of org A cannot UPDATE a definition into org B
--     (WITH CHECK rejects the org swap).
--   * a WO row round-trips a custom_fields JSONB value and a start_at timestamp.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. custom_field_definitions (org-defined typed fields; entity-scoped)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS custom_field_definitions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  entity          TEXT NOT NULL DEFAULT 'work_order'
                    CHECK (entity IN ('work_order')),
  key             TEXT NOT NULL,
  label           TEXT NOT NULL,
  label_ar        TEXT,
  type            TEXT NOT NULL DEFAULT 'text'
                    CHECK (type IN ('text','textarea','number','date','dropdown')),
  options         JSONB NOT NULL DEFAULT '[]'::jsonb,   -- string[] for type='dropdown'
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  -- key is the JSONB map key on work_orders.custom_fields; unique per org+entity.
  UNIQUE (organisation_id, entity, key)
);

CREATE INDEX IF NOT EXISTS idx_cfd_org_entity
  ON custom_field_definitions(organisation_id, entity);

ALTER TABLE custom_field_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cfd_org_select ON custom_field_definitions;
CREATE POLICY cfd_org_select ON custom_field_definitions
  FOR SELECT USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS cfd_org_insert ON custom_field_definitions;
CREATE POLICY cfd_org_insert ON custom_field_definitions
  FOR INSERT WITH CHECK (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS cfd_org_update ON custom_field_definitions;
CREATE POLICY cfd_org_update ON custom_field_definitions
  FOR UPDATE USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()))
  WITH CHECK (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS cfd_org_delete ON custom_field_definitions;
CREATE POLICY cfd_org_delete ON custom_field_definitions
  FOR DELETE USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. work_orders columns: custom_fields (WO-26) + start_at (WO-31)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ;
