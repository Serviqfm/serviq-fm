-- W5 / LOG-01 — Convert the user_notifications dedupe guard from a partial unique
-- INDEX to a real UNIQUE CONSTRAINT so PostgREST upsert can target it.
--
-- Why: NotificationService.insertInApp() now uses .upsert(..., { onConflict:
-- 'user_id,dedupe_key', ignoreDuplicates: true }) so a cron re-notify is
-- ON CONFLICT DO NOTHING (HTTP 200) instead of a 23505/409 that spams the log
-- hundreds of times a day. PostgREST's onConflict can only name a UNIQUE
-- constraint (or full unique index) — NOT a PARTIAL unique index (the old
-- `... WHERE dedupe_key IS NOT NULL`). So we swap the partial index for a
-- constraint.
--
-- Dedupe guarantee preserved: exactly one row per (user_id, dedupe_key) when
-- dedupe_key is non-null. Postgres 15+ defaults to NULLS DISTINCT, so rows with
-- dedupe_key IS NULL are NOT deduped — identical to the old partial WHERE clause,
-- which simply excluded NULLs from the index. Ad-hoc (NULL-key) notifications
-- stay unrestricted.
--
-- Idempotent. Safe to run twice. Run in the Supabase SQL editor.

-- Drop the old partial index (created by t10-01-user-notifications.sql).
DROP INDEX IF EXISTS uq_user_notifications_dedupe;

-- Add the UNIQUE constraint only if it doesn't already exist. (ADD CONSTRAINT
-- has no IF NOT EXISTS, so guard on pg_constraint.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_user_notifications_dedupe'
  ) THEN
    ALTER TABLE user_notifications
      ADD CONSTRAINT uq_user_notifications_dedupe UNIQUE (user_id, dedupe_key);
  END IF;
END $$;
