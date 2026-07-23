-- W6.1 / MKT-18 — vendor-invoice status transitions.
-- Run in the Supabase SQL editor BEFORE deploying the vendor-invoice status
-- actions on vendors/[id]. Idempotent — safe to run twice.
--
-- The original "SQL Files/sprint-h-01-vendor-invoices.sql" CHECK only allowed
-- ('pending','paid','overdue','cancelled'), but the vendors/[id] UI and the
-- status workflow (pending → approved → paid; disputed from pending/approved)
-- also use 'approved' and 'disputed'. Widen the constraint; legacy values are
-- kept so existing rows stay valid.

ALTER TABLE public.vendor_invoices
  DROP CONSTRAINT IF EXISTS vendor_invoices_status_check;

ALTER TABLE public.vendor_invoices
  ADD CONSTRAINT vendor_invoices_status_check
  CHECK (status IN ('pending', 'approved', 'paid', 'disputed', 'overdue', 'cancelled'));
