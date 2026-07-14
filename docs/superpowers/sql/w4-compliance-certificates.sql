-- W4 / FM-04 — Statutory compliance certificate register.
-- Run in the Supabase SQL editor BEFORE deploying the /dashboard/compliance page.
-- Idempotent. Safe to run twice. Styled after sprint-l-01-asset-log.sql.
--
-- A certificate is tied to the org and OPTIONALLY to a site and/or an asset
-- (asset_id references the MEP `assets` table). type is a free-ish CHECK enum
-- (civil_defense/elevator/fire_system/water_tank/pressure_vessel/other) matching
-- the gap-analysis spec; `status` is a stored lifecycle marker but the UI derives
-- expiry urgency live from expires_at (a stored status can go stale).
--
-- Security posture: standard 4-policy org RLS with WITH CHECK on INSERT and
-- UPDATE so an authenticated caller cannot create/move a row into another org.
-- SELECT stays org-scoped. Writes flow through the RLS'd authenticated browser
-- client (this page has no service-role route), so the org-scoped policies are
-- the whole enforcement surface. Cross-org site_id/asset_id references on a
-- caller's own row are integrity-only (not read exfiltration) and the create
-- form only offers the caller's own sites/assets; tighten with EXISTS-based FK
-- sub-conditions if a direct-PostgREST threat model demands it.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS compliance_certificates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  site_id         UUID REFERENCES sites(id)  ON DELETE SET NULL,
  asset_id        UUID REFERENCES assets(id) ON DELETE SET NULL,
  type            TEXT NOT NULL DEFAULT 'other'
                    CHECK (type IN ('civil_defense','elevator','fire_system','water_tank','pressure_vessel','other')),
  title           TEXT NOT NULL,
  certificate_no  TEXT,
  issuer          TEXT,
  issued_at       DATE,
  expires_at      DATE NOT NULL,
  doc_url         TEXT,
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','superseded','archived')),
  notes           TEXT,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compliance_certs_org        ON compliance_certificates(organisation_id);
CREATE INDEX IF NOT EXISTS idx_compliance_certs_site       ON compliance_certificates(site_id);
CREATE INDEX IF NOT EXISTS idx_compliance_certs_asset      ON compliance_certificates(asset_id);
CREATE INDEX IF NOT EXISTS idx_compliance_certs_expires_at ON compliance_certificates(expires_at);

ALTER TABLE compliance_certificates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS compliance_certs_org_select ON compliance_certificates;
CREATE POLICY compliance_certs_org_select ON compliance_certificates
  FOR SELECT USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS compliance_certs_org_insert ON compliance_certificates;
CREATE POLICY compliance_certs_org_insert ON compliance_certificates
  FOR INSERT WITH CHECK (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS compliance_certs_org_update ON compliance_certificates;
CREATE POLICY compliance_certs_org_update ON compliance_certificates
  FOR UPDATE USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()))
  WITH CHECK (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS compliance_certs_org_delete ON compliance_certificates;
CREATE POLICY compliance_certs_org_delete ON compliance_certificates
  FOR DELETE USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));
