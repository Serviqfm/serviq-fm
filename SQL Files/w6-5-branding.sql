-- W6-5 / MKT-27 — Per-tenant custom branding.
-- Run in the Supabase SQL editor BEFORE deploying the branding settings sub-page.
-- Idempotent. Safe to run twice.
--
-- Design: three columns on organisations hold the tenant's brand — an uploaded logo
--   (public URL in our own `media` bucket) plus a primary and secondary accent colour.
--   The feature is gated by the `custom_branding` flag in tenant_feature_flags; orgs
--   without the flag (or that never set branding) render the default ServIQ brand, so
--   this migration is fully backward compatible — every column reads NULL until an
--   admin fills it in, and NULL means "default brand".
--
-- Security posture:
--   * Columns ride on the EXISTING organisations RLS — admins/managers already UPDATE
--     their own org row via the org-scoped client on the settings page. RLS is
--     row-level, so these new columns inherit that org scoping automatically.
--   * Colours are validated as strict 6-digit hex (#rrggbb) at the DB boundary too, so
--     no CSS-injection payload can be persisted even if the app-layer guard is bypassed.
--     The app re-validates before interpolating into any style (defense in depth).

ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS brand_logo_url        TEXT,
  ADD COLUMN IF NOT EXISTS brand_primary_color   TEXT,
  ADD COLUMN IF NOT EXISTS brand_secondary_color TEXT;

COMMENT ON COLUMN public.organisations.brand_logo_url IS
  'Public URL (media bucket) of the tenant''s custom logo. NULL = use default ServIQ logo. Gated by tenant_feature_flags.custom_branding.';
COMMENT ON COLUMN public.organisations.brand_primary_color IS
  'Primary brand accent as strict #rrggbb hex. NULL = default. Gated by custom_branding flag.';
COMMENT ON COLUMN public.organisations.brand_secondary_color IS
  'Secondary brand accent as strict #rrggbb hex. NULL = default. Gated by custom_branding flag.';

-- Strict hex guard at the DB boundary (belt-and-braces over the app-layer regex).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organisations_brand_primary_hex_chk'
  ) THEN
    ALTER TABLE public.organisations
      ADD CONSTRAINT organisations_brand_primary_hex_chk
      CHECK (brand_primary_color IS NULL OR brand_primary_color ~ '^#[0-9a-fA-F]{6}$');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organisations_brand_secondary_hex_chk'
  ) THEN
    ALTER TABLE public.organisations
      ADD CONSTRAINT organisations_brand_secondary_hex_chk
      CHECK (brand_secondary_color IS NULL OR brand_secondary_color ~ '^#[0-9a-fA-F]{6}$');
  END IF;
END $$;
