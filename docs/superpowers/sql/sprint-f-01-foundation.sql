-- Sprint F — Foundation: platform admin portal schema
-- Run in Supabase SQL editor.

-- 1. Platform admin identity
CREATE TABLE IF NOT EXISTS platform_admins (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT now(),
  last_sign_in_at TIMESTAMP
);

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_admins_self_read ON platform_admins;
CREATE POLICY platform_admins_self_read ON platform_admins
  FOR SELECT USING (id = auth.uid());

-- 2. Per-tenant feature flags (scaffolding only)
CREATE TABLE IF NOT EXISTS tenant_feature_flags (
  organisation_id UUID PRIMARY KEY REFERENCES organisations(id) ON DELETE CASCADE,
  advanced_reporting BOOLEAN DEFAULT false,
  api_access BOOLEAN DEFAULT false,
  invoicing BOOLEAN DEFAULT true,
  multi_site BOOLEAN DEFAULT true,
  custom_branding BOOLEAN DEFAULT false,
  updated_at TIMESTAMP DEFAULT now(),
  updated_by UUID REFERENCES platform_admins(id)
);

-- 3. Platform audit log
CREATE TABLE IF NOT EXISTS platform_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_admin_id UUID REFERENCES platform_admins(id),
  action VARCHAR(100) NOT NULL,
  target_organisation_id UUID REFERENCES organisations(id),
  target_user_id UUID,
  details JSONB,
  created_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_audit_logs_org ON platform_audit_logs(target_organisation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_audit_logs_admin ON platform_audit_logs(platform_admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_audit_logs_action ON platform_audit_logs(action, created_at DESC);

-- 4. MRR snapshots
CREATE TABLE IF NOT EXISTS mrr_snapshots (
  snapshot_date DATE PRIMARY KEY,
  mrr_cents BIGINT NOT NULL,
  arr_cents BIGINT NOT NULL,
  active_tenants INTEGER NOT NULL,
  paying_tenants INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

-- 5. Extensions to organisations
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS plan VARCHAR(20) DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS billing_status VARCHAR(20) DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS mrr_cents INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS renews_at DATE,
  ADD COLUMN IF NOT EXISTS contract_notes TEXT,
  ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS offboarded_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS offboarded_by UUID REFERENCES platform_admins(id),
  ADD COLUMN IF NOT EXISTS offboard_export_url TEXT;

-- Constraints
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organisations_plan_check') THEN
    ALTER TABLE organisations ADD CONSTRAINT organisations_plan_check
      CHECK (plan IN ('free', 'starter', 'pro', 'enterprise'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organisations_billing_status_check') THEN
    ALTER TABLE organisations ADD CONSTRAINT organisations_billing_status_check
      CHECK (billing_status IN ('paid', 'failed', 'overdue'));
  END IF;
END $$;

-- 6. Users table: platform-level disabled flag (distinct from is_active)
ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled BOOLEAN DEFAULT false;

-- 7. Cross-tenant audit log impersonation attribution
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS impersonated_by UUID REFERENCES platform_admins(id);

-- 8. Backfill: every existing org needs a feature flag row
INSERT INTO tenant_feature_flags (organisation_id)
SELECT id FROM organisations
ON CONFLICT (organisation_id) DO NOTHING;

-- 9. Health score view
DROP VIEW IF EXISTS tenant_health;
CREATE VIEW tenant_health AS
SELECT
  o.id,
  o.name,
  o.plan,
  o.billing_status,
  o.mrr_cents,
  o.offboarded_at,
  COALESCE(
    LEAST(24, GREATEST(0,
      24 - EXTRACT(EPOCH FROM (now() - MAX(au.last_sign_in_at))) / 86400
    ))
  , 0)::INTEGER AS recency_pts,
  LEAST(18, COALESCE(
    (SELECT COUNT(*) FROM users WHERE organisation_id = o.id AND disabled = false), 0
  ) * 3)::INTEGER AS users_pts,
  LEAST(18, COALESCE(
    (SELECT COUNT(*) FROM work_orders
      WHERE organisation_id = o.id
      AND created_at > now() - INTERVAL '30 days'), 0
  ))::INTEGER AS wo_pts,
  (CASE o.billing_status
    WHEN 'paid' THEN 40
    WHEN 'overdue' THEN 20
    WHEN 'failed' THEN 0
   END)::INTEGER AS billing_pts,
  (
    COALESCE(LEAST(24, GREATEST(0, 24 - EXTRACT(EPOCH FROM (now() - MAX(au.last_sign_in_at))) / 86400)), 0)::INTEGER
    + LEAST(18, COALESCE((SELECT COUNT(*) FROM users WHERE organisation_id = o.id AND disabled = false), 0) * 3)::INTEGER
    + LEAST(18, COALESCE((SELECT COUNT(*) FROM work_orders WHERE organisation_id = o.id AND created_at > now() - INTERVAL '30 days'), 0))::INTEGER
    + (CASE o.billing_status WHEN 'paid' THEN 40 WHEN 'overdue' THEN 20 WHEN 'failed' THEN 0 END)::INTEGER
  ) AS total_score
FROM organisations o
LEFT JOIN users u ON u.organisation_id = o.id
LEFT JOIN auth.users au ON au.id = u.id
GROUP BY o.id, o.name, o.plan, o.billing_status, o.mrr_cents, o.offboarded_at;

-- Bootstrap admin INSERT — to be run AFTER creating the auth user in Supabase Auth dashboard
-- INSERT INTO platform_admins (id, email, full_name)
-- VALUES ('<auth_uid_from_supabase_auth_dashboard>', 'sharing.maaz@gmail.com', 'Maaz');
