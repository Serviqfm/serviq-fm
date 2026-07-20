-- FM-21 — Invoice status workflow (draft → sent → paid, or → void).
-- Adds a lifecycle to CUSTOMER/WO invoices (public.invoices). Idempotent.
-- No RLS change: the existing org-scoped policies already gate select/update.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS status  text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- CHECK added guardedly so re-runs are no-ops.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_status_check') THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_status_check
      CHECK (status IN ('draft', 'sent', 'paid', 'void'));
  END IF;
END $$;
