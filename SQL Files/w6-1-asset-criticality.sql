-- W6 / MKT-14 residual — asset criticality column + last_pm_at maintenance.
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.
-- Referenced as: SQL Files/w6-1-asset-criticality.sql
--
-- (a) assets.criticality — the MEP asset create/edit forms write it and the
--     standard asset report reads it. Constrained to the app's four levels.
-- (b) assets.last_pm_at — stamped by an AFTER UPDATE trigger below whenever a
--     PM-generated work order (source = 'pm_schedule') on an asset transitions
--     to completed. DB layer (not the close route) so every completion path —
--     the web close route, board drag, bulk actions, the public API — is caught.
--
-- Trigger coexistence & safety (same contract as w5-4-downtime-triggers.sql):
--   * AFTER trigger with a distinct name — the CORE-20/23 status-enforcement
--     BEFORE triggers settle the row first; this never touches work_orders itself.
--   * SECURITY DEFINER + pinned search_path so the asset write works on every
--     path (service-role crons, limited techs) and bypasses assets RLS safely.
--   * EXCEPTION WHEN OTHERS swallows everything — last_pm_at is best-effort
--     bookkeeping and must NEVER block or fail the work-order write.

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS criticality text
    CHECK (criticality IN ('low', 'medium', 'high', 'critical'));

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS last_pm_at timestamptz;

-- ── Stamp assets.last_pm_at when a PM work order completes ────────────────────
CREATE OR REPLACE FUNCTION public.stamp_asset_last_pm() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.source = 'pm_schedule' AND NEW.asset_id IS NOT NULL
     AND NEW.status = 'completed' AND OLD.status IS DISTINCT FROM NEW.status THEN
    -- org-bound: the WO's own tenant only, so a cross-org asset_id (this fn is
    -- SECURITY DEFINER and bypasses RLS) matches zero rows instead of stamping
    -- another tenant's asset.
    UPDATE public.assets SET last_pm_at = now()
     WHERE id = NEW.asset_id AND organisation_id = NEW.organisation_id;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;  -- ponytail: best-effort bookkeeping; never block the WO write
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_asset_last_pm ON public.work_orders;
CREATE TRIGGER trg_stamp_asset_last_pm
  AFTER UPDATE ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.stamp_asset_last_pm();
