-- Track B3-A — Public REST API + webhooks (MKT-19): api_keys + webhooks tables.
-- Run in the Supabase SQL editor BEFORE deploying /api/v1/* and /dashboard/developers.
-- Idempotent. Safe to run twice. Styled after sprint-l-01-asset-log.sql (4-policy org RLS).
--
-- SECURITY POSTURE (adversarial review):
--   * api_keys.key_hash holds ONLY a SHA-256 hash of the plaintext key. The plaintext is
--     shown to the admin ONCE at creation (by the API route, never persisted) and is
--     unrecoverable thereafter. key_prefix (first 8 chars) is a non-secret display aid.
--   * webhooks.secret holds the HMAC signing secret. It is admin-manageable and used
--     server-side only to sign outbound payloads; it is never exposed to occupants/anon.
--   * Both tables are ADMIN-ONLY at the RLS layer: SELECT + all writes require the caller
--     to be an admin in the row's org. Non-admins in the same org cannot even list keys.
--   * Public API auth does NOT use these RLS policies — /api/v1/* hashes the presented
--     Bearer key and looks the row up via the SERVICE-ROLE client (bypasses RLS by design),
--     then scopes every downstream query to the key's org. The org is resolved from the
--     credential, NEVER from client input. RLS here protects the dashboard read/write path.
--   * UPDATE policies carry WITH CHECK on organisation_id so an admin cannot move a row
--     into another org (cross-tenant escape backstop).
--
-- Acceptance (owner, after running):
--   * anon-key SELECT on api_keys / webhooks returns 0 rows cross-org AND 0 rows for a
--     non-admin member of the SAME org.
--   * inserting a key row as a non-admin (direct PostgREST) is denied by RLS.
--   * key_hash is UNIQUE (a collision or duplicate insert fails).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Admin-in-org predicate reused by every policy below. Inlined (no helper fn) to keep
-- the migration flat and greppable, matching repo convention.
--   organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid() AND role = 'admin')

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. api_keys — tenant-scoped API credentials for the public REST API.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  key_hash        TEXT NOT NULL UNIQUE,           -- SHA-256 hex of the plaintext key
  key_prefix      TEXT NOT NULL,                  -- first 8 chars of the plaintext, for display
  scopes          TEXT[] NOT NULL DEFAULT '{}',   -- e.g. {'work-orders:read','assets:read'}
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  last_used_at    TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_org      ON api_keys(organisation_id);
-- Public-API lookup path: hash the presented key, find a non-revoked row fast.
CREATE INDEX IF NOT EXISTS idx_api_keys_hash     ON api_keys(key_hash);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS api_keys_admin_select ON api_keys;
CREATE POLICY api_keys_admin_select ON api_keys
  FOR SELECT USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid() AND role = 'admin'));
DROP POLICY IF EXISTS api_keys_admin_insert ON api_keys;
CREATE POLICY api_keys_admin_insert ON api_keys
  FOR INSERT WITH CHECK (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid() AND role = 'admin'));
DROP POLICY IF EXISTS api_keys_admin_update ON api_keys;
CREATE POLICY api_keys_admin_update ON api_keys
  FOR UPDATE USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid() AND role = 'admin'));
DROP POLICY IF EXISTS api_keys_admin_delete ON api_keys;
CREATE POLICY api_keys_admin_delete ON api_keys
  FOR DELETE USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid() AND role = 'admin'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. webhooks — outbound webhook endpoint registrations (delivery is a follow-up stub).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhooks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  url             TEXT NOT NULL,
  event           TEXT NOT NULL,                  -- e.g. 'wo.created','wo.status_changed','request.submitted'
  secret          TEXT NOT NULL,                  -- HMAC signing secret (server-side only)
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  last_delivery_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_org        ON webhooks(organisation_id);
-- Delivery path: find active subscriptions for an org+event fast.
CREATE INDEX IF NOT EXISTS idx_webhooks_org_event  ON webhooks(organisation_id, event) WHERE is_active;

ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS webhooks_admin_select ON webhooks;
CREATE POLICY webhooks_admin_select ON webhooks
  FOR SELECT USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid() AND role = 'admin'));
DROP POLICY IF EXISTS webhooks_admin_insert ON webhooks;
CREATE POLICY webhooks_admin_insert ON webhooks
  FOR INSERT WITH CHECK (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid() AND role = 'admin'));
DROP POLICY IF EXISTS webhooks_admin_update ON webhooks;
CREATE POLICY webhooks_admin_update ON webhooks
  FOR UPDATE USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid() AND role = 'admin'));
DROP POLICY IF EXISTS webhooks_admin_delete ON webhooks;
CREATE POLICY webhooks_admin_delete ON webhooks
  FOR DELETE USING (organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid() AND role = 'admin'));

-- Column-level hardening (review): the SHA-256 key hash is never needed by any
-- client (the dashboard shows only key_prefix), so deny it to authenticated/anon
-- even for same-org admins hitting PostgREST directly. Service-role (server routes)
-- is unaffected — makes the "key_hash is not client-readable" guarantee literal.
REVOKE SELECT (key_hash) ON public.api_keys FROM authenticated, anon;
