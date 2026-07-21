-- W5 / CORE-11 — Per-user notification language.
--
-- Adds users.notification_language (nullable text). NotificationService reads it
-- (via the service-role client, bypassing RLS) to pick EN vs AR title/body for the
-- templated notifications it sends. NULL = fall back to 'en' (there is no org-level
-- default_language column today; add one to the COALESCE chain here + in
-- NotificationService.getRecipientLanguage if/when it exists).
--
-- Self-service write: rather than open a blanket UPDATE policy on public.users
-- (which would also expose role/organisation_id to self-edits), a column-scoped
-- SECURITY DEFINER RPC lets a signed-in user set ONLY their own
-- notification_language. The notification settings tab calls
-- supabase.rpc('set_notification_language', { lang }).
--
-- Idempotent. Safe to run twice. Run in the Supabase SQL editor.

ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_language text;

-- Guard: only 'en' | 'ar' | NULL. NOT VALID + validate keeps a re-run cheap and
-- tolerates any pre-existing rows (all NULL on first add).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_notification_language_chk'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_notification_language_chk
      CHECK (notification_language IN ('en', 'ar')) NOT VALID;
    ALTER TABLE users VALIDATE CONSTRAINT users_notification_language_chk;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION set_notification_language(lang text)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE users
     SET notification_language = NULLIF(lang, '')
   WHERE id = auth.uid()
     AND (lang IS NULL OR lang = '' OR lang IN ('en', 'ar'));
$$;

REVOKE ALL ON FUNCTION set_notification_language(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_notification_language(text) TO authenticated;
