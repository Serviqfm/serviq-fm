-- P7 / Procurement — ERP integration FRAMEWORK (playbook §4 Batch P7).
-- Run in the Supabase SQL editor BEFORE deploying the ERP settings page.
-- Idempotent. Safe to run twice.
--
-- Framework ONLY. There are no live connectors in V1: every provider resolves to
-- the NoopAdapter, which records what WOULD have been synced and sends nothing.
-- Real Oracle / Dynamics / Odoo adapters are Phase Q (owner decision gate).
--
--   * erp_connections — one row per org: which provider, and whether it is on
--   * erp_sync_log    — append-only record of every sync attempt
--
-- SECRETS NEVER GO IN erp_connections.config. It is plain JSONB readable by the
-- org's admins. When real connectors land (Q5), credentials belong in env/vault
-- and config holds only non-secret settings (base URL, company id, mappings).
--
-- RLS posture, and one deliberate departure from the house 4-policy template:
--   * erp_connections: admin-only for read AND write. The config is integration
--     plumbing, not something managers or technicians need to see.
--   * erp_sync_log: admin/manager may READ; there are NO insert/update/delete
--     policies at all. It is an audit log — rows are written by the service role
--     from server code and must not be editable (or forgeable) from a browser.
--
-- Zero cost for tenants who never touch this: with no erp_connections row, the
-- event hooks resolve to nothing and write nothing.
--
-- Acceptance (owner, after running — see procurement-08-erp.test.sql):
--   * provider is constrained to the four known values; one connection per org.
--   * an authenticated user cannot write erp_sync_log directly.
--   * a non-admin cannot read erp_connections.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. erp_connections — one per organisation.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.erp_connections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL DEFAULT 'none'
                    CHECK (provider IN ('oracle','dynamics','odoo','none')),
  config          JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active       BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_erp_connections_org ON public.erp_connections(organisation_id);

COMMENT ON COLUMN public.erp_connections.config IS
  'Non-secret connector settings only. Credentials must live in env/vault, never here.';

ALTER TABLE public.erp_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_connections_admin_select ON public.erp_connections;
CREATE POLICY erp_connections_admin_select ON public.erp_connections
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
  );
DROP POLICY IF EXISTS erp_connections_admin_insert ON public.erp_connections;
CREATE POLICY erp_connections_admin_insert ON public.erp_connections
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
  );
DROP POLICY IF EXISTS erp_connections_admin_update ON public.erp_connections;
CREATE POLICY erp_connections_admin_update ON public.erp_connections
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
  );
DROP POLICY IF EXISTS erp_connections_admin_delete ON public.erp_connections;
CREATE POLICY erp_connections_admin_delete ON public.erp_connections
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. erp_sync_log — append-only audit of sync attempts.
--    status 'skipped' is what the V1 NoopAdapter writes: the event was seen and
--    recorded, and deliberately nothing left the building.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.erp_sync_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL,
  object_type     TEXT NOT NULL
                    CHECK (object_type IN ('vendor','purchase_order','payment','budget','invoice')),
  object_id       UUID,
  direction       TEXT NOT NULL CHECK (direction IN ('push','pull')),
  status          TEXT NOT NULL CHECK (status IN ('pending','success','failed','skipped')),
  payload         JSONB,
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_erp_sync_log_org ON public.erp_sync_log(organisation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_erp_sync_log_object ON public.erp_sync_log(object_type, object_id);

ALTER TABLE public.erp_sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_sync_log_select ON public.erp_sync_log;
CREATE POLICY erp_sync_log_select ON public.erp_sync_log
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','manager')
  );

-- Deliberately NO insert / update / delete policies: with RLS enabled and no
-- write policy, every authenticated write is refused. Only the service role
-- (server code in web/src/lib/erp) appends rows. Re-running this migration also
-- drops any write policy someone may have added by hand.
DROP POLICY IF EXISTS erp_sync_log_insert ON public.erp_sync_log;
DROP POLICY IF EXISTS erp_sync_log_update ON public.erp_sync_log;
DROP POLICY IF EXISTS erp_sync_log_delete ON public.erp_sync_log;
