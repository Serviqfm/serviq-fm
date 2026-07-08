# Serviq-FM — Execution Log

Tracks completed to-dos from [`serviq-fm-gap-analysis-2026-07-06.md`](serviq-fm-gap-analysis-2026-07-06.md),
executed per [`execution-playbook.md`](execution-playbook.md). One line per to-do ID:
**ID — what — commit — how verified**.

DB-only changes (RLS/policies/RPCs) ship as idempotent SQL under `docs/superpowers/sql/`
and are marked **owner-run** — their acceptance can only be fully verified against the live
Supabase project after the owner runs the SQL, so those lines state what was verified locally
(SQL logic, code paths) vs. what needs the live DB.

---

## Batch 0 — Verification infrastructure (branch `claude/batch-0-verification-infra`)

- **B0-1 / DV-15 — GitHub Actions CI** — `1bc0a73` — `.github/workflows/ci.yml` runs `npm ci` +
  `next build` + `tsc --noEmit` + `vitest run` for web and `tsc --noEmit` for mobile, on PRs and
  pushes to `main`. Verified locally: web build/tsc/test all exit 0, mobile tsc exits 0. CI green
  on the PR confirms it in GitHub.
- **B0-2 / DV-15 — Vitest test runner** — `1bc0a73` — added `vitest` + `"test": "vitest run"` to
  `web/`, node-env `vitest.config.ts`. Seeded `web/src/lib/zatca.test.ts` (ZATCA TLV byte-length
  encoding incl. multi-byte Arabic, + 15% VAT math). Deleted orphan `Button.test.tsx` (required 4
  uninstalled deps — vitest/jsdom/@testing-library — and broke standalone `tsc --noEmit`). Verified:
  `npm run test` → 3 passed.
- **B0-3 — Branch-protection note** — owner action (agent cannot set repo settings): enable
  "Require status checks to pass before merging" → select the **web** and **mobile** CI checks on
  `main` in GitHub → Settings → Branches. Noted in the Batch 0 PR body.
- **B0-4 — `docs/execution-log.md` created** — this file.

Also version-controlled the gap analysis + execution playbook into `docs/` so the process and the
to-do IDs referenced here resolve inside the repo.

## Batch 1 — Tenant-isolation criticals (branch `claude/batch-1-tenant-isolation`, stacked on Batch 0)

All four are **security criticals**. The DB changes ship as idempotent SQL under
`docs/superpowers/sql/batch-1-*.sql` and are **owner-run** in the Supabase SQL editor — their
acceptance can only be fully verified against the live project after the owner runs them. Verified
locally: SQL logic/idempotency, exact policy/column names against the source SQL, and that no
legitimate code path is broken (4-lens adversarial review). Verified on the live DB: **pending owner**.

- **DV-01 — RLS on the 7 unprotected tables** — `e007efc` — `batch-1-01-rls-seven-tables.sql`.
  `platform_audit_logs` / `mrr_snapshots` / `account_deletion_requests` → RLS on, no policy
  (deny-all; service-role + SECURITY DEFINER RPC bypass). `tenant_feature_flags` → org-scoped
  authenticated SELECT (keeps `featureFlags.ts`). `user_notification_preferences` → self-scoped
  `FOR ALL` (keeps Notifications tab select+upsert). `notification_log` → self-scoped SELECT
  (keeps Push Audit tab). `notification_types` → authenticated read-only. Verified locally: every
  anon/authenticated reader in the codebase is covered by a matching policy; anon → 0 rows (null
  `auth.uid()`); idempotent. **Owner-run + verify anon-key returns 0 rows on all 7.**
- **DV-02 — Drop public SELECT on `requests`** — `e007efc` — `batch-1-02-requests-drop-public-select.sql`.
  Drops `"public can track own request"` (`SELECT USING (true)` — anon PII dump). `/track/[token]`
  reads via service role; org members via the intact `"org members can manage requests"` FOR ALL
  policy. Verified locally: exact policy name matches the source; no anon/authenticated reader
  depends on the dropped policy. **Owner-run + verify anon `select * from requests` → 0 rows and
  track page still works.**
- **DV-03 — Storage bucket hardening** — `e007efc` — `batch-1-03-storage-bucket-hardening.sql`
  (+ `web/src/app/(public)/r/[token]/page.tsx`). Mirrors sprint-k-01: drops public listing on
  `work-order-media` + `requests`; owner-scopes `work-order-media` UPDATE/DELETE (kills cross-tenant
  overwrite); adds size cap + image/PDF MIME allowlist to the `requests` bucket. Portal input given a
  matching `accept` filter and upload errors are now surfaced (no silent drop). Verified locally:
  legit image/PDF portal uploads pass the allowlist; WO-media writes go via service role (unaffected);
  build green. **Owner-run + verify anon listing fails on both buckets; portal photo upload still works.**
- **DV-04 — SECURITY DEFINER RPCs + send-push edge function** — `e007efc` —
  `batch-1-04-rpc-hardening.sql` (+ deleted `supabase/functions/send-push/`, edited
  `web/src/lib/push.ts`). RPCs `get_dau_mau` / `get_users_with_login`: pin `search_path = public`,
  `REVOKE ... FROM PUBLIC`, `GRANT EXECUTE ... TO service_role` (both callers use the service-role
  admin client). Edge function deleted; `push.ts` retargeted to the authenticated same-origin
  `/api/push`. Verified locally: grep shows no code path references the edge function; both push
  callers still compile; payload maps to `/api/push`'s camelCase. **Owner-run SQL + `supabase
  functions delete send-push`** (was never deployed — confirmed empty). Known limitation: push
  *delivery* stays blocked until DV-05 (Batch 3) unifies the token store.

**Batch 0 + Batch 1 merged to main 2026-07-07 (PRs #9, #10); SQL run + smoke-tested in prod.**

## Batch 2 — Auth criticals (branch `claude/batch-2-auth-criticals`)

Verified locally: web build/tsc/test + mobile tsc green; adversarially reviewed (4 lenses),
which caught and fixed the reset-page PKCE double-exchange. Live-DB / email / device
acceptance is **owner-verify** (needs the SQL run, Supabase Auth config, and a device).

- **DV-08 — Self-service password reset + change** — `425603c` — new `/reset-password`
  (request-link + set-new-password via the recovery session; detects the auto-exchanged
  session, no manual double-exchange), `/change-password` (forced), shared
  `/api/account/password` route, both dead "Forgot password" links wired, Change Password
  card on settings → Account, mobile "Forgot password?" opens the web reset URL. Verified:
  build/tsc green. **Owner-verify:** add `<prod>/reset-password` (+ localhost) to Supabase
  Auth → Redirect URLs and confirm the recovery email template/SMTP; then send yourself a
  reset and complete it.
- **DV-09 — Temp-password hygiene** — `425603c` — CSPRNG `lib/tempPassword.ts` (~144-bit)
  in all 3 invite routes (test: `tempPassword.test.ts`); `must_change_password` flag
  (`batch-2-01-must-change-password.sql`) + middleware gate forces a change on first web
  login; temp password no longer echoed from the two org-admin invite routes (email-only),
  platform-tenant creation keeps its deliberate one-time display. **Known limitation:**
  the forced-change gate is web-only — mobile users aren't gated yet (deferred; the org
  invite no longer exposes the password to anyone but the user, so it's defense-in-depth).
- **DV-10 — Upload validation + rate limiting** — `425603c` — `/api/upload` now rejects
  non-image/PDF types (415) and >25 MiB (413) before reading the file. Per-endpoint rate
  limiting delegated to **Vercel WAF** (owner's choice) — recommended rules in the PR body.
- **DV-18 — CSP + security headers** — `425603c` — `next.config.mjs` `headers()`: CSP
  (self + Google Fonts + Supabase + api.qrserver.com + api.mymemory.translated.net;
  `unsafe-inline` required for Next hydration + inline styles — nonce upgrade is a
  follow-up), plus X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, HSTS.
  **Owner-verify:** smoke the preview (dashboard, uploads, asset QR tab, Translate button,
  PDF export, fonts) under the CSP.
