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

### Batch P2 — PO lifecycle + vendor upgrades

| Item | Commit | Evidence |
|---|---|---|
| `procurement-03-po-vendor.sql` — widened PO status, `delivery_address` / `sent_at` / `vendor_email_snapshot`, 5 vendor columns | _see PR_ | Not verified — needs the live DB. `.test.sql` covers the vocabulary, the receive path and the vendor columns. |
| `receive_purchase_order()` widened to accept `acknowledged` / `in_transit` | _see PR_ | `.test.sql` 2 — **required, not cosmetic**: the shipped RPC only received draft/sent, so the new in-flight states would have been unreceivable. |
| Send-to-vendor: PO PDF + email, `draft → sent` | _see PR_ | Build green; route emitted. Actual delivery not verified — needs a live send (Resend). |
| Forward-only status advance route | _see PR_ | `lib/purchaseOrders.test.ts` — 5 cases incl. backwards, terminal, and the statuses the route must refuse to own. |
| PO detail page (stepper, lines, send, requisition link, receipt ledger) | _see PR_ | Built as `ƒ /dashboard/purchase-orders/[id]` (4.28 kB). |
| PO PATCH (draft-only delivery details) + create-form address field | _see PR_ | Build green. Needed so a PO converted from a requisition can still get an address before it is sent. |
| Vendor edit/detail: payment terms, bank fields, contract window | _see PR_ | Build green. |
| On-time delivery %, computed not stored | _see PR_ | `lib/purchaseOrders.test.ts` — including a hand-computed 2/3 = 67% sample. A timezone bug (deadline parsed local, receipts UTC) was caught by this test and fixed. |
| Contract-expiry alerts (30/7 day) | _see PR_ | Extended `/api/cron/compliance-expiry` rather than adding a cron; no `vercel.json` change. Not verified — needs a live cron run. |
| Full build gate | _see PR_ | `npx tsc --noEmit` clean · `npm run build` ✓ 141/141 pages · `vitest run` 22 files / 128 tests passed. |

**Deviations / notes:**

- Added `PATCH /api/purchase-orders/[id]` (draft-only), which the playbook does not list. Without it `delivery_address` is unreachable on a PO created by requisition conversion, so the column and the vendor PDF would both be dead on arrival.
- No cancel action: the status vocabulary keeps `cancelled`, but nothing in P2 sets it and the playbook does not ask for it.
- The receipt-history panel shows the stock ledger, which is the only receipt record V1 has. P3 replaces it with per-line goods receipts.

### Batch P3 — Goods receipt & inspection

| Item | Commit | Evidence |
|---|---|---|
| `procurement-04-goods-receipt.sql` — `goods_receipts`, `goods_receipt_lines`, `stock_transactions.ref_goods_receipt_id` | _see PR_ | Not verified — needs the live DB. `.test.sql` covers all 7 assertions. |
| `receive_purchase_order_lines(po, JSONB)` — per-line qty/condition/bin, ok-only stock movement, completion rule | _see PR_ | `.test.sql` 1a/1b (partial: +6 stock, PO stays open), 2 (damaged writes no ledger row), 4 (completing receipt flips to received). |
| Over-receipt guard | _see PR_ | `.test.sql` 5 — cumulative ok qty may not exceed the order. Not in the playbook; added because nothing else prevented it. |
| `receive_purchase_order()` kept working as receive-all sugar | _see PR_ | `.test.sql` 7 — the PO list button and empty-body POST behave as before and now write a real receipt. |
| Cross-org receive raises | _see PR_ | `.test.sql` 6. |
| `/api/purchase-orders/[id]/receive` takes an optional JSON body | _see PR_ | Build green; empty body is the old path exactly. |
| Per-line receive UI, receipt history, discrepancy badges (detail + list) | _see PR_ | Built as `ƒ /dashboard/purchase-orders/[id]` (5.96 kB). Falls back to the all-or-nothing button pre-migration. |
| `po_receipt_discrepancy` notification to PO creator + admins | _see PR_ | Renders itself in Settings → Notifications via the existing `procurement` category. Delivery not verified. |
| Full build gate | _see PR_ | `npx tsc --noEmit` clean · `npm run build` ✓ 141/141 pages · `vitest run` 22 files / 128 tests passed. |

**Deviations / notes:**

- No Vitest: P3's logic is all in the RPC and covered by `.test.sql`. The client-side per-line aggregation is a sum.
- `condition` is a reserved word in PL/pgSQL, so it is quoted inside the function body. The column name itself follows the playbook.
- The receipt UI and the completion rule read the same cumulative-ok-quantity definition the RPC uses, so screen and database cannot disagree about what is outstanding.

### Batch P4 — Invoice & 3-way match

| Item | Commit | Evidence |
|---|---|---|
| `procurement-05-three-way.sql` — `purchase_order_id` / `match_status` / `match_detail` on `vendor_invoices` | _see PR_ | Not verified — needs the live DB. `.test.sql` covers defaults, the CHECK, and the org-bound FK. |
| `vendor_invoice_lines` (deviation — see below) | _see PR_ | `.test.sql` 4 (cascade) and 5 (cross-org INSERT refused). |
| `lib/threeWayMatch.ts` — the pure matcher | _see PR_ | **17 Vitest cases** covering all three checks, both tolerance edges (±1% exactly in and just out), accumulation across lines, unlinked lines, negative deltas, zero-sum totals, and float rounding. |
| `POST /api/vendor-invoices/[id]/match` | _see PR_ | Build green. Refuses to guess when goods-receipt or line data is missing rather than flagging a false mismatch. |
| `PATCH /api/vendor-invoices/[id]` — PO link + lines | _see PR_ | Build green. Clears a stored verdict whenever its inputs change; refuses to edit a paid invoice. |
| Status route additions (`approved_for_payment` / `disputed`) with `can_view_financials` denial | _see PR_ | Build green. Only a `matched` invoice can be approved for payment. |
| Vendor-invoice detail page with the match panel | _see PR_ | Built as `ƒ /dashboard/vendors/[id]/invoices/[invoiceId]` (4.96 kB). |
| `invoice_match_mismatch` notification to admins | _see PR_ | Renders in Settings → Notifications via the `procurement` category. Delivery not verified. |
| Full build gate | _see PR_ | `npx tsc --noEmit` clean · `npm run build` ✓ 141/141 pages · `vitest run` 23 files / 145 tests passed. |

**Deviations / notes:**

- **`vendor_invoice_lines` was added, and the playbook does not list it.** `vendor_invoices` has no line items — only `amount` — so the playbook's own acceptance criterion ("seeded mismatch: invoice qty > received flags red with the exact delta") is impossible to meet without invoiced quantities. Without the table the matcher could only ever compare totals.
- `match_status` is deliberately NOT the payment status. `vendor_invoices.status` keeps its MKT-18 lifecycle; the API keeps the two in step using only transitions that state machine already allows, so a paid invoice is never dragged back open by a match decision.
- Approving for payment requires `match_status = 'matched'`. Approving an invoice that failed the match is precisely what the match exists to prevent.

### Batch P5 — Budgets with reserve + hard block

| Item | Commit | Evidence |
|---|---|---|
| `procurement-06-budgets.sql` — `budget_periods` table with 4-policy RLS | _see PR_ | Not verified — needs the live DB. |
| `budget_spend(cost_center, from, to)` — reserved vs actual | _see PR_ | `.test.sql` 4 (approved requisition counts as reserved, not actual) and 5 (conversion does not double-count). |
| `submit_requisition()` gains the 100% hard block | _see PR_ | `.test.sql` 1 (no period => no block), 2 (76% succeeds), 3 (over 100% raises with the numbers). |
| `lib/budget.ts` — error parsing + threshold maths | _see PR_ | 10 Vitest cases. Caught a real parsing bug: Postgres appends CONTEXT after the payload, so the naive split produced NaN and the block would have surfaced as a generic failure. |
| Submit route returns a structured `budget_exceeded` payload | _see PR_ | Build green. Numbers reach the UI; the database carries no UI copy. |
| 75%/90% threshold notification to admins | _see PR_ | Emitted from the route after commit, deduped per period + threshold. Delivery not verified. |
| Budget periods editor + stacked reserved/actual bar on cost-center detail | _see PR_ | Build green. Hidden entirely pre-migration. |
| Bilingual block panel on the requisition detail | _see PR_ | Build green. Shows requested / reserved / actual / budget / remaining. |
| Full build gate | _see PR_ | `npx tsc --noEmit` clean · `npm run build` ✓ 141/141 pages · `vitest run` 24 files / 155 tests passed. |

**Deviations / notes:**

- **Reserved does not count a converted requisition and its PO at once.** The playbook defines reserved as "approved/converted requisition totals + open PO totals"; a converted requisition *is* its purchase order, so counting both would double-count and block budgets that are not actually full. Reserved counts a requisition while `approved`, then hands over to the PO. Same for actual: a received PO with a matched invoice is counted once, at the invoice amount.
- **Known limitation, documented in the migration:** a PO raised directly, never through a requisition, has no cost center (`purchase_orders` has no `cost_center_id`) and is invisible to budgets. Requisitions are the budget-bearing document in V1. Closing it needs a column plus a PO-time block, which is not in P5 scope.
- The 75%/90% warning is emitted by the route, not the RPC: raising in the RPC would roll the submit back, and a warning must not.

### Batch P6 — Procurement reporting

Code only — **no migration to run**.

| Item | Commit | Evidence |
|---|---|---|
| `lib/procurementReports.ts` — every figure on the page | _see PR_ | **20 Vitest cases**: grouping, cancelled/draft handling, per-line category split, unattributed bucketing, chronological months, cycle-time sample counts, vendor on-time. |
| Reports page: spend by vendor / category / cost center / month | _see PR_ | Built as `ƒ /dashboard/procurement/reports` (5.81 kB). |
| Cycle time — 4 stages with sample counts | _see PR_ | `procurementReports.test.ts` — including the trap test that a requisition still awaiting approval is not averaged in as a zero-day approval. |
| Vendor performance table | _see PR_ | Tested; reuses the P2 on-time definition (null ≠ 0%). |
| Budget vs actual (current period) | _see PR_ | Reads P5 `budget_spend`; the panel hides entirely when no period exists. |
| CSV export on every chart and table | _see PR_ | Uses the existing `lib/csv.ts` (BOM + formula-injection sanitising already handled there). |
| PDF export | _see PR_ | `ƒ /api/procurement/reports/pdf` — recomputed server-side from the same pure functions, so the document cannot be forged from a request body. |
| Procurement home KPI tiles + Reports nav entry | _see PR_ | Fourth tile is month-to-date committed spend, totalled by the same `poTotal`/`isCommitted` the reports page uses. |
| Full build gate | _see PR_ | `npx tsc --noEmit` clean · `npm run build` ✓ 143/143 pages · `vitest run` 25 files / 175 tests passed. |

**Definitions worth knowing (documented at the top of the module):**

- **Spend = committed money**: the value of purchase orders actually placed. Cancelled orders are excluded; drafts are included, because the commitment exists before the order is sent.
- **Requisitions are never counted as spend.** An approved requisition is an intention; counting it alongside the PO it becomes would double-count the same money — the same trap P5's `reserved` avoids.
- A PO raised directly, with no requisition behind it, has no cost center and appears under `—` in the cost-center chart rather than being dropped, so that chart still sums to total spend.

**Notes:**

- The procurement Reports nav entry points at the new procurement report; the CAFM Reports page is unchanged and still reachable from the FM workspace.
- No date-range filter: spend-by-month gives the trend, and a filter is not in the acceptance criteria. Easy to add later.

### Batch P7 — ERP integration framework

Framework only — **no live connectors** (Phase Q, owner decision gate).

| Item | Commit | Evidence |
|---|---|---|
| `procurement-08-erp.sql` — `erp_connections` (one per org, admin-only RLS) + `erp_sync_log` (append-only) | _see PR_ | Not verified — needs the live DB. `.test.sql` covers the provider CHECK, one-connection-per-org, append-only log, admin-only read. |
| `lib/erp` — one `ErpAdapter` interface + `NoopAdapter` + `fireErpEvent` | _see PR_ | **8 Vitest cases**: every adapter method writes a `skipped` row, event→method routing, and `fireErpEvent` swallowing a missing table, a throwing resolver and a failing log write. |
| Hook: PO send → `po.sent` | _see PR_ | Fired after the status flip commits; `void`, never throws. |
| Hook: invoice approved for payment → `invoice.approved` | _see PR_ | Only the finance release fires; a dispute is internal and does not. |
| Hook: vendor created → `vendor.created` | _see PR_ | Vendor creation is client-side, so the page pings `POST /api/erp/vendor-created` after its insert; the route re-checks the vendor is in the caller's org. |
| ERP settings page — provider picker (real providers "coming soon") + sync log viewer | _see PR_ | Built as `ƒ /dashboard/settings/erp` (3.27 kB); linked from Settings beside Custom Branding. |
| Full build gate | _see PR_ | `npx tsc --noEmit` clean · `npm run build` exit 0, ✓ 144/144 pages · `vitest run` 26 files / 183 tests passed. |

**Deviations / notes:**

- **`erp_sync_log` has no write policies at all**, departing from the house 4-policy template on purpose: it is an audit log, written only by the service role, so a browser session can neither forge nor edit a row.
- **`erp_connections` is admin-only for reads too.** `config` is plain JSONB; the migration documents that credentials must never go in it (Q5 puts secrets in env/vault).
- **Zero cost for tenants who never enable ERP.** With no active connection the hooks resolve to nothing and write nothing — which also means the acceptance check needs the connection switched **on** (provider "none") first.
- **The NoopAdapter logs `skipped`, never `success`.** Nothing was delivered, and the log must not claim otherwise.
- **Known ceiling:** `void` on Next 14 / Vercel means a pending log write *can* be dropped if the function freezes right after responding — the same posture as `lib/webhookDelivery.ts`. Upgrade path, noted in code: `waitUntil()` from `@vercel/functions`, or `after()` on Next 15, once a real connector needs delivery guarantees. The vendor-created route awaits its write, since nobody waits on that response.
- `pushPayment` and `pullBudgets` are on the interface (per the playbook) but have no V1 caller.

**Phase P (V1) is complete with this batch.** Phase Q is behind the owner decision gate and is not started.

### Hotfix — organisation-account pages unreachable in procurement-only tenants

Reported by the owner at the start of Phase Q: "there is no user module in procurement."

| Item | Commit | Evidence |
|---|---|---|
| `middleware.ts` — `/dashboard/users`, `billing`, `security`, `privacy`, `usage`, `developers` added to the procurement-shared prefixes | _see PR_ | `npx tsc --noEmit` clean · `npm run build` exit 0, 144/144 pages · `vitest run` 26 files / 183 tests passed. Redirect behaviour not verified against a live procurement-only tenant. |
| `Sidebar.tsx` — the same six items in `PROCUREMENT_NAV` | _see PR_ | Same keys as the CAFM nav, so the existing role gates and the `can_manage_users` custom-role gate apply unchanged. |

**Root cause (P0):** users live in one table shared by both workspaces, but P0 listed `/dashboard/users` as CAFM-only. A procurement-only admin was redirected away from the Users page and had no nav entry, so they could not add anyone — including the approvers the P1 approval chains need. The same misclassification covered Billing, Security, Privacy, Usage and Developers, which are organisation-account pages rather than CAFM features.

**Left as is, on purpose:** the user edit page still offers the CAFM site scope and work-order skill categories, and the CSV import still accepts a team column. All three are optional; in a procurement-only tenant they are simply empty. Teams stay CAFM-only — they exist for work-order assignment.
