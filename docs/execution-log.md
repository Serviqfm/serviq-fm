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

### PR-B4 — Saved views + shareable filter URLs (branch `claude/phase-b-saved-views`, stacked on PR-B3)

Build gate green; adversarially verified — sound; fixed the mount double-fetch race (fetch now
gated on URL parsing). SQL owner-run, SQL-first.

- **WO-13** — `<this commit>` — `phase-b-03-saved-views.sql` (saved_views, self-scoped RLS) +
  URL↔filter two-way sync on the WO list + Saved Views bar (apply/save/delete).
  **Owner-verify:** set filters → copy URL to another tab (same filters); Save current view →
  reselect it later. Unblocks: WO-14 column chooser persistence + WO-18 dispatch board.

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

### WO CSV import/export (branch `claude/wo-10-11-csv-import-export`, off `main`)

No SQL, no deps. Build gate: web tsc ✓, web build ✓ (both new routes in tree), mobile tsc ✓. Adversarial
review (3 lenses) — 1 medium + several low/nit correctness bugs, all fixed except one documented override.

- **WO-10** — `<this commit>` — Export button + column-picker modal on the WO list: CSV of the currently
  *filtered* rows (or only *checked* rows when any selected), reusing `lib/csv.ts`. `exportCSV` also
  hardened against CSV formula injection (leading `=+-@` cells prefixed `'`; plain numbers untouched).
  **Owner-verify:** filter to completed → export = completed only; untick columns → headers change;
  check 3 rows → 3 data rows.
- **WO-11** — `<this commit>` — Import page (`/dashboard/work-orders/import`, manager-only) using robust
  `parseCSV` + new `POST /api/work-orders/import` (service_role, admin/manager-gated). Template download,
  name/email→id resolution (unmatched/ambiguous → warning, not error), strict per-row validation, and a
  `wo_number`-match update path (partial: only filled columns change; accepts a `WO-` prefix). Review
  fixes: strict numeric parse (no `"1,250"`→`1`), assignee limited to technicians/managers, date-only
  due stored at local noon, ambiguous-name/dup-wo_number handling, malformed-body guard.
  **Owner-verify:** import a few rows (blank `wo_number`) → created; a bad-category row errors, others
  import; put an existing WO number → that WO updates. Deferred: per-row field-config enforcement
  (import is a manager override); column-picker persistence + extra export columns land with WO-14/WO-30.

### WO list column/filter cluster (branch `claude/t1-wo-list`, off `main`)

One SQL file (`wo-15-bookmarks.sql`, owner-run). Build gate: web tsc ✓, web build ✓.

- **WO-14** — `<this commit>` — "Columns" button + chooser modal on the WO list; visible columns persist
  per-browser in localStorage (`wo-list-visible-cols`). One `LIST_COLUMNS` model now drives both the table
  and the CSV export picker (WO # + Title are always-on). New columns: Start Date, Created By, Requested By,
  Last Updated, Est. Duration, Team, Close-out Notes, Days Since Created. **Owner-verify:** untick a column →
  hides + survives reload; Reset restores defaults. (No `completed_by`/`Completed By` column exists in the
  schema, so that one is deferred to a DB migration.)
- **WO-15** — `<this commit>` — Per-user bookmarks: star toggle on each list row + a "Bookmarked" filter
  chip. New `wo_bookmarks` table (self-scoped RLS, mirrors `saved_views`) in
  `docs/superpowers/sql/wo-15-bookmarks.sql` — **owner-run before deploy**; list swallows a missing-table
  error so build/first-load still work. **Owner-verify:** star a WO → appears under Bookmarked for that user
  only. Deferred: bookmark toggle on WO detail + mobile.
- **WO-16** — `<this commit>` — Default landing view is now "Open" (excludes completed/closed via a virtual
  `open` status served with `.not('status','in','(completed,closed)')`); added an "Unassigned" quick-filter
  chip (assignee null and no vendor). **Owner-verify:** fresh list shows only open statuses; Unassigned chip
  shows only WOs with no assignee.
- **WO-30 (list/export half)** — `<this commit>` — Close-out notes (`completion_notes`) surfaced as a
  toggleable list column and CSV export column. The "editable at close on Overview" half depends on WO-01
  and stays on the detail page — deferred. **Owner-verify:** a WO with completion notes shows them in the
  Close-out Notes column and export.

Deferred from track: WO-29 (asset-dropdown-by-site lives on the new/edit *forms*, not the list),
WO-12 (archive — needs `archived_at` migration + detail changes).

### T4 — Site detail page + GPS/team assignment (branch `claude/t4-locations`, off `main`)

Owner-run SQL: `docs/superpowers/sql/t4-01-site-gps-assignment.sql` (adds `sites.latitude`,
`sites.longitude`, `sites.assigned_team_id`; app tolerates its absence — reads null until applied).
Build gate: web tsc ✓, web build ✓ (new `/dashboard/sites/[id]` route in tree).

- **AL-13** — `<this commit>` — Site detail page `dashboard/sites/[id]/page.tsx` with tabs
  Details / Work Orders / Assets / Parts / Files. Each list tab queries by `site_id`
  (`work_orders`, `assets`, `inventory_items`); Files reuses the polymorphic `file_attachments`
  table via a new generic `EntityFilesTab` (extracted from `WorkOrderFilesTab`, which is now a thin
  wrapper) with `entity_type='site'` — no new files table needed. Site cards link to it (title + View).
  **Owner-verify:** open a site → each tab lists only that site's records; upload a file on Files →
  it attaches to the site and appears in the Files library.
- **AL-15** — `<this commit>` — GPS latitude/longitude on site create + edit forms and a team
  assignment select on edit (teams from `sprint-k-05-teams`); Details tab shows coordinates
  (Google-Maps link) and the assigned team. Coordinates parsed server-side (finite-or-null) in the
  sites POST/PATCH allowlists; fields added to the field-catalog (optional by default).
  **Owner-verify (after SQL):** set lat/long + a team on a site → they persist and show on the detail page.

Deferred to follow-ups: AL-14 (nested sub-locations), AL-17/AL-19/AL-20 (floor plans, import wizard
upgrades, re-parent spaces), MKT-25 (floor-plan pin-drop).

### Asset Log module foundation (branch `claude/t3-asset-log`, off `main`)

New non-MEP register module (spaces-only, separate from MEP `assets`). First PR = foundation only;
item detail/create-edit/QR/mobile (AG-4/5/6/8/9), reports (AG-10), warranty cron (AG-11), split
(AG-12), and CSV (AG-7) deferred to follow-ups. Build gate: web tsc ✓, web build ✓ (all
`/api/asset-log/*` + `/dashboard/asset-log` in tree). Mobile untouched.

- **AG-1** — `<this commit>` — Schema migration `docs/superpowers/sql/sprint-l-01-asset-log.sql`
  (**owner-run**): 5 tables (`asset_log_types`, `asset_log_items`, `asset_log_movements`,
  `asset_log_repairs`, `asset_log_condition_reviews`) with all CHECK constraints (statuses,
  1–5 ratings, unit+qty=1) + FK indexes + the standard 4-policy org RLS on every table, plus the
  SECURITY DEFINER `move_asset_log_item` RPC (org-verified internally, `SET search_path=public`,
  EXECUTE to authenticated only). Idempotent. Verified locally: SQL parses, styled after
  sprint-k-03. Live acceptance (cross-org RLS deny, atomic move, unit CHECK) via the paired
  `sprint-l-01-asset-log.test.sql` rollback harness after the owner runs it.
- **AG-2** — `<this commit>` — Write routes under `web/src/app/api/asset-log/**`: POST create
  (seeds 5 default types on first use, writes the initial movement row when a space is set),
  PATCH/DELETE `[id]` (DELETE admin-only + blocked unless `disposed`), POST `[id]/decommission`
  (+ re-commission), POST `[id]/repairs` (+ optional status flip). Standard auth→profile-org→role
  gate→service-role write + `audit_logs` (`entity_type='asset_log_item'`), deduped through
  `_helpers.ts`. Helper `web/src/lib/asset-log.ts` (straight-line current-value calc + status maps,
  with a runnable self-check). **Owner-verify:** requester gets 403 on writes; DELETE a non-disposed
  item → 400; decommission stamps date/by/reason and flips to `disposed`.
- **AG-3** — `<this commit>` — Sidebar "Asset Log" nav item (below Assets) + list page
  `web/src/app/dashboard/asset-log/page.tsx`: 5 stat cards, RLS-scoped client fetch, table
  (AL-####, name+AR, type, site→space, qty, status, condition stars + not-usable chip, current
  value, warranty badges), filters (search, type, status chips, site→space cascade, usable /
  warranty-expiring / review-due / include-disposed toggles; disposed hidden by default). ~40 EN/AR
  keys in `context/LanguageContext.tsx`. Bulk QR multi-select intentionally deferred with AG-6
  (its export route). **Owner-verify:** list shows only caller-org items, hides disposed by default,
  filters combine with search, renders in Arabic RTL.

### T2 — WO close-out notes (branch `claude/t2-wo-lifecycle`, off `main`)

No SQL (uses existing `work_orders.completion_notes` column), no deps. Build gate: web tsc ✓, web build ✓.

- **WO-30** — `<this commit>` — Close-out notes are now a first-class field captured *at completion* on
  web (previously the technician could only enter them via the separate Edit page). A "Close-out notes"
  textarea shows on the WO detail while the WO is still open (gated/required via Form Fields >
  Close Work Order, new `completion_notes` catalog entry on `work_orders_close`); the value is sent
  through `POST /api/work-orders/[id]/close`, persisted to `completion_notes`, and rendered on detail
  (existing block). Added a "Close-out Notes" column to the WO list CSV export (WO-10 picker). The close
  route only writes notes when provided (never blanks earlier mobile/edit notes) and falls back to the
  stored value when merely *closing* an already-completed WO so a required-notes rule isn't re-imposed.
  **Owner-verify:** mark a WO Completed with notes → notes show on detail + export column; set
  `completion_notes` required on the Close page → Complete is blocked until notes entered; closing an
  already-completed WO with required notes still succeeds.

Deferred to follow-ups: WO-06/07 (labor time + costs, need SQL), WO-19 (mobile signature),
WO-23 (feedback rating — tokenized public email/page surface), MKT-15 (failure-code picklists + report).

## Wave 2 — custom fields · dispatch · PM meters · Asset Log detail (2026-07-14)

Four parallel tracks, disjoint files, build-gated. New RLS tables carry WITH CHECK on
insert AND update (Wave-1 lesson). T5 + T8 SQL got a full adversarial review before owner-run.

### T5 — WO custom fields + planned start (PR #27, `claude/t5-wo-custom-fields`)
- **WO-26** — org-defined custom fields on WOs, JSONB design: `custom_field_definitions` table
  (org RLS, insert+update WITH CHECK) + `work_orders.custom_fields JSONB`; Settings → Custom Fields
  admin CRUD; rendered on WO new/edit and shown on detail. **WO-31** — `work_orders.start_at` planned
  start on new/edit/detail. **SQL:** `t5-01-wo-custom-fields.sql` (+ `.test.sql`). Review: clean.
  Deferred: WO-04 (category-as-table), WO-25 (custom statuses — touches CORE-20 triggers), FM-20.

### T6 — Dispatch board (PR #25, `claude/t6-dispatch-board`)
- **WO-18 / FM-15 / MKT-06** — new `/dashboard/work-orders/board`: status-column kanban of active WOs,
  drag-to-advance, per-card technician reassign (managers), CORE-21 tech scoping, optimistic + audit.
  No SQL (reuses work_orders + existing RLS). Board nav button on the calendar page. Deferred: WO-24
  (linking), CORE-30.

### T8 — PM meters + hybrid trigger (PR #26, `claude/t8-pm-meters`)
- **1C-11 / MKT-04** — `meters` + `meter_readings` (org RLS, insert+update WITH CHECK); `pm_schedules`
  gains meter_id/meter_interval/last_trigger_reading; `generate_due_pm_work_orders()` SECURITY DEFINER
  (search_path pinned, service_role-only) = nightly hybrid trigger (calendar-due OR meter-threshold,
  whichever first); `/dashboard/meters` page; `/api/cron/pm-generate` meter pass (CRON_SECRET-gated,
  fails closed). **SQL:** `t8-01-meters-pm.sql` (+ `.test.sql`). **Review caught a CRITICAL** — the meter
  arm advanced the marker on any open WO, swallowing meter crossings on hybrid schedules; **fixed** —
  one open-WO de-dupe, no marker advance on skip, calendar service resets the meter clock. Deferred:
  1C-09/1C-10 (floating/calendar recurrence), seasonal/lifecycle.

### T3b — Asset Log item forms + detail (PR #28, `claude/t3b-asset-log-detail`)
- **AG-4 / AG-5** — asset-log item create/edit forms (JSONB custom_fields) + item detail page with tabs
  (Details / Movements / Repairs / Condition) + lifecycle actions, on the merged #24 foundation; the
  move action uses the authenticated client (RPC needs auth.uid()). No new migration. Deferred: AG-6
  (QR + bulk PDF), AG-8/9 (mobile).

## Wave 3 — location perms · notifications · mobile completion (2026-07-14)

Three disjoint tracks. T9 (RLS) got the deepest adversarial review of the program; findings fixed pre-merge.

### T9 — Location-based permissions (PR #30, `claude/t9-location-perms`)
- **1C-14 / MKT-11** — `user_site_scope(user_id, site_id, organisation_id)` join table; `user_can_access_site()`
  SECURITY DEFINER helper (search_path pinned, org-aware) with a BACKWARD-COMPATIBLE default (no valid scope
  rows = unrestricted, so shipping it locks nobody out); a catalog-driven idempotent rewrite that ANDs the site
  check into the existing `work_orders`/`assets` org policies' USING (org expression/roles/WITH CHECK preserved
  verbatim; CORE-20 triggers untouched). Site-assign UI on the user edit page. **SQL:** `t9-01-site-scope.sql`
  (+ `.test.sql`). **Review (deep) fixed pre-merge:** user_site_scope writes now require admin/manager + bind
  user_id & site_id to the caller's org (closed a self-grant/forged-row vector); helper made org-correct;
  roles quote_ident'd; documented that for the FOR-ALL/no-WITH-CHECK base policy, extending USING also
  site-scopes WRITES for scoped users (intended). Deferred: 1C-13, custom roles/SSO/MFA (MKT-20/21/22).

### T10 — Notifications + escalation (PR #31, `claude/t10-notifications`)
- **CORE-15** — `user_notifications` in-app feed table (self-scoped org RLS) + `NotificationBell` (unread badge,
  alert center, mark-read, 60s poll) in the sidebar + `NotificationService.insertInApp()` (isEnabled-gated,
  swallows only 23505 dedupe). **CORE-16** — `/api/cron/escalations` (CRON_SECRET-gated, fails closed) with
  three deduped passes (overdue WOs, PM overdue 24h, due <24h), excluding deactivated users; hourly in
  `web/vercel.json`. **SQL:** `t10-01-user-notifications.sql` (+ `.test.sql`). Review: clean (the flagged
  "missing insertInApp" was a false positive — it exists on-branch). Deferred: 1C-06, full 1C-07 sweep,
  additional_workers fan-out.

### T11 — Mobile completion parity (PR #33, `claude/t11-mobile-parity`)
- **FM-07 / CORE-05** — mobile WO Complete/Close now POSTs the web `/api/work-orders/[id]/close` endpoint
  (via a new `webApi.ts` that presents the Supabase session as the `@supabase/ssr` cookie) instead of writing
  `work_orders.status` directly — centralizes close-out enforcement/sign-off/audit + notifications, and removes
  a direct-PostgREST status-write bypass (complements CORE-20). Completion sheet: close-out photo + sign-off.
  No SQL. Deferred: FM-06 (tasks/checklists tab), CORE-04 web wiring.

## Wave 4 batch 1 — KPIs · purchasing · compliance+QR · portal chat (2026-07-14)

Four disjoint tracks; new-RLS tracks (B/C/D) got a full SQL review — fixes below landed pre-merge.

### W4-A — Real KPIs + reports (PR #36) — CORE-13, FM-03, FM-12
Real MTTR / MTBF / total maintenance cost / active-technicians + SLA compliance % and worst-first breach
table on `/dashboard/reports`; pure fns in `lib/kpis.ts` with a 10-case vitest. FM-12: grepped — no fake
hardcoded KPI deltas existed to remove. No SQL (client-side aggregation over org-scoped rows).

### W4-B — Purchase orders + stock ledger (PR #37) — MKT-05, FM-10
`purchase_orders` / `purchase_order_items` / `stock_transactions` (org RLS, insert+update WITH CHECK) +
`receive_purchase_order()` SECURITY DEFINER RPC (atomic PO→received + stock bump + ledger; idempotent via
status guard). New `/dashboard/purchase-orders` + `/dashboard/inventory/ledger`. **SQL:** `w4-01-purchasing.sql`.
Review fix: the receive loop now JOINs in-org inventory items so the ledger can't record a stock-in that
never landed (ledger/inventory divergence). Residual (documented): FK-binding WITH CHECK for direct writers
(none today). Follow-up: FM-17 settings toggles.

### W4-C — Compliance register + Asset Log QR (PR #38) — FM-04, AG-6
`compliance_certificates` (org RLS, expiry flags) + `/dashboard/compliance`; `/al/[token]` QR landing
(self-auth, RLS-scoped) + bulk A4 QR-label PDF export + asset-log list bulk-select. **SQL:**
`w4-compliance-certificates.sql`. Review: clean. Deferred: compliance sidebar link + expiry-alert cron.

### W4-D — Request-portal chat (PR #35) — CORE-36, WO-22
`request_messages` + a two-way thread: staff on the request detail, requester on the public `/track/[token]`
via `/api/public/request-messages/[token]` (service-role, token pins to one request_id, `sender_type`
forced server-side). **SQL:** `core-36-request-messages.sql`. Review: token scoping + anon-deny sound;
render is JSX-escaped (no XSS); fix added — a 3s anti-flood throttle on the public POST.
