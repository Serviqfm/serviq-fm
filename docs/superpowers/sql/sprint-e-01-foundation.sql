-- Sprint E — Foundation: field_configs table
-- Run in Supabase SQL editor.

CREATE TABLE IF NOT EXISTS field_configs (
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  page VARCHAR(50) NOT NULL,
  field_key VARCHAR(50) NOT NULL,
  visibility VARCHAR(10) NOT NULL
    CHECK (visibility IN ('required', 'optional', 'hidden')),
  updated_at TIMESTAMP DEFAULT now(),
  updated_by UUID REFERENCES users(id),
  PRIMARY KEY (organisation_id, page, field_key)
);

ALTER TABLE field_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS field_configs_org_select ON field_configs;
CREATE POLICY field_configs_org_select ON field_configs
  FOR SELECT USING (
    organisation_id IN (
      SELECT organisation_id FROM users WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS field_configs_org_write ON field_configs;
CREATE POLICY field_configs_org_write ON field_configs
  FOR ALL USING (
    organisation_id IN (
      SELECT organisation_id FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE INDEX IF NOT EXISTS idx_field_configs_org_page
  ON field_configs(organisation_id, page);
