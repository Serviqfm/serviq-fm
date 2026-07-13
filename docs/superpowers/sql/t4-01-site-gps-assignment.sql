-- T4 / AL-15 — Site GPS coordinates + team assignment. Idempotent, owner-run.
-- Run in the Supabase SQL editor before deploying. The app tolerates its absence
-- (queries select these columns at request time; missing columns simply read null
-- after this migration, and the create/edit forms only write them once it exists).

ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS assigned_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sites_assigned_team ON public.sites(assigned_team_id);
