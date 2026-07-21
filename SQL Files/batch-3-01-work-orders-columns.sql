-- Batch 3 (PR-A) — work_orders columns for vendor assignment (DV-12/FM-09) and
-- close sign-off (WO-01). Idempotent. Run in the Supabase SQL editor BEFORE deploying
-- the Batch 3 code (the edit/close routes write these columns).

-- DV-12: vendors get their own assignment column; assigned_to stays users-only.
ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS assigned_vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL;

-- Migrate existing rows where a vendor id was wrongly written into assigned_to.
-- Safe to re-run: after the first run no assigned_to matches a vendor id, and the
-- assigned_vendor_id IS NULL guard prevents clobbering already-migrated rows.
UPDATE public.work_orders w
  SET assigned_vendor_id = w.assigned_to, assigned_to = NULL
  WHERE w.assigned_to IN (SELECT id FROM public.vendors)
    AND w.assigned_vendor_id IS NULL;

-- WO-01: close sign-off gets its own column so it never overwrites completion_notes.
ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS signed_off_by TEXT;
