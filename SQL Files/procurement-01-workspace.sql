-- P0 / Procurement — workspace split flags.
-- Run in the Supabase SQL editor BEFORE deploying Batch P0.
-- Idempotent. Safe to run twice.
--
-- Design (playbook §2 A2):
--   * organisations.has_cafm         — tenant may use the CAFM workspace (/dashboard/*).
--   * organisations.has_procurement  — tenant may use the Procurement workspace
--                                      (/dashboard/procurement/*).
--   * Defaults (true / false) mean EVERY existing tenant keeps exactly today's
--     behavior: CAFM on, procurement off, until a platform admin flips it.
--   * No RLS change — organisations already carries its policies, and these are
--     read via the service-role client in middleware and the platform admin API.
--   * The app degrades gracefully WITHOUT this migration: middleware falls back
--     to a flag-less profile select and behaves exactly as it does today
--     (see web/src/middleware.ts, SELECT_BASE), so `next build` and the running
--     app both work before this runs.

ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS has_cafm        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS has_procurement BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organisations.has_cafm IS
  'Tenant may use the CAFM workspace (/dashboard/*). Default true = unchanged for every existing tenant.';
COMMENT ON COLUMN public.organisations.has_procurement IS
  'Tenant may use the Procurement workspace (/dashboard/procurement/*). Default false = opt-in per tenant.';
