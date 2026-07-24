-- W6-6 / AP-13 — Monthly auto-draft of tenant invoices for bank-transfer tenants
-- Run in Supabase SQL editor. Idempotent.
--
-- The /api/cron/tenant-invoice-autodraft job drafts one tenant_invoice per active
-- non-Stripe (bank-transfer) tenant each month. Two columns support that:
--   billing_period  'YYYY-MM' the auto-draft covers (NULL for manually created invoices)
--   zatca_qr        ZATCA Phase-2 TLV QR captured at draft time (audit snapshot)
-- A partial UNIQUE index on (organisation_id, billing_period) makes the cron
-- idempotent: a second run in the same month hits 23505 and is skipped. Manual
-- invoices keep billing_period NULL and are unaffected (NULLs are not unique).

ALTER TABLE tenant_invoices ADD COLUMN IF NOT EXISTS billing_period TEXT;
ALTER TABLE tenant_invoices ADD COLUMN IF NOT EXISTS zatca_qr TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_invoices_org_period
  ON tenant_invoices(organisation_id, billing_period)
  WHERE billing_period IS NOT NULL;
