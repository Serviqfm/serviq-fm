-- W6-11 / 1C-32 — org-defined CUSTOM ROLES as a UI + route permission OVERLAY.
-- Run in the Supabase SQL editor BEFORE deploying the Settings > Roles page.
-- Idempotent. Safe to run twice.
--
-- DESIGN (critical — do not "replace" the 4-role model with this):
--   public.users.role stays one of the 4 BASE roles (admin/manager/technician/
--   requester) and remains the SOLE anchor of every RLS policy and both triggers
--   (enforce_wo_transition, generate_due_pm_work_orders). NOTHING in this file
--   changes an existing policy or grants anything.
--
--   A custom role is a SUBTRACTIVE overlay:
--     * custom_roles.base_role is the intended TEMPLATE/CEILING — documentation for
--       the admin picking it. It is NEVER read to authorize anything, anywhere.
--     * custom_roles.permissions is a jsonb map capability -> boolean. Only an
--       EXPLICIT false matters: it DENIES a capability the user's real base role
--       would otherwise have. Absent / true / no custom role = unchanged behavior.
--     * A custom role can therefore never grant a capability users.role lacks. If a
--       technician's custom_role_id somehow pointed at an admin-base custom role,
--       they would gain exactly nothing.
--
--   users.custom_role_id is org-bound by a COMPOSITE FK (id, organisation_id), so a
--   row can never reference another org's custom role. ON DELETE SET NULL: deleting
--   a custom role silently drops the overlay, never orphans or locks out a user.
--
-- Security posture:
--   * 4-policy org RLS on custom_roles. SELECT = any org member (the client hook
--     reads its own overlay). INSERT/UPDATE/DELETE = ADMIN ONLY — managing roles is
--     an admin function — with WITH CHECK org-bound on INSERT and UPDATE.
--   * users.custom_role_id is LOCKED from client self-assignment by an additive
--     check in enforce_user_privilege_lock (below): only service_role (the admin
--     users API routes) may set it.
--
-- Acceptance (owner, after running):
--   * anon-key SELECT returns only own-org custom roles; cross-org INSERT/UPDATE denied.
--   * a manager/technician cannot INSERT/UPDATE/DELETE a custom role (admin-only gate).
--   * a user cannot set their own users.custom_role_id via PostgREST (privilege lock).
--   * a base_role outside the 4 values is rejected by the CHECK.
--   * app `next build`s and runs WITHOUT this migration applied (table/column optional).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.custom_roles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  name_ar         TEXT,
  base_role       TEXT NOT NULL
    CHECK (base_role IN ('admin','manager','technician','requester')),
  permissions     JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (organisation_id, name)
);

CREATE INDEX IF NOT EXISTS idx_custom_roles_org ON public.custom_roles(organisation_id);

-- Composite unique key so users.custom_role_id can carry an org-bound FK.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'custom_roles_id_org_key' AND conrelid = 'public.custom_roles'::regclass
  ) THEN
    ALTER TABLE public.custom_roles ADD CONSTRAINT custom_roles_id_org_key
      UNIQUE (id, organisation_id);
  END IF;
END $$;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS custom_role_id UUID;

-- Org-bound composite FK: the referenced custom role must belong to the SAME org
-- as the user row. Nullable, ON DELETE SET NULL.
-- The COLUMN LIST on SET NULL is load-bearing (PG15+): without it, deleting a
-- custom role would try to null the user's organisation_id too. Only the overlay
-- column is cleared.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_custom_role_org_fkey' AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users ADD CONSTRAINT users_custom_role_org_fkey
      FOREIGN KEY (custom_role_id, organisation_id)
      REFERENCES public.custom_roles(id, organisation_id)
      ON DELETE SET NULL (custom_role_id);
  END IF;
END $$;

ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;

-- SELECT: any member of the org (the signed-in user reads their own overlay, and
-- the admin page lists the org's roles).
DROP POLICY IF EXISTS custom_roles_org_select ON public.custom_roles;
CREATE POLICY custom_roles_org_select ON public.custom_roles
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  );

-- INSERT: own org + ADMIN only.
DROP POLICY IF EXISTS custom_roles_org_insert ON public.custom_roles;
CREATE POLICY custom_roles_org_insert ON public.custom_roles
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
  );

-- UPDATE: own org + ADMIN only; WITH CHECK blocks an org-swap.
DROP POLICY IF EXISTS custom_roles_org_update ON public.custom_roles;
CREATE POLICY custom_roles_org_update ON public.custom_roles
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
  );

-- DELETE: own org + ADMIN only.
DROP POLICY IF EXISTS custom_roles_org_delete ON public.custom_roles;
CREATE POLICY custom_roles_org_delete ON public.custom_roles
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
  );

-- ---------------------------------------------------------------------------
-- Privilege lock — SUPERSEDES the definition in core-20-23-role-aware-enforcement.sql.
-- PURELY ADDITIVE: every existing check is preserved verbatim; the ONLY change is
-- that custom_role_id joins role/organisation_id/is_active as an administrator-only
-- column on the authenticated (direct PostgREST) path. Assigning a custom role is
-- therefore only possible from the service_role admin users routes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_user_privilege_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
       IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;  -- service_role / no-JWT paths pass
  END IF;

  -- On the direct path a user may only modify their OWN row (push token, name,
  -- first_login_at, and self-service account deletion via request_account_deletion,
  -- which sets `disabled` on the caller's own row — see below).
  IF OLD.id <> auth.uid() THEN
    RAISE EXCEPTION 'You can only modify your own profile' USING ERRCODE = '42501';
  END IF;

  -- Privileged fields are administrator-only and change only server-side.
  -- NOTE: `is_active` (admin activation) and `disabled` (account lockout / the
  -- login gate the mobile app checks) are DISTINCT columns — keep them separate,
  -- because self-service deletion writes `disabled`, not `is_active`.
  IF NEW.role            IS DISTINCT FROM OLD.role
     OR NEW.organisation_id IS DISTINCT FROM OLD.organisation_id
     OR NEW.is_active    IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION 'Changing role, organisation, or active status requires an administrator'
      USING ERRCODE = '42501';
  END IF;

  -- W6-11: a custom role is assigned by an admin through the server-side users
  -- routes only — never self-assigned from the client.
  IF NEW.custom_role_id IS DISTINCT FROM OLD.custom_role_id THEN
    RAISE EXCEPTION 'Changing the custom role requires an administrator'
      USING ERRCODE = '42501';
  END IF;

  -- Re-enabling a locked-out account is administrator-only. Self-service deletion
  -- (disabled false -> true on your own row) is allowed; undoing a deletion or an
  -- admin lockout (true -> false) with a still-valid token is not.
  IF COALESCE(OLD.disabled, false) = true AND COALESCE(NEW.disabled, false) = false THEN
    RAISE EXCEPTION 'Only an administrator can re-enable a disabled account'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_user_privilege_lock ON public.users;
CREATE TRIGGER trg_enforce_user_privilege_lock
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.enforce_user_privilege_lock();
