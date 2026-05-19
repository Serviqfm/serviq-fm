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

## Verify after running

```sql
-- All four key tables should exist:
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('field_configs', 'platform_admins', 'tenant_feature_flags',
                     'platform_audit_logs', 'mrr_snapshots');

-- View should exist:
SELECT * FROM tenant_health LIMIT 1;

-- Functions should exist:
SELECT routine_name FROM information_schema.routines
WHERE routine_name IN ('get_dau_mau', 'get_users_with_login');
```
