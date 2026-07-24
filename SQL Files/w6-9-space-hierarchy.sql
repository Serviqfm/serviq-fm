-- W6-9 / AL-14 — Nested sub-locations (spaces can nest under a parent space)
-- Run in the Supabase SQL editor BEFORE deploying the updated location tree.
-- Idempotent. Safe to run twice. Additive only — no changes to existing RLS,
-- constraints, or the PM generator.
--
-- Spaces already nest one level under a site. This adds an OPTIONAL self
-- reference so a space can also nest under another space in the same site,
-- giving a site → space → sub-space tree of arbitrary depth.
--
-- Security posture:
--   * parent_space_id is bound to the SAME organisation via a composite FK
--     (parent_space_id, organisation_id) → spaces(id, organisation_id), so a
--     row can never point at a parent in another org. Existing spaces RLS is
--     unchanged and continues to gate reads/writes.
--   * Cycle prevention (a space cannot be its own ancestor) is enforced in the
--     UI; this migration only guards the direct self-parent case in the DB.
--
-- Acceptance (owner, after running):
--   * a space can be assigned a parent_space_id in the same org; cross-org
--     parent assignment is rejected by the composite FK.
--   * setting parent_space_id = id (direct self-parent) is rejected.

-- Composite target the self-FK can reference (id is already PK/unique, but a FK
-- needs a unique constraint on the exact referenced column list).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'spaces_id_org_uniq'
  ) THEN
    ALTER TABLE public.spaces
      ADD CONSTRAINT spaces_id_org_uniq UNIQUE (id, organisation_id);
  END IF;
END $$;

ALTER TABLE public.spaces
  ADD COLUMN IF NOT EXISTS parent_space_id UUID;

-- Org-bound composite self-FK: parent must be a space in the SAME org.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'spaces_parent_org_fk'
  ) THEN
    ALTER TABLE public.spaces
      ADD CONSTRAINT spaces_parent_org_fk
      FOREIGN KEY (parent_space_id, organisation_id)
      REFERENCES public.spaces(id, organisation_id) ON DELETE SET NULL;
  END IF;
END $$;

-- A space cannot be its own direct parent. (Deeper cycles are prevented in the UI.)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'spaces_no_self_parent_chk'
  ) THEN
    ALTER TABLE public.spaces
      ADD CONSTRAINT spaces_no_self_parent_chk
      CHECK (parent_space_id IS NULL OR parent_space_id <> id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_spaces_parent ON public.spaces(parent_space_id)
  WHERE parent_space_id IS NOT NULL;
