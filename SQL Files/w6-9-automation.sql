-- WO-27 — Automation workflow builder (MVP).
-- Run in the Supabase SQL editor BEFORE deploying /dashboard/automation.
-- Idempotent. Safe to run twice. Styled after w6-8-handovers.sql + w5-4-downtime-triggers.sql.
--
-- What it is: an org-scoped rules engine that reacts to work-order events.
--   A rule = (trigger_event, condition, action):
--     * trigger_event: 'wo_created' (WO inserted) | 'wo_completed' (status → completed).
--     * condition: a simple equals-match jsonb map, e.g. {"priority":"critical"} or
--       {"category":"HVAC"}. An empty {} matches every WO. Only the keys 'priority'
--       and 'category' are honoured (any other key is ignored) — no arbitrary code.
--     * action: MVP supports one shape — {"type":"notify_role","role":"admin"|"manager"}.
--       On a match, every user of that role in the org gets a user_notifications row.
--   Rules are admin/manager-managed; the builder page creates one trigger + one
--   condition field/value + one action at a time.
--
-- ACTIVATION (additive, non-invasive):
--   AFTER INSERT and AFTER UPDATE triggers on work_orders — SECURITY DEFINER, pinned
--   search_path, EXCEPTION WHEN OTHERS swallow. They are best-effort: a missing/empty
--   automation_rules table or a malformed rule must NEVER block or fail a work_orders
--   write. Distinct names; they coexist with the shipped downtime / last_pm / sla
--   triggers and DO NOT reference or alter generate_due_pm_work_orders.
--
-- Security posture (4-policy org RLS):
--   * SELECT: any org member (so the builder can list rules).
--   * INSERT / UPDATE / DELETE: admin/manager only (privileged writes);
--     WITH CHECK pins organisation_id + created_by to the caller's org.
--   * The trigger's notification INSERT is SECURITY DEFINER (bypasses user_notifications
--     RLS) so auto-writes work on every WO write path (manual form, PM cron, inspection
--     cron, limited techs).
--
-- Acceptance (owner, after running):
--   * anon-key SELECT on automation_rules returns only own-org rows.
--   * a technician CANNOT INSERT/UPDATE/DELETE a rule (role gate); admin/manager can.
--   * creating a rule {wo_created, {"priority":"critical"}, notify_role admin} then
--     inserting a critical WO drops one notification per admin in the org.
--   * dropping the automation_rules table and inserting a WO still succeeds (non-fatal).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.automation_rules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  trigger_event    TEXT NOT NULL,
  condition        JSONB NOT NULL DEFAULT '{}'::jsonb,
  action           JSONB NOT NULL,
  created_by       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT automation_rules_trigger_chk CHECK (trigger_event IN ('wo_created', 'wo_completed')),
  CONSTRAINT automation_rules_action_chk  CHECK (action->>'type' IN ('notify_role'))
);

CREATE INDEX IF NOT EXISTS idx_automation_rules_org
  ON public.automation_rules(organisation_id);
-- Trigger hot path: active rules for an org+event.
CREATE INDEX IF NOT EXISTS idx_automation_rules_active
  ON public.automation_rules(organisation_id, trigger_event) WHERE is_active;

ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;

-- SELECT: any member of the org.
DROP POLICY IF EXISTS automation_rules_org_select ON public.automation_rules;
CREATE POLICY automation_rules_org_select ON public.automation_rules
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  );

-- INSERT: admin/manager only; org + created_by bound to the caller.
DROP POLICY IF EXISTS automation_rules_org_insert ON public.automation_rules;
CREATE POLICY automation_rules_org_insert ON public.automation_rules
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
    AND (created_by IS NULL OR created_by = auth.uid())
  );

-- UPDATE: admin/manager only; WITH CHECK blocks org-swap.
DROP POLICY IF EXISTS automation_rules_org_update ON public.automation_rules;
CREATE POLICY automation_rules_org_update ON public.automation_rules
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  )
  WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
    AND (created_by IS NULL OR created_by IN (SELECT id FROM public.users WHERE organisation_id = automation_rules.organisation_id))
  );

-- DELETE: admin/manager only.
DROP POLICY IF EXISTS automation_rules_org_delete ON public.automation_rules;
CREATE POLICY automation_rules_org_delete ON public.automation_rules
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  );

-- ── ACTIVATION: run matching rules on a work-order event ─────────────────────
-- One function drives both triggers; TG_OP + the status transition decide the
-- event. Strictly constrained: only 'priority'/'category' equals-match, only the
-- notify_role action. Wrapped so a bad rule / absent table never blocks the WO.
CREATE OR REPLACE FUNCTION public.run_automation_rules_on_wo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_event text;
  v_rule  record;
  v_role  text;
BEGIN
  -- Which event fired?
  IF TG_OP = 'INSERT' THEN
    v_event := 'wo_created';
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'completed'
        AND OLD.status IS DISTINCT FROM NEW.status THEN
    v_event := 'wo_completed';
  ELSE
    RETURN NEW;  -- an UPDATE that is not a completion transition: nothing to do
  END IF;

  FOR v_rule IN
    SELECT id, condition, action
    FROM public.automation_rules
    WHERE organisation_id = NEW.organisation_id
      AND is_active
      AND trigger_event = v_event
  LOOP
    -- Condition: simple equals-match on the two honoured keys. A key present in
    -- the rule that does not equal the WO's value skips the rule. Absent key = wildcard.
    IF (v_rule.condition ? 'priority')
       AND (v_rule.condition->>'priority') IS DISTINCT FROM NEW.priority THEN
      CONTINUE;
    END IF;
    IF (v_rule.condition ? 'category')
       AND (v_rule.condition->>'category') IS DISTINCT FROM NEW.category THEN
      CONTINUE;
    END IF;

    -- Action: notify_role → one row per user of that role in the org.
    -- dedupe_key 'automation:<rule>:<wo>' makes each rule fire once per WO per user.
    IF v_rule.action->>'type' = 'notify_role' THEN
      v_role := v_rule.action->>'role';
      IF v_role IN ('admin', 'manager') THEN
        INSERT INTO public.user_notifications
          (organisation_id, user_id, type_key, title, body, link, dedupe_key)
        SELECT
          NEW.organisation_id, u.id, 'automation',
          CASE WHEN COALESCE(u.notification_language, 'en') = 'ar'
               THEN 'أتمتة: ' || COALESCE(NEW.wo_number, 'أمر عمل')
               ELSE 'Automation: ' || COALESCE(NEW.wo_number, 'Work order') END,
          NEW.title,  -- WO title is user-authored free text; not translated
          '/dashboard/work-orders/' || NEW.id,
          'automation:' || v_rule.id || ':' || NEW.id
        FROM public.users u
        WHERE u.organisation_id = NEW.organisation_id
          AND u.role = v_role
        ON CONFLICT (user_id, dedupe_key) DO NOTHING;
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;  -- ponytail: best-effort; a bad/absent rule must NEVER block the WO write
END;
$$;

DROP TRIGGER IF EXISTS trg_run_automation_rules_wo_ins ON public.work_orders;
CREATE TRIGGER trg_run_automation_rules_wo_ins
  AFTER INSERT ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.run_automation_rules_on_wo();

DROP TRIGGER IF EXISTS trg_run_automation_rules_wo_upd ON public.work_orders;
CREATE TRIGGER trg_run_automation_rules_wo_upd
  AFTER UPDATE ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.run_automation_rules_on_wo();
