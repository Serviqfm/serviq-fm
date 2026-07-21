-- CORE-36 / WO-22 — Request portal chat (two-way message thread on a request)
-- Run in Supabase SQL editor. Idempotent.
--
-- A request carries a message thread. Org members converse from the internal
-- request detail (RLS: they read/write messages whose request belongs to their
-- org). The public tracking page (/track/[token]) reads/writes via a
-- service-role API route scoped to that single request's tracking_token — the
-- anon requester never touches this table directly, so no anon RLS policy.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS request_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('staff', 'requester')),
  sender_name TEXT,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_request_messages_request ON request_messages(request_id, created_at);

ALTER TABLE request_messages ENABLE ROW LEVEL SECURITY;

-- Org 4-policy pattern. The organisation_id column is the tenant guard; on
-- insert/update we also bind the FK: the referenced request must live in the
-- same org, so a member can't attach a message to another org's request by
-- passing a mismatched organisation_id.
DROP POLICY IF EXISTS request_messages_org_select ON request_messages;
CREATE POLICY request_messages_org_select ON request_messages
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS request_messages_org_insert ON request_messages;
CREATE POLICY request_messages_org_insert ON request_messages
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid())
    AND request_id IN (
      SELECT id FROM requests WHERE organisation_id = request_messages.organisation_id
    )
  );

DROP POLICY IF EXISTS request_messages_org_update ON request_messages;
CREATE POLICY request_messages_org_update ON request_messages
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid())
  ) WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid())
    AND request_id IN (
      SELECT id FROM requests WHERE organisation_id = request_messages.organisation_id
    )
  );

DROP POLICY IF EXISTS request_messages_org_delete ON request_messages;
CREATE POLICY request_messages_org_delete ON request_messages
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid())
  );
