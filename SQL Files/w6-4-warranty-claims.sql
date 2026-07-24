-- W6-4 / FM-24 — Work-order warranty claim tracking.
-- Run in the Supabase SQL editor BEFORE deploying the Warranty tab on the WO
-- detail page. Idempotent. Safe to run twice.
--
-- Design:
--   * warranty_claims — one row per claim raised against a work order (optionally
--     tied to the MEP asset the WO covers). status walks submitted → approved /
--     rejected → paid. amount is the claimed/settled figure.
--   * The app degrades gracefully without this table: the Warranty tab just shows
--     an empty list, so `next build` and the running app both work WITHOUT this
--     migration applied.
--
-- Security posture (4-policy org RLS, mirrored EXACTLY from w5-2-wo-labor-costs.sql):
--   * SELECT / DELETE: any member of the caller's org.
--   * INSERT / UPDATE carry a WITH CHECK that pins organisation_id to the caller's
--     org AND requires work_order_id to live in that org — a caller cannot write a
--     claim onto another org's work order.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.warranty_claims (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  work_order_id   UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  asset_id        UUID REFERENCES public.assets(id) ON DELETE SET NULL,
  claim_number    TEXT,
  status          TEXT NOT NULL DEFAULT 'submitted'
                    CHECK (status IN ('submitted','approved','rejected','paid')),
  provider        TEXT,
  amount          NUMERIC CHECK (amount IS NULL OR amount >= 0),
  notes           TEXT,
  created_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warranty_claims_wo  ON public.warranty_claims(work_order_id);
CREATE INDEX IF NOT EXISTS idx_warranty_claims_org ON public.warranty_claims(organisation_id);

ALTER TABLE public.warranty_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS warranty_claims_org_select ON public.warranty_claims;
CREATE POLICY warranty_claims_org_select ON public.warranty_claims
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  );

-- Writes are admin/manager only (mirrors the UI canManage gate — UI gating is not
-- a security boundary). WITH CHECK binds organisation_id, the work order, AND the
-- optional asset all to the caller's org (asset_id NULL is allowed) so a raw API
-- call can't cross-reference another tenant's WO or asset.
DROP POLICY IF EXISTS warranty_claims_org_insert ON public.warranty_claims;
CREATE POLICY warranty_claims_org_insert ON public.warranty_claims
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','manager')
    AND work_order_id IN (
      SELECT id FROM public.work_orders
      WHERE organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    )
    AND (asset_id IS NULL OR asset_id IN (
      SELECT id FROM public.assets
      WHERE organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    ))
  );

DROP POLICY IF EXISTS warranty_claims_org_update ON public.warranty_claims;
CREATE POLICY warranty_claims_org_update ON public.warranty_claims
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','manager')
  )
  WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','manager')
    AND work_order_id IN (
      SELECT id FROM public.work_orders
      WHERE organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    )
    AND (asset_id IS NULL OR asset_id IN (
      SELECT id FROM public.assets
      WHERE organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    ))
  );

DROP POLICY IF EXISTS warranty_claims_org_delete ON public.warranty_claims;
CREATE POLICY warranty_claims_org_delete ON public.warranty_claims
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','manager')
  );

-- Server-side transition guard: money status can only walk forward
-- submitted → approved/rejected → paid; rejected & paid are terminal. Stops a
-- raw-API jump straight to 'paid' (the client NEXT map is UX only, not a boundary).
CREATE OR REPLACE FUNCTION public.enforce_warranty_claim_transition() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'submitted' AND NEW.status IN ('approved','rejected'))
      OR (OLD.status = 'approved' AND NEW.status IN ('paid','rejected'))
    ) THEN
      RAISE EXCEPTION 'Illegal warranty claim status transition: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_warranty_claim_transition ON public.warranty_claims;
CREATE TRIGGER trg_enforce_warranty_claim_transition
  BEFORE UPDATE ON public.warranty_claims
  FOR EACH ROW EXECUTE FUNCTION public.enforce_warranty_claim_transition();
