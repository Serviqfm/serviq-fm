-- W5 / AL-03 — Auto open/close asset downtime from critical work orders.
-- Run in the Supabase SQL editor AFTER b8-asset-downtime.sql. Idempotent.
--
-- Why the DB layer (not the API): critical WOs are created from many write
-- paths — the manual "New WO" form, the PM recurrence cron, the inspection
-- cron. A trigger catches them all; app-layer code would miss the crons.
--
-- The operational loop:
--   * AFTER INSERT on work_orders — a NEW critical WO on an MEP asset opens a
--     downtime period for that asset, UNLESS one is already open (manual
--     "Mark Down" or a prior critical WO). The row carries work_order_id so
--     the closer below can find it again.
--   * AFTER UPDATE on work_orders — when that WO reaches completed/closed, the
--     still-open downtime row it opened is closed (ended_at = now()).
--
-- Coexistence & safety:
--   * Both are AFTER triggers: the CORE-20/23 status-enforcement triggers and
--     maintain_wo_sla_clock are BEFORE triggers, so they decide the final row
--     first; these fire on the settled NEW and never touch work_orders itself.
--   * SECURITY DEFINER so the auto-write bypasses asset_downtime RLS and works
--     on every write path (including service-role crons and limited techs).
--   * Wrapped in EXCEPTION WHEN OTHERS: downtime is best-effort and must NEVER
--     block or fail the work-order write. No RAISE ever escapes.
--   * Invariant: an asset has AT MOST ONE open downtime period. Enforced by a
--     unique partial index so the NOT EXISTS guard below is race-safe (a
--     concurrent second critical WO hits the unique violation, which the trigger
--     swallows — one open row wins). It also makes availability%/MTBF well-defined.

-- One open downtime period per asset. If pre-existing data already has overlapping
-- open rows this will error — resolve those (set an ended_at) before re-running.
CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_downtime_open
  ON public.asset_downtime (asset_id) WHERE ended_at IS NULL;

-- ── Auto-OPEN: critical WO created → open a downtime period ──────────────────
CREATE OR REPLACE FUNCTION public.auto_open_downtime_from_wo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_org uuid;
BEGIN
  -- Skip WOs created already-resolved (e.g. a historical bulk import of a closed
  -- critical WO) — the AFTER UPDATE closer never fires for a row born completed/
  -- closed, so opening here would strand a downtime period that never closes.
  IF NEW.priority = 'critical' AND NEW.asset_id IS NOT NULL
     AND NEW.status NOT IN ('completed', 'closed') THEN
    -- Only if the asset is not already down (any open period, manual or auto).
    IF NOT EXISTS (
      SELECT 1 FROM public.asset_downtime
      WHERE asset_id = NEW.asset_id AND ended_at IS NULL
    ) THEN
      SELECT organisation_id INTO v_org FROM public.assets WHERE id = NEW.asset_id;
      IF v_org IS NOT NULL THEN
        INSERT INTO public.asset_downtime (organisation_id, asset_id, cause, work_order_id, started_at)
        VALUES (v_org, NEW.asset_id,
                'Auto: critical work order ' || COALESCE(NEW.wo_number, NEW.id::text),
                NEW.id, now());
      END IF;
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;  -- ponytail: downtime is best-effort; never block the WO write
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_open_downtime_from_wo ON public.work_orders;
CREATE TRIGGER trg_auto_open_downtime_from_wo
  AFTER INSERT ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.auto_open_downtime_from_wo();

-- ── Auto-CLOSE: WO reaches completed/closed → close the period it opened ─────
CREATE OR REPLACE FUNCTION public.auto_close_downtime_from_wo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status IN ('completed', 'closed') AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.asset_downtime
       SET ended_at = now()
     WHERE work_order_id = NEW.id
       AND ended_at IS NULL;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;  -- ponytail: best-effort; never block the WO write
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_close_downtime_from_wo ON public.work_orders;
CREATE TRIGGER trg_auto_close_downtime_from_wo
  AFTER UPDATE ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.auto_close_downtime_from_wo();
