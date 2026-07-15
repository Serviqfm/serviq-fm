-- 1C-15 — Admin-editable user fields.
-- Adds hourly_rate, job_title, phone, skill_categories to users.
-- Idempotent; no new RLS (users already has org-scoped RLS).
-- phone is included defensively — ADD COLUMN IF NOT EXISTS is a no-op if it exists.

alter table public.users add column if not exists hourly_rate     numeric;
alter table public.users add column if not exists job_title       text;
alter table public.users add column if not exists phone           text;
alter table public.users add column if not exists skill_categories text[];
