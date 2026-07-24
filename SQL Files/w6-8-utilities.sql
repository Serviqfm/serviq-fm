-- FM-28 / MKT-24 — Utilities / energy dashboard (site-level utility billing).
-- Run in the Supabase SQL editor BEFORE using the Utilities page.
-- Idempotent. Safe to run twice. Styled after b8-asset-downtime.sql.
--
-- Scope: SEPARATE from the asset `meters` module. Meters track asset usage
-- (runtime hours / cycles) to drive PM. Utilities track site-level billed
-- consumption (electricity / water / gas) and cost.
--
-- Design:
--   * utility_accounts — one per (site, utility) billing account. tariff_per_unit
--     × consumption = cost. site_id is nullable (org-wide account).
--   * utility_readings — periodic meter/bill readings. Consumption for a period
--     is the delta between consecutive readings on the same account; the page
--     computes this client-side (no RPC), same as meters/downtime.
--
-- Security posture (4-policy org RLS):
--   * SELECT: any org member.
--   * INSERT/UPDATE/DELETE: admin/manager only (utility billing setup is admin
--     work). WITH CHECK pins organisation_id to the caller's org and binds
--     site_id / account_id to that same org — no cross-org rows.
--
-- Acceptance (owner, after running):
--   * anon-key SELECT returns only own-org rows; cross-org INSERT denied.
--   * a reading cannot reference an org-B account (FK-to-org bind).
--   * a technician cannot INSERT/UPDATE/DELETE; an admin can.
--   * period_end earlier than period_start is rejected by CHECK.
--   * the app `next build`s and runs WITHOUT this migration (empty lists;
--     writes surface the insert error).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.utility_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  site_id         UUID REFERENCES public.sites(id) ON DELETE SET NULL,   -- NULL = org-wide
  utility_type    TEXT NOT NULL CHECK (utility_type IN ('electricity', 'water', 'gas', 'other')),
  provider        TEXT,
  tariff_per_unit NUMERIC NOT NULL DEFAULT 0,
  unit            TEXT NOT NULL DEFAULT 'kWh',
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.utility_readings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  account_id      UUID NOT NULL REFERENCES public.utility_accounts(id) ON DELETE CASCADE,
  reading_value   NUMERIC NOT NULL,
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT utility_readings_period_chk CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS idx_utility_accounts_org  ON public.utility_accounts(organisation_id);
CREATE INDEX IF NOT EXISTS idx_utility_accounts_site ON public.utility_accounts(site_id);
CREATE INDEX IF NOT EXISTS idx_utility_readings_org  ON public.utility_readings(organisation_id);
-- consecutive-reading delta lookup, ordered by period.
CREATE INDEX IF NOT EXISTS idx_utility_readings_acct ON public.utility_readings(account_id, period_start);

ALTER TABLE public.utility_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.utility_readings ENABLE ROW LEVEL SECURITY;

-- ── utility_accounts ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS utility_accounts_org_select ON public.utility_accounts;
CREATE POLICY utility_accounts_org_select ON public.utility_accounts
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS utility_accounts_org_insert ON public.utility_accounts;
CREATE POLICY utility_accounts_org_insert ON public.utility_accounts
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
    AND (site_id IS NULL OR site_id IN (SELECT id FROM public.sites WHERE organisation_id = utility_accounts.organisation_id))
  );

DROP POLICY IF EXISTS utility_accounts_org_update ON public.utility_accounts;
CREATE POLICY utility_accounts_org_update ON public.utility_accounts
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  )
  WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
    AND (site_id IS NULL OR site_id IN (SELECT id FROM public.sites WHERE organisation_id = utility_accounts.organisation_id))
  );

DROP POLICY IF EXISTS utility_accounts_org_delete ON public.utility_accounts;
CREATE POLICY utility_accounts_org_delete ON public.utility_accounts
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  );

-- ── utility_readings ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS utility_readings_org_select ON public.utility_readings;
CREATE POLICY utility_readings_org_select ON public.utility_readings
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS utility_readings_org_insert ON public.utility_readings;
CREATE POLICY utility_readings_org_insert ON public.utility_readings
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
    AND account_id IN (SELECT id FROM public.utility_accounts WHERE organisation_id = utility_readings.organisation_id)
  );

DROP POLICY IF EXISTS utility_readings_org_update ON public.utility_readings;
CREATE POLICY utility_readings_org_update ON public.utility_readings
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  )
  WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
    AND account_id IN (SELECT id FROM public.utility_accounts WHERE organisation_id = utility_readings.organisation_id)
  );

DROP POLICY IF EXISTS utility_readings_org_delete ON public.utility_readings;
CREATE POLICY utility_readings_org_delete ON public.utility_readings
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  );
