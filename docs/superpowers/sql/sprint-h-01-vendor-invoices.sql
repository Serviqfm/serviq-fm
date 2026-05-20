-- Sprint H — Vendor invoices table (was missing from earlier migrations)
-- Run in Supabase SQL editor. Idempotent.

CREATE TABLE IF NOT EXISTS vendor_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  work_order_id UUID REFERENCES work_orders(id) ON DELETE SET NULL,
  invoice_number VARCHAR(100) NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  description TEXT,
  invoice_date DATE,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled')),
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_invoices_vendor ON vendor_invoices(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_invoices_org ON vendor_invoices(organisation_id);

ALTER TABLE vendor_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendor_invoices_org_select ON vendor_invoices;
CREATE POLICY vendor_invoices_org_select ON vendor_invoices
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS vendor_invoices_org_insert ON vendor_invoices;
CREATE POLICY vendor_invoices_org_insert ON vendor_invoices
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS vendor_invoices_org_update ON vendor_invoices;
CREATE POLICY vendor_invoices_org_update ON vendor_invoices
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS vendor_invoices_org_delete ON vendor_invoices;
CREATE POLICY vendor_invoices_org_delete ON vendor_invoices
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid())
  );
