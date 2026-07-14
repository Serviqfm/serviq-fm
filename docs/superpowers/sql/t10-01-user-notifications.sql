-- T10 / CORE-15 + CORE-16 — In-app notification feed (`user_notifications`).
-- Run in the Supabase SQL editor BEFORE deploying the notification bell + escalation cron.
-- Idempotent. Safe to run twice. Styled after sprint-l-01-asset-log.sql.
--
-- Why a new table (not `notification_log`): `notification_log` is a delivery-audit
-- trail for email/push (type_key, channel, status, error_message) with no read state,
-- title, body, or link. The in-app alert center needs those + a per-user unread
-- concept. Spec (CORE-15) explicitly offers `user_notifications` as the alternative.
--
-- Idempotency for the cron (CORE-16): `dedupe_key` is UNIQUE per (user_id, dedupe_key).
-- The escalation cron inserts with a stable key per event (e.g. `wo_overdue:<woId>:<dueISO>`)
-- and swallows the unique-violation on re-run, so each event notifies a user exactly once.
--
-- Security posture: standard 4-policy org RLS. SELECT/UPDATE/DELETE are additionally
-- self-scoped to user_id = auth.uid() (a member only ever sees/clears their OWN rows,
-- not the whole org's). All INSERTs are service-role (cron + notify helper) and bypass
-- RLS; the authenticated INSERT policy exists only to satisfy the 4-policy convention
-- and is likewise self-scoped so a client cannot forge a row for another user.
--
-- Acceptance (owner, after running):
--   * anon-key SELECT on user_notifications returns 0 rows.
--   * an authenticated user sees only their own rows; UPDATE can set read_at only on
--     their own rows and cannot move a row to another user/org.
--   * a second service-role INSERT with the same (user_id, dedupe_key) is rejected
--     (unique violation) — the cron relies on this for once-only escalation.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS user_notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type_key        TEXT NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT,
  link            TEXT,
  -- Stable per-event key; NULL for ad-hoc (non-deduped) notifications.
  dedupe_key      TEXT,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- One notification per (user, event). Partial unique index so multiple NULL
-- dedupe_keys (ad-hoc rows) are allowed while cron events stay once-only.
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_notifications_dedupe
  ON user_notifications(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

-- Feed query: a user's rows newest-first, unread first.
CREATE INDEX IF NOT EXISTS idx_user_notifications_user
  ON user_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_notifications_unread
  ON user_notifications(user_id) WHERE read_at IS NULL;

ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;

-- SELECT: own rows only (org membership is implied — every row is owned by user_id).
DROP POLICY IF EXISTS user_notifications_self_select ON user_notifications;
CREATE POLICY user_notifications_self_select ON user_notifications
  FOR SELECT USING (user_id = auth.uid());

-- INSERT: self-scoped + org-scoped. (Real inserts are service-role; this only
-- satisfies the 4-policy convention and blocks a client forging others' rows.)
DROP POLICY IF EXISTS user_notifications_self_insert ON user_notifications;
CREATE POLICY user_notifications_self_insert ON user_notifications
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid())
  );

-- UPDATE: own rows only, and cannot be moved to another user/org (mark-read path).
DROP POLICY IF EXISTS user_notifications_self_update ON user_notifications;
CREATE POLICY user_notifications_self_update ON user_notifications
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid())
  );

-- DELETE: own rows only (dismiss).
DROP POLICY IF EXISTS user_notifications_self_delete ON user_notifications;
CREATE POLICY user_notifications_self_delete ON user_notifications
  FOR DELETE USING (user_id = auth.uid());
