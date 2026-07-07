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
  functions delete send-push` (deleting the repo file does NOT undeploy it) + verify a tenant-user
  `rpc('get_users_with_login')` fails.** Known limitation: push *delivery* stays blocked until DV-05
  (Batch 3) unifies the token store — DV-04 only removes the unauthenticated edge function.
