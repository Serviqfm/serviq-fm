# Procurement Q1 — Credit / Non-Credit Workflows and Vendor Payments

**Status:** design approved in conversation 2026-09-15; awaiting owner review of this written spec.
**Phase:** Q (V2), project 1 of 5. Playbook: `docs/procurement-execution-playbook.md` §4 Phase Q.
**Source:** `CAFM App/Procurement Module.pdf` §1 (the four workflows) and the V2 section of `Procurement App Design Specification.pdf`.

## 1. Goal

V1 has no payment records. `vendor_invoices.status` can say `paid`, but there is no amount, date, reference or confirmation behind it, while every workflow in the source PDF has explicit "sent to payment / payment confirmed" steps.

This project adds:

1. **Vendor payments** — a real record of every payment, requested by one person and confirmed by another.
2. **The two one-off purchase flows** from the PDF, end to end:
   - **Credit** — goods first, invoice, then payment.
   - **Non-credit** — payment (prepayment) first, then goods, then invoice.

## 2. Scope

**In scope:** vendor account type, the payments table and its three database functions, the prepayment guard at goods receipt, non-credit settlement, notifications, the ERP `payment.confirmed` event, the Payments page and the screen changes in §7.

**Out of scope (later Phase Q projects):**

| Deferred | Where it goes |
|---|---|
| `requisitions.purchase_type` (one_off / contract / sla) | Q3 — the column would only ever hold `one_off` here. Adding it later with that default backfills every row. |
| Contract flow (advance payment, progress confirmation, final payment) | Q3 |
| SLA flow (recurring prepaid/accrual schedules, second approval chain) | Q3 |
| Quotations and the comparison sheet; budget check at quotation time | Q2 |
| Vendor credit limit and risk | Q4 |
| Live ERP connectors | Q5 |
| Cancelling a PO | Not designed. `cancelled` exists in the status vocabulary, but nothing sets it today. |
| Automatic refunds | Never automated in this project (see §6.4). |
| Payments in the budget maths | P5 still counts a received PO as actual spend, paid or not. |

## 3. Decisions (locked with the owner)

| # | Decision | Why |
|---|---|---|
| D1 | The workflow is decided by **purchase type + vendor terms**, not one field. This project only covers one-off purchases, where the vendor's account type picks credit or non-credit. | "Contract" and "SLA" describe a purchase, not a supplier. One vendor can fill a one-off order and run an SLA. |
| D2 | Deliver the **one-off flows first**; contract and SLA build on the same payments table in Q3. | Smaller, shippable, and it proves the payment model with real use. |
| D3 | Non-credit goods arriving before prepayment: **blocked, with an admin override** that requires a written reason. | Keeps the prepay rule real without trapping goods that are physically at the dock. |
| D4 | **Payments table + guards** approach. V1 statuses are kept; each ordering rule is enforced inside the database step it guards. | Smallest change, and it matches how V1 already enforces its rules. A generic stage engine was rejected (rewrites every V1 step, abstraction with two users); payment states in `purchase_orders.status` were rejected (credit and non-credit need the states in different orders in one column). |
| D5 | **Two-person rule:** whoever requests a payment cannot confirm it, unless they are the org's only active admin or manager. | Standard control for releasing money, without locking out one-person tenants. |

## 4. Data model

```
vendors
  + account_type        TEXT NOT NULL DEFAULT 'credit'  CHECK (credit | non_credit)

purchase_orders
  + account_type        TEXT NULL  CHECK (credit | non_credit)
                        copied from the vendor when the PO is sent

goods_receipts
  + override_reason     TEXT NULL   required when receiving a non-credit PO before its prepayment
  + override_by         UUID NULL → users

vendor_payments                                     (new)
  id, organisation_id
  purchase_order_id     NOT NULL, org-bound composite FK → purchase_orders
  vendor_invoice_id     NULL,     org-bound composite FK → vendor_invoices
  kind                  prepayment | invoice_payment
  amount                NUMERIC(14,2) NOT NULL CHECK (amount > 0)
  status                requested | confirmed | cancelled
  reference             TEXT NULL   finance's bank or ERP reference; required to confirm
  note                  TEXT NULL
  requested_by / requested_at
  confirmed_by / confirmed_at
  cancelled_by / cancelled_at
```

Rules the database enforces:

- **Kind ↔ invoice pairing:** `CHECK ((kind = 'prepayment' AND vendor_invoice_id IS NULL) OR (kind = 'invoice_payment' AND vendor_invoice_id IS NOT NULL))`.
- **No double payments:** a partial unique index allows one non-cancelled prepayment per PO, and another allows one non-cancelled payment per invoice. Partial deliveries with several invoices still work — each invoice gets its own payment.
- **`purchase_orders.account_type` is frozen at send.** If a vendor later changes terms, POs already in progress keep their rules. A draft that has not been sent uses the vendor's current setting. `NULL` means credit.
- **No `closed` status and no `closed_at` column.** Whether a PO is closed is derived from rows that already exist (§5).

### 4.1 Row-level security

`vendor_payments` gets **read for org members and no write policies at all.** Every change goes through the database functions in §6. This is money: a browser session must not be able to insert a "confirmed" payment. It is the same pattern as P7's `erp_sync_log`.

The new columns on `vendors`, `purchase_orders` and `goods_receipts` inherit those tables' existing policies.

## 5. The two flows

```
credit       sent → receive → invoice → match → approved_for_payment
                  → request payment → confirm payment → invoice 'paid' → closed

non-credit   sent → request prepayment → confirm prepayment → receive
                  → invoice → match → settle against prepayment → closed
```

**Closed** is computed by `lib/purchaseFlow.ts`, a pure tested function used by the stepper line, the Payments page and reports:

- **Credit** — every PO line fully received, and every invoice on the PO is `paid`.
- **Non-credit** — prepayment confirmed, every PO line fully received, and every invoice on the PO is `paid` (settled against the prepayment, see §6.3).

The same function returns the **next step** for display: *Awaiting prepayment → Awaiting delivery → Awaiting invoice → Awaiting payment → Closed*.

## 6. Database functions

All are `SECURITY DEFINER`, read `auth.uid()` themselves, verify the caller's organisation, require the caller to be `admin` or `manager`, and lock the rows they change (`FOR UPDATE`). Errors that the UI must explain use a machine-readable prefix, like P5's `BUDGET_EXCEEDED`.

### 6.1 Receipt guard — inside `receive_purchase_order_lines()`

The P3 function gains one new optional argument, `p_override_reason TEXT`.

- If the PO's effective account type is `non_credit` and it has no **confirmed** prepayment:
  - with no override reason → `RAISE 'PREPAYMENT_REQUIRED|<po_id>'`;
  - with a reason and the caller is **admin** → the receipt proceeds, and `override_reason` / `override_by` are stored on the goods receipt;
  - with a reason and the caller is **not** admin → `RAISE 'PREPAYMENT_REQUIRED|<po_id>'`.
- The legacy all-or-nothing `receive_purchase_order()` calls the same function, so the PO list's Receive button cannot skip the check.
- Credit POs are unaffected.

### 6.2 `request_vendor_payment(p_po_id, p_kind, p_invoice_id)`

The amount is **always computed here** and never taken from the caller.

| Case | Allowed when | Amount |
|---|---|---|
| `prepayment` | PO is non-credit, its status is `sent`, `acknowledged`, `in_transit` or `received` (received covers an admin override), and it has no open prepayment | PO total (sum of lines) |
| `invoice_payment`, credit PO | Invoice belongs to this PO and is `approved_for_payment` | Invoice amount |
| `invoice_payment`, non-credit PO | Invoice is `approved_for_payment` and a prepayment is **confirmed** | See §6.3 |

### 6.3 Non-credit settlement (inside `request_vendor_payment`)

A PO can be delivered and invoiced in parts (P3/P4), so each invoice is settled against the **unused prepayment balance**, not the whole prepayment:

```
balance = confirmed prepayment
        − Σ over this PO's already-paid invoices of (invoice amount − its confirmed invoice_payment, if any)
```

The balance is derived from existing rows; no extra column. Using the same ±1% tolerance as the 3-way match (applied to the invoice amount):

- **Invoice ≤ balance (+1%)** → no payment row. The invoice moves straight to `paid` and uses up that much of the balance.
- **Invoice > balance by more than 1%** → one `invoice_payment` row for the **difference** only; the rest comes out of the balance.

**Overpayment** can only be known at the end: once the PO is fully received and every invoice is `paid`, a remaining balance above 1% of the prepayment means the vendor was overpaid. The PO shows "Overpaid by X" and admins are notified. Refunds are never automated.

### 6.4 `confirm_vendor_payment(p_payment_id, p_reference)`

- The payment must be `requested`; the reference must be non-empty.
- **Two-person rule (D5):** if `requested_by = auth.uid()` and the org has **more than one** active admin/manager → `RAISE 'PAYMENT_SAME_PERSON|<payment_id>'`.
- Confirming an `invoice_payment` moves the invoice's payment status to `paid`, using a transition MKT-18 already allows (`approved → paid`).

### 6.5 `cancel_vendor_payment(p_payment_id, p_note)`

Only a `requested` payment can be cancelled. Confirmed payments are permanent.

## 7. API, notifications, ERP, permissions

### 7.1 Routes

All start with `resolveCaller(['admin','manager'], 'can_view_financials')` and then call the database function on the **user-session** client (the service client's `auth.uid()` is null), as in P1.

| Route | Body | Calls |
|---|---|---|
| `POST /api/vendor-payments` | `{ purchase_order_id, kind, vendor_invoice_id? }` — **no amount** | `request_vendor_payment()` |
| `POST /api/vendor-payments/[id]/confirm` | `{ reference }` | `confirm_vendor_payment()` |
| `POST /api/vendor-payments/[id]/cancel` | `{ note? }` | `cancel_vendor_payment()` |
| `POST /api/purchase-orders/[id]/receive` *(changed)* | adds optional `override_reason` | `receive_purchase_order_lines()` |

`PREPAYMENT_REQUIRED` and `PAYMENT_SAME_PERSON` are turned into structured responses (`{ code, … }`) by a small tested parser, so the screen can explain rather than show a raw database error.

### 7.2 Notifications

One new type, `vendor_payment`, in the existing `procurement` category.

| Event | Who is told |
|---|---|
| Payment requested | Org admins (the finance audience; there is no finance role, per A3) |
| Prepayment confirmed | PO creator — the vendor can ship |
| Invoice payment confirmed | PO creator — the PO is closed |
| Receipt with override | Org admins, with who overrode and why |
| Non-credit PO overpaid (balance left after the last invoice) | Org admins |

### 7.3 ERP

Confirming a payment fires `payment.confirmed` → `ErpAdapter.pushPayment`, the method P7 declared with no caller. Same posture as P7: `void`-ed, never throws, logs `skipped` in V1.

### 7.4 Permissions

- The `can_view_financials` **key stays**, because custom roles store it by name in JSON and renaming it would silently drop existing denials. Only its **label** changes: "Create invoices" → "Manage finances (invoices, matching, payments)".
- Override at goods receipt is **admin only**.

## 8. Screens

| Screen | Change |
|---|---|
| Vendor edit / detail | **Account type** field (Credit / Non-credit) and a tag on the detail page |
| PO detail | **Payments** panel: account type, each payment's status and reference, Confirm (reference required) and Cancel; for non-credit, the unused prepayment balance and, once closed, "Overpaid by X" when relevant. A line under the V1 stepper shows the next step from `purchaseFlow`. |
| Receive panel | On `PREPAYMENT_REQUIRED`, explains the block. Admins also get a reason box and **Receive anyway**. |
| Vendor-invoice detail | Once approved for payment: **Request payment** (credit) or **Settle against prepayment** (non-credit), showing how much comes from the balance and how much would be a new payment. |
| **Procurement → Payments** (new, admin/manager) | Finance's queue: Requested / Confirmed / Cancelled tabs, confirm in place. Added to `PROCUREMENT_NAV`. |

Confirm is shown disabled with an explanation when the two-person rule would refuse it; the database still enforces it.

## 9. Errors, edge cases, degradation

- **Existing tenants see no change.** Every vendor defaults to `credit` and existing POs have a `NULL` account type (= credit), so nothing blocks until someone marks a vendor non-credit.
- **Concurrency:** row locks plus the partial unique indexes make a second request for the same prepayment or invoice fail instead of creating a duplicate.
- **Vendor changes terms mid-flight:** the PO keeps the account type it was sent with (§4).
- **Before the migration runs:** payment panels and the Payments page hide themselves, and receiving works exactly as in V1.

## 10. Testing

**`procurement-09-payments.test.sql`** (read-only, `BEGIN … ROLLBACK`) proves:

1. Receiving a non-credit PO without a confirmed prepayment raises `PREPAYMENT_REQUIRED`.
2. An admin override stores the reason and `override_by`; a manager's override is refused.
3. Prepayment amount = PO total; invoice payment amount = invoice amount — regardless of anything passed in.
4. A credit invoice payment requires `approved_for_payment`.
5. A second open prepayment on the same PO is refused.
6. Two-person rule: self-confirm refused with two approvers, allowed with one.
7. Confirming an invoice payment marks the invoice `paid`.
8. Cancelling works only while `requested`.
9. A browser-session `INSERT` into `vendor_payments` is refused.
10. Non-credit settlement against the running balance: an invoice within the balance → no payment row and invoice paid; a second invoice exceeding what is left → a row for the difference only; a leftover balance after the last invoice is reported as overpaid.
11. The legacy `receive_purchase_order()` hits the same guard.

**Vitest:** `lib/purchaseFlow.ts` (next step and closed, both flows, partial deliveries, multiple invoices) and the payment error parser.

## 11. Delivery — two PRs, each safe on its own

| Batch | Contents | Safe because |
|---|---|---|
| **Q1-A** Database + API | `procurement-09-payments.sql` + `.test.sql`, the three functions, receipt guard, routes, notifications, ERP hook, capability label | Inert until a vendor is marked non-credit |
| **Q1-B** Screens | Vendor field, Payments panel, receive override, invoice buttons, Payments page, `purchaseFlow` + parser with Vitest | Only reads and calls what Q1-A shipped |

Each batch follows the playbook's standing rules: branch off `main`, build gate before push, idempotent SQL in `SQL Files/` listed as a manual pre-deploy step, bilingual UI, evidence in the PR body.
