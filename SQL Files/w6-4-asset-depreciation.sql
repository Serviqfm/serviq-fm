-- W6-4 / AL-05 — Straight-line depreciation inputs on MEP assets.
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.
--
-- purchase_cost + purchase_date already exist (the asset forms write them); the
-- guards below are no-ops on prod. salvage_value + useful_life_years are the new
-- inputs the current-book-value calc needs. Straight-line book value is computed
-- in the app (web/src/lib/assetFields.ts, guarding divide-by-zero); no DB math.
--
-- useful_life_years is kept DISTINCT from the pre-existing expected_lifespan_years
-- (a warranty/replacement-planning field) so the two concerns never collide.

ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS purchase_cost      NUMERIC;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS purchase_date      DATE;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS salvage_value      NUMERIC;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS useful_life_years  INTEGER;
