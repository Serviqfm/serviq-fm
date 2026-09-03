-- P1 / Procurement — requisitions + named-approver chains (playbook §4 Batch P1).
-- Run in the Supabase SQL editor BEFORE deploying /dashboard/procurement/requisitions.
-- Idempotent. Safe to run twice. Styled after w4-01-purchasing.sql (4-policy org RLS)
-- and w6-7-cost-centers.sql (admin/manager-gated config tables, org-bound composite FKs).
--
-- Five tables + two RPCs:
--   * procurement_approval_rules       — threshold bands (min/max amount) per org
--   * procurement_approval_rule_steps  — the ordered NAMED approvers of a band
--   * requisitions                     — the request header
--   * requisition_items                — lines, same shape as purchase_order_items
--   * requisition_approvals            — the MATERIALISED chain for one requisition
--   * submit_requisition()  — picks the band, builds the chain, flips to pending
--   * decide_requisition()  — sequential approve/reject, lowest pending step only
--
-- Playbook A3: approvals are named USER IDs with a free-text label ("Finance",
-- "Director"), NOT new roles. ServiqFM's role model (admin/manager/technician/
-- client + subtractive custom-role overlay) is untouched.
--
-- Sequential enforcement lives in the RPCs, never in the UI: both are SECURITY
-- DEFINER and read auth.uid() themselves, so they cannot be aimed at another
-- org's requisition (same posture as receive_purchase_order()).
--
-- Known residual (same posture as w4-01-purchasing.sql): requisition_items keeps
-- the open 4-policy org RLS, so a direct PostgREST write could edit the LINES of
-- a requisition already in flight — the materialised chain would then be the one
-- picked for the old total. Reads stay org-scoped and the status itself is
-- trigger-guarded (section 9); close this too with a pending_approval line-edit
-- trigger if direct client writes are ever added.
--
-- The app degrades gracefully WITHOUT this migration: the requisition pages read
-- empty and the API routes surface the PostgREST error, so `next build` and the
-- running CAFM app both work before this runs.
--
-- Acceptance (owner, after running — see procurement-02-requisitions.test.sql):
--   * cross-org SELECT/INSERT denied on all four new tables.
--   * band selection matches the spec example (<500 = 1 step, 500-5k = 2, >5k = 3).
--   * approver #2 cannot act before #1 (raises).
--   * reject short-circuits the chain; a second submit is a no-op; resubmit after
--     a rejection rebuilds the chain from scratch.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. procurement_approval_rules — one threshold band.
--    [min_amount, max_amount) — max_amount NULL means "and above" (infinity).
--    Bands are org config: admin/manager write, any member reads (the requisition
--    detail page shows the chain that was picked).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.procurement_approval_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  min_amount      NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (min_amount >= 0),
  max_amount      NUMERIC(14,2) CHECK (max_amount IS NULL OR max_amount > min_amount),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proc_rules_org ON public.procurement_approval_rules(organisation_id, is_active);

-- Composite unique key so the step rows can be org-bound (a plain FK on rule_id
-- alone would let a raw PostgREST INSERT hang a step off another tenant's band).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'procurement_approval_rules_id_org_key') THEN
    ALTER TABLE public.procurement_approval_rules
      ADD CONSTRAINT procurement_approval_rules_id_org_key UNIQUE (id, organisation_id);
  END IF;
END $do$;

ALTER TABLE public.procurement_approval_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS proc_rules_org_select ON public.procurement_approval_rules;
CREATE POLICY proc_rules_org_select ON public.procurement_approval_rules
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  );
DROP POLICY IF EXISTS proc_rules_org_insert ON public.procurement_approval_rules;
CREATE POLICY proc_rules_org_insert ON public.procurement_approval_rules
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','manager')
  );
DROP POLICY IF EXISTS proc_rules_org_update ON public.procurement_approval_rules;
CREATE POLICY proc_rules_org_update ON public.procurement_approval_rules
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','manager')
  )
  WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','manager')
  );
DROP POLICY IF EXISTS proc_rules_org_delete ON public.procurement_approval_rules;
CREATE POLICY proc_rules_org_delete ON public.procurement_approval_rules
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','manager')
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. procurement_approval_rule_steps — the ordered approvers of one band.
--    label is free text ("Finance", "Director") — playbook A3: NOT a role.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.procurement_approval_rule_steps (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  rule_id          UUID NOT NULL,
  step_order       INT NOT NULL CHECK (step_order > 0),
  approver_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  label            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proc_rule_steps_rule_org_fk') THEN
    ALTER TABLE public.procurement_approval_rule_steps
      ADD CONSTRAINT proc_rule_steps_rule_org_fk
      FOREIGN KEY (rule_id, organisation_id)
      REFERENCES public.procurement_approval_rules(id, organisation_id) ON DELETE CASCADE;
  END IF;
END $do$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_proc_rule_steps_order ON public.procurement_approval_rule_steps(rule_id, step_order);
CREATE INDEX IF NOT EXISTS idx_proc_rule_steps_org ON public.procurement_approval_rule_steps(organisation_id);

ALTER TABLE public.procurement_approval_rule_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS proc_rule_steps_org_select ON public.procurement_approval_rule_steps;
CREATE POLICY proc_rule_steps_org_select ON public.procurement_approval_rule_steps
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  );
DROP POLICY IF EXISTS proc_rule_steps_org_insert ON public.procurement_approval_rule_steps;
CREATE POLICY proc_rule_steps_org_insert ON public.procurement_approval_rule_steps
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','manager')
  );
DROP POLICY IF EXISTS proc_rule_steps_org_update ON public.procurement_approval_rule_steps;
CREATE POLICY proc_rule_steps_org_update ON public.procurement_approval_rule_steps
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','manager')
  )
  WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','manager')
  );
DROP POLICY IF EXISTS proc_rule_steps_org_delete ON public.procurement_approval_rule_steps;
CREATE POLICY proc_rule_steps_org_delete ON public.procurement_approval_rule_steps
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','manager')
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. requisitions — the request header.
--    cost_center_id uses the org-bound composite FK (cost_centers already carries
--    cost_centers_id_org_key from w6-7-cost-centers.sql). site_id is a plain FK,
--    matching purchase_orders.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.requisitions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id    UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  requisition_number BIGINT GENERATED ALWAYS AS IDENTITY,
  title              TEXT NOT NULL,
  justification      TEXT,
  site_id            UUID REFERENCES public.sites(id) ON DELETE SET NULL,
  cost_center_id     UUID,
  needed_by          DATE,
  status             TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','pending_approval','approved','rejected','converted','cancelled')),
  created_by         UUID REFERENCES public.users(id) ON DELETE SET NULL,
  submitted_at       TIMESTAMPTZ,
  decided_at         TIMESTAMPTZ,
  purchase_order_id  UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_requisitions_org_status ON public.requisitions(organisation_id, status);
CREATE INDEX IF NOT EXISTS idx_requisitions_creator    ON public.requisitions(created_by);

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'requisitions_id_org_key') THEN
    ALTER TABLE public.requisitions ADD CONSTRAINT requisitions_id_org_key UNIQUE (id, organisation_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'requisitions_cost_center_org_fk')
     AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cost_centers_id_org_key') THEN
    ALTER TABLE public.requisitions
      ADD CONSTRAINT requisitions_cost_center_org_fk
      FOREIGN KEY (cost_center_id, organisation_id)
      REFERENCES public.cost_centers(id, organisation_id) ON DELETE SET NULL;
  END IF;
END $do$;

ALTER TABLE public.requisitions ENABLE ROW LEVEL SECURITY;

-- Any member of the org may raise a requisition (playbook: all roles create);
-- the approval chain, not RLS, is what gates spending.
DROP POLICY IF EXISTS requisitions_org_select ON public.requisitions;
CREATE POLICY requisitions_org_select ON public.requisitions
  FOR SELECT USING (organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid()));
DROP POLICY IF EXISTS requisitions_org_insert ON public.requisitions;
CREATE POLICY requisitions_org_insert ON public.requisitions
  FOR INSERT WITH CHECK (organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid()));
DROP POLICY IF EXISTS requisitions_org_update ON public.requisitions;
CREATE POLICY requisitions_org_update ON public.requisitions
  FOR UPDATE USING (organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid()))
  WITH CHECK (organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid()));
DROP POLICY IF EXISTS requisitions_org_delete ON public.requisitions;
CREATE POLICY requisitions_org_delete ON public.requisitions
  FOR DELETE USING (organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. requisition_items — same shape as purchase_order_items so conversion is a
--    straight column copy.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.requisition_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  requisition_id  UUID NOT NULL,
  item_id         UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  description     TEXT,
  quantity        NUMERIC(12,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_cost       NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'requisition_items_req_org_fk') THEN
    ALTER TABLE public.requisition_items
      ADD CONSTRAINT requisition_items_req_org_fk
      FOREIGN KEY (requisition_id, organisation_id)
      REFERENCES public.requisitions(id, organisation_id) ON DELETE CASCADE;
  END IF;
END $do$;

CREATE INDEX IF NOT EXISTS idx_requisition_items_req ON public.requisition_items(requisition_id);
CREATE INDEX IF NOT EXISTS idx_requisition_items_org ON public.requisition_items(organisation_id);

ALTER TABLE public.requisition_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS requisition_items_org_select ON public.requisition_items;
CREATE POLICY requisition_items_org_select ON public.requisition_items
  FOR SELECT USING (organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid()));
DROP POLICY IF EXISTS requisition_items_org_insert ON public.requisition_items;
CREATE POLICY requisition_items_org_insert ON public.requisition_items
  FOR INSERT WITH CHECK (organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid()));
DROP POLICY IF EXISTS requisition_items_org_update ON public.requisition_items;
CREATE POLICY requisition_items_org_update ON public.requisition_items
  FOR UPDATE USING (organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid()))
  WITH CHECK (organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid()));
DROP POLICY IF EXISTS requisition_items_org_delete ON public.requisition_items;
CREATE POLICY requisition_items_org_delete ON public.requisition_items
  FOR DELETE USING (organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. requisition_approvals — the chain MATERIALISED at submit time, so editing a
--    rule later never rewrites the history of a requisition already in flight.
--    Rows are written by the two RPCs below. The direct-write policies are the
--    belt to the RPCs' braces: INSERT/DELETE are admin/manager only, and UPDATE
--    additionally requires the caller to BE that step's approver — a raw
--    PostgREST write still cannot approve on someone else's behalf (it can,
--    however, act out of order; only the RPC enforces sequencing).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.requisition_approvals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  requisition_id   UUID NOT NULL,
  step_order       INT NOT NULL CHECK (step_order > 0),
  approver_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  label            TEXT,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  comment          TEXT,
  acted_at         TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'requisition_approvals_req_org_fk') THEN
    ALTER TABLE public.requisition_approvals
      ADD CONSTRAINT requisition_approvals_req_org_fk
      FOREIGN KEY (requisition_id, organisation_id)
      REFERENCES public.requisitions(id, organisation_id) ON DELETE CASCADE;
  END IF;
END $do$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_req_approvals_step ON public.requisition_approvals(requisition_id, step_order);
CREATE INDEX IF NOT EXISTS idx_req_approvals_approver ON public.requisition_approvals(approver_user_id, status);
CREATE INDEX IF NOT EXISTS idx_req_approvals_org ON public.requisition_approvals(organisation_id);

ALTER TABLE public.requisition_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS req_approvals_org_select ON public.requisition_approvals;
CREATE POLICY req_approvals_org_select ON public.requisition_approvals
  FOR SELECT USING (organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid()));
DROP POLICY IF EXISTS req_approvals_org_insert ON public.requisition_approvals;
CREATE POLICY req_approvals_org_insert ON public.requisition_approvals
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','manager')
  );
DROP POLICY IF EXISTS req_approvals_org_update ON public.requisition_approvals;
CREATE POLICY req_approvals_org_update ON public.requisition_approvals
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND approver_user_id = auth.uid()
  )
  WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND approver_user_id = auth.uid()
  );
DROP POLICY IF EXISTS req_approvals_org_delete ON public.requisition_approvals;
CREATE POLICY req_approvals_org_delete ON public.requisition_approvals
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','manager')
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. purchase_orders.requisition_id — the PO's back-link to the requisition it
--    came from. Org-bound composite FK (cost-centers pattern).
--    ponytail: requisitions.purchase_order_id is the mirror of this link. BOTH are
--    written in exactly one place — the convert route — so they cannot drift; this
--    column is the authoritative one (a PO always knows its source).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS requisition_id UUID;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_requisition_org_fk') THEN
    ALTER TABLE public.purchase_orders
      ADD CONSTRAINT purchase_orders_requisition_org_fk
      FOREIGN KEY (requisition_id, organisation_id)
      REFERENCES public.requisitions(id, organisation_id) ON DELETE SET NULL;
  END IF;
END $do$;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_requisition ON public.purchase_orders(requisition_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RPC submit_requisition — the ONLY way a requisition enters approval.
--    Sums the lines, picks the active band containing that total, materialises
--    the chain, flips to pending_approval. No matching band => AUTO-APPROVE
--    (permissive default, house philosophy: a tenant that never configured bands
--    is not blocked from working). Idempotent: anything not draft/rejected is
--    returned unchanged. A resubmit after rejection rebuilds the chain from
--    scratch, so an approver who rejected sees a fresh pending row.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION submit_requisition(p_id UUID)
RETURNS requisitions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_org     UUID;
  v_req     requisitions%ROWTYPE;
  v_total   NUMERIC(14,2);
  v_rule_id UUID;
  v_steps   INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Marks this transaction as "the status change is coming from the workflow",
  -- which is what requisitions_guard_status() below looks for.
  PERFORM set_config('app.requisition_rpc', '1', true);

  SELECT organisation_id INTO v_org FROM users WHERE id = auth.uid();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'no organisation';
  END IF;

  SELECT * INTO v_req FROM requisitions
    WHERE id = p_id AND organisation_id = v_org
    FOR UPDATE;
  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'requisition not found in your organisation';
  END IF;

  -- Idempotent: only a draft or a rejected (revision loop) requisition submits.
  IF v_req.status NOT IN ('draft','rejected') THEN
    RETURN v_req;
  END IF;

  -- Only the creator resubmits their own work; admin/manager may submit any.
  IF v_req.created_by <> auth.uid()
     AND (SELECT role FROM users WHERE id = auth.uid()) NOT IN ('admin','manager') THEN
    RAISE EXCEPTION 'only the creator or an admin/manager may submit this requisition';
  END IF;

  SELECT COALESCE(SUM(quantity * unit_cost), 0) INTO v_total
    FROM requisition_items WHERE requisition_id = p_id AND organisation_id = v_org;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'requisition has no priced lines';
  END IF;

  -- A resubmit starts from a clean chain.
  DELETE FROM requisition_approvals WHERE requisition_id = p_id AND organisation_id = v_org;

  -- Band selection: [min_amount, max_amount), max NULL = and above. Overlapping
  -- bands are a config error; the highest min_amount wins so the pick is
  -- deterministic rather than arbitrary.
  SELECT id INTO v_rule_id
    FROM procurement_approval_rules
   WHERE organisation_id = v_org
     AND is_active
     AND v_total >= min_amount
     AND (max_amount IS NULL OR v_total < max_amount)
   ORDER BY min_amount DESC
   LIMIT 1;

  IF v_rule_id IS NOT NULL THEN
    INSERT INTO requisition_approvals
      (organisation_id, requisition_id, step_order, approver_user_id, label, status)
    SELECT v_org, p_id, s.step_order, s.approver_user_id, s.label, 'pending'
      FROM procurement_approval_rule_steps s
     WHERE s.rule_id = v_rule_id AND s.organisation_id = v_org
     ORDER BY s.step_order;
    GET DIAGNOSTICS v_steps = ROW_COUNT;
  ELSE
    v_steps := 0;
  END IF;

  IF v_steps = 0 THEN
    -- No band, or a band with no approvers configured: auto-approve.
    UPDATE requisitions
       SET status = 'approved', submitted_at = now(), decided_at = now(), updated_at = now()
     WHERE id = p_id
     RETURNING * INTO v_req;
  ELSE
    UPDATE requisitions
       SET status = 'pending_approval', submitted_at = now(), decided_at = NULL, updated_at = now()
     WHERE id = p_id
     RETURNING * INTO v_req;
  END IF;

  RETURN v_req;
END;
$fn$;

REVOKE ALL ON FUNCTION submit_requisition(UUID) FROM public;
GRANT EXECUTE ON FUNCTION submit_requisition(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. RPC decide_requisition — sequential approve/reject.
--    ONLY the approver named on the LOWEST pending step may act; anyone else
--    (including a later approver trying to jump the queue, and including an
--    admin who isn't in the chain) raises. Reject requires a comment and
--    short-circuits: the requisition goes to 'rejected' and the untouched steps
--    stay pending as a record of where the chain stopped.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION decide_requisition(p_id UUID, p_approve BOOLEAN, p_comment TEXT DEFAULT NULL)
RETURNS requisitions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_org       UUID;
  v_req       requisitions%ROWTYPE;
  v_step      requisition_approvals%ROWTYPE;
  v_remaining INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Marks this transaction as "the status change is coming from the workflow",
  -- which is what requisitions_guard_status() below looks for.
  PERFORM set_config('app.requisition_rpc', '1', true);

  SELECT organisation_id INTO v_org FROM users WHERE id = auth.uid();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'no organisation';
  END IF;

  SELECT * INTO v_req FROM requisitions
    WHERE id = p_id AND organisation_id = v_org
    FOR UPDATE;
  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'requisition not found in your organisation';
  END IF;

  IF v_req.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'requisition is not awaiting approval';
  END IF;

  SELECT * INTO v_step FROM requisition_approvals
    WHERE requisition_id = p_id AND organisation_id = v_org AND status = 'pending'
    ORDER BY step_order
    LIMIT 1
    FOR UPDATE;
  IF v_step.id IS NULL THEN
    RAISE EXCEPTION 'no pending approval step';
  END IF;

  -- The sequencing gate: out-of-order approvers and non-approvers both land here.
  IF v_step.approver_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'it is not your turn to decide this requisition';
  END IF;

  IF NOT p_approve AND COALESCE(btrim(p_comment), '') = '' THEN
    RAISE EXCEPTION 'a comment is required when rejecting';
  END IF;

  UPDATE requisition_approvals
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
         comment = p_comment,
         acted_at = now()
   WHERE id = v_step.id;

  IF NOT p_approve THEN
    UPDATE requisitions
       SET status = 'rejected', decided_at = now(), updated_at = now()
     WHERE id = p_id
     RETURNING * INTO v_req;
    RETURN v_req;
  END IF;

  SELECT count(*) INTO v_remaining FROM requisition_approvals
    WHERE requisition_id = p_id AND organisation_id = v_org AND status = 'pending';

  IF v_remaining = 0 THEN
    UPDATE requisitions
       SET status = 'approved', decided_at = now(), updated_at = now()
     WHERE id = p_id
     RETURNING * INTO v_req;
  END IF;

  RETURN v_req;
END;
$fn$;

REVOKE ALL ON FUNCTION decide_requisition(UUID, BOOLEAN, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION decide_requisition(UUID, BOOLEAN, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Status guard — the RPCs are the ONLY workflow path for an end user.
--    RLS keeps a member inside their org but would still let them PATCH
--    requisitions.status = 'approved' straight through PostgREST with the anon
--    key, self-approving their own spend. This trigger refuses any status change
--    made by an `authenticated` caller that did not come from
--    submit_requisition() / decide_requisition() (they set app.requisition_rpc).
--
--    Service-role callers (our API routes — notably convert, which sets
--    'converted') are unaffected: their JWT role is not `authenticated`.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION requisitions_guard_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_claims text := current_setting('request.jwt.claims', true);
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND v_claims IS NOT NULL
     AND (v_claims::json ->> 'role') = 'authenticated'
     AND COALESCE(current_setting('app.requisition_rpc', true), '') <> '1'
  THEN
    RAISE EXCEPTION 'requisition status changes must go through submit_requisition() or decide_requisition()';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_requisitions_guard_status ON public.requisitions;
CREATE TRIGGER trg_requisitions_guard_status
  BEFORE UPDATE ON public.requisitions
  FOR EACH ROW EXECUTE FUNCTION requisitions_guard_status();
