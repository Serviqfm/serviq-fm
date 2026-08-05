-- W6-6 / CORE-28 — Per-template email recipients for completed-inspection PDFs.
-- Run in the Supabase SQL editor BEFORE deploying the W6-6 inspection routes.
-- Idempotent. Safe to run twice.
--
-- When an inspection run is submitted, the app generates a PDF of the completed
-- inspection and emails it (best-effort) to the addresses listed here. A simple
-- text[] of emails on the existing template row — no child table needed for a
-- flat list of addresses.
--
-- No new RLS: inspection_templates already carries org-scoped policies, and this
-- column rides on the existing row's read/write grants. The app reads templates
-- with select('*') / select('...recipients'), so `next build`/run succeeds
-- WITHOUT this migration applied — the column simply defaults to '{}' once it runs.

ALTER TABLE public.inspection_templates
  ADD COLUMN IF NOT EXISTS recipients TEXT[] NOT NULL DEFAULT '{}'::text[];
