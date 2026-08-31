# Serviq-FM — Procurement Module Execution Playbook

**Purpose:** execute the Procurement App design (`docs/superpowers/specs/2026-07-20-procurement-app-design.html` + the two source PDFs in `CAFM App/`) in safe, verified batches, so every push builds green on Vercel first time. Same discipline as `docs/execution-playbook.md`; this file is the standing instruction set for the procurement work, and the kickoff prompt at the bottom is what the owner pastes into a new session.

**Status tracking:** log completed batch items in `docs/procurement-execution-log.md` (create in Batch P0), one line per item with commit hash and verification evidence.

---

## 1. Non-negotiable ground rules

Identical to `docs/execution-playbook.md` §1 — read that section first. Summary:

1. Never work on or push to `main`. One batch = one branch = one PR.
2. Build gate before every push: `cd web && npx tsc --noEmit && npm run build` (+ `cd mobile && npx tsc --noEmit` if mobile touched). Paste evidence in the PR body.
3. DB changes ship as **idempotent** SQL in `SQL Files/procurement-NN-<name>.sql` (repo convention — NOT `docs/superpowers/sql/`), listed under **"Manual pre-deploy steps"** in the PR body. The owner runs them in the Supabase SQL editor before merging. Each migration gets a matching `.test.sql` in the house style (cross-org RLS proof, RPC behavior).
4. New env vars documented in PR body + `web/.env.example`, never hardcoded.
5. Report honestly; "Not verified — needs owner check" for anything needing the live DB.
6. Every user-facing string bilingual EN/AR. Match existing UI conventions (Tailwind token classes as used in `Sidebar.tsx` / `purchase-orders/page.tsx`, `useLanguage()`, `material-symbols-outlined` icons).

## 2. Architecture decisions (locked — do not relitigate)

These were decided with the owner on 2026-08-31 and override any conflicting reading of the spec:

- **A1 — Shared tables, procurement nav.** ONE set of tables serves both workspaces: existing `vendors`, `purchase_orders`, `purchase_order_items`, `stock_transactions`, `inventory_items`, `cost_centers`, `vendor_invoices` are REUSED, not duplicated. There are no `procurement_vendors`-style parallel tables. `/dashboard/procurement/*` is a navigation shell + new procurement-only pages; the spec's "tenant_id" is this repo's `organisation_id`.
- **A2 — Workspace split at middleware.** `organisations.has_cafm` (default `true`) + `organisations.has_procurement` (default `false`). The existing `/dashboard/*` gate in `web/src/middleware.ts` already loads the caller's profile+org — extend that one choke point. Procurement-only org on a CAFM route → redirect `/dashboard/procurement`; CAFM-only org on `/dashboard/procurement/*` → redirect `/dashboard`; both → `/dashboard/workspace-selector` picks (choice cached in `localStorage`, key `serviqfm_workspace`). No new context provider.
- **A3 — Named-approver chains, not roles.** ServiqFM's role model is fixed (`admin/manager/technician/client` + subtractive custom-role overlay in `lib/customRoles.ts`). Do NOT add Director/Finance/Procurement roles. Threshold bands map to ordered lists of actual user IDs with a free-text label ("Finance", "Director"). Sequential enforcement lives in SECURITY DEFINER RPCs (the house pattern — see `receive_purchase_order()` in `SQL Files/w4-01-purchasing.sql`), never in the UI.
- **A4 — V1 is the linear workflow only.** The four workflow models (Credit / Non-Credit / Contracts / SLA), quotation comparison, and payment sequencing from the Procurement Module PDF are **V2** (Phase Q below). V1 assumption: invoices post-delivery, single currency per tenant.
- **A5 — API routes reuse `resolveCaller`** from `web/src/app/api/purchase-orders/_helpers.ts` (auth + org + role gate + service client). New procurement write routes import it; do not copy it.

## 3. Prior-art inventory (read before every batch)

Roughly half of "V1" already exists from the CAFM gap-closing waves. Never rebuild these — extend them:

| Spec module | Already in repo | Gap to build |
|---|---|---|
| A. Vendors | `vendors` table + pages (`app/dashboard/vendors/`), ratings (`average_rating`), `vat_number`, categories, active flag | payment terms, bank details, contract expiry + alerts, on-time-delivery % (computed) |
| B. Requisitions | — nothing — | everything (Batch P1) |
| C. Purchase orders | `purchase_orders`/`purchase_order_items` (w4-01), create/list pages, `organisations.purchasing_enabled` toggle, `receive_purchase_order()` RPC | requisition link, `acknowledged`/`in_transit` statuses, send-PO-to-vendor email/PDF, delivery address |
| D. Goods receipt | atomic full receive (RPC) + stock ledger | partial receipts, per-line received qty, discrepancy flags, bin location |
| E. Invoices | `vendor_invoices` (sprint-h) + tenant invoicing, ZATCA lib | 3-way match engine + review UI |
| F. Budgets | `cost_centers` with `annual_budget`, WO cost rollup | budget periods, reserved-vs-actual, 75/90% alerts, 100% hard block at requisition/PO time |
| G. Reporting | `app/dashboard/reports/` + builder, Recharts, CSV/PDF libs (`lib/csv.ts`, `lib/pdf-report-styles.ts`) | procurement dashboard + spend/cycle-time views |
| H. ERP | webhooks (`lib/webhookDelivery.ts`), public API v1 (`app/api/v1/`) | mapping/config framework (no live connectors in V1) |
| Infra | Notifications (`lib/NotificationService.ts`, `notificationTypes.ts`), email (`lib/email.ts`), files (`EntityFilesTab`), audit patterns, RLS 4-policy template | procurement notification types; workspace split |

## 4. Program plan — batches

Each batch is one PR, ordered by dependency. Stop at every batch boundary and give the owner: PR link, SQL files to run in order, env vars, smoke-test checklist.

### Phase P — V1 MVP

#### Batch P0 — Workspace split (no new business logic)

*SQL:* `procurement-01-workspace.sql` — `ALTER TABLE organisations ADD COLUMN IF NOT EXISTS has_cafm BOOLEAN NOT NULL DEFAULT true, ADD COLUMN IF NOT EXISTS has_procurement BOOLEAN NOT NULL DEFAULT false;` (no RLS change — `organisations` policies already exist).

*Code:*
- `middleware.ts`: add the two columns to the existing profile/org lookup; implement A2 redirects. Fail open (missing columns pre-migration → CAFM behavior unchanged).
- `app/dashboard/workspace-selector/page.tsx`: two cards (CAFM / Procurement), bilingual; only renders when both flags true, else redirects to the single allowed workspace.
- `components/Sidebar.tsx`: add `PROCUREMENT_NAV` array (Procurement Home, Requisitions, Purchase Orders, Vendors, Inventory, Invoices, Cost Centers, Reports, Settings — reusing existing routes where they exist) and a workspace switcher row shown only when both flags true. Active nav = workspace derived from flags + `localStorage`.
- `app/dashboard/procurement/page.tsx`: home page — placeholder cards for "My requisitions / Awaiting my approval / Open POs" (wired for real in P1).
- Platform admin: expose the two flags wherever `tenant_feature_flags` are edited (`app/platform/`), so the owner can flip them per tenant.

*Accept:* org with `has_procurement=false` gets a 404-equivalent redirect off `/dashboard/procurement/*` (deep link included); procurement-only org can't reach `/dashboard/work-orders`; both-flags org sees the selector once and the switcher after; CAFM-only tenants (all existing tenants) see zero change.

#### Batch P1 — Requisitions + approval chains (Module B — the heart)

*SQL:* `procurement-02-requisitions.sql`:
- `procurement_approval_rules` (org, `min_amount NUMERIC`, `max_amount NUMERIC NULL` = ∞, `is_active`) and `procurement_approval_rule_steps` (org, rule_id, `step_order`, `approver_user_id → users`, `label TEXT`). Admin/manager-gated writes via RLS (cost-centers pattern).
- `requisitions` (org, `requisition_number BIGINT GENERATED ALWAYS AS IDENTITY`, title, justification, site_id, cost_center_id, needed_by, status `CHECK IN ('draft','pending_approval','approved','rejected','converted','cancelled')`, created_by, submitted_at, decided_at, purchase_order_id).
- `requisition_items` (org, requisition_id, item_id → inventory_items NULLABLE, description snapshot, quantity, unit_cost — same shape as `purchase_order_items`).
- `requisition_approvals` — the materialised chain (org, requisition_id, step_order, approver_user_id, label, status `pending|approved|rejected`, comment, acted_at).
- `purchase_orders ADD COLUMN requisition_id` with org-bound composite FK (cost-centers `(id, organisation_id)` pattern).
- RPC `submit_requisition(p_id)` — SECURITY DEFINER, org-verified from `auth.uid()`: sums lines, picks the active rule band containing the total, materialises chain rows, flips to `pending_approval`; **no matching band → auto-approve** (permissive default, house philosophy); idempotent (non-draft returns unchanged).
- RPC `decide_requisition(p_id, p_approve, p_comment)` — only the LOWEST-step pending approver may act; reject requires comment, short-circuits chain, status → `rejected`; last approve → `approved`. Rejected requisitions can be edited + resubmitted by the creator (revision loop from the Module PDF: reset chain on resubmit).
- `.test.sql`: cross-org denial on all 4 tables; band selection; out-of-order approval raises; reject short-circuits; double submit no-op; resubmit-after-reject rebuilds chain.

*Code:*
- API under `app/api/procurement/requisitions/`: `route.ts` (POST create — validates item/site/cost-center org membership like the PO route), `[id]/route.ts` (PATCH draft/rejected only), `[id]/submit/route.ts`, `[id]/decide/route.ts` (all roles may create; decide checks the RPC does the real gate), `[id]/convert/route.ts` (admin/manager; approved only; creates PO from requisition lines via the existing PO insert shape, sets `requisition_id`, flips requisition → `converted`).
- Pages: `app/dashboard/procurement/requisitions/page.tsx` (list + status filter tabs, mirroring `purchase-orders/page.tsx`), `new/page.tsx` (line-item form mirroring `purchase-orders/new`), `[id]/page.tsx` (detail: lines, approval timeline with per-step status/comments, submit / approve / reject / convert buttons per caller).
- Settings: `app/dashboard/settings/procurement/page.tsx` — threshold bands editor (add band → ordered approver picker from org users). Admin/manager only.
- Notifications: new types `req_pending_approval` (to the current step's approver on submit/step-advance), `req_decided` (to creator) via `NotificationService` + email — follow an existing type end-to-end (e.g. how `po_*` prefs are wired in Settings → Notifications).
- Wire the P0 home-page cards to real queries.

*Accept:* spec's threshold example works end-to-end (<500 = 1 step; 500–5k = 2; >5k = 3); approver #2 cannot act before #1 (proved in `.test.sql`, not just UI); rejected → edit → resubmit gets a fresh chain; convert produces a PO visible in the existing PO list with a back-link.

#### Batch P2 — PO lifecycle + vendor upgrades (Modules C + A)

*SQL:* `procurement-03-po-vendor.sql`:
- `purchase_orders`: widen status CHECK to `('draft','sent','acknowledged','in_transit','received','cancelled')` (drop+re-add constraint idempotently); add `delivery_address TEXT`, `sent_at`, `vendor_email_snapshot`.
- `vendors`: `ADD COLUMN IF NOT EXISTS payment_terms TEXT, bank_name TEXT, bank_iban TEXT, contract_start DATE, contract_end DATE` (bank fields are the ERP-sync placeholders).
- No new RLS (existing tables).

*Code:*
- Send-to-vendor: `app/api/purchase-orders/[id]/send/route.ts` — renders a simple PO PDF (reuse `lib/pdf-report-styles.ts` / the inspection-pdf approach), emails the vendor via `lib/email.ts`, flips `draft → sent`. Status advance route for `acknowledged`/`in_transit` (manual buttons — no vendor portal in V1).
- PO detail page `app/dashboard/purchase-orders/[id]/page.tsx` (currently list-only): lines, status stepper, send button, requisition link, receipt history (P3-ready).
- Vendor edit/detail: new fields + contract-expiry badge; on-time-delivery % computed from received POs (`received_at <= expected_at`) — display-only, no stored metric.
- Contract expiry alerts: extend the existing cron (`app/api/cron/`) with a 30-day-lookahead notification to admins.

*Accept:* PO email actually sends (owner check on live), status stepper enforces forward-only transitions server-side, vendor on-time % matches a hand-computed sample, contract expiring inside 30 days notifies.

#### Batch P3 — Goods receipt & inspection (Module D)

*SQL:* `procurement-04-goods-receipt.sql`:
- `goods_receipts` (org, purchase_order_id, `receipt_number IDENTITY`, received_by, received_at, notes, status `partial|full`).
- `goods_receipt_lines` (org, goods_receipt_id, purchase_order_item_id, qty_received, `condition CHECK IN ('ok','damaged','wrong_item','short')`, bin_location TEXT, note).
- Replace the all-or-nothing receive path: `CREATE OR REPLACE FUNCTION receive_purchase_order_lines(p_po_id, p_lines JSONB)` — per-line qty, bumps stock + ledger only for `ok` quantities on in-org items, marks the PO `received` only when cumulative ok-qty ≥ ordered qty on every line (else stays `in_transit`/`sent`); keeps the old `receive_purchase_order()` working (now sugar: receive-all).
- Discrepancy → notification to PO creator + admins.

*Code:* receive UI on the PO detail page (per-line qty/condition/bin inputs), receipts history section, discrepancy badge on the PO list. API `app/api/purchase-orders/[id]/receive` gains a JSON body (backward compatible: empty body = receive-all).

*Accept:* partial receipt leaves PO open and stock bumped by exactly the ok qty; second receipt completing the PO flips it to `received`; damaged/short lines never touch stock; ledger rows reference the receipt; `.test.sql` proves cross-org receive raises.

#### Batch P4 — Invoice & 3-way match (Module E)

*SQL:* `procurement-05-three-way.sql`: `vendor_invoices` gains `purchase_order_id` (org-bound composite FK), `match_status CHECK IN ('unmatched','matched','mismatch','approved_for_payment','disputed')`, `match_detail JSONB` (the computed diff snapshot).

*Code:*
- Pure matcher `web/src/lib/threeWayMatch.ts` + Vitest test: input = PO lines, cumulative GR ok-quantities, invoice lines/total; output = per-check pass/fail (PO↔Invoice price+qty, GR↔Invoice qty, totals) with tolerances (qty exact, amount ±1% configurable constant).
- API `app/api/vendor-invoices/[id]/match/route.ts` (runs matcher, stores result) and status route additions for `approved_for_payment`/`disputed` (admin/manager, `can_view_financials` capability denial honored).
- UI: vendor-invoice detail gets a match panel (three checks, green/red, diff table) + approve-to-pay / dispute buttons; mismatch notifies finance-ish audience (admins).

*Accept:* seeded mismatch (invoice qty > received) flags red with the exact delta shown; clean case auto-passes; matcher covered by unit tests (the only pure-logic module in the phase — test it hard).

#### Batch P5 — Budgets with reserve + hard block (Module F)

*SQL:* `procurement-06-budgets.sql`:
- `budget_periods` (org, cost_center_id, `period CHECK IN ('monthly','quarterly','annual')`, starts_on, ends_on, amount) — keeps `cost_centers.annual_budget` as legacy display.
- `budget_spend(p_cost_center, p_from, p_to)` SQL function: **reserved** = approved/converted requisition totals + open PO totals; **actual** = received PO totals (+ matched invoices where present).
- Extend `submit_requisition()`: when the requisition has a cost center with an active period and (reserved+actual+this) > 100% of amount → RAISE (hard block, spec-mandated); 75%/90% crossings → notification to admins. No period configured → no block (permissive default).

*Code:* budget editor inside the existing cost-centers pages (periods CRUD), spend bar (reserved vs actual vs budget) on cost-center detail, block/alert surfaced in the requisition submit UI with the numbers.

*Accept:* submit that lands at 101% is refused with a bilingual message naming the numbers; 76% submit succeeds + notifies; tenant with no periods behaves exactly as before.

#### Batch P6 — Procurement reporting (Module G)

*Code only* (aggregate in SQL views if needed — `procurement-07-report-views.sql` optional):
- `app/dashboard/procurement/reports/page.tsx` with Recharts: spend by vendor / category / cost center / month; cycle time (requisition created → approved → PO sent → received: avg days per stage); vendor performance table (on-time %, open POs); budget vs actual. CSV export via `lib/csv.ts`; reuse `pdf-report-styles` for PDF.
- Procurement home page gets the real KPI tiles.

*Accept:* every chart reconciles against a raw SQL spot-check on seeded data; CSV opens in Excel with correct headers; Arabic layout renders RTL.

#### Batch P7 — ERP integration framework (Module H — framework ONLY)

- `procurement-08-erp.sql`: `erp_connections` (org, `provider CHECK IN ('oracle','dynamics','odoo','none')`, config JSONB, is_active) + `erp_sync_log` (org, object_type, object_id, direction, status, payload, error).
- `web/src/lib/erp/` — one `ErpAdapter` interface (`pushVendor`, `pushPO`, `pushPayment`, `pullBudgets`, `syncInvoice`) + a `NoopAdapter` that writes `erp_sync_log` rows. Event hooks: vendor create, PO send, invoice approve call the adapter fire-and-forget. **No live connectors** — that is Phase Q; do not scaffold Oracle/Dynamics/Odoo classes (`ponytail:` YAGNI, one interface + noop is the whole framework).
- Settings page: provider picker + connection form (disabled/"coming soon" for real providers), sync log viewer.

*Accept:* PO send writes a sync-log row; framework adds zero latency/failures to the main flows (fire-and-forget, errors logged not thrown).

### Phase Q — V2 (owner decision gate — do NOT start unprompted)

Same batch discipline; design each against the Procurement Module PDF's four flows before coding:

- **Q1 — Account types & workflow models:** `vendors.account_type` (credit/non-credit/contract/sla); requisition/PO pipeline stages become model-driven (payment-before-goods for non-credit, advance/final for contracts, recurring for SLA). Payment records table + "sent to payment / confirmed" states.
- **Q2 — Quotation management:** quotation upload per PO (files infra), multi-vendor comparison sheet auto-required above a tenant threshold, budget check at quotation time (fail → cancel PO+PR + notify requester/approvers, per the PDF).
- **Q3 — Contracts & SLA as first-class modules:** scope/progress confirmation, recurring payment schedules (prepaid/accrual × weekly/monthly/quarterly), multi-level validation for SLA.
- **Q4 — Advanced vendor:** credit limit tracking, CR number, credit-risk display.
- **Q5 — Live ERP connectors:** implement `ErpAdapter` per provider, config + secrets via env/tenant config.

### Phase R+ — Future (not planned here): supplier RFQ portal, reorder points, mobile approver flows, ML forecasting.

## 5. Per-batch workflow

1. Re-read the relevant spec section + §3 prior art, then read the actual code touched. Trace the full flow before editing.
2. SQL first (idempotent, 4-policy RLS, org-bound composite FKs for cross-table links, `.test.sql`). The app must degrade gracefully pre-migration (cost-centers precedent: missing column ⇒ feature silently off).
3. Server routes with `resolveCaller`; RPCs own every state transition that money or approval depends on.
4. UI last, bilingual, matching existing pages pixel-for-pattern.
5. Vitest for pure logic (matcher, band selection helper if extracted, cycle-time math).
6. Build gate → commit `feat(procurement): P<n> <thing>` → PR with the §6 checklist from the main playbook (SQL run order, env vars, evidence, not-verified list).

## 6. Kickoff prompt — copy-paste into a new session

> Read `docs/procurement-execution-playbook.md` and follow it exactly. Architecture decisions in §2 are locked. Check `docs/procurement-execution-log.md` for what's done, then execute the next batch from §4, in a git worktree on a new branch off `main`, one PR per batch.
>
> Rules that override everything else: never push to `main`; run the build gate before every push; ship DB changes as idempotent SQL in `SQL Files/` with `.test.sql`, listed as manual pre-deploy steps in the PR body; reuse the existing tables/helpers named in §3 instead of creating parallel ones; verify every acceptance criterion literally and paste evidence; log completed items. If something can't be verified without the live DB, say so instead of claiming it works.
>
> When the PR is up green, stop and give me: the PR link, the exact SQL files to run in Supabase in order, any env vars for Vercel, and the production smoke-test checklist.
