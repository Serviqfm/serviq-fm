-- B3-C / MKT-20 — Org-level SSO email domain.
-- Run in the Supabase SQL editor BEFORE deploying the SSO settings sub-page.
-- Idempotent. Safe to run twice.
--
-- Design: record which email domain an org routes to SAML/OIDC SSO. This is only
--   the org-side *record* of the domain — the actual IdP / SAML metadata is
--   configured by the owner in the Supabase dashboard (Authentication → SSO),
--   which is where supabase.auth.signInWithSSO({ domain }) resolves the IdP.
--   The column exists so an org admin can see/manage the domain that gets routed,
--   and so the app can display SSO status. No secrets live here.
--
-- Backward compatible: the login page derives the domain from the typed email and
--   calls signInWithSSO directly; Supabase decides if that domain has an IdP. The
--   app therefore works WITHOUT this migration applied (sso_domain simply reads as
--   NULL and the settings sub-page shows "not configured").
--
-- Security posture:
--   * sso_domain rides on the EXISTING organisations RLS (admins/managers already
--     UPDATE their own org row via the org-scoped client on the settings page).
--     RLS is row-level, so the new column inherits that org scoping automatically.
--   * A partial UNIQUE index stops two different orgs from claiming the same domain
--     (which would make login routing ambiguous). NULLs are excluded so orgs
--     without SSO don't collide.
--   * Domain is stored lower-cased and trimmed (app normalises; a CHECK keeps it
--     lower-case at the DB boundary too).

ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS sso_domain TEXT;

COMMENT ON COLUMN public.organisations.sso_domain IS
  'Email domain (e.g. acme.com) routed to SAML/OIDC SSO. IdP metadata is configured in the Supabase dashboard, not here. NULL = SSO not configured.';

-- Keep it lower-case / no leading @ at the DB boundary. Idempotent guard.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organisations_sso_domain_lower_chk'
  ) THEN
    ALTER TABLE public.organisations
      ADD CONSTRAINT organisations_sso_domain_lower_chk
      CHECK (sso_domain IS NULL OR sso_domain = lower(sso_domain));
  END IF;
END $$;

-- One org per domain: ambiguous routing otherwise. Partial index skips NULLs.
CREATE UNIQUE INDEX IF NOT EXISTS uq_organisations_sso_domain
  ON public.organisations (sso_domain)
  WHERE sso_domain IS NOT NULL;
