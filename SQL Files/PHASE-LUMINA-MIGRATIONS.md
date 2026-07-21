# Phase Lumina — Supabase migrations to run before deploy

Run these in the Supabase SQL editor in order. Each is idempotent (uses `IF NOT EXISTS`), safe to re-run.

## 1. Sprint E — field_configs table

File: [sprint-e-01-foundation.sql](./sprint-e-01-foundation.sql)

Creates `field_configs` table + RLS policies + index. Required for Sprint E (per-field visibility/requirement controls in Settings).

## 2. Sprint F — platform admin foundation

File: [sprint-f-01-foundation.sql](./sprint-f-01-foundation.sql)

Creates: `platform_admins`, `tenant_feature_flags`, `platform_audit_logs`, `mrr_snapshots`. Extends `organisations` with plan/billing/Stripe/offboarding columns. Adds `users.disabled` and `audit_logs.impersonated_by`. Creates `tenant_health` view. Backfills feature flags for existing orgs.

**Manual follow-up after running:** Create a platform admin auth user in Supabase Auth dashboard, then uncomment + run the `INSERT INTO platform_admins` block at the bottom of the file with the new auth UID.

## 3. Sprint F — metrics support functions

File: [sprint-f-02-metrics.sql](./sprint-f-02-metrics.sql)

Creates `get_dau_mau()` and `get_users_with_login(org_id)` SECURITY DEFINER functions used by the platform metrics API.

## 4. Sprint H — vendor invoices

File: [sprint-h-01-vendor-invoices.sql](./sprint-h-01-vendor-invoices.sql)

Creates the `vendor_invoices` table + RLS so the Save Invoice button on the vendor detail page works.

## 5. Sprint I — storage buckets

File: [sprint-i-01-storage-buckets.sql](./sprint-i-01-storage-buckets.sql)

Ensures the `work-order-media`, `media`, `requests`, `offboard-exports` storage buckets exist and authenticated users can INSERT/UPDATE/SELECT into them. Without this, photo uploads on work-order close and asset/WO creation fail with "row violates row-level security policy".

> The app already routes the close-out, WO-new, and asset-new uploads through a server endpoint that uses the service-role key as a backstop, so this migration is now a defence-in-depth measure rather than a hard blocker.

## 6. Sprint I — spaces.qr_token

File: [sprint-i-02-spaces-qr-token.sql](./sprint-i-02-spaces-qr-token.sql)

Adds `qr_token` column to `spaces` (UUID default `gen_random_uuid()`, unique, indexed) and backfills any nulls. Required for the public Space QR landing page to resolve scanned codes.

## 7. Sprint I — tenant invoices

File: [sprint-i-03-tenant-invoices.sql](./sprint-i-03-tenant-invoices.sql)

Creates the `tenant_invoices` table for platform-issued invoices from the Tenant > Billing tab. Line items are stored in JSONB so admins can add subscription + ad-hoc fees + other bills without schema changes.

## Verify after running

```sql
-- All key tables should exist:
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('field_configs', 'platform_admins', 'tenant_feature_flags',
                     'platform_audit_logs', 'mrr_snapshots', 'vendor_invoices',
                     'tenant_invoices');

-- View should exist:
SELECT * FROM tenant_health LIMIT 1;

-- Functions should exist:
SELECT routine_name FROM information_schema.routines
WHERE routine_name IN ('get_dau_mau', 'get_users_with_login');

-- Storage buckets should exist:
SELECT id, public FROM storage.buckets
WHERE id IN ('work-order-media', 'media', 'requests', 'offboard-exports');

-- spaces.qr_token column should exist on every space:
SELECT count(*) FILTER (WHERE qr_token IS NULL) AS missing_tokens, count(*) AS total FROM spaces;
```
