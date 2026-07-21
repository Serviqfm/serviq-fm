-- Sprint I — Tenant invoices (platform-issued)
-- Run in Supabase SQL editor. Idempotent.
--
-- Platform admins can issue invoices to tenants for subscriptions + ad-hoc fees from
-- the Tenant > Billing tab. Each invoice carries line items in jsonb so admins can add
-- arbitrary fees / other bills without schema changes.

CREATE TABLE IF NOT EXISTS tenant_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  invoice_number VARCHAR(50) NOT NULL,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal_cents BIGINT NOT NULL DEFAULT 0,
  vat_cents BIGINT NOT NULL DEFAULT 0,
  total_cents BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'void')),
  notes TEXT,
  created_by UUID REFERENCES platform_admins(id),
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_invoices_org ON tenant_invoices(organisation_id);
CREATE INDEX IF NOT EXISTS idx_tenant_invoices_status ON tenant_invoices(status);

-- Sequential invoice numbers per organisation (e.g., TI-0001 per tenant).
CREATE OR REPLACE FUNCTION next_tenant_invoice_number(org_id UUID) RETURNS TEXT AS $$
DECLARE
  next_seq INT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 'TI-(\d+)') AS INT)), 0) + 1
    INTO next_seq
    FROM tenant_invoices
   WHERE organisation_id = org_id
     AND invoice_number ~ '^TI-\d+$';
  RETURN 'TI-' || LPAD(next_seq::text, 4, '0');
END;
$$ LANGUAGE plpgsql;

ALTER TABLE tenant_invoices ENABLE ROW LEVEL SECURITY;

-- Platform admins read/write all. Tenant members can read their own invoices.
DROP POLICY IF EXISTS tenant_invoices_platform_admin_all ON tenant_invoices;
CREATE POLICY tenant_invoices_platform_admin_all ON tenant_invoices
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM platform_admins WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE id = auth.uid()));

DROP POLICY IF EXISTS tenant_invoices_tenant_read ON tenant_invoices;
CREATE POLICY tenant_invoices_tenant_read ON tenant_invoices
  FOR SELECT TO authenticated
  USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid()));
