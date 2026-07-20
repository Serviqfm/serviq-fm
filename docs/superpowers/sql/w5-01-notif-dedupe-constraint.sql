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

-- Swap the partial index for the constraint, guarded as ONE unit on
-- pg_constraint. The DROP INDEX must live inside the guard: once the constraint
-- exists its backing index reuses the same name, and a bare
-- `DROP INDEX IF EXISTS uq_user_notifications_dedupe` on a re-run would raise
-- "cannot drop index ... because constraint ... requires it" (IF EXISTS does
-- not suppress that dependency error). Guarding the whole block makes a re-run a
-- clean no-op. (ADD CONSTRAINT has no IF NOT EXISTS, hence the pg_constraint check.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_user_notifications_dedupe'
  ) THEN
    -- Only the partial index exists at this point (constraint not yet created),
    -- so this drop has no dependents.
    DROP INDEX IF EXISTS uq_user_notifications_dedupe;
    ALTER TABLE user_notifications
      ADD CONSTRAINT uq_user_notifications_dedupe UNIQUE (user_id, dedupe_key);
  END IF;
END $$;
