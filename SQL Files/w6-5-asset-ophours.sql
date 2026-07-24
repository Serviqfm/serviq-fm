-- AL-07 — Per-asset operating-hours, used by the availability calc.
-- Run in the Supabase SQL editor. Idempotent. Safe to run twice.
--
-- Design: one number per asset — hours the asset is expected to operate per
-- week (0..168). The asset detail Downtime tab uses it to scale the availability
-- window: an asset that runs 40h/week is measured against 40h, not the calendar
-- 168h, so a shift-based asset's availability isn't diluted by nights/weekends.
-- NULL / 0 means "assume continuous operation" (the pre-existing 24/7 behaviour),
-- so the app builds and behaves exactly as before WITHOUT this migration.
--
-- No new table / no RLS: this is a plain column on assets, already org-scoped and
-- RLS-protected. Edited through the existing assets PATCH route (org-checked).
--
-- ponytail: a single weekly figure, not a per-weekday schedule. If shift patterns
-- ever need per-day granularity, add an asset_operating_hours child table then.

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS operating_hours_per_week NUMERIC
    CHECK (operating_hours_per_week IS NULL OR (operating_hours_per_week >= 0 AND operating_hours_per_week <= 168));
