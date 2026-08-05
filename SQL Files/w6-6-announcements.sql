-- W6-6 / AP-07 — Platform announcements to tenants
-- Run in Supabase SQL editor. Idempotent.
--
-- Platform admins post announcements from /platform/announcements. A dismissible
-- banner in the tenant dashboard shows the active ones. Per-user dismissal is stored
-- client-side (localStorage), so no dismissal table is needed.
--
-- Audience: organisation_id NULL = broadcast to ALL tenants; set = one specific org.
-- Active for a tenant = active AND published_at IS NOT NULL AND published_at <= now()
-- AND (organisation_id IS NULL OR organisation_id = the caller's org).

CREATE TABLE IF NOT EXISTS tenant_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE, -- NULL = all tenants
  published_at TIMESTAMPTZ,                                            -- NULL = draft
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES platform_admins(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_announcements_active
  ON tenant_announcements(active, published_at);
CREATE INDEX IF NOT EXISTS idx_tenant_announcements_org
  ON tenant_announcements(organisation_id);

ALTER TABLE tenant_announcements ENABLE ROW LEVEL SECURITY;

-- Platform admins: full read/write.
DROP POLICY IF EXISTS tenant_announcements_platform_admin_all ON tenant_announcements;
CREATE POLICY tenant_announcements_platform_admin_all ON tenant_announcements
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM platform_admins WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE id = auth.uid()));

-- Tenant members: read only the active, published announcements meant for them.
DROP POLICY IF EXISTS tenant_announcements_tenant_read ON tenant_announcements;
CREATE POLICY tenant_announcements_tenant_read ON tenant_announcements
  FOR SELECT TO authenticated
  USING (
    active
    AND published_at IS NOT NULL
    AND published_at <= now()
    AND (
      organisation_id IS NULL
      OR organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid())
    )
  );
