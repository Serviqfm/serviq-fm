-- P4 / Procurement — invoice & 3-way match (playbook §4 Batch P4).
-- Run in the Supabase SQL editor BEFORE deploying the invoice match panel.
-- Idempotent. Safe to run twice.
--
-- The 3-way match compares three documents:
--   PURCHASE ORDER (what we agreed to buy)
--   GOODS RECEIPT (what actually arrived and passed inspection — P3)
--   VENDOR INVOICE (what we are being billed for)
--
-- vendor_invoices gains:
--   * purchase_order_id — org-bound composite FK, the document being matched against
--   * match_status      — unmatched | matched | mismatch | approved_for_payment | disputed
--   * match_detail      — JSONB snapshot of the computed diff at match time
--
-- DEVIATION FROM THE PLAYBOOK, and why it is required:
-- the playbook lists only those three columns, but vendor_invoices has no line
-- items — just `amount`. Its own acceptance criterion ("seeded mismatch: invoice
-- qty > received flags red with the exact delta") is impossible without invoiced
-- QUANTITIES, so this migration also adds vendor_invoice_lines, shaped like
-- purchase_order_items. Without it the matcher could only ever compare totals.
--
-- match_status is NOT the payment status. vendor_invoices.status keeps its own
-- lifecycle (pending -> approved -> paid, disputed) from MKT-18; match_status is
-- the matching verdict plus the finance decision that follows it. The API keeps
-- them in step: approving a matched invoice for payment also moves a `pending`
-- invoice to `approved`, and disputing it moves the payment status to `disputed`
-- — both are transitions the existing MKT-18 state machine already allows.
--
-- No new RLS on vendor_invoices (it already carries org policies). The new lines
-- table gets the standard 4-policy org RLS.
--
-- The app degrades gracefully WITHOUT this migration: the invoice detail page
-- reports that matching is unavailable and the rest of the vendor pages are
-- untouched, so `next build` and the running app both work before this runs.
--
-- Acceptance (owner, after running — see procurement-05-three-way.test.sql):
--   * the three vendor_invoices columns exist and default to 'unmatched'.
--   * an invoice cannot be pointed at another org's purchase order.
--   * invoice lines are org-scoped and cascade with their invoice.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. vendor_invoices — the match columns.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.vendor_invoices
  ADD COLUMN IF NOT EXISTS purchase_order_id UUID,
  ADD COLUMN IF NOT EXISTS match_status      TEXT NOT NULL DEFAULT 'unmatched',
  ADD COLUMN IF NOT EXISTS match_detail      JSONB;

-- Drop + re-add so re-running (or widening later) is safe.
ALTER TABLE public.vendor_invoices DROP CONSTRAINT IF EXISTS vendor_invoices_match_status_check;
ALTER TABLE public.vendor_invoices ADD CONSTRAINT vendor_invoices_match_status_check
  CHECK (match_status IN ('unmatched','matched','mismatch','approved_for_payment','disputed'));

-- Org-bound composite FK: an invoice can only reference a PO in the SAME org.
-- purchase_orders_id_org_key was added by procurement-04-goods-receipt.sql; create
-- it here too so this migration stands on its own if P4 is applied first.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_id_org_key') THEN
    ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_id_org_key UNIQUE (id, organisation_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendor_invoices_po_org_fk') THEN
    ALTER TABLE public.vendor_invoices
      ADD CONSTRAINT vendor_invoices_po_org_fk
      FOREIGN KEY (purchase_order_id, organisation_id)
      REFERENCES public.purchase_orders(id, organisation_id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendor_invoices_id_org_key') THEN
    ALTER TABLE public.vendor_invoices ADD CONSTRAINT vendor_invoices_id_org_key UNIQUE (id, organisation_id);
  END IF;
END $do$;

CREATE INDEX IF NOT EXISTS idx_vendor_invoices_po ON public.vendor_invoices(purchase_order_id);

COMMENT ON COLUMN public.vendor_invoices.match_status IS
  '3-way match verdict + finance decision. NOT the payment status — that stays in vendor_invoices.status.';
COMMENT ON COLUMN public.vendor_invoices.match_detail IS
  'Snapshot of the computed diff at match time (web/src/lib/threeWayMatch.ts output). Historical record, not live.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. vendor_invoice_lines — what the vendor actually billed, per line.
--    purchase_order_item_id links a billed line to the ordered line it belongs
--    to; that link is what makes a per-line price/quantity comparison possible.
--    Shaped like purchase_order_items so the UI can prefill from the PO.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vendor_invoice_lines (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id        UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  vendor_invoice_id      UUID NOT NULL,
  purchase_order_item_id UUID REFERENCES public.purchase_order_items(id) ON DELETE SET NULL,
  description            TEXT,
  quantity               NUMERIC(12,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price             NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendor_invoice_lines_invoice_org_fk') THEN
    ALTER TABLE public.vendor_invoice_lines
      ADD CONSTRAINT vendor_invoice_lines_invoice_org_fk
      FOREIGN KEY (vendor_invoice_id, organisation_id)
      REFERENCES public.vendor_invoices(id, organisation_id) ON DELETE CASCADE;
  END IF;
END $do$;

CREATE INDEX IF NOT EXISTS idx_vi_lines_invoice ON public.vendor_invoice_lines(vendor_invoice_id);
CREATE INDEX IF NOT EXISTS idx_vi_lines_po_item ON public.vendor_invoice_lines(purchase_order_item_id);
CREATE INDEX IF NOT EXISTS idx_vi_lines_org     ON public.vendor_invoice_lines(organisation_id);

ALTER TABLE public.vendor_invoice_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vi_lines_org_select ON public.vendor_invoice_lines;
CREATE POLICY vi_lines_org_select ON public.vendor_invoice_lines
  FOR SELECT USING (organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid()));
DROP POLICY IF EXISTS vi_lines_org_insert ON public.vendor_invoice_lines;
CREATE POLICY vi_lines_org_insert ON public.vendor_invoice_lines
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','manager')
  );
DROP POLICY IF EXISTS vi_lines_org_update ON public.vendor_invoice_lines;
CREATE POLICY vi_lines_org_update ON public.vendor_invoice_lines
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','manager')
  )
  WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','manager')
  );
DROP POLICY IF EXISTS vi_lines_org_delete ON public.vendor_invoice_lines;
CREATE POLICY vi_lines_org_delete ON public.vendor_invoice_lines
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','manager')
  );
