-- Batch 2 / DV-09 — Force a password change after a temp-password first login.
-- Idempotent. Run in the Supabase SQL editor.
--
-- Adds a boolean flag on the users profile. The three invite routes (POST /api/users,
-- resend-invite, POST /api/platform/tenants) set it true when they mint a temp
-- password; the dashboard middleware redirects a signed-in user to /change-password
-- while the flag is true; POST /api/account/password clears it once a new password is
-- set. Existing users default to false, so they are never forced to change.
--
-- Read/written only by the service-role client (middleware + those routes), so no RLS
-- policy is needed.
--
-- RUN THIS BEFORE DEPLOYING THE BATCH 2 CODE. The three invite write-paths (POST
-- /api/users, POST /api/platform/tenants, resend-invite) set must_change_password on
-- insert/update and will FAIL (PostgREST PGRST204) if the column is absent — breaking
-- user and tenant creation. The middleware read degrades gracefully via its error
-- fallback, but the writes do not. (Same "SQL first, then merge" order as every batch.)

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
