-- W6-4 / AL-02 — Org-defined custom fields for MEP assets.
-- Run in the Supabase SQL editor BEFORE deploying the W6-4 asset routes/pages.
-- Idempotent. Safe to run twice. Styled after t5-01-wo-custom-fields.sql.
--
-- Design (mirrors the shipped WO custom-fields system): JSONB values + a
-- field-definition table (NOT EAV).
--   * asset_field_defs — org-scoped, admin-managed typed field defs.
--   * assets.custom_fields JSONB — free key→value map keyed by def.key. This
--     column already exists (the asset detail Custom Fields tab writes it); the
--     ADD COLUMN below is a no-op guard so a fresh DB still gets it.
--
-- A separate table from custom_field_definitions (which is CHECK-constrained to
-- entity='work_order') so this track never touches the WO system's constraint.
--
-- Security posture (adversarial review, per the WO precedent): INSERT and UPDATE
-- both carry WITH CHECK on organisation_id so an authenticated caller cannot move
-- a row into another org. Definitions are written client-side by admins (the
-- asset-fields settings page); RLS scopes every write to the caller's org.
--
-- The app reads defs with an org-scoped client query (RLS below) and reads values
-- off assets.custom_fields via select('*'), so `next build`/run succeeds WITHOUT
-- this migration applied — the table simply doesn't exist until it runs.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.asset_field_defs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  key             TEXT NOT NULL,
  label           TEXT NOT NULL,
  label_ar        TEXT,
  type            TEXT NOT NULL DEFAULT 'text'
                    CHECK (type IN ('text','textarea','number','date','dropdown')),
  options         JSONB NOT NULL DEFAULT '[]'::jsonb,   -- string[] for type='dropdown'
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (organisation_id, key)
);

CREATE INDEX IF NOT EXISTS idx_asset_field_defs_org ON public.asset_field_defs(organisation_id);

-- assets.custom_fields already exists in prod; guard for a fresh DB.
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.asset_field_defs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS afd_org_select ON public.asset_field_defs;
CREATE POLICY afd_org_select ON public.asset_field_defs
  FOR SELECT USING (organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid()));

-- Writes are admin/manager only (UI gating is not a security boundary) — parity
-- with asset_statuses in this same batch.
DROP POLICY IF EXISTS afd_org_insert ON public.asset_field_defs;
CREATE POLICY afd_org_insert ON public.asset_field_defs
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','manager'));

DROP POLICY IF EXISTS afd_org_update ON public.asset_field_defs;
CREATE POLICY afd_org_update ON public.asset_field_defs
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','manager'))
  WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','manager'));

DROP POLICY IF EXISTS afd_org_delete ON public.asset_field_defs;
CREATE POLICY afd_org_delete ON public.asset_field_defs
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','manager'));
