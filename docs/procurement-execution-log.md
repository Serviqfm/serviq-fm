# Procurement Module — Execution Log

One line per completed playbook item (`docs/procurement-execution-playbook.md` §4), with the
commit and the evidence it was verified against. "Not verified" means exactly that.

## Phase P — V1 MVP

### Batch P0 — Workspace split

| Item | Commit | Evidence |
|---|---|---|
| `procurement-01-workspace.sql` — `organisations.has_cafm` / `has_procurement` (+ `.test.sql`) | _see PR_ | Not verified — needs the live DB. `.test.sql` asserts column shape, defaults and that every existing tenant stays CAFM-on / procurement-off. |
| `middleware.ts` — A2 workspace redirects at the existing `/dashboard/*` choke point | _see PR_ | `npx tsc --noEmit` clean; `npm run build` green (middleware 131 kB). Redirect behavior not verified against a live procurement tenant. |
| `app/dashboard/workspace-selector/page.tsx` — bilingual two-card picker | _see PR_ | Built as `ƒ /dashboard/workspace-selector` (1.41 kB). |
| `app/dashboard/procurement/page.tsx` — procurement home (placeholder tiles + shared-page links) | _see PR_ | Built as `ƒ /dashboard/procurement` (1.24 kB). |
| `components/Sidebar.tsx` — `PROCUREMENT_NAV`, workspace switcher, first-visit selector redirect | _see PR_ | Build green. Nav swap not verified against a live both-workspace tenant. |
| Platform admin toggles for both flags (Feature Flags tab) | _see PR_ | Build green. Save path not verified — needs the live DB. |
| Full build gate | _see PR_ | `npx tsc --noEmit` clean · `npm run build` ✓ 138/138 pages · `vitest run` 21 files / 119 tests passed. |

**Deviations from the playbook (deliberate, one line each):**

- P0's nav list omits **Requisitions**. Its page ships in P1; a nav item pointing at a 404 would
  otherwise reach production. Added in P1 with the page.
- The procurement home tiles are static placeholders (as the playbook specifies) — P1 wires them.
- The middleware allows a procurement-only tenant onto the **shared** CAFM routes the procurement
  nav links to (POs, vendors, inventory, invoices, cost centers, reports, settings), per A1
  "shared tables, procurement nav". Everything else under `/dashboard` stays CAFM-only.

### Batch P1 — Requisitions + approval chains

| Item | Commit | Evidence |
|---|---|---|
| `procurement-02-requisitions.sql` — 5 tables, 2 RPCs, status-guard trigger, `purchase_orders.requisition_id` | _see PR_ | Not verified — needs the live DB. `.test.sql` covers all 8 acceptance points. |
| `submit_requisition()` — band selection, chain materialisation, auto-approve fallback | _see PR_ | `.test.sql` 2a/2b/2c (300 → 1 step, 1000 → 2, 9000 → 3) and 7 (no band → auto-approve). |
| `decide_requisition()` — sequential approve/reject, comment-required reject | _see PR_ | `.test.sql` 3 (out-of-order raises), 5a/5b (blank comment raises; reject short-circuits), 6 (resubmit rebuilds). |
| Status-guard trigger — RPCs are the only end-user status path | _see PR_ | `.test.sql` 8 (direct `UPDATE … status='approved'` refused). |
| API: create / patch / submit / decide / convert under `api/procurement/requisitions/` | _see PR_ | Build green; all five routes emitted as `ƒ` server routes. Runtime behavior not verified — needs the live DB. |
| Pages: list, new, detail (chain timeline + actions) | _see PR_ | Built: list 2.5 kB, new 3.02 kB, detail 4.3 kB. |
| Settings → Procurement approvals (band + ordered approver editor) | _see PR_ | Built as `ƒ /dashboard/settings/procurement` (3.49 kB). Writes gated by admin/manager RLS, not just the UI. |
| Notifications `req_pending_approval` / `req_decided` | _see PR_ | New `procurement` category renders itself in Settings → Notifications (`getAllCategories()`); emission not verified — needs a live send. |
| Requisitions nav item (deferred from P0) + procurement home tiles wired | _see PR_ | Build green; home tiles now query real counts. |
| PO list back-link to the source requisition | _see PR_ | Fetched in a separate tolerant query so a pre-migration tenant sees the page unchanged. |
| Full build gate | _see PR_ | `npx tsc --noEmit` clean · `npm run build` ✓ 141/141 pages · `vitest run` 21 files / 119 tests passed. |

**Deviations / notes:**

- No Vitest added: P1 has no pure-TS logic worth pinning (band selection and sequencing live in SQL, covered by `.test.sql`). The playbook's Vitest item lands in P4 with the 3-way matcher.
- The requisition detail's "view the purchase order" link goes to the PO **list** — there is no PO detail page until P2.
- Known residual, documented in the migration header: `requisition_items` keeps open org RLS, so a direct PostgREST write could edit lines of an in-flight requisition. Status changes are trigger-guarded; lines are not.
