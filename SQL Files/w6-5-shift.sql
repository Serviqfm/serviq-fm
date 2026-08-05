-- W6.5 / 1C-30 — Per-user shift status for notification muting.
--
-- Adds users.on_shift (boolean, NOT NULL DEFAULT true). NotificationService reads
-- it (service-role client, bypasses RLS) and, while a user is off-shift
-- (on_shift = false), suppresses NON-CRITICAL push notifications. Critical alerts
-- (overdue / escalation) always send. DEFAULT true means every existing user is
-- "on shift" until they toggle off — existing behaviour is unchanged (fail open).
--
-- Self-service write: rather than open a blanket UPDATE policy on public.users, a
-- column-scoped SECURITY DEFINER RPC lets a signed-in user set ONLY their own
-- on_shift flag, mirroring set_notification_language (w5-6-notif-language.sql).
-- The notification settings tab calls supabase.rpc('set_on_shift', { p_on }).
--
-- Idempotent. Safe to run twice. Run in the Supabase SQL editor.

ALTER TABLE users ADD COLUMN IF NOT EXISTS on_shift boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION set_on_shift(p_on boolean)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE users
     SET on_shift = COALESCE(p_on, true)
   WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION set_on_shift(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_on_shift(boolean) TO authenticated;
