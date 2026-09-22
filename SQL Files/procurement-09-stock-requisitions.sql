-- P9 / Procurement — stock requisitions ("Consumables in Stock") + QR request portal.
-- Run in the Supabase SQL editor AFTER procurement-01 … procurement-08
-- (this redefines submit_requisition() and budget_spend() from procurement-06).
-- Idempotent. Safe to run twice.
--
-- What ships:
--   * inventory_items.photo_url          — picture shown on the stock picker
--   * inventory_items.reserved_quantity  — held by requisitions awaiting approval;
--                                          AVAILABLE = stock_quantity - reserved_quantity
--   * requisition_items.line_type        — 'purchase' (goes to a PO) | 'stock'
--                                          (issued from inventory)
--   * requisition_items.reserved_qty / issued_qty — per-line record of what was
--                                          held / handed out, so release and issue
--                                          never depend on lines edited later
--   * requisitions_stock_effects()       — ONE trigger owns every stock movement:
--        draft/rejected -> pending_approval  RESERVE (raises STOCK_SHORT|… if short)
--        draft/rejected -> approved          RESERVE + ISSUE (auto-approve path)
--        pending_approval -> approved        ISSUE (stock down, reservation cleared,
--                                            ledger row reason 'issue_requisition')
--        pending_approval -> rejected/cancelled/draft, or DELETE while pending
--                                            RELEASE
--     Living on the status change (not inside the RPCs) means the service-role
--     paths — cancel, convert, the portal — get the same behaviour for free.
--   * requisition_items lines holding a reservation are frozen (no edit/delete).
--   * submit_requisition() — body moved to _submit_requisition_core() so the
--     portal can reuse it. Two behaviour changes, both for stock lines:
--        - totals (approval band + budget block) count PURCHASE lines only:
--          consumables already on the shelf are not new spend;
--        - "no priced lines" becomes "no lines": a stock-only requisition of
--          unpriced consumables is legitimate.
--   * budget_spend() — same purchase-lines-only rule, else an approved stock
--     requisition (which never converts to a PO) would sit in RESERVED forever.
--   * QR portal: sites.requisition_token (one QR per site, regenerate by setting
--     a new gen_random_uuid()), organisations.requisition_email_domains (the
--     official-email allowlist), requisitions.requester_email/requester_name,
--     requisition_portal_sessions (email one-time codes; service role only), and
--     submit_portal_requisition() — service role only.
--
-- KNOWN LIMITS, on purpose:
--   * An inventory adjustment can still push stock_quantity below reserved_quantity;
--     the issue step then raises STOCK_SHORT rather than letting stock go negative.
--   * Stock issued is not charged to the cost center's budget actuals.
--   * Cancelling an ALREADY-approved requisition does not return issued stock —
--     do that with a normal inventory adjustment.
--
-- The app degrades gracefully WITHOUT this migration: every new column is only
-- read by the step-3/step-4 pages, which do not ship before this runs.
--
-- Acceptance (owner, after running — see procurement-09-stock-requisitions.test.sql).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Columns.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS photo_url         TEXT,
  ADD COLUMN IF NOT EXISTS reserved_quantity NUMERIC(12,2) NOT NULL DEFAULT 0;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_items_reserved_nonneg') THEN
    ALTER TABLE public.inventory_items
      ADD CONSTRAINT inventory_items_reserved_nonneg CHECK (reserved_quantity >= 0);
  END IF;
END $do$;

ALTER TABLE public.requisition_items
  ADD COLUMN IF NOT EXISTS line_type    TEXT NOT NULL DEFAULT 'purchase',
  ADD COLUMN IF NOT EXISTS reserved_qty NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS issued_qty   NUMERIC(12,2);

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'requisition_items_line_type_check') THEN
    ALTER TABLE public.requisition_items
      ADD CONSTRAINT requisition_items_line_type_check CHECK (line_type IN ('purchase','stock'));
  END IF;
  -- A stock line must point at the inventory item it draws from. Existing rows
  -- are all 'purchase' (the default), so this validates cleanly.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'requisition_items_stock_has_item') THEN
    ALTER TABLE public.requisition_items
      ADD CONSTRAINT requisition_items_stock_has_item CHECK (line_type = 'purchase' OR item_id IS NOT NULL);
  END IF;
END $do$;

ALTER TABLE public.requisitions
  ADD COLUMN IF NOT EXISTS requester_email TEXT,
  ADD COLUMN IF NOT EXISTS requester_name  TEXT;

-- One QR per site. A volatile default fills every existing row with its own token.
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS requisition_token UUID NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS idx_sites_requisition_token ON public.sites(requisition_token);

-- Lower-case domains without the @, e.g. {'acme.com','acme.sa'}. Empty = portal off.
ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS requisition_email_domains TEXT[] NOT NULL DEFAULT '{}';

-- Ledger: a requisition issue is its own reason and links back to its source.
ALTER TABLE public.stock_transactions
  ADD COLUMN IF NOT EXISTS ref_requisition_id UUID REFERENCES public.requisitions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_stock_tx_requisition ON public.stock_transactions(ref_requisition_id);

-- Drop whichever CHECK guards `reason` (w4-01 declared it inline, so its name is
-- generated), then re-add it by a known name with the new value.
DO $do$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.stock_transactions'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%reason%'
  LOOP
    EXECUTE format('ALTER TABLE public.stock_transactions DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $do$;
ALTER TABLE public.stock_transactions
  ADD CONSTRAINT stock_transactions_reason_check
  CHECK (reason IN ('adjust','receive','consume_wo','issue_requisition'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. requisitions_stock_effects — reserve / issue / release on status change.
--    SECURITY DEFINER: a requester may not have UPDATE on inventory_items, but
--    submitting is exactly what entitles them to a reservation. Every statement
--    is pinned to NEW/OLD.organisation_id.
--    Items are locked in item_id order so two concurrent submits cannot deadlock,
--    and the availability check happens under that lock, so the last unit can
--    only ever be reserved once.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION requisitions_stock_effects()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r       RECORD;
  v_name  TEXT;
  v_stock NUMERIC;
  v_avail NUMERIC;
BEGIN
  -- RELEASE: a pending requisition deleted outright. BEFORE DELETE, so the lines
  -- are still there to read (the cascade would remove them otherwise).
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'pending_approval' THEN
      UPDATE inventory_items ii
         SET reserved_quantity = GREATEST(ii.reserved_quantity - x.qty, 0)
        FROM (SELECT item_id, SUM(reserved_qty) AS qty FROM requisition_items
               WHERE requisition_id = OLD.id AND reserved_qty IS NOT NULL AND item_id IS NOT NULL
               GROUP BY item_id) x
       WHERE ii.id = x.item_id AND ii.organisation_id = OLD.organisation_id;
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- RESERVE: entering approval (or skipping straight to approved).
  IF OLD.status IN ('draft','rejected') AND NEW.status IN ('pending_approval','approved') THEN
    FOR r IN
      SELECT item_id, SUM(quantity) AS qty FROM requisition_items
       WHERE requisition_id = NEW.id AND line_type = 'stock'
       GROUP BY item_id ORDER BY item_id
    LOOP
      SELECT name, COALESCE(stock_quantity, 0) - reserved_quantity INTO v_name, v_avail
        FROM inventory_items
       WHERE id = r.item_id AND organisation_id = NEW.organisation_id
         FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'STOCK_ITEM_MISSING|%', r.item_id;
      END IF;
      -- Machine-readable, like BUDGET_EXCEEDED: STOCK_SHORT|<item>|<requested>|<available>
      IF v_avail < r.qty THEN
        RAISE EXCEPTION 'STOCK_SHORT|%|%|%', v_name, r.qty, GREATEST(v_avail, 0);
      END IF;
      UPDATE inventory_items SET reserved_quantity = reserved_quantity + r.qty WHERE id = r.item_id;
    END LOOP;

    UPDATE requisition_items SET reserved_qty = quantity
     WHERE requisition_id = NEW.id AND line_type = 'stock';
  END IF;

  -- ISSUE: final approval hands the reserved quantity out.
  IF NEW.status = 'approved' THEN
    FOR r IN
      SELECT id, item_id, reserved_qty FROM requisition_items
       WHERE requisition_id = NEW.id AND line_type = 'stock'
         AND reserved_qty IS NOT NULL AND item_id IS NOT NULL
       ORDER BY item_id
    LOOP
      SELECT name, COALESCE(stock_quantity, 0) INTO v_name, v_stock
        FROM inventory_items
       WHERE id = r.item_id AND organisation_id = NEW.organisation_id
         FOR UPDATE;
      IF NOT FOUND THEN
        CONTINUE;  -- item deleted since: nothing left to hand out
      END IF;
      -- Only reachable if someone adjusted stock below what was reserved.
      IF v_stock < r.reserved_qty THEN
        RAISE EXCEPTION 'STOCK_SHORT|%|%|%', v_name, r.reserved_qty, GREATEST(v_stock, 0);
      END IF;

      UPDATE inventory_items
         SET stock_quantity    = v_stock - r.reserved_qty,
             reserved_quantity = GREATEST(reserved_quantity - r.reserved_qty, 0)
       WHERE id = r.item_id;

      INSERT INTO stock_transactions
        (organisation_id, item_id, delta, reason, note, ref_requisition_id, created_by)
      VALUES
        (NEW.organisation_id, r.item_id, -r.reserved_qty, 'issue_requisition',
         'Requisition #' || NEW.requisition_number || ' issued', NEW.id, auth.uid());

      UPDATE requisition_items SET issued_qty = r.reserved_qty, reserved_qty = NULL WHERE id = r.id;
    END LOOP;
  END IF;

  -- RELEASE: leaving approval without being approved.
  IF OLD.status = 'pending_approval' AND NEW.status IN ('rejected','cancelled','draft') THEN
    UPDATE inventory_items ii
       SET reserved_quantity = GREATEST(ii.reserved_quantity - x.qty, 0)
      FROM (SELECT item_id, SUM(reserved_qty) AS qty FROM requisition_items
             WHERE requisition_id = NEW.id AND reserved_qty IS NOT NULL AND item_id IS NOT NULL
             GROUP BY item_id) x
     WHERE ii.id = x.item_id AND ii.organisation_id = NEW.organisation_id;

    UPDATE requisition_items SET reserved_qty = NULL
     WHERE requisition_id = NEW.id AND reserved_qty IS NOT NULL;
  END IF;

  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION requisitions_stock_effects() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_requisitions_stock_effects ON public.requisitions;
CREATE TRIGGER trg_requisitions_stock_effects
  AFTER UPDATE OF status ON public.requisitions
  FOR EACH ROW EXECUTE FUNCTION requisitions_stock_effects();

DROP TRIGGER IF EXISTS trg_requisitions_stock_release_on_delete ON public.requisitions;
CREATE TRIGGER trg_requisitions_stock_release_on_delete
  BEFORE DELETE ON public.requisitions
  FOR EACH ROW EXECUTE FUNCTION requisitions_stock_effects();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Freeze lines that hold a reservation. Editing or deleting one would make
--    the held quantity drift from the line. pg_trigger_depth() = 1 lets the
--    stock trigger above (depth 2) and FK cascades through; only a direct write
--    is refused.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION requisition_items_guard_reserved()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF pg_trigger_depth() = 1 AND OLD.reserved_qty IS NOT NULL THEN
    RAISE EXCEPTION 'this line holds reserved stock and cannot change while the requisition awaits approval';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_requisition_items_guard_reserved ON public.requisition_items;
CREATE TRIGGER trg_requisition_items_guard_reserved
  BEFORE UPDATE OR DELETE ON public.requisition_items
  FOR EACH ROW EXECUTE FUNCTION requisition_items_guard_reserved();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. budget_spend — procurement-06 with purchase lines only.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION budget_spend(p_cost_center UUID, p_from DATE, p_to DATE)
RETURNS TABLE (reserved NUMERIC, actual NUMERIC)
LANGUAGE sql
STABLE
AS $fn$
  WITH req AS (
    SELECT r.status,
           COALESCE((
             SELECT SUM(ri.quantity * ri.unit_cost)
               FROM requisition_items ri
              WHERE ri.requisition_id = r.id
                AND ri.line_type = 'purchase'
           ), 0) AS total
      FROM requisitions r
     WHERE r.cost_center_id = p_cost_center
       AND COALESCE(r.submitted_at::date, r.created_at::date) BETWEEN p_from AND p_to
  ),
  po AS (
    SELECT p.status,
           COALESCE((
             SELECT SUM(poi.quantity * poi.unit_cost)
               FROM purchase_order_items poi
              WHERE poi.purchase_order_id = p.id
           ), 0) AS total,
           (
             SELECT SUM(vi.amount)
               FROM vendor_invoices vi
              WHERE vi.purchase_order_id = p.id
                AND vi.match_status IN ('matched','approved_for_payment')
           ) AS invoiced
      FROM purchase_orders p
      JOIN requisitions r2
        ON r2.id = p.requisition_id
       AND r2.cost_center_id = p_cost_center
     WHERE p.created_at::date BETWEEN p_from AND p_to
  )
  SELECT
    COALESCE((SELECT SUM(total) FROM req WHERE status = 'approved'), 0)
      + COALESCE((SELECT SUM(total) FROM po
                   WHERE status IN ('draft','sent','acknowledged','in_transit')), 0),
    COALESCE((SELECT SUM(COALESCE(invoiced, total)) FROM po WHERE status = 'received'), 0);
$fn$;

REVOKE ALL ON FUNCTION budget_spend(UUID, DATE, DATE) FROM public;
GRANT EXECUTE ON FUNCTION budget_spend(UUID, DATE, DATE) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. _submit_requisition_core — procurement-06's submit body, minus the caller
--    checks (those stay in the two public wrappers below). Internal: no grants.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _submit_requisition_core(p_id UUID, p_org UUID)
RETURNS requisitions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_req      requisitions%ROWTYPE;
  v_total    NUMERIC(14,2);
  v_rule_id  UUID;
  v_steps    INT;
  v_period   budget_periods%ROWTYPE;
  v_reserved NUMERIC(14,2);
  v_actual   NUMERIC(14,2);
BEGIN
  -- Marks this transaction as "the status change is coming from the workflow",
  -- which is what requisitions_guard_status() looks for.
  PERFORM set_config('app.requisition_rpc', '1', true);

  SELECT * INTO v_req FROM requisitions
    WHERE id = p_id AND organisation_id = p_org
    FOR UPDATE;
  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'requisition not found in your organisation';
  END IF;

  -- Idempotent: only a draft or a rejected (revision loop) requisition submits.
  IF v_req.status NOT IN ('draft','rejected') THEN
    RETURN v_req;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM requisition_items WHERE requisition_id = p_id AND organisation_id = p_org) THEN
    RAISE EXCEPTION 'requisition has no lines';
  END IF;

  -- P9: only purchase lines are new spend.
  SELECT COALESCE(SUM(quantity * unit_cost), 0) INTO v_total
    FROM requisition_items
   WHERE requisition_id = p_id AND organisation_id = p_org AND line_type = 'purchase';

  -- P5: the hard block (unchanged).
  IF v_req.cost_center_id IS NOT NULL AND v_total > 0 THEN
    SELECT * INTO v_period FROM budget_periods
     WHERE cost_center_id = v_req.cost_center_id
       AND organisation_id = p_org
       AND current_date BETWEEN starts_on AND ends_on
     ORDER BY starts_on DESC
     LIMIT 1;

    IF v_period.id IS NOT NULL THEN
      SELECT b.reserved, b.actual INTO v_reserved, v_actual
        FROM budget_spend(v_req.cost_center_id, v_period.starts_on, v_period.ends_on) b;

      IF COALESCE(v_reserved, 0) + COALESCE(v_actual, 0) + v_total > v_period.amount THEN
        RAISE EXCEPTION 'BUDGET_EXCEEDED|%|%|%|%',
          v_total, COALESCE(v_reserved, 0), COALESCE(v_actual, 0), v_period.amount;
      END IF;
    END IF;
  END IF;

  DELETE FROM requisition_approvals WHERE requisition_id = p_id AND organisation_id = p_org;

  SELECT id INTO v_rule_id
    FROM procurement_approval_rules
   WHERE organisation_id = p_org
     AND is_active
     AND v_total >= min_amount
     AND (max_amount IS NULL OR v_total < max_amount)
   ORDER BY min_amount DESC
   LIMIT 1;

  IF v_rule_id IS NOT NULL THEN
    INSERT INTO requisition_approvals
      (organisation_id, requisition_id, step_order, approver_user_id, label, status)
    SELECT p_org, p_id, s.step_order, s.approver_user_id, s.label, 'pending'
      FROM procurement_approval_rule_steps s
     WHERE s.rule_id = v_rule_id AND s.organisation_id = p_org
     ORDER BY s.step_order;
    GET DIAGNOSTICS v_steps = ROW_COUNT;
  ELSE
    v_steps := 0;
  END IF;

  -- The status flip fires requisitions_stock_effects(): stock is reserved (and,
  -- on auto-approve, issued) inside this same transaction, or the submit fails.
  IF v_steps = 0 THEN
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

REVOKE ALL ON FUNCTION _submit_requisition_core(UUID, UUID) FROM public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. submit_requisition — signed-in path. Same caller checks as procurement-06.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION submit_requisition(p_id UUID)
RETURNS requisitions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_org UUID;
  v_req requisitions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT organisation_id INTO v_org FROM users WHERE id = auth.uid();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'no organisation';
  END IF;

  SELECT * INTO v_req FROM requisitions WHERE id = p_id AND organisation_id = v_org FOR UPDATE;
  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'requisition not found in your organisation';
  END IF;

  IF v_req.status IN ('draft','rejected')
     AND v_req.created_by IS DISTINCT FROM auth.uid()
     AND (SELECT role FROM users WHERE id = auth.uid()) NOT IN ('admin','manager') THEN
    RAISE EXCEPTION 'only the creator or an admin/manager may submit this requisition';
  END IF;

  RETURN _submit_requisition_core(p_id, v_org);
END;
$fn$;

REVOKE ALL ON FUNCTION submit_requisition(UUID) FROM public;
GRANT EXECUTE ON FUNCTION submit_requisition(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. submit_portal_requisition — QR portal path. SERVICE ROLE ONLY: the portal
--    API route has already verified the site token and the emailed code, and
--    wrote the requisition with requester_email and created_by = NULL.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION submit_portal_requisition(p_id UUID)
RETURNS requisitions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_org UUID;
BEGIN
  SELECT organisation_id INTO v_org FROM requisitions
   WHERE id = p_id AND created_by IS NULL AND requester_email IS NOT NULL;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'not a portal requisition';
  END IF;
  RETURN _submit_requisition_core(p_id, v_org);
END;
$fn$;

REVOKE ALL ON FUNCTION submit_portal_requisition(UUID) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION submit_portal_requisition(UUID) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. requisition_portal_sessions — one row per "email me a code".
--    The portal API stores a SHA-256 of the 6-digit code, counts attempts, and
--    once verified hands the row id back as the (30-minute) session token.
--    RLS on with NO policies: only the service role can read or write it.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.requisition_portal_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  site_id         UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  code_hash       TEXT NOT NULL,
  attempts        INT NOT NULL DEFAULT 0,
  expires_at      TIMESTAMPTZ NOT NULL,
  verified_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_req_portal_sessions_email ON public.requisition_portal_sessions(lower(email), created_at DESC);

ALTER TABLE public.requisition_portal_sessions ENABLE ROW LEVEL SECURITY;
