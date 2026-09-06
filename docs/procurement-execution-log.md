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
