-- W7-02 / Procurement Q5 — live ERP connectors (Odoo, Business Central, Oracle).
-- Run in the Supabase SQL editor BEFORE deploying the connector code.
-- Requires procurement-08-erp.sql. Idempotent. Safe to run twice.
--
--   * erp_credentials    — encrypted connector secrets, ONE row per org.
--                          Zero client access: RLS on, no policies, and table
--                          privileges revoked from anon/authenticated. Only the
--                          service role (server routes in web/src/app/api/erp)
--                          reads or writes it. The value is AES-256-GCM
--                          ciphertext (key = ERP_ENCRYPTION_KEY, app env only —
--                          the database never sees the key). `hints` holds
--                          "configured / last 4 chars" for the settings page.
--   * erp_external_refs  — our object id → the ERP's id, per org + provider. This
--                          is the idempotency record: a retry of an already
--                          synced vendor / PO / invoice finds it and does not
--                          create a duplicate. `complete = false` marks a
--                          multi-step create (BC header made, lines pending) a
--                          retry resumes instead of redoing.
--   * erp_sync_log.external_id — the ERP id on successful pushes (display).
--   * erp_connections.last_test_* — result of the last "Test connection".
--
-- RLS tightening: erp_connections loses its client INSERT/UPDATE/DELETE
-- policies. Writes now go through the admin-only /api/erp/connection route,
-- which validates the config (https, SSRF guard) and keeps secrets out of the
-- plain JSONB. Admin SELECT stays (the settings page reads non-secret config
-- through the route anyway).
--
-- Acceptance (owner, after running):
--   * as an authenticated admin, `select * from erp_credentials` → permission
--     denied (or 0 rows); insert/update are refused.
--   * a manager can read erp_external_refs for their org; nobody can write it
--     from the client.
--   * an admin can no longer upsert erp_connections via PostgREST directly.
--   * the app still builds and the ERP page still loads WITHOUT this migration
--     (it shows the "run w7-02" notice when saving credentials).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. erp_credentials — encrypted secrets, service role only.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.erp_credentials (
  organisation_id UUID PRIMARY KEY REFERENCES public.organisations(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL CHECK (provider IN ('oracle','dynamics','odoo')),
  ciphertext      TEXT NOT NULL CHECK (ciphertext LIKE 'v1.%'),
  hints           JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.erp_credentials IS
  'AES-256-GCM encrypted ERP connector secrets. Service role only — no client policies, no client grants.';

ALTER TABLE public.erp_credentials ENABLE ROW LEVEL SECURITY;
-- Belt and braces: even a policy added by hand later grants nothing without table privileges.
REVOKE ALL ON public.erp_credentials FROM anon, authenticated;
GRANT ALL ON public.erp_credentials TO service_role;

-- Drop any policy that may have been added by hand; none is intended.
DO $do$
DECLARE p RECORD;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'erp_credentials' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.erp_credentials', p.policyname);
  END LOOP;
END $do$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. erp_external_refs — idempotency map.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.erp_external_refs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL CHECK (provider IN ('oracle','dynamics','odoo')),
  object_type     TEXT NOT NULL CHECK (object_type IN ('vendor','purchase_order','invoice')),
  object_id       UUID NOT NULL,
  external_id     TEXT NOT NULL,
  complete        BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_erp_external_refs_key
  ON public.erp_external_refs(organisation_id, provider, object_type, object_id);

ALTER TABLE public.erp_external_refs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_external_refs_select ON public.erp_external_refs;
CREATE POLICY erp_external_refs_select ON public.erp_external_refs
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','manager')
  );
-- No write policies: only the service role maintains this map.
DROP POLICY IF EXISTS erp_external_refs_insert ON public.erp_external_refs;
DROP POLICY IF EXISTS erp_external_refs_update ON public.erp_external_refs;
DROP POLICY IF EXISTS erp_external_refs_delete ON public.erp_external_refs;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Columns on the P7 tables.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.erp_sync_log
  ADD COLUMN IF NOT EXISTS external_id TEXT;

ALTER TABLE public.erp_connections
  ADD COLUMN IF NOT EXISTS last_test_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_test_ok      BOOLEAN,
  ADD COLUMN IF NOT EXISTS last_test_message TEXT;

COMMENT ON COLUMN public.erp_connections.config IS
  'Non-secret connector settings only (URLs, ids, business units). Secrets live encrypted in erp_credentials.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. erp_connections: server-route writes only (admin SELECT kept).
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS erp_connections_admin_insert ON public.erp_connections;
DROP POLICY IF EXISTS erp_connections_admin_update ON public.erp_connections;
DROP POLICY IF EXISTS erp_connections_admin_delete ON public.erp_connections;
