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

## Batch 4 — Data integrity (branch `claude/batch-4-data-integrity`, stacked on PR-B)

Build gate green. Adversarially verified (SQL semantics + code regression lenses) — caught and
fixed an LPAD-truncation blocker in the invoice allocator (legacy epoch numbers would have
permanently bricked invoice creation), a cross-org `space_id` validation gap, and the missing
tenant-route retry. SQL is owner-run, SQL-first.

- **DV-13** (twins FM-22, MKT-18 constraint clause) — `df77f39` — `batch-4-01-data-integrity.sql`:
  dedupe + unique indexes on `(organisation_id, invoice_number)` for `invoices` + `tenant_invoices`;
  `next_invoice_number()` (session-org, non-truncating) + fixed `next_tenant_invoice_number()`;
  both routes now allocate via RPC with a 23505 retry. **Owner-verify:** create two invoices —
  sequential numbers; unique index visible in the dashboard.
- **DV-17** — `df77f39` — composite FKs on `team_members` (+ corrupt cross-org row cleanup).
  **Owner-verify:** inserting a team_members row with a mismatched org id fails at the DB.
- **1C-22** (DV-31 clause) — `df77f39` — `scrub_additional_worker()` called from user delete.
- **AL-01** — `df77f39` — descendant-aware asset delete: cascade vs promote is an explicit choice
  (single + bulk), computed from the full org hierarchy.
- **AL-21** — `df77f39` — Space picker on asset new/edit (site-filtered, clears on site change);
  API validates the space's org via its site. Mobile CreateAssetScreen deferred.
- **DV-06** — **owner action**: run `supabase login && supabase link --project-ref cnpsplprnnabhrjjeqwp
  && supabase db pull` in the repo root, commit the generated `supabase/migrations/` file. This is
  the DR baseline and unblocks the deferred role-aware RLS work (CORE-20/CORE-23 + PR-B's residual
  client-side transition surface). Exact steps in the PR body.

## Phase B — WO power features

### PR-B1 — WO templates + duplication (branch `claude/phase-b-wo-templates-dup`)

Build gate green; adversarially verified (correctness + cross-org RLS) — PASS, fixed a
category value-string mismatch + the WorkOrder.category type gap. SQL owner-run, SQL-first.

- **WO-08** — `<this commit>` — `phase-b-01-wo-templates.sql` (work_order_templates, org RLS) +
  `work-orders/templates/` CRUD page + "create from template" (`?template=`) + "Save as Template"
  on WO detail. **Owner-verify:** create a template, use it, and Save-as-Template a WO.
- **WO-09** — `<this commit>` — Duplicate action on WO detail (`?duplicate_from=`) prefills the
  create form (definitional fields + tasks + additional workers; not wo_number/status/dates/photos).

No CORE- twins for either. Next in this track: Files module (WO-05 + WO-03), then Calendar +
Saved views (WO-17 + WO-13), then CSV import/export (WO-10/11), filtering cluster (WO-14/15/16).

### PR-B2 — Files module + upload validation (branch `claude/phase-b-wo-files`, stacked on PR-B1)

Build gate green; adversarially verified (RLS + correctness) — no cross-org leak, no upload
regression; fixed the stale size-limit message + completed storage-object cleanup on delete.

- **WO-05** — `<this commit>` — `phase-b-02-files.sql` (files + file_attachments, org RLS) +
  global `dashboard/files/` page + `WorkOrderFilesTab` (Files tab on WO detail: upload / attach
  existing / detach; detach keeps the record) + `DELETE /api/files/[id]` (removes DB row +
  storage object). Sidebar "Files" entry. **Owner-verify:** upload a PDF on a WO's Files tab →
  it shows there AND on /dashboard/files; detach keeps the global record; delete removes it.
  Deferred (noted): asset/site Files tabs (infra is polymorphic — trivial follow-up), auto-filing
  generated invoices, tags, and signed direct-to-storage uploads for large video.
- **WO-03** — `<this commit>` — /api/upload allowlist widened to images+PDF+MP4/MOV, cap 40 MB;
  the public requests bucket stays image/PDF-only via its Batch-1 bucket-level policy.

### PR-B3 — WO calendar with drag-to-reschedule (branch `claude/phase-b-wo-calendar`, stacked on PR-B2)

No SQL. Build gate green; adversarially verified (correctness + security) — PASS; fixed the
best-effort audit try/catch + chip WO-number padding.

- **WO-17** — `<this commit>` — `/dashboard/work-orders/calendar`: month grid of open WOs by
  `due_at` (date-fns CSS grid, no new deps), HTML5 drag-to-reschedule with optimistic update,
  refetch-revert, and audit trail; technician scoping matches CORE-21; Calendar button on the list.
  **Owner-verify:** drag a WO chip to another day → due date persists + a "Rescheduled" row in the
  WO History tab. Deferred: weekly/day intraday views; WO-18 dispatch board (Phase 2, needs WO-13).

## Security — role-aware DB enforcement (branch `claude/core-20-23-role-aware`, off `main`)

Pure-SQL security backstop — no app code. Unblocked by reading the live RLS policies directly
(a `pg_policies` dump from the SQL editor) instead of the full `supabase db pull`, since the
CLI wasn't installed. **DV-06 (the full `supabase/migrations/` DR baseline) is still not done**
(needs the Supabase CLI); it is no longer a blocker for this work. Two rounds of parallel
adversarial review (bypass / lockout / SQL-correctness / spec-fidelity) — round 1 caught 4
confirmed defects, all fixed; round 2 confirmed fixes hold with zero regressions.

- **CORE-20** — `<this commit>` — `core-20-23-role-aware-enforcement.sql`: `BEFORE UPDATE` trigger
  `enforce_wo_transition` on `work_orders`. Enforces (on the authenticated / direct-PostgREST path
  only — service_role routes + no-JWT contexts pass): requester read-only; close/reopen = admin/manager;
  complete = admin/manager or a worker; technicians only on WOs assigned to them; non-managers can't
  self-assign or self-add to `additional_workers`; closed WOs locked except manager reopen. Mobile
  writes status straight to PostgREST, so route checks (CORE-01/02/03) were bypassed there — this is
  the durable gate. **Owner-verify:** run `core-20-23-role-aware-enforcement.test.sql` (BEGIN/ROLLBACK
  harness, simulates JWTs, prints PASS/FAIL) → all PASS; on mobile a technician can no longer
  close/complete a WO that isn't theirs.
- **CORE-23** (privilege-escalation fix, was untracked/Critical) — `<this commit>` — trigger
  `enforce_user_privilege_lock` on `users`: on the authenticated path a user may only edit their OWN
  row and never `role`/`organisation_id`/`is_active`, and cannot re-enable a `disabled` account
  (self-service deletion via `request_account_deletion` still works). Closes: any org member could
  `users.update({role:'admin'})` on themselves via PostgREST.
- **Collusion complete-fix** — `<this commit>` — closed the 2-account residual: the trigger now
  blanket-blocks *any* non-manager change to a WO's `additional_workers` set (order-insensitive mutual
  containment, so an unchanged re-save still passes), and the web new/edit pages hide the Team /
  Additional-Workers fields for non-managers and never write them (`new/page.tsx`, `[id]/edit/page.tsx`
  gated on `isManager`). Build gate: web tsc ✓, web build ✓, mobile tsc ✓; web unit tests not run
  (owner declined) — changes are conditional UI rendering + a role check, no tested logic touched.
  Two benign spec-parity notes left as-is (manager reopen destination; trigger stricter than /close on
  already-closed WOs).
