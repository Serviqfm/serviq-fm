-- Batch 4 — Data integrity (DV-13/FM-22, DV-17, 1C-22). Idempotent.
-- RUN BEFORE DEPLOYING THE BATCH 4 CODE — the invoice routes and the user-delete
-- route call the functions below (same SQL-first order as every batch).

-- ============================================================
-- DV-13 / FM-22 — collision-proof invoice numbering
-- ============================================================

-- 1. Dedupe any historical collisions (appends -D2, -D3… to later duplicates) so the
--    unique indexes below can be created. Re-runs find no rn>1 → no-op.
WITH d AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY organisation_id, invoice_number ORDER BY created_at) AS rn
  FROM public.invoices
)
UPDATE public.invoices i SET invoice_number = i.invoice_number || '-D' || d.rn
FROM d WHERE i.id = d.id AND d.rn > 1;

WITH d AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY organisation_id, invoice_number ORDER BY created_at) AS rn
  FROM public.tenant_invoices
)
UPDATE public.tenant_invoices t SET invoice_number = t.invoice_number || '-D' || d.rn
FROM d WHERE t.id = d.id AND d.rn > 1;

-- 2. Unique backstops (ZATCA requires unique numbering; these make duplicates impossible).
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_org_number
  ON public.invoices (organisation_id, invoice_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_invoices_org_number
  ON public.tenant_invoices (organisation_id, invoice_number);

-- 3. Sequential allocator for ORG (client) invoices: INV-<year>-NNNNN per org per year.
--    Derives the org from the calling session (auth.uid()), so an authenticated user can
--    only allocate numbers for their own organisation. The advisory lock serialises
--    concurrent ALLOCATIONS; the route's insert is a separate transaction, so the unique
--    index + the route's 23505 retry are the actual duplicate defense.
--    NOTE: legacy INV-<year>-<epoch6> numbers match the scan, so orgs with history
--    continue monotonically from the legacy max (6-digit numbers — valid and unique).
--    LPAD must never truncate: GREATEST keeps the full width when next_seq > 5 digits.
CREATE OR REPLACE FUNCTION public.next_invoice_number() RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  org UUID;
  yr TEXT := to_char(now(), 'YYYY');
  next_seq INT;
BEGIN
  SELECT organisation_id INTO org FROM users WHERE id = auth.uid();
  IF org IS NULL THEN RAISE EXCEPTION 'no organisation for caller'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('invoices:' || org::text));
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM ('^INV-' || yr || '-(\d+)$')) AS INT)), 0) + 1
    INTO next_seq
    FROM invoices
    WHERE organisation_id = org AND invoice_number ~ ('^INV-' || yr || '-\d+$');
  RETURN 'INV-' || yr || '-' || LPAD(next_seq::TEXT, GREATEST(5, LENGTH(next_seq::TEXT)), '0');
END $$;

REVOKE ALL ON FUNCTION public.next_invoice_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_invoice_number() TO authenticated;

-- 4. Fix the TENANT (platform) invoice allocator: same MAX-scan as sprint-i-03 but
--    serialised under an advisory lock. Called only by the platform API (service role).
CREATE OR REPLACE FUNCTION public.next_tenant_invoice_number(org_id UUID) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE next_seq INT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('tenant_invoices:' || org_id::text));
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 'TI-(\d+)') AS INT)), 0) + 1
    INTO next_seq
    FROM tenant_invoices
    WHERE organisation_id = org_id AND invoice_number ~ '^TI-\d+$';
  RETURN 'TI-' || LPAD(next_seq::TEXT, GREATEST(4, LENGTH(next_seq::TEXT)), '0');
END $$;

REVOKE ALL ON FUNCTION public.next_tenant_invoice_number(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_tenant_invoice_number(UUID) TO service_role;

-- ============================================================
-- DV-17 — team_members org integrity (composite FKs)
-- ============================================================

-- Remove any corrupt cross-org rows first (rows whose attested org doesn't match the
-- team's or the user's real org) — the FKs below would reject them.
DELETE FROM public.team_members tm
  WHERE NOT EXISTS (SELECT 1 FROM public.teams t WHERE t.id = tm.team_id AND t.organisation_id = tm.organisation_id)
     OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = tm.user_id AND u.organisation_id = tm.organisation_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_id_org_key') THEN
    ALTER TABLE public.users ADD CONSTRAINT users_id_org_key UNIQUE (id, organisation_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'teams_id_org_key') THEN
    ALTER TABLE public.teams ADD CONSTRAINT teams_id_org_key UNIQUE (id, organisation_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_members_team_org_fkey') THEN
    ALTER TABLE public.team_members ADD CONSTRAINT team_members_team_org_fkey
      FOREIGN KEY (team_id, organisation_id) REFERENCES public.teams (id, organisation_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_members_user_org_fkey') THEN
    ALTER TABLE public.team_members ADD CONSTRAINT team_members_user_org_fkey
      FOREIGN KEY (user_id, organisation_id) REFERENCES public.users (id, organisation_id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================
-- 1C-22 — scrub additional_workers on user delete
-- ============================================================

CREATE OR REPLACE FUNCTION public.scrub_additional_worker(p_user_id UUID) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE work_orders SET additional_workers = array_remove(additional_workers, p_user_id)
  WHERE p_user_id = ANY(additional_workers)
$$;

REVOKE ALL ON FUNCTION public.scrub_additional_worker(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.scrub_additional_worker(UUID) TO service_role;
