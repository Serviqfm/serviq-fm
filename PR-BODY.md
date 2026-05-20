## Summary

Integration branch for three feature streams that landed on top of `origin/main` (Sprints A–D, currently in production):

- **Sprint G — Lumina UI Redesign** *(from `claude/zen-hellman-cd3a6c`)*
  All 50+ dashboard, auth, and public routes converted to Lumina Tailwind design tokens (`web/src/lib/lumina-tokens.ts`, `web/tailwind.config.ts`). Material Symbols icons, glass-morphism nav, mobile bottom-nav, star-pattern backgrounds. Phase 4 dashboard rebuild included.

- **Sprint E — Field Visibility Settings** *(from `claude/beautiful-jones-c7bcb9`)*
  Admins can mark per-page form fields as required / optional / hidden. New `field_configs` table + RLS, catalog at `web/src/lib/field-catalog.ts`, client hook `web/src/lib/useFieldConfig.ts`, server enforcement `web/src/lib/fieldEnforcement.ts`, and a Form Fields tab in `/dashboard/settings`. 11 pages covered, ~70 catalog entries, defense-in-depth (client hide + server reject).

- **Sprint F — Platform Super-Admin Portal** *(from `claude/beautiful-jones-c7bcb9`)*
  New `/platform/*` route group gated by the `platform_admins` table (returns 404 to mask the portal). Dashboard (MRR/ARR/DAU/MAU), Tenants list+detail with impersonation, onboarding/offboarding (with zip export), billing+plan editing with diff-based audit, feature-flag toggles *(scaffolding — see caveat)*, system health page, unified audit feed. Impersonation uses signed cookie + nodejs-runtime middleware.

- **User-deletion FK fix** *(from `claude/zen-hellman-cd3a6c`)*
  Full 9-table cleanup on user delete so deletions no longer fail when the user is referenced by work orders or other relations.

Build is clean (`npm run build` succeeds — 62 routes, including all `/platform/*` and `/dashboard/*`). `npx tsc --noEmit` has pre-existing errors only in `web/src/components/design-system/Button.test.tsx` (test-runner type deps not installed); Next ignores these via `eslint.ignoreDuringBuilds: true`. The `crypto in Edge Runtime` warning is benign — middleware pins `export const runtime = 'nodejs'`.

## ⚠️ Manual prereqs before merging to `main`

Run these in the Supabase SQL editor **in order** (all idempotent):

1. `docs/superpowers/sql/sprint-e-01-foundation.sql` — `field_configs` table + RLS + index
2. `docs/superpowers/sql/sprint-f-01-foundation.sql` — `platform_admins`, `tenant_feature_flags`, `platform_audit_logs`, `mrr_snapshots`, plus extensions to `organisations`, `users.disabled`, `audit_logs.impersonated_by`, and `tenant_health` view
3. `docs/superpowers/sql/sprint-f-02-metrics.sql` — `get_dau_mau()` + `get_users_with_login()` SECURITY DEFINER functions

Manifest: `docs/superpowers/sql/PHASE-LUMINA-MIGRATIONS.md`

Then create a platform admin auth user in the Supabase Auth dashboard and **uncomment + run the `INSERT INTO platform_admins` block at the bottom of `sprint-f-01-foundation.sql`** with that auth UID. Without this row, no one can access `/platform/*` (the gate returns 404 for non-admins).

After deploy: backfill Sprint E defaults — `cd web && npx tsx scripts/seed-field-configs.ts` (idempotent).

`RESEND_FROM_EMAIL=noreply@serviqfm.com` is already set in Vercel — no env-var changes needed.

## Caveats — intentional, do not "fix"

- **Sprint F feature-flag toggles** at `web/src/app/platform/tenants/[id]/flags/FlagsForm.tsx` are scaffolding by design. They persist values to `tenant_feature_flags` and write audit entries, but no product feature consults `useFeatureFlag` yet. The UI surfaces a note explaining this. Enforcement is follow-up work.
- `web/src/lib/brand.ts` is **restored** here. zen-hellman had deleted it but several `origin/main` pages still import `C`, `F`, `primaryBtn`, `LUMINA_COLORS` from it. Removing those imports is follow-up cleanup, not blocking.

## Out of scope

- Mobile EAS production build (iOS + Android) — separate workstream/ticket.

## Test plan

- [ ] User runs the 3 SQL migrations in Supabase SQL editor in order
- [ ] User creates a platform admin auth user and inserts the `platform_admins` row
- [ ] After Vercel deploys, log in via `/login/employee` as the platform admin → redirected to `/platform/dashboard`
- [ ] Verify `/platform/tenants` lists organisations and `/platform/tenants/[id]` opens
- [ ] Verify impersonation enter/exit works and banner appears
- [ ] Verify `/dashboard/settings` Form Fields tab loads for tenant admins and saves persist
- [ ] Verify a non-platform-admin gets a 404 on `/platform/*`
- [ ] Spot-check Sprint G Lumina styling on 3–5 dashboard pages

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
