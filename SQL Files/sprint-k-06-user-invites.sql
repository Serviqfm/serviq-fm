-- Sprint K — user invite tracking (pending-invite status, UpKeep parity)
-- Run in Supabase SQL editor. Idempotent.
--
-- Status is DERIVED in app code, never stored:
--   pending  = invited_at IS NOT NULL AND first_login_at IS NULL
--   active   = is_active AND NOT pending
--   inactive = is_active = false
--
-- Existing users have invited_at = NULL so they are never shown as pending.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_login_at timestamptz;

-- First-login tracking.
-- GoTrue bumps auth.users.last_sign_in_at on EVERY sign-in (password, OAuth,
-- magic link, mobile app). A trigger on that column is the only spot that
-- reliably covers all login flows — password logins never pass through
-- /auth/callback. The function swallows errors so tracking can never block a
-- sign-in.
CREATE OR REPLACE FUNCTION public.set_first_login_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.users
     SET first_login_at = now()
   WHERE id = NEW.id
     AND first_login_at IS NULL;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_first_login ON auth.users;
CREATE TRIGGER trg_users_first_login
  AFTER UPDATE OF last_sign_in_at ON auth.users
  FOR EACH ROW
  WHEN (NEW.last_sign_in_at IS DISTINCT FROM OLD.last_sign_in_at)
  EXECUTE FUNCTION public.set_first_login_at();
