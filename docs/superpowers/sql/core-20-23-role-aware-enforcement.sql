-- CORE-20 / CORE-23 — Role-aware, DB-level enforcement for work-order status
-- transitions and user-privilege changes. Idempotent. Run in the Supabase SQL
-- editor. No app code change ships with this — it is a pure security backstop.
--
-- WHY A TRIGGER (not RLS): the mobile app and any direct PostgREST client write
-- `work_orders`/`users` with the caller's own JWT, so the web routes' role checks
-- (CORE-01/02/03, WO-02, users role safety) are bypassed there. RLS can gate WHO
-- may touch a row, but cannot compare OLD.status -> NEW.status in one policy, which
-- transition legality requires. A BEFORE UPDATE trigger can, and it is the durable
-- chokepoint every client passes through.
--
-- WHY IT DOES NOT BREAK THE WEB APP: the web API routes do their writes with the
-- service_role key (jwt role = 'service_role'), which these triggers deliberately
-- skip — those writes are already role-validated server-side. The trigger only
-- enforces on the 'authenticated' path (mobile / direct PostgREST). No-JWT contexts
-- (this SQL editor, pg_cron, SECURITY DEFINER jobs) are skipped too, so data fixes
-- and automation keep working.
--
-- Roles: admin, manager, technician, requester.  Statuses: new, assigned,
-- in_progress, on_hold, completed, closed.

-- ---------------------------------------------------------------------------
-- CORE-20 — work-order transition enforcement
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_wo_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_role      text;
  v_is_worker boolean;
BEGIN
  -- Only guard the direct-PostgREST / authenticated path. service_role (web
  -- routes) and no-JWT contexts (SQL editor, cron, definer jobs) pass untouched.
  IF nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
       IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;

  SELECT role INTO v_role FROM public.users WHERE id = v_uid;

  -- Requesters are read-only on work orders (CORE-19/CORE-20). An unknown/absent
  -- profile is treated as unprivileged and denied.
  IF v_role IS NULL OR v_role = 'requester' THEN
    RAISE EXCEPTION 'Requesters cannot modify work orders' USING ERRCODE = '42501';
  END IF;

  -- CORE-02: a closed work order is locked; only a manager/admin may act on it
  -- (their only legitimate action is reopening it, handled below).
  IF OLD.status = 'closed' AND v_role NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'Closed work orders are locked. Ask a manager to reopen.'
      USING ERRCODE = '42501';
  END IF;

  -- CORE-20 root guard: "worker" status (assigned_to / additional_workers) is what
  -- authorizes starting or completing a WO, so a non-manager must not be able to
  -- grant it — to themselves OR to a colleague (the collusion path). Field-only
  -- edits are NOT status changes, so without this a technician could rewrite the
  -- worker list in one call, then someone on it acts on the WO in the next.
  -- Assignment is a manager function: the web hides these fields for non-managers,
  -- sets assigned_to via the service-role PATCH route, and this is the durable gate.
  IF v_role NOT IN ('admin', 'manager') THEN
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
      RAISE EXCEPTION 'Only a manager or admin can assign a work order'
        USING ERRCODE = '42501';
    END IF;
    -- Any change to the worker SET is blocked. Mutual containment is order- and
    -- duplicate-insensitive, so a no-op re-save of the same members still passes.
    IF NOT (COALESCE(NEW.additional_workers, ARRAY[]::uuid[]) @> COALESCE(OLD.additional_workers, ARRAY[]::uuid[])
            AND COALESCE(NEW.additional_workers, ARRAY[]::uuid[]) <@ COALESCE(OLD.additional_workers, ARRAY[]::uuid[])) THEN
      RAISE EXCEPTION 'Only a manager or admin can change the workers on a work order'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Transition gating only applies when the status actually changes; field-only
  -- edits (time logs, photos, notes) are left to route/RLS enforcement.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- COALESCE the scalar compare to a real boolean: an unassigned WO has
    -- assigned_to = NULL, and `NULL = v_uid` is NULL, not FALSE. Left raw, the
    -- guards below would see `NOT NULL` = NULL and silently pass, letting a
    -- technician complete/progress any UNASSIGNED work order.
    v_is_worker := COALESCE(OLD.assigned_to = v_uid, false)
                OR (v_uid = ANY (COALESCE(OLD.additional_workers, ARRAY[]::uuid[])));

    IF OLD.status IN ('completed', 'closed')
       AND NEW.status NOT IN ('completed', 'closed') THEN
      -- Reopen (CORE-03): manager/admin only.
      IF v_role NOT IN ('admin', 'manager') THEN
        RAISE EXCEPTION 'Only a manager or admin can reopen a work order'
          USING ERRCODE = '42501';
      END IF;

    ELSIF NEW.status = 'closed' THEN
      -- Close (CORE-01): manager/admin only, and only from completed.
      IF v_role NOT IN ('admin', 'manager') THEN
        RAISE EXCEPTION 'Only a manager or admin can close a work order'
          USING ERRCODE = '42501';
      END IF;
      IF OLD.status <> 'completed' THEN
        RAISE EXCEPTION 'A work order must be completed before it can be closed'
          USING ERRCODE = '42501';
      END IF;

    ELSIF NEW.status = 'completed' THEN
      -- Complete: manager/admin, or a worker on the WO (assignee / additional).
      IF v_role NOT IN ('admin', 'manager') AND NOT v_is_worker THEN
        RAISE EXCEPTION 'Only the assigned worker or a manager can complete this work order'
          USING ERRCODE = '42501';
      END IF;

    ELSE
      -- Start / hold / resume (into in_progress or on_hold): a technician may
      -- only drive WOs assigned to them; managers/admins anywhere.
      IF v_role = 'technician' AND NOT v_is_worker THEN
        RAISE EXCEPTION 'Technicians can only update work orders assigned to them'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_wo_transition ON public.work_orders;
CREATE TRIGGER trg_enforce_wo_transition
  BEFORE UPDATE ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_wo_transition();

-- ---------------------------------------------------------------------------
-- CORE-23 — user privilege lock (closes a direct-PostgREST escalation hole:
-- the org-isolation RLS lets any authenticated member UPDATE any user row in
-- their org, so a technician could self-promote to admin, or disable/edit a
-- colleague. Admin edits all run server-side under service_role and are unaffected.)
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
