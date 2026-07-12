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

## Batch 3 PR-A — Broken-feature criticals (branch `claude/batch-3-broken-features`)

Build gate green (web tsc/build/test 12 passing incl. new pm-utils seasonal tests; mobile tsc).
Adversarially reviewed (4 lenses) — PM logic + fake-stats passed clean; fixed 3 findings
(wizard zero-sites 500, WO-list vendor display, completion-notes relabel). SQL is owner-run.

- **DV-05** (twins 1C-03, CORE-06 delivery-half, FM-01, MKT-01) — `8a2ddbb` — `/api/push` reads
  `users.push_token`; dropped the dead `user_devices` read + delete. Push now delivers end to end.
  **Device-verify pending owner** (needs a phone). DV-19 deep-link tap deferred.
- **DV-07** (twins CORE-22, FM-13, MKT-10 core) — `8a2ddbb` — `/request` wizard → `requests`
  approval queue (category + site now required, tracking link); no more direct `work_orders` insert.
- **DV-11** (twins 1C-08, FM-19) + **1C-04** (twins CORE-33, FM-18) — `8a2ddbb` — PM cron reads
  per-schedule `lead_time_days` and skips/rolls past seasonal inactive windows (wrap-around aware);
  tested helpers in `pm-utils.ts` (`pm-utils.test.ts`). PM detail lists by `pm_schedule_id`;
  "generate now" sets the FK + `due_at`. (PM create-form seasonal/lead fields deferred — edit form
  already has seasonal.)
- **DV-12** (twin FM-09) — `8a2ddbb` — `batch-3-01-work-orders-columns.sql` adds `assigned_vendor_id`
  + migrates vendor rows; edit page routes vendor picks there; vendor tab + WO list/detail show them.
- **DV-28** (twins CORE-32, FM-23) — `8a2ddbb` — asset PM History tab loads completed PM WOs by
  `pm_schedule_id`.
- **WO-01** — `8a2ddbb` — `batch-3-01-*.sql` adds `signed_off_by`; close route stores sign-off there,
  no longer overwriting `completion_notes`.
- **DV-20 fake-decoration clause** (twins CORE-12, FM-12 partial, MKT-08 partial) — `8a2ddbb` —
  removed hard-coded dashboard deltas + fixed the Open-Orders mislabel. (DV-20 perf clause — count-head
  queries / no `select('*')` — deferred to the Phase E performance batch.)

**SQL (owner-run, SQL-first):** `docs/superpowers/sql/batch-3-01-work-orders-columns.sql`.
**Known limitation:** an org that sets `assigned_to` field-config to "required" would block a
vendor-only assignment (edge config; documented, not fixed).

## Batch 3 PR-B — WO governance, code layer (branch `claude/batch-3-governance`, stacked on PR-A)

No SQL. Build gate green; adversarially verified (bypass + regression lenses) — all in-scope
controls confirmed, no regressions; the review's ungoverned-'completed' finding fixed in-batch.

- **CORE-19** — `b97e748` — middleware redirects `role=requester` off `/dashboard/*` to `/request`
  (after the must-change-password gate). Web lockdown done; mobile requester UI (CORE-23) deferred.
- **CORE-01** — `b97e748` — close route: `closed` needs admin/manager + prior status `completed`;
  `completed` needs manager or being the assignee/additional worker.
- **CORE-02** — `b97e748` — PATCH 409s on closed WOs; status recompute no longer silently reopens
  in_progress/on_hold/completed WOs; Edit hidden on closed.
- **CORE-03** — `b97e748` — new `/api/work-orders/[id]/reopen` (manager-only, mandatory reason,
  audit-logged); web Reopen button; mobile reopen manager-gated.
- **CORE-21** — `b97e748` — technician web WO list scoped to `assigned_to=me OR
  me=ANY(additional_workers)`.
- **WO-02** — `b97e748` — technicians can only PATCH WOs they created.
- **DV-25** — `b97e748` — mobile: requesters read-only on WO detail; reopen manager-only.

**Deferred (explicit):** durable role-aware **RLS** for the client-side transition surface
(in_progress/on_hold via direct PostgREST) — blocked on **DV-06** (needs the live base-table
policies from `supabase db pull` before writing role predicates safely). CORE-20's DB-level gating
and CORE-23 (mobile requester experience) land there. Until then those transitions are enforced by
UI + route checks only.
