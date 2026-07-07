# Serviq-FM — Feature Gap Analysis & Development Roadmap

**Date:** 2026-07-06 · **Scope:** web app (Next.js 14 + Supabase), mobile app (Expo), database & platform admin
**Inputs:** 6 client requirement documents (Work Orders, Core Features, Assets, Locations, Preventive Maintenance, Users & Teams — ~965 distilled requirement items), full codebase inventory (web, mobile, DB/RLS/security), market benchmark vs UpKeep / MaintainX / IBM Maximo / Facilio / Limble / Fiix, an FM-practitioner operational review, a new Asset Log module spec, and a senior-developer + platform-owner engineering review.

**Direction confirmed with the owner before writing:** target both segments phased (SMB parity first, enterprise items labeled *Phase 2/3*); to-dos as flat lists per section; the new Asset Log assigns items to **spaces only** (not people); billing/subscription automation **is** in scope for the Admin Panel list.

---

## Verdict in one paragraph

Serviq-FM today is a competent light CMMS with several genuine differentiators for the Saudi market — bilingual EN/AR with RTL, ZATCA Phase-2 TLV invoicing, an anonymous space-QR request portal, per-tenant form-field configuration, and a platform back office (MRR, health scoring, signed impersonation, offboarding-with-export) that most early SaaS products don't have. It is **not yet** at UpKeep/MaintainX parity: requirements coverage runs roughly 30–45% per module, mobile has no offline mode, there is no meters module, no SLA/escalation engine, no files module, no WO templates/calendar dispatch, and push notifications are **functionally dead end-to-end** due to a token schema split. Several security findings (a cross-tenant PII leak on `requests`, seven RLS-less tables, an unauthenticated push edge function, no password reset) must be fixed before any serious commercial push. The full report contains **247 developer-ready to-dos** (20 Critical, 86 High) across eight sections.

## Requirements coverage (client docs vs build)

| Module (doc) | Present | Partial | Missing | To-dos |
|---|---|---|---|---|
| Work Orders (~290 items) | ~95 (33%) | ~25 | ~160 | 36 (WO-) |
| Core Features (117 groups) | 41 | 43 | 33 | 36 (CORE-) |
| Users & Teams + PM (252 items) | 56 | 43 | 138 | 33 (1C-) |
| Assets + Locations (183 items) | 57 | 17 | 109 | 23 (AL-) |

## Fix-first: cross-cutting criticals (deduplicated)

These recur across multiple sections; each lists the canonical to-do IDs.

1. **Cross-tenant data exposure.** `requests` table has `SELECT USING (true)` — any anon-key holder can dump all tenants' requester PII. Seven more tables (`tenant_feature_flags`, `platform_audit_logs`, `mrr_snapshots`, `account_deletion_requests`, `notification_types/_log/_preferences`) have **no RLS at all**; `work-order-media` and `requests` storage buckets allow public listing and cross-tenant overwrite; `send-push` edge function has zero authorization; `get_dau_mau`/`get_users_with_login` SECURITY DEFINER RPCs leak cross-org data. → Section 5 (DV-) criticals.
2. **Push notifications never deliver.** Mobile writes tokens to `users.push_token`; `/api/push` reads the never-populated `user_devices` table. The entire dispatch loop (assign → technician phone buzzes) is dead. → CORE/1C/MKT/FM/DV all flag it; fix once.
3. **No password reset or change — anywhere.** "Forgot password?" is `href="#"`; a locked-out sole admin is unrecoverable. Temp passwords are `'Serviq'+Math.random()` (~41 bits) and are **echoed in API JSON responses** with no forced change. → 1C-/DV- criticals.
4. **Role scoping is cosmetic in places.** Requesters get full org visibility on web and mobile; technicians see all org WOs on web; no per-user site scoping; no role-aware RLS. → CORE-19 and related.
5. **Public `/request` wizard bypasses the approval queue** — inserts directly into `work_orders` with `source: 'requester'`, which likely violates the live CHECK constraint (i.e., the flow may be failing outright in production). → DV-/WO-.
6. **Work-order lifecycle governance unenforced.** Close route has no role check and no completed-state precondition and overwrites `completion_notes`; closed WOs remain fully editable; mobile allows any role to reopen without a comment. → WO-01, CORE- criticals.
7. **PM cron defects.** Ignores `lead_time_days` (hardcoded 2-day cutoff) and the seasonal inactive-period fields; PM detail matches generated WOs by *title heuristic* despite a real `pm_schedule_id` FK. → 1C-/FM-/DV-.
8. **Data-integrity bugs:** vendor assignment writes a vendor id into `assigned_to` (a users FK); ZATCA-unsafe collision-prone invoice numbering; `team_members` accepts client-attested org ids; asset parent-delete orphans children; `assets.space_id` not settable from any form; asset PM History tab never loads; asset QR tab calls external `api.qrserver.com`. → WO-/AL-/DV-.
9. **Fabricated dashboard numbers** ("+12%", "-5%", invented compliance insights) are hard-coded and shown to paying users — reputational risk out of proportion to fix cost. → CORE-.
10. **Engineering hygiene:** zero version-controlled migrations for the 19 base tables (DB can't be rebuilt from source), zero CI, one orphan test, no error tracking, no rate limiting, no CSP, no pagination on 9 of 13 list pages, zero realtime subscriptions. → DV-.

## Biggest functional build-outs (the parity backlog, by theme)

- **Mobile:** offline mode (WatermelonDB is installed and never imported), checklists/tasks execution, parts consumption, signatures, deep links from push, meter readings. (CORE-, MKT-, FM-)
- **Meters module** — wholly absent; blocks meter-based and hybrid PM triggers. (1C-, MKT-)
- **SLA policy engine + overdue escalation** — an escalation helper exists but is never called; no breach/MTTR reporting. Fatal for penalty-clause FM contracts. (FM-02/03/12, MKT-)
- **Work-order power features:** files module, templates, duplication, linking, calendar/dispatch scheduler, saved views, custom statuses/fields, CSV import/export, automation workflows, portal chat. (WO-)
- **Assets:** downtime & reliability tracking, depreciation, check-in/out, operation hours; **Locations:** deeper hierarchy, site detail tabs, floor plans. (AL-)
- **Users:** custom roles, location-based permissions, PM CSV import, completion-based (floating) PM. (1C-)
- **Stores & purchasing:** purchase orders, stock ledger, min/max reorder. (FM-, MKT-)
- **Compliance (GCC-critical):** statutory certificate register (civil defense, elevators, fire, legionella), document library, permits-to-work, Ramadan/seasonal scheduling. (FM-)
- **New Asset Log module** (furniture/IT/appliances/signage, QR-labelled, space-assigned, commission/decommission, cost/warranty/condition tracking) — full build-ready spec in Section 4; 5 new tables, ~7 routes, 6 web pages, 2 mobile screens; ~70–80% of plumbing (QR, spaces, scanner, CSV, vendors) is reusable. (AG-)
- **Phase 2/3 (enterprise, labeled inline):** public API + webhooks, SSO/SCIM, SOC 2 readiness, IoT/BMS condition monitoring, energy analytics, space/move management, AI copilot. (MKT-, DV-)
- **Admin Panel / business owner:** Stripe subscription automation, plan-limit enforcement (seats/WOs/storage), self-serve trial→upgrade funnel, dunning, usage metering, announcements, support tooling, PDPL data-residency posture, status page, product analytics. (AP-)

## Report map & to-do inventory

| Section | Content | To-dos | Critical / High |
|---|---|---|---|
| 1A | Work Orders doc vs build | 36 (WO-) | 1 / 11 |
| 1B | Core Features doc vs build (lifecycle, mobile, dashboard, inspections, roles) | 36 (CORE-) | 4 / 14 |
| 1C | Users & Teams + Preventive Maintenance docs vs build | 33 (1C-) | 4 / 11 |
| 1D | Assets + Locations docs vs build | 23 (AL-) | 0 / 4 |
| 2 | Market comparison vs UpKeep/MaintainX/Maximo/Facilio | 28 (MKT-) | 2 / 12 |
| 3 | FM practitioner review (GCC operations lens) | 31 (FM-) | 2 / 12 |
| 4 | Asset Log module — build-ready spec | 15 (AG-) | 0 / 8 |
| 5 | Senior dev review (DV-) + Admin Panel/business owner (AP-) | 45 | 7 / 14 |
| **Total** | | **247** | **20 / 86** |

**Conventions:** every to-do is a checkbox with a unique ID, a *What* a developer agent can act on standalone, a *Where* (likely files), and *Accept* (testable acceptance criteria). Severity: Critical = security/data-loss/broken feature · High = core parity gap · Medium = valuable enhancement · Low = polish. Enterprise-tier items carry a **Phase 2/3** label. Where the same underlying fix appears in multiple sections it is cross-referenced rather than duplicated.

**Suggested execution order for the developer agent:** (1) all Criticals in Section 5 + the cross-cutting list above; (2) Section 1A–1D Highs (doc parity); (3) Section 2/3 Highs (market + FM parity, including offline mobile, meters, SLA); (4) Section 4 Asset Log build; (5) Mediums; (6) Phase 2/3 items as a deliberate roadmap decision.

---

---

# Section 1A — Work Orders: Requirements vs. Build

Compared the ~290-item Work Orders requirements checklist (`req-workorders.md`, distilled from the client's UpKeep Work Orders doc) against the current Serviq-FM build (web Next.js app, Expo mobile app, Supabase schema — per `build-web.md`, `build-mobile.md`, `build-db-security.md`, with direct repo spot-checks where inventories were ambiguous). Headline: of ~290 items, roughly **95 Present (~33%)**, **~25 Partial**, **~160 Missing**, and ~10 N/A (UpKeep-migration-specific: Legacy/New toggle, sunset dates, plan-tier marketing). Core WO creation, status lifecycle, tasks/checklists, photos, numbering, invoicing, and form-field configuration are solid — several exceed the doc. The big gaps are: files/attachments, labor & cost tracking, WO templates, linking/duplication, calendar/scheduler, saved views, custom statuses/fields, bookmarks/archive, CSV import/export of WOs, automation workflows, and requester-facing chat/feedback.

## Comparison by requirement area

### 1–2. Work Order Creation (Legacy + New experience)

| Item | Status | Evidence |
|---|---|---|
| WO section in sidebar + create button | **Present** | `web/src/components/Sidebar.tsx`, `app/dashboard/work-orders/new/page.tsx` |
| Required fields marked with red asterisk | **Present** | `new/page.tsx` (`isReq(...)` + `text-error` asterisks, driven by field-config) |
| Title, Description, Priority, Category | **Present** | `new/page.tsx` |
| Images upload at creation | **Present** | `new/page.tsx` (up to 8 photos) |
| Due Date, Estimated Duration | **Present** | `new/page.tsx` (datetime-local; `estimated_duration_minutes`, sprint-k-03) |
| Main worker / Additional workers / Team | **Present** | `new/page.tsx` (assign-to, additional-workers multi-checkbox, team select; `work_orders.team_id`, `additional_workers uuid[]`) |
| Team assignment notifies all members | **Missing** | `lib/notifications/workOrderNotifications.ts:71` defines `notifyWOTeamAssigned` but nothing calls it (verified by grep) |
| Location (Site) field; asset auto-fills site | **Present** | `new/page.tsx:116-119` ("UpKeep parity: selecting an asset auto-fills its site/location") |
| Selecting location filters asset dropdown | **Partial** | Mobile filters assets by site (`mobile/src/screens/CreateWorkOrderScreen.tsx`); web renders all assets regardless of chosen site (`new/page.tsx:393`) |
| One location + one asset per WO (1:1) | **Present** | `work_orders.site_id`/`asset_id` single columns |
| Parts selection at creation | **Partial** | Parts only attachable after creation via detail "Parts Used" tab (`[id]/page.tsx`) |
| File/document attachments (PDF/MP4) | **Missing** | WOs support photos only; no document uploads |
| 40MB / type restriction on uploads | **Missing** | `api/upload/route.ts` does not validate content type or size (per build-db-security §2.9) |
| Start Date field | **Missing** | `work_orders` has `due_at`/`started_at` (actual) only — no planned start date |
| Vendor selectable as worker | **Present** | Edit form Assign To optgroups "Internal Technicians / External Vendors" (`[id]/edit/page.tsx`) |
| Submit disabled until required complete | **Present** | HTML `required` attrs from field-config |
| Tasks/checklists at creation | **Present** (exceeds "after creation only") | `new/page.tsx` task rows + checklist template apply |
| File auto-logged in global Files section | **Missing** | No global Files module |
| All paid roles can create; technicians edit only own | **Partial** | All roles except requester can create; **no technician edit-own-only restriction** — any technician can edit any WO (no role check in `api/work-orders/[id]/route.ts`) |

**Exceeds docs:** duplicate-open-WO warning when picking an asset (`new/page.tsx:101-107`), server-side field-config enforcement on create (`lib/fieldEnforcement.ts`), bilingual AR fields + machine-translate button.

### 3. Photos / Images

Present: add photos at create/edit (web + mobile), mobile camera + gallery with crop (`mobile/src/screens/WorkOrderDetailScreen.tsx` Photos tab, compress to 800px), photos shown on WO detail with zoom, close-out photo upload (`api/work-orders/[id]/close`). **Missing:** mobile photo annotation (draw/text), video/PDF attachments on WOs, photo delete/captions on mobile.

### 4. Categories

**Partial.** 12 fixed hardcoded categories shared by web and mobile (`work-orders/page.tsx`, `mobile/src/lib/categories.ts`) — used in create/edit/filter. **Missing:** any Settings UI to add/edit/delete categories (web or mobile); no default-list management, no per-org custom categories.

### 5. Tasks & Checklists

Present: one-time tasks (`work_order_tasks`, sprint-k-03), reusable checklist templates with bilingual items (`work-orders/checklists/page.tsx`, `checklist_templates`), add at creation and on existing WO, toggle done with done_by/done_at, delete (creator or admin/manager). **Missing:** editing an existing task's title; per-task file/note/image attachments; Pass/Flag/Fail inspection-style task values on WOs (exists only in the separate Inspections module, `app/dashboard/inspections/*`); checklists auto-attached to PM-generated WOs (cron `api/cron/pm-generate` creates bare WOs); mobile has **no tasks/checklists at all** (build-mobile §7).

### 6. Files (global section + attaching)

**Missing entirely.** No global Files module, no Files tab on WO/asset/location/part detail, no "add from saved files", no tags, no 40MB/type enforcement. Assets and WOs carry `photo_urls` arrays only; public requests accept 1 generic file.

### 7. Time, Labor & Cost Tracking

| Item | Status | Evidence |
|---|---|---|
| Total cost = labor + parts + additional (auto) | **Missing** | Only single manual `actual_cost` field on WO edit |
| Labor cost = time × hourly rate | **Partial** | Invoice generation computes started→completed hours × assignee `hourly_rate` (`invoices/new/InvoiceForm.tsx:60-70`) — invoice-time only, not on the WO |
| Parts cost from inventory price × qty | **Present** | Parts Used tab decrements `inventory_items.stock_quantity`, logs cost (`work-orders/[id]/page.tsx`) |
| Additional Cost section | **Missing** | Invoice form has free-form surcharges, but the WO itself has no additional-costs entries |
| Hourly rate per user (settings UI) | **Missing** | `users.hourly_rate` column read by invoicing but no field on users new/edit forms (verified by grep) |
| Vendor hourly rates | **Missing** | Vendor form has no rate field |
| Labor-cost-in-total admin toggle | **Missing** | — |
| Manual labor entry (user/duration/category) | **Partial** | Mobile timer logs time into `actual_hours` + `time_log` comments (`WorkOrderDetailScreen.tsx` Time tab); **no manual entry, no edit/delete, no categories, no web equivalent** |
| Timer categories settings (Wrench/Drive time) | **Missing** | — |
| Labor / Costs / Parts tabs on detail | **Partial** | Parts Used tab exists; no Labor or Costs tabs |
| Exports include labor/parts/costs; Time & Cost report | **Missing** | No WO CSV export; reports are 4 fixed PDFs (`api/reports/standard/[type]`) |

### 8. Signature Capture

**Partial.** Web close requires a typed full-name digital sign-off written to `completion_notes` (`work-orders/[id]/page.tsx` + `api/work-orders/[id]/close/route.ts:90`). **Missing:** mobile signature pad (mobile has no signatures at all), per-WO signature optional/required toggle, org-level Hidden/Optional/Required config, admin-bypass vs technician-must-comply rules. **Bug found while verifying:** close with sign-off *overwrites* any existing `completion_notes` with `"Signed off by: X"` (`close/route.ts:90`) — notes entered via the edit form are silently destroyed.

### 9. Duplicate Work Orders

**Missing.** No duplicate action anywhere on WO detail or list (verified by grep — only the duplicate-*warning* on create exists, which is a different feature and exceeds docs).

### 10. Invoices

**Present, exceeds docs.** Generate Invoice from completed WO (gated by `invoicing` flag + per-site `invoicing_enabled`), prefilled service charges/labor/parts, PDF with **ZATCA Phase-2 TLV QR** (`lib/zatca.ts`, `api/invoices/generate`), download. **Partial:** invoice is not filed into a WO Files tab (no Files tab exists); no explicit preview-then-print step (direct PDF download covers the intent).

### 11. Work Order Linking

**Missing entirely.** No Links tab, no relationship types (Blocked by / Blocks / Splits from / Relates to / Duplicates / Duplicated by). Build has only system links: `request_id`, `pm_schedule_id` source references.

### 12. Work Order Templates

**Missing.** Checklist templates exist (§5) but there are no full WO templates (title/description/assignees/asset/tasks/parts), no Templates tab, no create-from-template, no convert-WO-to-template, nothing on mobile.

### 13. Scheduler / Smart Schedule

**Missing.** No scheduler or dispatch board exists (build-web §18: "no drag-drop scheduling or technician dispatch view"). Calendar exists only for PM schedules (`pm-schedules/calendar/page.tsx`).

### 14. External Request Portal Chat

**Missing.** The public tracking page (`app/(public)/track/[token]/page.tsx`) is a read-only status stepper; there is no two-way admin↔requester chat, no attachments in replies. (Internal WO comments with counterparty email notify exist, but requesters are anonymous and excluded.)

### 15. Migration & Platform Notes

Mostly N/A (Legacy/New toggle, sunset dates). Relevant items: PM module auto-generates WOs on schedule — **Present, exceeds** (hourly Vercel cron, duplicate-skip, end-date handling, `api/cron/pm-generate`). Custom fields on WOs — **Missing** (assets have free JSONB custom fields, WOs have none — verified). AI work summary — **Missing**. Close-out notes as list column/export — **Missing**. Hide-archived / bookmarked / unassigned filters — **Missing** (no WO archive or bookmark concepts; "new" status only approximates unassigned).

### 16. WO Detail View

Present tabs: Tasks, Comments, Photos, History (audit timeline), Parts Used, Activity Log, plus Space Assets commissioning (exceeds docs). Info grid, SLA banner, priority/status badges, PDF export per WO (`api/reports/work-order/[id]`). **Missing:** Labor tab, Costs tab, Files tab, @mentions in comments/activity (notification pref `wo_mention` exists in `lib/notificationTypes.ts` but no emitting code path — build-web §14).

### 17. Status Lifecycle & Processing

**Present, exceeds.** Six statuses (new/assigned/in_progress/on_hold/completed/closed) vs the doc's four; guarded transitions (`nextStatuses` map in `[id]/page.tsx`); status-change notifications to assignee/creator/requester via email + Expo push (`api/notifications/wo-status`, `lib/push.ts`). Completion blocking: **Partial** — field-config can require close-out photos server-side (`close/route.ts` + `lib/fieldEnforcement.ts`), but incomplete tasks/required time never block completion. Auto-timer tied to status changes: **Missing** (mobile timer is fully manual).

### 18. Close-Out Notes

**Partial.** `completion_notes` exists, editable on the edit form, shown on detail. **Missing:** dedicated close-out editing at completion (and the overwrite bug in §8), AI "Auto Generate Summary", close-out notes as list column and in exports.

### 19. Work Order Feedback / Review

**Missing entirely.** No feedback toggle, no star-rating email to requester on completion, no admin feedback report.

### 20. Work Order Numbering

**Present.** `wo_number` is a DB-generated sequence rendered `WO-0001`, unique, not editable (`types/work-order.ts`, list page). **Missing:** admin-settable start count in Settings.

### 21. Form Configuration (Enterprise)

**Present, exceeds availability.** Per-org, per-page field visibility (required/optional/hidden) with server-side enforcement — for every tenant, not just an enterprise tier (`lib/field-catalog.ts` ~70 fields/11 pages, `field_configs` table with admin-only RLS, `FormFieldsTab.tsx`). **Partial:** no checklist-level "required before close" config; no TIME-field config (no labor fields exist); WO pages covered are new/edit/close.

### 22. Custom Statuses

**Missing.** Status set is fixed (though richer than the default four). No Statuses settings tab, no custom status names mapped to base types, none in filters/reports.

### 23. Custom Fields on WOs

**Missing.** No custom-field builder, no typed fields (text/dropdown/date/number/currency), nothing on the WO form/list/reports. (Assets' free key-value JSONB `custom_fields` is a precedent to reuse.)

### 24. Bookmarks

**Missing.** No bookmark button, filter, or storage anywhere (verified by grep).

### 25. Calendar View (WOs)

**Missing for WOs.** Month calendar exists only for PM schedules (`pm-schedules/calendar/page.tsx`) — no WO calendar, no drag-to-reschedule, no weekly/daily intraday views, no mobile calendar.

### 26. List View Columns

**Partial.** Fixed 10-column table (WO#, Title+overdue chip, Asset, Site, Category, Priority, Status, Assigned, Due, Created — `work-orders/page.tsx`). **Missing:** column chooser, column widths, and many documented columns (Start Date, Days Since Created, Time, Labor Cost, Created By, Completed By, Requested By, Last Updated, Archived, Close-out Notes, Custom Fields, Parts, Files, Team — team shows on detail only).

### 27. Filtering, Search & Saved Views

Present: status chips, priority chips, category dropdown, technician dropdown, date from/to, free-text search (title/asset/site/WO#), clear-filters (`work-orders/page.tsx`). **Missing:** saved views (persist + name + dropdown), shareable filter URLs (filters are component state, not query params), archived filter/unarchive (no archive concept on WOs), explicit unassigned filter, bookmarked filter, default view excluding completed (default chip is "all"), due-date-window quick filters.

### 28. Automated Workflows

**Missing as a user-configurable feature.** No Settings > Automation, no IF/AND/THEN builder. Hardcoded automations partially cover documented examples: failed inspection items auto-create high-priority WOs (`inspections/new/page.tsx` — matches the "task Flag → create WO" recipe), PM cron auto-creates WOs, request approval creates WOs with picked priority/due date (`api/requests/[id]/approve`).

### 29. CSV Import of Work Orders

**Missing entirely** (all 38 sub-items). Assets, sites/spaces, inventory, and vendors have CSV import; work orders have none — no template download, no create-or-update by ID.

### 30. Export & Print

**Partial.** Per-WO PDF export (`api/reports/work-order/[id]`), WO-register PDF report, dashboard PDF. **Missing:** WO list CSV export (verified — no export on `work-orders/page.tsx`; other entity lists have it), filter-respecting export, column-choice export, batch export of multi-selected WOs (multi-select exists but only for bulk-assign), PDF of current table view, direct print flow.

### 31. Cross-Cutting Permissions

Present: admins/managers edit all; field-config writes admin-only (RLS + route); status notifications to applicable users. **Missing/Partial:** technician can-only-edit-own-created rule not enforced anywhere (web edit API has no role check beyond org; mobile allows any role to change status); admin-only toggles for the not-yet-built settings (timers, start count, signature bypass) are moot until those exist; team-assignment notification not wired (§1).

### Where the build exceeds the doc (summary)

- Duplicate-open-WO warning at creation; server-enforced form-field config for all tenants (UpKeep = Enterprise-only); 6-state lifecycle with guarded transitions; ZATCA-compliant invoice PDF + VAT QR; bilingual EN/AR fields, RTL, machine translation; per-WO SLA hours with overdue banners; Space Assets commissioning tab; QR-driven public request portal with tracking tokens; PM auto-generation cron with compliance dashboards; media-retention lifecycle messaging; audit-log History tab with impersonation attribution.

### To-Dos

- [ ] **WO-01 — Fix close-route overwrite of completion notes** (Severity: Critical)
  - What: `POST /api/work-orders/[id]/close` sets `completion_notes = "Signed off by: X"`, destroying any notes previously entered on the edit form. Store the sign-off in its own column (e.g. `signed_off_by`) or append instead of overwrite.
  - Where: `web/src/app/api/work-orders/[id]/close/route.ts:90`, WO detail/edit pages, DB migration for new column.
  - Accept: closing a WO that already has completion notes preserves them; sign-off name still recorded and displayed.

- [ ] **WO-02 — Enforce technician edit-own-only permission** (Severity: High)
  - What: Requirements say technicians may only edit/delete WOs they created. Add a role check in the WO PATCH route (and mobile status-change paths) so technicians can update status on assigned WOs but cannot edit fields of WOs they didn't create; admins/managers unrestricted.
  - Where: `web/src/app/api/work-orders/[id]/route.ts`, `web/src/app/dashboard/work-orders/[id]/edit/page.tsx` (hide Edit), `mobile/src/screens/WorkOrderDetailScreen.tsx`; ideally RLS policy too.
  - Accept: a technician PATCHing another user's WO gets 403; edit button hidden for non-creators with technician role; admin edit unaffected.

- [ ] **WO-03 — Validate upload type and size server-side** (Severity: High)
  - What: `/api/upload` accepts any content type/size (public `requests` bucket compounds this). Enforce allowlist (jpeg/png/pdf/mp4) and a max size (e.g. 40MB) server-side.
  - Where: `web/src/app/api/upload/route.ts`, `web/src/app/api/requests/submit/route.ts`.
  - Accept: uploading an .exe or >40MB file returns 400; allowed types succeed on WO, asset, and request flows.

- [ ] **WO-04 — Category management settings (CRUD)** (Severity: High)
  - What: Replace the hardcoded 12-category lists with an org-scoped `wo_categories` table seeded with the current defaults; add a Settings > Categories tab (add/rename/delete). Keep category as free string on WOs for backward compatibility.
  - Where: db migration + RLS; `web/src/app/dashboard/settings/` new tab; consumers `work-orders/page.tsx`, `new`, `[id]/edit`, assets pages, `mobile/src/lib/categories.ts` (fetch from DB).
  - Accept: admin adds a category and it appears in WO create/filter on web and mobile; deleting a category doesn't break existing WOs.

- [ ] **WO-05 — Global Files module + Files tab on WO/asset/site** (Severity: High)
  - What: Org-scoped `files` table (name, url, size, type, tags, uploaded_by) + polymorphic attachments; global Files page; Files tab on WO detail (upload new / attach existing / detach without deleting the file record); accept PDF/png/jpeg/MP4. Store generated invoices there too.
  - Where: db migration; `web/src/app/dashboard/files/` (new); WO detail `[id]/page.tsx` new tab; asset/site detail; reuse `/api/upload`.
  - Accept: a PDF attached to a WO appears both on the WO Files tab and in the global Files page; removing it from the WO keeps the global record.

- [ ] **WO-06 — Labor time logging with rates (web)** (Severity: High)
  - What: `work_order_time_logs` table (user, minutes, category, hourly_rate snapshot, note); Labor tab on WO detail with manual Add Time and per-user totals/cost; add Hourly Rate field to user create/edit forms (column already exists and is read by invoicing); mobile timer writes a row here instead of/in addition to comments.
  - Where: db migration; `web/src/app/dashboard/work-orders/[id]/page.tsx` (Labor tab); `web/src/app/dashboard/users/new|[id]/edit`; `mobile/src/screens/WorkOrderDetailScreen.tsx` Time tab; `invoices/new/InvoiceForm.tsx` to sum logs.
  - Accept: manual time entry with user+duration produces labor cost = duration × rate; invoice labor prefills from summed logs; mobile timer entries appear on web Labor tab.

- [ ] **WO-07 — Additional costs + auto total cost on WO** (Severity: High)
  - What: `work_order_costs` table (description, amount, created_by); Costs tab on detail; computed WO total = labor (WO-06) + parts (existing Parts Used) + additional costs, displayed on detail and available to invoicing.
  - Where: db migration; `web/src/app/dashboard/work-orders/[id]/page.tsx`; `invoices/new/InvoiceForm.tsx`.
  - Accept: adding a 100 SAR additional cost updates the WO total; invoice surcharges prefill from cost entries.

- [ ] **WO-08 — Work order templates** (Severity: High)
  - What: `wo_templates` table storing title/description/priority/category/asset/assignees/tasks; Templates tab in Work Orders; "Create from template" on the new-WO form (prefill then edit); "Convert to Template" action on WO detail. Mobile: apply-only.
  - Where: db migration; `web/src/app/dashboard/work-orders/templates/` (new); `new/page.tsx`; `[id]/page.tsx` action menu; `mobile/src/screens/CreateWorkOrderScreen.tsx` (Phase 2 for mobile apply).
  - Accept: converting a WO to a template then creating from it reproduces title/tasks/asset; templates editable/deletable.

- [ ] **WO-09 — Duplicate work order action** (Severity: Medium)
  - What: "Duplicate" in a 3-dot menu on WO detail (and list row) that opens the create form prefilled with title, description, priority, category, site, asset, tasks — user edits then saves as a new WO.
  - Where: `web/src/app/dashboard/work-orders/[id]/page.tsx`; reuse `new/page.tsx` with a `?duplicate_of=` param; copy `work_order_tasks`.
  - Accept: duplicating a WO yields an editable prefilled form; saving creates a new WO number with copied tasks.

- [ ] **WO-10 — WO list CSV export (filtered, column choice) + batch export** (Severity: High)
  - What: Export menu on the WO list: CSV of the currently filtered rows with all/custom column selection; support exporting only checked rows (multi-select already exists). Include costs/close-out fields as they land.
  - Where: `web/src/app/dashboard/work-orders/page.tsx` (client-side CSV like assets export, or an API route for large orgs).
  - Accept: filtering to status=completed then exporting yields only completed rows; column picker changes CSV headers; selecting 3 rows exports 3.

- [ ] **WO-11 — WO CSV import (create/update)** (Severity: Medium)
  - What: Import page mirroring the assets importer: downloadable template (title, description, wo_number blank=auto, due date, start/status/priority/category, assignee email, team, asset name, site name, estimated hours, additional cost), per-row validation, existing-ID update path.
  - Where: `web/src/app/dashboard/work-orders/import/page.tsx` (new, pattern from `assets/import/page.tsx`); server route for inserts.
  - Accept: importing 5 rows creates 5 WOs with resolved asset/site/assignee; a bad category row errors without aborting others; row with existing WO id updates it.

- [ ] **WO-12 — Archive/unarchive WOs + archived filter** (Severity: Medium)
  - What: `archived_at` column; Archive action on closed/completed WOs; list hides archived by default with an "Archived" filter toggle; Unarchive button on archived detail.
  - Where: db migration; `web/src/app/dashboard/work-orders/page.tsx`, `[id]/page.tsx`.
  - Accept: archived WO disappears from default list, appears under Archived filter, unarchive restores it.

- [ ] **WO-13 — Saved views + shareable filter URLs** (Severity: Medium)
  - What: Sync WO list filters to URL query params; "Save View" persists named filter sets per user (`saved_views` table: user, page, name, filters jsonb); Saved Views dropdown; pasting a URL reproduces filters for any org member.
  - Where: `web/src/app/dashboard/work-orders/page.tsx`; db migration + RLS.
  - Accept: saving a view and reselecting it restores all filters; copying the URL to another session shows the same filtered list.

- [ ] **WO-14 — List column chooser + missing columns** (Severity: Medium)
  - What: "Columns" button with checkbox list (persist choice per user, e.g. in saved_views or localStorage); add columns: Start Date, Created By, Completed By, Requested By, Last Updated, Estimated Duration, Team, Close-out Notes, Days Since Created.
  - Where: `web/src/app/dashboard/work-orders/page.tsx`.
  - Accept: unchecking a column hides it and persists across reloads; new columns render correct data.

- [ ] **WO-15 — Bookmarks (star WOs + Bookmarked filter)** (Severity: Low)
  - What: Per-user bookmark toggle on WO detail and list rows (`wo_bookmarks` table user_id+work_order_id); "Bookmarked" filter chip.
  - Where: db migration + RLS; `web/src/app/dashboard/work-orders/page.tsx`, `[id]/page.tsx`; mobile later.
  - Accept: bookmarking a WO surfaces it under the Bookmarked filter for that user only.

- [ ] **WO-16 — Unassigned filter + default view excluding completed** (Severity: Low)
  - What: Add an "Unassigned" quick filter (assigned_to is null / status=new) and make the default status selection exclude completed/closed per the requirement.
  - Where: `web/src/app/dashboard/work-orders/page.tsx`.
  - Accept: landing on the list shows only open statuses; Unassigned chip shows only WOs without an assignee.

- [ ] **WO-17 — WO calendar view with drag-to-reschedule** (Severity: High)
  - What: Calendar view toggle on the Work Orders page (month grid; WOs plotted by `due_at`; WOs without due date excluded); drag a WO to a new date updates `due_at`. Weekly/daily intraday views can be Phase 2.
  - Where: `web/src/app/dashboard/work-orders/page.tsx` (view switcher) or `work-orders/calendar/page.tsx`; reuse month-grid pattern from `pm-schedules/calendar/page.tsx`.
  - Accept: WO with due date appears on its day; dragging to another day persists the new due date and logs audit.

- [ ] **WO-18 — Scheduler / technician dispatch board** (Severity: Medium; Phase 2)
  - What: Technician-rows × time-columns scheduler with unscheduled-WO tray, filters (priority/status/site/team), drag to assign+schedule; per-user saved views (reuse WO-13).
  - Where: new `web/src/app/dashboard/scheduler/` + sidebar entry.
  - Accept: dragging an unassigned WO onto a technician/day sets assignee + due date; filters narrow visible rows.

- [ ] **WO-19 — Mobile signature pad + signature required config** (Severity: High)
  - What: Org/WO-level "require signature on completion" (field-config page `work_orders_close` fits); mobile completion flow shows a draw-signature pad, uploads PNG to storage, stores URL on the WO; web close prompts file upload when required (admins may bypass).
  - Where: db column `signature_url` + field-catalog entry; `mobile/src/screens/WorkOrderDetailScreen.tsx` (complete flow); `web/src/app/api/work-orders/[id]/close/route.ts`; WO detail render.
  - Accept: with signature required, mobile completion blocks until signed; signature image visible on web WO detail; admin can bypass on web, technician cannot.

- [ ] **WO-20 — Tasks: notes/images, edit, pass/flag/fail, required-to-close** (Severity: Medium)
  - What: Extend `work_order_tasks` with note/image_url/value (pass|flag|fail) and `is_required`; task 3-dot menu (edit title, add note, add image); close route blocks completion while required tasks are open (extend existing field-config close enforcement).
  - Where: db migration; `web/src/app/dashboard/work-orders/[id]/page.tsx` Tasks tab; `api/work-orders/[id]/close/route.ts`.
  - Accept: a required unchecked task blocks Complete with a clear error; task note/image persist and display; pass/flag/fail selectable on inspection-style tasks.

- [ ] **WO-21 — Mobile tasks/checklists on WO detail** (Severity: High)
  - What: Tasks tab on mobile WO detail: list `work_order_tasks`, toggle done (done_by/done_at), add ad-hoc task. Field techs currently cannot see or complete checklists at all.
  - Where: `mobile/src/screens/WorkOrderDetailScreen.tsx`.
  - Accept: tasks created on web appear on mobile; checking one on mobile updates progress on web.

- [ ] **WO-22 — Requester portal chat on tracking page** (Severity: Medium)
  - What: Two-way message thread on the public tracking page (`request_messages` table keyed by request, sender = staff user or anonymous requester via tracking token) with image attachment; admin side chats from the request detail; email notify both directions.
  - Where: db migration; `web/src/app/(public)/track/[token]/page.tsx` (+ a token-authenticated API route); `web/src/app/dashboard/requests/[id]/page.tsx`.
  - Accept: requester posts a message via tracking link, admin sees and replies from request detail, requester sees the reply; no cross-request access via token guessing.

- [ ] **WO-23 — Work order feedback (star rating on completion)** (Severity: Medium; Phase 2)
  - What: Org settings toggle; on WO completion email the requester/creator a rating link (tokenized public page, 1–5 stars + comment); notify admins on submission; simple feedback list page.
  - Where: db migration (`wo_feedback`); `api/work-orders/[id]/close` hook; `lib/email.ts` template; public `app/(public)/feedback/[token]/page.tsx`.
  - Accept: completing a WO with feedback enabled sends the email; submitted rating visible to admins; toggle off = no email.

- [ ] **WO-24 — WO-to-WO linking** (Severity: Medium; Phase 2)
  - What: `work_order_links` table (wo_id, linked_wo_id, relationship enum: blocked_by/blocks/splits_from/relates_to/duplicates/duplicated_by); Links section on WO detail to pick relationship + WOs; informational only (no auto-actions), matching the doc.
  - Where: db migration + RLS; `web/src/app/dashboard/work-orders/[id]/page.tsx`.
  - Accept: linking A "blocks" B shows the inverse ("blocked by A") on B; links render as clickable WO numbers.

- [ ] **WO-25 — Custom WO statuses** (Severity: Medium; Phase 3, enterprise-tier)
  - What: `wo_custom_statuses` table (name, base_type of the 6 core statuses); Settings > Work Orders > Statuses tab; custom statuses appear in the status picker and list filters, mapping to base-type behavior for lifecycle/notifications.
  - Where: db migration; settings tab; `work-orders/[id]/page.tsx` status button; list filters.
  - Accept: "On Hold – Waiting for Parts" selectable and filterable; reporting groups it under On Hold.

- [ ] **WO-26 — Custom fields on work orders** (Severity: Medium; Phase 3, enterprise-tier)
  - What: Typed custom-field definitions (text/multiline/dropdown/date/number/currency) per org (Settings tab) + values on WOs; render section on create/edit/detail; expose as list column and CSV export column. Reuse the assets `custom_fields` JSONB pattern for values, definitions in a new table.
  - Where: db migration; `web/src/app/dashboard/settings/`; WO `new`, `[id]/edit`, `[id]/page.tsx`, list page.
  - Accept: admin defines a dropdown field; it appears on WO create with its options; value shows on detail and in export.

- [ ] **WO-27 — Automation workflow builder (IF/AND/THEN)** (Severity: Medium; Phase 3, enterprise-tier)
  - What: Settings > Automation: workflows = trigger (WO created/closed, request created/approved/denied, task updated) + AND conditions (priority, category, location, asset, task value) + THEN action (assign user/team/category/priority/due date, send reminder email, create WO). Evaluate server-side in the WO/request/task write paths.
  - Where: db migration (`workflows` jsonb rules); hooks in `api/work-orders/route.ts`, `[id]/route.ts`, `close`, `api/requests/[id]/approve`; settings UI.
  - Accept: a workflow "IF WO created AND category=HVAC THEN assign Team X" auto-assigns on creation; disabled workflow does nothing.

- [ ] **WO-28 — Wire team-assignment notifications** (Severity: Medium)
  - What: `notifyWOTeamAssigned` (`web/src/lib/notifications/workOrderNotifications.ts:71`) is defined but never called. Invoke it from WO create/edit when `team_id` is set/changed, notifying all `team_members`.
  - Where: `web/src/app/api/work-orders/route.ts`, `[id]/route.ts` (or the client follow-up update path that saves team).
  - Accept: assigning a team to a WO sends email/push to every active team member per their preferences.

- [ ] **WO-29 — Filter web asset dropdown by selected site** (Severity: Low)
  - What: On the web WO create/edit forms, once a site is chosen, limit the Asset options to that site's assets (mobile already does this); keep asset→site autofill.
  - Where: `web/src/app/dashboard/work-orders/new/page.tsx:393`, `[id]/edit/page.tsx`.
  - Accept: choosing Site A hides assets belonging to Site B; picking an asset first still autofills its site.

- [ ] **WO-30 — Close-out notes as first-class field + list/export column** (Severity: Medium)
  - What: After WO-01 separates sign-off, surface close-out notes: editable on the Overview at completion, optional column on the list (WO-14), included in CSV export (WO-10).
  - Where: `web/src/app/dashboard/work-orders/[id]/page.tsx`, list page, export.
  - Accept: notes entered at close display on detail, in the list column, and in exports.

- [ ] **WO-31 — WO start-date field** (Severity: Low)
  - What: Add planned `start_at` to work_orders + create/edit forms + list column + calendar use; distinct from actual `started_at`.
  - Where: db migration; `new/page.tsx`, `[id]/edit/page.tsx`, list page, field catalog.
  - Accept: WO saved with a future start date displays it; field configurable via Form Fields settings.

- [ ] **WO-32 — WO numbering start count setting** (Severity: Low)
  - What: Admin setting to set the next `wo_number` (sequence restart at N, non-retroactive, must exceed current max).
  - Where: settings Organisation tab; small API route running `ALTER SEQUENCE`/`setval` via service role.
  - Accept: setting start count 5000 makes the next WO WO-5000; existing numbers unchanged; non-admin gets 403.

- [ ] **WO-33 — Auto-timer on status change** (Severity: Low; Phase 2)
  - What: Org setting: when enabled, mobile timer auto-starts on In Progress and auto-stops/logs on Complete (builds on WO-06 time logs).
  - Where: settings toggle; `mobile/src/screens/WorkOrderDetailScreen.tsx` status handlers.
  - Accept: with the toggle on, tapping Start Work begins the timer; Complete stops it and logs the duration.

- [ ] **WO-34 — @mentions in comments/activity** (Severity: Medium; Phase 2)
  - What: @mention autocomplete of active org users in WO comments; mentioned users notified (pref key `wo_mention` already exists in `lib/notificationTypes.ts` with no emitter).
  - Where: `web/src/app/dashboard/work-orders/[id]/page.tsx` Comments tab; `lib/NotificationService.ts` call site.
  - Accept: typing @name suggests active users only; the mentioned user receives email/push per preferences.

- [ ] **WO-35 — Mobile photo annotation** (Severity: Low; Phase 2)
  - What: Draw/text annotation over a captured photo before attaching (e.g. react-native-skia or a lightweight canvas overlay), then upload the flattened image via the existing pipeline.
  - Where: `mobile/src/screens/WorkOrderDetailScreen.tsx`, `CreateWorkOrderScreen.tsx`.
  - Accept: annotated markup is baked into the uploaded JPEG and visible on web.

- [ ] **WO-36 — AI close-out summary** (Severity: Low; Phase 3)
  - What: "Auto Generate Summary" on close: LLM summarizes WO description, tasks, activity log, time and parts into a close-out note the user can edit before saving.
  - Where: new API route (server-side LLM call); `[id]/page.tsx` close modal.
  - Accept: button produces an editable summary referencing actual WO activity; nothing saved without user confirmation.

---

# Section 1B — Core Features vs Current Build

Compared the ~200 checklist items in `req-core.md` (from `docs/Core Features.md`) against the web/mobile/DB build inventories, with direct code spot-checks on the WO close route, WO detail/edit pages, mobile WO detail screen, sidebar role gating, dashboard stats, and the inspection template builder. Across 117 assessed requirement groups (some bundling several checklist items; detailed WO field/view/export items delegated to the Work Orders analyst): **41 Present, 43 Partial, 33 Missing**. Strongest areas: asset registry, PM auto-generation, web WO flow. Weakest: **lifecycle governance is unenforced** (anyone can close, closed WOs are editable, no web reopen, mobile reopen is a free-for-all), **the mobile app is online-only with functionally broken push**, **several dashboard numbers are fabricated decorations**, and **the 4-role permission matrix is UI-cosmetic** — requesters can browse the entire org on web and mobile.

Overlaps with other analysts are flagged inline; to-dos below are kept when the fix belongs at the lifecycle/mobile/dashboard/inspection/role level.

---

## 1. WO Status Lifecycle (sign-off / reopen / immutability)

| Requirement | Status | Evidence |
|---|---|---|
| Exact 6-status workflow New→Assigned→In Progress→On Hold→Completed→Closed | **Present** (web) | `web/src/app/dashboard/work-orders/[id]/page.tsx:474-480` `nextStatuses` map; DB CHECK on `work_orders.status` |
| Technician sets In Progress / On Hold | **Present** | web detail transitions; `mobile/src/screens/WorkOrderDetailScreen.tsx` Start Work / Put On Hold |
| Completed requires final close-out photo | **Partial** | Web: `closeout_photos` enforceable via field config in `/api/work-orders/[id]/close` (any pre-existing photo satisfies it). Mobile: Complete sets `completed_at` with no photo requirement |
| Digital sign-off screen at completion | **Partial** | Web only, and at *close* not completion: typed-name modal → `completion_notes = "Signed off by: X"` (`[id]/page.tsx:674`). No signature capture; nothing on mobile |
| Manager notified to review & close | **Partial** | Web fires push/email to assignee/creator on status change (`[id]/page.tsx:244-252`) — not a review notice to managers. Mobile transitions fire **no notifications at all**; push delivery itself is broken (§2) |
| Manager sign-off required before Closed | **Missing** | `/api/work-orders/[id]/close/route.ts` has **no role check** (verified full file) — any org member incl. technician/requester can POST `status:'closed'`; nor does it require current status `completed` (new→closed possible) |
| Manager can reopen if unsatisfactory | **Missing** (inverted) | Web: `closed: []` terminal — no reopen path (`wo.reopen` i18n key exists unused, `LanguageContext.tsx:144`). Mobile: **any role** can Reopen completed/closed → in_progress (`WorkOrderDetailScreen.tsx:273-274`) |
| Reopen requires manager comment | **Missing** | Mobile reopen writes only an auto `status_change` comment; no reason prompt |
| Once Closed, WO cannot be edited | **Missing** | Edit button rendered unconditionally (`[id]/page.tsx:496`); `PATCH /api/work-orders/[id]` has no closed-status guard; no DB trigger/RLS immutability |
| Only manager can reopen Closed | **Missing** | see above |
| Closed WO permanent in asset history | **Present** | asset detail Work Orders tab + lifecycle cost summed from closed WOs |
| Photo proof before/during/after | **Partial** | photos attachable at any stage (web+mobile); no before/during/after categorization (overlaps WO analyst) |
| History log of every status change (user + timestamp) | **Partial** | Web transitions → `audit_logs` + History tab. **Mobile transitions write only `work_order_comments` rows, never `audit_logs`** — web History tab misses them |
| SLA breach alert to manager | **Missing** | `notifyWOOverdue` helper exists but no cron invokes it (build-web §15; overlaps WO analyst) |

Comments/photos-at-any-stage/both-role commenting/audit-trail-visible: all **Present** (web tabs; mobile Comments/Photos/Activity). Push on creation/reassignment: **Partial — functionally broken** (see §2 push finding). Due-date-approaching push and notifications in the technician's preferred language: **Missing**.

## 2. Technician Mobile App

| Requirement | Status | Evidence |
|---|---|---|
| Today view: due-date-sorted list of my WOs | **Partial** | `mobile/src/screens/HomeScreen.tsx` is a stats dashboard: 4 counters + last-5 open WOs **newest-first, not due-sorted** |
| Priority colour coding (red/orange/yellow/green) | **Present** | priority dots/badges (`mobile/src/lib/theme.ts`) |
| PM tasks due today in separate section | **Partial** | "Upcoming PM Tasks" widget (next 5) is display-only — no PM detail/completion from mobile (cron-generated PM WOs do land in the normal WO list, so the *work* is completable) |
| Red overdue banner with count | **Partial** | Overdue stat card exists; no banner treatment |
| WO detail: asset/location, description, priority badge, SLA countdown, photos, comments | **Present** | `WorkOrderDetailScreen.tsx` — countdown pill/banner, 5 tabs |
| Update status / add comments / take photos from detail | **Present** | camera+gallery, auto-compressed to 800px JPEG before upload |
| Photos compressed before upload | **Present** | `expo-image-manipulator` pipeline |
| QR scan to confirm at correct asset | **Missing** | scanner only opens asset pages; no scan-from-WO confirm flow |
| GPS check-in on-site | **Missing** | no geolocation anywhere (build-mobile §7) |
| Bottom nav exactly 5 tabs (Today, All WOs, Assets, Notifications, Profile) | **Partial** | **4 tabs — no Notifications tab**; Home bell is decorative with no onPress |
| Assets tab searchable + QR scanner | **Present** | `AssetsScreen.tsx`, `QRScannerScreen.tsx` (org-verified resolution) — mobile search misses serial/location (web has them) |
| Profile language toggle AR/EN | **Present** | persisted; RTL is text-alignment only, no layout mirroring |
| Offline mode (all 5 items: full offline, cached WOs, queued updates/photos, auto-sync, offline banner) | **Missing** | zero offline support — `@nozbe/watermelondb` in package.json but never imported; no NetInfo, no queue (build-mobile §7) |
| Notifications in chosen language | **Missing** | language lives only in device AsyncStorage; templates single-language |
| Notification tap deep-links to WO/PM | **Missing** | no `linking` config, no scheme, no response listener. Worse: **push delivery is broken end-to-end** — mobile registers tokens on `users.push_token` (`mobile/src/lib/notifications.ts:42-45`) while `/api/push` reads the never-populated `user_devices` table (`web/src/app/api/push/route.ts:68`) → every send 404s "No active devices" (build-db §3.7; overlaps DB analyst P1) |

## 3. Manager Dashboard (web)

Verified the flagged hard-coded decorations directly: `web/src/components/pages/DashboardOverviewPage.tsx:163` (`+12%`), `:177` (`-5%`), `:191` (`8 scheduled`) are literal strings; the "Platform Insight" banner (`:284-290`) fabricates "compliance is up by 8% this month… operational health index at an all-time high" regardless of data; `web/src/app/dashboard/work-orders/page.tsx:177` hard-codes "12% from last week". These render as real analytics to paying customers.

| Requirement | Status | Evidence |
|---|---|---|
| Manager lands on Operations Overview | **Present** | `app/dashboard/page.tsx` → `DashboardOverviewPage.tsx` |
| 4 counters: Open, Overdue (red), PM Due Today, Active Technicians Online | **Partial** | first 3 present (client-side aggregation over full-table fetches); 4th slot is PM Compliance % — **Active Technicians Online missing** |
| Status breakdown New / Assigned / In Progress / On Hold | **Partial** | bar strips merge Assigned+In Progress into one band |
| Recent Activity: last 20 status changes | **Partial** | last **4** from `audit_logs`; "View All Notifications" links to the WO list; mobile-made changes never reach `audit_logs` |
| Upcoming PM: next 7 days | **Missing** on dashboard | exists as "Due Soon ≤7d" stat on the PM list page + calendar, not on landing |
| Site map view w/ colour-coded pins | **Missing** | no maps anywhere (build-web §18) |
| KPIs: MTTR, MTBF, PM Compliance %, Total Maintenance Cost | **Partial** | only PM Compliance % exists; MTTR/MTBF/cost dashboards explicitly absent (build-web §13) |
| KPIs update in real time | **Missing** | zero realtime subscriptions in web or mobile (build-web §0) |
| Quick actions: create WO / add asset / run report | **Missing** | dashboard has nav links only (verified) |
| Notification bell w/ unread alerts (requester submissions, SLA-approaching, PM overdue, low stock) | **Missing** | no web in-app notification center — email/push only (build-web §15); low-stock helper `lib/notifications/partsNotifications.ts` exists but is never called |

## 4. Inspection Checklists

| Requirement | Status | Evidence |
|---|---|---|
| Completable on web by technician/manager | **Present** | `dashboard/inspections/new/page.tsx` 2-step run flow |
| Completable on mobile | **Missing** | no inspection screens in mobile (build-mobile §7) |
| Submission auto-produces timestamped, signed PDF | **Partial** | on-demand PDF endpoint `/api/reports/inspection/[id]` exists; not auto-generated/emailed; no signature |
| Item types: Yes/No, Pass/Fail, Numeric (1–5 or custom), Free Text, Photo Required, Date | **Partial** | pass_fail / yes_no / score (fixed 1–5) / text / photo — **no Date type, no custom numeric range, no numeric-with-threshold** (verified `templates/new/page.tsx`: refrigeration temp and pool pH/chlorine readings are plain `text` items); **photo item type is a stub at run time** ("upload available after submission") |
| Failed items auto-generate linked WO | **Present** | each failed pass_fail creates a high-priority "Inspection Fail:" WO |
| Recurring scheduled inspections | **Missing** | manual runs only; the only cron is `pm-generate` |
| Manual trigger | **Present** | run flow |
| 4 vertical templates (schools/retail/compounds/hotels) | **Present** | 4 built-ins, 8 items each, EN+AR; coverage broadly matches the spec item lists |
| Auto-send completed PDF to facilities director | **Missing** | no distribution hooks |
| Retail brand-compliance variant w/ per-item photo evidence | **Partial** | photo item exists in template but photo capture at run time isn't implemented |
| Multi-branch compliance score comparison | **Missing** | no cross-site inspection reporting |
| Compound unit handover (move-in/out) checklist as legal record | **Missing** | no handover flow; generic template can't lock/countersign |
| Hotel rotating room schedule + room-by-room compliance map | **Missing** | inspections not schedulable; no room map |
| Hotel guest complaint→WO with room pre-filled | **Present (different mechanism — exceeds)** | space-QR request portal: scan room QR → `/r/{token}` form → triage → WO pre-linked to site/space, plus anonymous tracking page (build-web §8) |

## 5. User Roles & Permissions

Web role gating is **navigation-only** for most pages (`web/src/components/Sidebar.tsx:12-25` — only Requests/Sites/Vendors/Users/Teams/Invoices/Reports carry `roles`; Dashboard, Work Orders, Assets, PM Schedules, Inspections, Inventory, Settings render for **every** role). RLS is org-scoped, never role-scoped (build-db §2.3), and mobile talks straight to PostgREST.

| Requirement | Status | Evidence |
|---|---|---|
| Admin: full access, manage users/roles, reports/exports, custom fields, verticals | **Present** | users CRUD w/ last-admin rails (`api/users/[id]/route.ts`), asset `custom_fields` JSONB, org vertical setting, field-config engine (exceeds spec) |
| Admin: configure plans/billing, SLA rules, storage policy | **Partial** | plan card view-only (mailto upgrade), billing lives with platform admins; SLA is per-WO hours only, no org SLA rules; storage add-ons informational |
| Manager: sees WOs/assets/PMs/inspections/reports; creates/edits/assigns/closes; manages vendors | **Present** | all flows exist |
| Manager: approve WO completions | **Partial** | completed→closed exists but is not role-restricted (§1) |
| Manager: cannot access billing | **Present** | tenant billing managed in platform portal only |
| Manager: cannot access unassigned sites | **Missing** | no per-user site scoping exists anywhere (build-web §10) — managers see whole org |
| Technician: sees only own WOs/PMs (web + mobile) | **Partial** | mobile filters client-side (`WorkOrdersScreen.tsx:89`); **web shows technicians every org WO** (verified: `work-orders/page.tsx` has no role filter); neither is RLS-enforced |
| Technician: asset detail only for linked assets | **Missing (deviation)** | full org registry visible to all roles — arguably better UX than spec; record as accepted deviation or fix |
| Technician: update status / comments / photos / complete PMs / QR / offline | **Partial** | all but offline; PM completion via generated WOs |
| Technician: cannot create WOs/assets/PMs | **Missing (deviation)** | web create pages unrestricted; mobile hides create only from requesters — needs product decision or org toggle |
| Technician: cannot see other technicians' tasks | **Partial** | same as own-WOs row |
| Requester: sees own requests only, no org visibility | **Missing — Critical** | web: requester login reaches the full dashboard (WOs, assets, inventory, inspections, PM, settings all render). Mobile: requesters see **all org WOs** (only `technician` is filtered) and all assets, and can change WO statuses (no role gating on transitions) |
| Requester: submit via web portal (title/desc/location/photo) | **Partial** | public QR flow excellent (anonymous); logged-in `/request` wizard **bypasses the approval queue** — inserts straight into `work_orders` with `source='requester'` (build-web §8) |
| Requester: submit via mobile | **Missing** | no request flow on mobile; requesters can't create anything (build-mobile §5) |
| Requester: status notifications; WO only after manager review | **Present** (public flow) | approve/reject/status emails + tracking stepper; review gate holds for the QR flow only |

## 6. Asset Management (compact — deep dive belongs to the Assets/Locations analyst; overlaps noted)

| Requirement | Status | Evidence |
|---|---|---|
| Registry fields (13 + custom fields) | **Present** | `assets/new` form + Custom Fields JSONB tab |
| Custom fields addable by admin | **Present** | free key/value on detail |
| Status values Active/Under Maintenance/Decommissioned/Retired | **Partial** | `active/under_maintenance/retired` (+ online/offline in space panel); "Decommissioned" is an action (retire + final WO), not a distinct state |
| 12 fixed categories | **Present** | exact list matches web+mobile |
| QR auto-generated at creation; printable | **Present — exceeds** | `SERVIQ-<ts>-<rand>` + bulk QR PDF export 2/4/6-per-A4 |
| NFC tag assignment / scan | **Missing** | QR only (`barcodeTypes: ['qr']`) |
| QR scan opens asset detail on mobile | **Present** | `QRScannerScreen.tsx` |
| Photo gallery: primary + up to 10 | **Partial** | up to 10 photos, no primary designation; asset photos have no `media_expires_at` retention handling |
| Full WO history / PM list / warranty status / lifecycle cost per asset | **Present** | detail tabs; lifecycle cost from closed WOs' `actual_cost` |
| Warranty alert 30 days before expiry | **Partial** | UI badges only — no notification ever sent |
| Search by name/serial/location (web+mobile) | **Partial** | web yes; mobile searches name/category only |
| Filter/sort by category, site, status, last-serviced | **Partial** | category/status/search on web; no site filter chip, no last-serviced sort |
| Bulk import CSV / export | **Present** | CSV template import w/ per-row errors; CSV export + print (spec's Excel/PDF ≈ satisfied) |
| Multi-site tagging (plan-gated) | **Present** | sites + `multi_site` flag blocks 2nd site on small plans |
| Asset map / floor plan (Phase 2) | **Missing** | none |
| Decommission → final WO + PM suspension + archived state | **Present** | decommission action retires asset, suspends PMs, auto-creates "Decommission:" WO; retired filterable (default list still shows them — minor) |

## 7. Preventive Maintenance (compact — deep dive belongs to the PM analyst; overlaps noted)

| Requirement | Status | Evidence |
|---|---|---|
| Schedule fields; free-form or template description; manager/admin create | **Present** | `pm-schedules/new` + 6 quick templates; creation not role-gated (see roles) |
| Frequencies Daily…Annual + custom cron | **Partial** | 7 named frequencies + weekly days-of-week picker (exceeds); **no custom/cron frequency** |
| Start date + auto future due dates | **Present** | `next_due_at` rolling (cron generates 2 days ahead; `lead_time_days` column exists but is never read — build-db §3.9) |
| WO auto-generation, pre-fill, auto-assign, cycle repeat | **Present** | hourly `api/cron/pm-generate` (Bearer-gated, fail-closed) |
| Technician notified for PM WOs like reactive | **Partial** | cron does not send assignment notifications; and push is broken anyway |
| Photos/checklists on PM WOs, closable like reactive | **Present** | PM WOs are normal WOs |
| PM calendar view | **Present** | month grid + list |
| Overdue PMs highlighted red on calendar | **Partial** | overdue flags on list/stats; calendar chips not overdue-styled |
| PM compliance dashboard % | **Present** | compliance page (`on_time_count/completed_count`) |
| Compliance filterable by asset category/site/technician | **Partial** | site + technician only |
| PM history log per asset | **Partial — broken** | asset-detail "PM History" tab renders but **data is never loaded — always empty** (build-web §3) |
| Vertical template packs (4 verticals × 4 templates) | **Partial** | 6 generic quick-templates cover ~half the spec'd list |
| Overdue PM escalation (24h) | **Missing** | no escalation cron |
| Seasonal PM (date-range activation) | **Partial** | `is_seasonal` + months displayed on detail but **no UI to set them** and cron ignores them |
| Parts/inventory pre-specification on PM | **Missing** | no link |
| PM pause/suspend | **Present** | pause/resume + archive |

## 8. Numeric Limits & Constants

| Constant | Status |
|---|---|
| Max 8 WO photos / 10(+1) asset photos | **Present** (web forms) |
| 6-month media retention | **Partial** — `media_expires_at` + purge warnings + storage-tab marketing exist; **no purge job anywhere** (build-web §17) |
| Warranty alert 30d before expiry | **Partial** (badge, no notification) |
| PM overdue escalation 24h | **Missing** |
| Recent Activity = 20 | **Partial** (shows 4) |
| Upcoming PM = 7 days | **Partial** (PM page stat, not dashboard) |
| 4 dashboard counters | **Partial** (different 4th counter) |
| 5 mobile tabs | **Partial** (4) |
| Score 1–5 w/ custom range | **Partial** (fixed 1–5) |

## Where the build EXCEEDS the spec

- **Platform multi-tenant back office**: tenant health scoring, MRR/ARR, HMAC session-bound impersonation, offboarding exports — not in the Core Features doc at all.
- **ZATCA Phase-2 VAT invoicing** with TLV QR (`web/src/lib/zatca.ts`) + vendor invoice log.
- **Per-org form-field configuration engine** (`lib/field-catalog.ts`, server-enforced) — a generalization of the custom-fields requirement.
- **Space-level QR request portal** with anonymous tracking tokens and triage queue — richer than the spec's requester portal.
- **WO task checklists + bilingual checklist templates, teams, 4-level asset hierarchy, weekly days-of-week PM, bulk QR PDF sheets, mobile time-tracking timer, OTA updates (EAS)** — all beyond spec.

---

### To-Dos

- [ ] **CORE-01 — Enforce manager/admin-only close and completed→closed sequencing** (Severity: Critical)
  - What: `POST /api/work-orders/[id]/close` accepts `status:'closed'` from any org member and from any prior status. Add a role check (admin/manager for `closed`) and require the WO's current status to be `completed` before allowing `closed`.
  - Where: `web/src/app/api/work-orders/[id]/close/route.ts` (caller profile already loaded — add `role` to the select); hide the Close control for technicians in `web/src/app/dashboard/work-orders/[id]/page.tsx`.
  - Accept: technician POSTing `closed` gets 403; a `new` WO cannot jump to `closed`; manager close with sign-off still works.

- [ ] **CORE-02 — Make Closed work orders immutable** (Severity: Critical)
  - What: Closed WOs are editable via `PATCH /api/work-orders/[id]` (no status guard), the Edit button renders unconditionally, and mobile lets any role Reopen a closed WO. Reject PATCH when status is `closed` (except the explicit reopen action), hide Edit on closed WOs, remove mobile reopen of closed for non-managers. Since mobile writes via PostgREST, add a DB-level guard (trigger or RLS UPDATE policy) too.
  - Where: `web/src/app/api/work-orders/[id]/route.ts`, `web/src/app/dashboard/work-orders/[id]/page.tsx:496`, `mobile/src/screens/WorkOrderDetailScreen.tsx:273-274`, new SQL migration.
  - Accept: PATCH on a closed WO returns 4xx; Edit button absent on closed WOs; direct PostgREST update of a closed WO by a technician is rejected.

- [ ] **CORE-03 — Manager reopen flow with mandatory reason comment** (Severity: High)
  - What: Add a web reopen action on closed/completed WOs, manager/admin only, requiring a reason; writes the comment + audit log, clears `completed_at`/`closed_at`, sets `in_progress`. Gate mobile reopen the same way (today: any role, no reason, and it's the only client that can reopen at all).
  - Where: `web/src/app/dashboard/work-orders/[id]/page.tsx` (reuse the sign-off modal pattern), close route or a sibling route; `mobile/src/screens/WorkOrderDetailScreen.tsx`.
  - Accept: reopen without a comment is blocked; reason appears in History; technicians see no reopen control on either client.

- [ ] **CORE-04 — Notify managers on Completed and route mobile transitions through the server** (Severity: High)
  - What: On transition to `completed`, notify org managers/admins to review & close. Mobile status changes currently bypass all notification and `audit_logs` writes — point mobile's transition handler at the server close route (and a new transition route for the other statuses) so notifications + audit fire regardless of client.
  - Where: `web/src/app/api/work-orders/[id]/close/route.ts` + `lib/NotificationService.ts`; `mobile/src/screens/WorkOrderDetailScreen.tsx`.
  - Accept: completing a WO on mobile produces a manager notification and an `audit_logs` row; web History shows mobile-made transitions.

- [ ] **CORE-05 — Mobile completion flow: close-out photo + sign-off screen** (Severity: High)
  - What: On mobile Complete, present a completion screen honoring the org's `closeout_photos` field config (require photo when configured) and capture a sign-off name, matching the web close-route contract.
  - Where: `mobile/src/screens/WorkOrderDetailScreen.tsx` Complete handler → call `POST /api/work-orders/[id]/close`.
  - Accept: with closeout_photos=required, mobile Complete without a photo is rejected with a clear message.

- [ ] **CORE-06 — Fix end-to-end push delivery + notification tap deep-links** (Severity: Critical) *(overlaps DB analyst P1 — kept: it guts the entire mobile notification requirement set)*
  - What: Mobile stores Expo tokens on `users.push_token`; `/api/push` reads the never-written `user_devices` table, so every push 404s. Read `users.push_token/push_platform` in `/api/push` (simplest), delete or authenticate the orphaned `supabase/functions/send-push`. Then add an `expo-notifications` response listener + `linking` config/scheme so tapping a push opens the WO.
  - Where: `web/src/app/api/push/route.ts:68`, `mobile/src/lib/notifications.ts`, `mobile/src/navigation/index.tsx`, `mobile/app.json` (scheme), `supabase/functions/send-push`.
  - Accept: WO assignment produces a push on a real device; tapping it lands on that WO's detail; `send-push` is removed or gated.

- [ ] **CORE-07 — Mobile offline mode: cache + queued mutations + offline banner** (Severity: High)
  - What: Spec requires full offline operation; nothing exists. Minimum viable: local cache of assigned WOs/assets (WatermelonDB already a dependency, or an AsyncStorage snapshot), queue for status updates/comments/photos, auto-sync on reconnect (NetInfo), offline banner. Last-write-wins with server timestamps is acceptable v1.
  - Where: new sync layer in `mobile/src/`; touch `WorkOrdersScreen`, `WorkOrderDetailScreen`, photo pipeline.
  - Accept: airplane mode → assigned WOs still listed/openable; an offline status change appears on web after reconnect; banner shows while disconnected.

- [ ] **CORE-08 — Rework mobile Home into the spec'd Today view** (Severity: Medium)
  - What: Sort the technician's WO list by due date (not created_at), add the red overdue-count banner, make PM rows tappable (to the generated PM WO or a read-only schedule sheet), and add serial-number/site to mobile asset search while in there.
  - Where: `mobile/src/screens/HomeScreen.tsx`, `WorkOrdersScreen.tsx`, `AssetsScreen.tsx`.
  - Accept: nearest-due WO first; overdue banner when ≥1 past due; PM rows navigate; asset search matches serial.

- [ ] **CORE-09 — Add mobile Notifications tab (5-tab nav) with in-app notification list** (Severity: Medium)
  - What: Notifications tab backed by `notification_log` (or a new user-facing notifications table) with unread state; wire the inert Home bell to it. Brings nav to the spec'd 5 tabs.
  - Where: `mobile/src/navigation/index.tsx`, new `NotificationsScreen`, `HomeScreen.tsx`.
  - Accept: 5 tabs render; WO-assigned event creates a row; tapping opens the WO.

- [ ] **CORE-10 — QR scan-to-confirm asset from WO detail (+ optional GPS check-in)** (Severity: Medium)
  - What: "Scan to confirm asset" from WO detail opens the existing scanner in verify mode, checks the scan matches `wo.asset_id`, logs an arrival activity. GPS check-in can piggyback on the same log (Phase 2 if cut).
  - Where: `mobile/src/screens/WorkOrderDetailScreen.tsx`, `QRScannerScreen.tsx` (verify-mode param).
  - Accept: correct scan logs "arrived at asset"; wrong asset warns.

- [ ] **CORE-11 — Server-side user language preference + localized notifications** (Severity: Medium)
  - What: Add `users.preferred_language` (en/ar) set from both apps' language toggles; `NotificationService`/email templates pick per-recipient language.
  - Where: DB migration; `mobile/src/context/LangContext.tsx`; web Settings Account tab; `web/src/lib/NotificationService.ts`, `lib/email.ts`.
  - Accept: Arabic-preference user receives Arabic push/email for WO assignment.

- [ ] **CORE-12 — Remove fabricated dashboard statistics** (Severity: High)
  - What: Hard-coded "+12%"/"-5%"/"8 scheduled" (`DashboardOverviewPage.tsx:163,177,191`), "12% from last week" (`work-orders/page.tsx:177`), and the Platform Insight banner's invented compliance claims (`DashboardOverviewPage.tsx:284-290`) show fake analytics. Compute real month-over-month deltas or delete the ornaments and the banner (deleting is acceptable and faster).
  - Where: `web/src/components/pages/DashboardOverviewPage.tsx`, `web/src/app/dashboard/work-orders/page.tsx`.
  - Accept: no literal percentage strings remain; every dashboard number traces to a query.

- [ ] **CORE-13 — Add missing KPIs: MTTR, MTBF, Total Maintenance Cost, Active Technicians** (Severity: High)
  - What: MTTR = avg(completed_at−created_at) for the month; MTBF = avg gap between WOs per asset; cost = sum(actual_cost) this month; Active Technicians via `last_sign_in_at` (existing `get_users_with_login` RPC — which also needs the auth hardening the DB analyst flagged). Prefer SQL aggregates over the current fetch-all-rows pattern.
  - Where: `web/src/components/pages/DashboardOverviewPage.tsx`; optional small RPC migration.
  - Accept: KPI row shows MTTR/MTBF/compliance/cost for current month and changes when a WO closes; 4th counter shows active technicians.

- [ ] **CORE-14 — Dashboard completeness: 20-row activity feed, Upcoming-PM (7d) panel, split Assigned vs In Progress, quick actions** (Severity: Medium)
  - What: Bump Recent Activity to 20 `audit_logs` rows with a real view-all target; add a next-7-days PM panel (query already exists on the PM page); split the merged status band; add Create WO / Add Asset / Run Report quick-action buttons.
  - Where: `web/src/components/pages/DashboardOverviewPage.tsx`.
  - Accept: 20 activity rows; PM panel lists `next_due_at` ≤7d; four distinct status bars; three working quick actions.

- [ ] **CORE-15 — Web notification bell + in-app alert center** (Severity: High)
  - What: Header bell with unread count backed by a per-user feed (reuse `notification_log` writes or add `user_notifications`). Spec'd alert types: new requester submissions, SLA-approaching, PM overdue, low stock — wire the never-called `lib/notifications/partsNotifications.ts` low-stock helper while at it.
  - Where: web layout/`components/Sidebar.tsx` header, new API route, `lib/NotificationService.ts` (also insert an in-app row).
  - Accept: a public request submission increments managers' bell; mark-read clears it; low-stock event appears.

- [ ] **CORE-16 — Escalation cron: SLA breach + PM overdue (24h) + due-date-approaching** (Severity: High) *(overlaps WO/PM analysts — one cron serves all three)*
  - What: Scheduled route (pattern: `api/cron/pm-generate`) that (a) alerts managers on WOs past `due_at` (invoke the orphaned `notifyWOOverdue`), (b) escalates PM WOs not started 24h past due, (c) reminds assignees of WOs due soon. Dedupe so each event notifies once.
  - Where: new `web/src/app/api/cron/escalations/route.ts`, `vercel.json`, `lib/notifications/workOrderNotifications.ts`.
  - Accept: an overdue WO produces exactly one manager alert; a PM WO untouched 24h past due escalates; re-runs don't re-notify.

- [ ] **CORE-17 — Warranty-expiry 30-day notification** (Severity: Medium) *(overlaps Assets analyst)*
  - What: Extend the escalation cron to notify admins/managers when `assets.warranty_expiry` is ≤30 days out (badges exist; no notification is ever sent). Once per asset.
  - Where: same cron route; `lib/NotificationService.ts`.
  - Accept: asset with warranty_expiry = today+30d triggers one manager email/push.

- [ ] **CORE-18 — Media retention purge job (make the 6-month promise real)** (Severity: Medium)
  - What: UI promises 6-month media retention (`media_expires_at`, purge warnings, storage add-on marketing) but nothing purges — the notice is currently misleading. Cron deletes storage objects past `media_expires_at` and strips them from `photo_urls`; stamp `media_expires_at` on asset photos too.
  - Where: new cron route; buckets `work-order-media`/`media`; `work_orders.photo_urls`.
  - Accept: WO with expired media loses files, shows expired placeholders; structured data untouched.

- [ ] **CORE-19 — Lock the requester role to submit-and-track only** (Severity: Critical)
  - What: Requesters currently browse the full web dashboard (all WOs/assets/inventory/inspections render; sidebar hides only 7 admin items) and on mobile see every org WO/asset and can change statuses. Web: redirect role=requester from `/dashboard/*` to `/request` + a my-requests list. Mobile: requester-specific UI (see CORE-23) with org-wide queries removed. Back it with role-aware RLS since mobile hits PostgREST directly.
  - Where: `web/src/middleware.ts` or dashboard layout; `mobile/src/screens/WorkOrdersScreen.tsx:89`, `AssetsScreen.tsx`, `WorkOrderDetailScreen.tsx`; RLS policies on base tables (live DB — commit as migrations).
  - Accept: requester on web lands on the request portal and cannot open `/dashboard/work-orders`; requester on mobile sees no org WOs and cannot change any status (verified via direct PostgREST call).

- [ ] **CORE-20 — Role-gate WO status transitions at the DB/server chokepoint** (Severity: High)
  - What: Mobile applies zero role gating to transitions and RLS never checks roles — any role can move any WO through any state. Enforce: technicians transition only WOs assigned to them (in_progress/on_hold/completed); closed/reopen manager-only (CORE-01/02/03). Durable fix is RLS UPDATE policies or a transition-validating trigger, since mobile bypasses web routes.
  - Where: SQL migration (new `supabase/migrations/`); `mobile/src/screens/WorkOrderDetailScreen.tsx` UI gating to match.
  - Accept: technician cannot update a WO not assigned to them via direct PostgREST; UI hides disallowed transitions.

- [ ] **CORE-21 — Scope technicians' web views to their own assignments** (Severity: High)
  - What: Web shows technicians every org WO (verified — no role filter on the list). Filter `assigned_to = me OR me = ANY(additional_workers)` for role=technician on WO list, dashboard stats, PM lists. (Spec's "asset detail only for linked assets" is stricter than industry norm — recommend keeping the full registry read-only and recording the deviation.)
  - Where: `web/src/app/dashboard/work-orders/page.tsx`, `components/pages/DashboardOverviewPage.tsx`, `dashboard/pm-schedules/page.tsx`.
  - Accept: technician sees only own WOs in list and counters; manager view unchanged.

- [ ] **CORE-22 — Route the logged-in requester wizard through the approval queue** (Severity: High)
  - What: `/request` wizard inserts directly into `work_orders` (`source='requester'`), bypassing the manager-review gate that the spec and the public QR flow both require. Insert into `requests` (pending) instead; approval creates the WO via the existing triage flow.
  - Where: `web/src/app/request/page.tsx`, reuse `api/requests/submit` logic.
  - Accept: wizard submission appears in Dashboard→Requests as pending; no WO exists until approval.

- [ ] **CORE-23 — Mobile request-submission flow for requesters** (Severity: Medium)
  - What: Requesters can't submit anything on mobile. Add a create-request screen (title, description, site/location, optional photo → `requests` table) and a my-requests status list. Pairs with CORE-19's lockdown.
  - Where: new `mobile/src/screens/` screens; `mobile/src/navigation/index.tsx`.
  - Accept: requester submits from mobile; request appears in web triage; requester sees status updates.

- [ ] **CORE-24 — Per-user site scoping for managers** (Severity: Medium; Phase 2)
  - What: Spec restricts managers to assigned site(s); no `user_sites` concept exists. Add a `user_sites` join table + query filters + RLS; empty = all sites (backward compatible).
  - Where: DB migration; `web/src/app/dashboard/users/[id]/edit` (site multi-select); list-page queries; RLS.
  - Accept: manager assigned Site A sees no Site B WOs/assets; unassigned managers behave as today.

- [ ] **CORE-25 — Run inspections on mobile** (Severity: High)
  - What: Inspection execution on mobile: pick template/site/space/asset, typed inputs incl. photo capture, submit to `inspection_results`. Extract the web's failed-item→WO logic into a shared server route so it isn't duplicated client-side.
  - Where: new `mobile/src/screens/`; new `web/src/app/api/inspections/submit/route.ts` used by both clients.
  - Accept: mobile-completed inspection appears in web results; failed item creates the WO.

- [ ] **CORE-26 — Recurring/scheduled inspections (incl. hotel room rotation)** (Severity: High)
  - What: Inspection schedules (template, site/asset/space, frequency, assignee, next_due) + cron generation, same pattern as `pm-generate`. Round-robin over a site's spaces covers the hotel every-room-per-quarter requirement.
  - Where: DB migration; extend `api/cron/pm-generate` or sibling route; inspections UI for schedule CRUD.
  - Accept: monthly-scheduled inspection produces a due task each cycle unattended; rotation visits each space before repeating.

- [ ] **CORE-27 — Inspection item types: numeric w/ custom range + threshold, date type; functional photo items** (Severity: Medium)
  - What: Add `numeric` item type with min/max and pass/fail threshold (refrigeration temps, pool pH/chlorine are currently free-text) and a `date` type; implement photo capture during the run (currently an "upload available after submission" stub) with required-photo validation.
  - Where: `web/src/app/dashboard/inspections/templates/new/page.tsx` + `templates/[id]/edit`, `inspections/new/page.tsx`, PDF `api/reports/inspection/[id]/route.tsx`.
  - Accept: out-of-threshold numeric marks fail and spawns the WO; photo-required item blocks submission without one; values render in the PDF.

- [ ] **CORE-28 — Auto-distribute completed inspection PDFs** (Severity: Medium)
  - What: On submission, generate the PDF and email it to a per-template (or org-setting) recipient list — the "facilities director compliance record" requirement; include conductor name + timestamp in the PDF.
  - Where: inspection submit handler → server route; `lib/email.ts`; template builder recipients field.
  - Accept: completing an inspection sends the PDF to the configured address.

- [ ] **CORE-29 — Cross-site inspection compliance comparison + per-space compliance grid** (Severity: Medium; Phase 2)
  - What: Reporting view comparing pass rates across sites (retail multi-branch) and a per-space grid coloured by last result for a site (hotel "room-by-room map" without needing floor plans).
  - Where: `web/src/app/dashboard/reports/page.tsx` or an inspections tab; aggregates over `inspection_results`.
  - Accept: compliance % per site for a template + date range; space grid for a chosen site.

- [ ] **CORE-30 — Compound unit-handover checklist flow** (Severity: Low; Phase 2)
  - What: Move-in/move-out inspection variant: per-space handover with per-fixture condition + photos, locked once countersigned, exportable PDF as the condition record. Ship as a compound template + `handover` flag reusing CORE-27's photo items.
  - Where: inspections module (template flag + result lock), PDF route.
  - Accept: completed handover produces a locked, photo-bearing PDF linked to the space.

- [ ] **CORE-31 — Wire mobile status changes into audit_logs** (Severity: Medium)
  - What: Mobile transitions write only `work_order_comments`, so the web History tab and the dashboard activity feed miss them. Solved automatically if CORE-04 routes mobile through server routes; otherwise add a DB trigger on `work_orders.status` change writing `audit_logs`.
  - Where: covered by CORE-04, or SQL trigger migration.
  - Accept: a status change made on mobile appears in the web WO History tab and Recent Activity.

- [ ] **CORE-32 — Fix the empty PM History tab on asset detail** (Severity: High) *(overlaps PM analyst — it's a rendered-but-dead feature)*
  - What: Asset detail's "PM History" tab renders but never loads data. Populate it from completed PM-generated WOs (`pm_schedule_id` link now exists): date, technician, duration, notes, photos.
  - Where: `web/src/app/dashboard/assets/[id]/page.tsx`.
  - Accept: an asset with a completed PM WO shows it in the tab with technician + completion date.

- [ ] **CORE-33 — Seasonal PM: setting UI + cron enforcement** (Severity: Medium) *(overlaps PM analyst)*
  - What: `is_seasonal`/`seasonal_start_month`/`seasonal_end_month` display on the PM detail but there is no UI to set them and the generation cron ignores them. Add the fields to create/edit forms and skip generation outside the window.
  - Where: `web/src/app/dashboard/pm-schedules/new/page.tsx`, `[id]/edit`, `api/cron/pm-generate/route.ts` (also wire the dead `lead_time_days` column while in the file — build-db §3.9).
  - Accept: a schedule windowed May–Sep generates no WOs in December; lead_time_days is honored.

- [ ] **CORE-34 — NFC tag support for assets** (Severity: Low; Phase 2)
  - What: Assign an NFC tag id to an asset and resolve NFC scans on mobile to the asset page (spec lists NFC alongside QR). `react-native-nfc-manager` in the Expo dev-client build; store tag id in a new `assets.nfc_tag_id`.
  - Where: DB migration; `mobile/` scanner; asset edit forms.
  - Accept: scanning a linked NFC tag opens the asset detail.

- [ ] **CORE-35 — Realtime dashboard updates** (Severity: Low; Phase 2)
  - What: Spec wants KPIs updating as WOs close; zero realtime exists. Cheapest honest version: Supabase realtime subscription (or 60s polling) on `work_orders` for the dashboard page only.
  - Where: `web/src/components/pages/DashboardOverviewPage.tsx`.
  - Accept: closing a WO in another tab updates counters without manual refresh.

- [ ] **CORE-36 — Site map view with colour-coded pins** (Severity: Low; Phase 2/3)
  - What: Multi-site map (Medium/Enterprise) with one pin per site coloured green/yellow/red from open/overdue WO counts. Needs lat/lng on sites; a static map or self-hosted-tile Leaflet keeps it dependency-light.
  - Where: `sites` migration (lat/lng), dashboard panel.
  - Accept: site with overdue WOs renders red; clicking a pin opens the site.

---

# Section 1C — Users & Teams + Preventive Maintenance vs Serviq-FM Build

Compared the 252-item Users & Teams + Preventive Maintenance checklist (UpKeep help-doc derived, `req-users-pm.md`) against the Serviq-FM web app (`web/src`), mobile app (`mobile/src`), and DB/security inventory. Result: **56 Present, 43 Partial, 138 Missing, 15 N/A** (UpKeep-legacy/process items). The user lifecycle core (invite, deactivate, last-admin protection, delete-with-guards) and PM basics (cron generation, pause/archive, end dates, weekly day picker) are solid. Headline gaps: **no password change/reset anywhere** (the login page's "Forgot password?" is a dead `href="#"` link), **no meters module → no meter/hybrid PM**, **no completion-based (floating) scheduling**, **no location-based permissions**, and four verified broken features: **seasonal PM fields the cron ignores**, **push delivery broken by a token-schema split**, **mobile never enforces tenant deactivation (`is_active`)**, and **invoicing reads an `hourly_rate` no UI can set**.

---

## Comparison by requirement area

### 1. Users — roles & account rules (req §1.1–1.8, 51 items: 25 Present / 11 Partial / 13 Missing / 2 N/A)

| Requirement | Status | Evidence / gap |
|---|---|---|
| Role set (Admin, Ltd Admin, Tech, Ltd Tech, Requester, View Only, Custom) | Partial | Build has 4 roles: `admin/manager/technician/requester` (`users.role`, plain text). No Limited Technician, View Only, or custom roles. |
| Admins manage users/teams | Present | `web/src/app/dashboard/users/*`, `teams/*` (admin/manager gated). |
| No self role change; ≥1 admin always | Present | Server-enforced: `self_role_change`, `last_admin_role`, `last_admin_deactivate` in `web/src/app/api/users/[id]/route.ts`; delete route mirrors it. **Exceeds docs** — UpKeep states the rule, Serviq enforces it server-side with typed error codes. |
| One account per email; reserved until deleted; "already exists" error | Present | Supabase auth unique email; `api/users/route.ts` surfaces the create failure and rolls back (`auth.admin.deleteUser` on profile-insert failure). |
| Users change own email/password (admins cannot) | Missing | Inverted: nobody can change email; only an admin can reset a password (resend-invite temp password). No self-service at all. |
| Delete + re-add never-logged-in user | Present | Delete API + derived Pending status (`invited_at`/`first_login_at`, sprint-k-06). |
| Role changeable anytime; ~5-min sync | Present | Immediate (role read per page load) — **exceeds** the docs' sync caveat. |
| Paid roles / license consumption | N/A | No seat-license model; plans are flat tiers (`organisations.plan`). |
| Invite from Users section | Present | `dashboard/users/new` + `POST /api/users`. |
| Multi-invite in one flow | Partial | One user per submit; no "+ Add User" batching. |
| Invite email with credential-creation link | Partial | Sends a **temp password** instead (`'Serviq'+Math.random()+'!1'` — ~41 bits, echoed in the JSON response and on screen, no forced change; db audit §2.10). |
| Invite link expiry; forgot-password fallback | Missing | Temp password never expires; no reset flow exists; `login/client/page.tsx:168` "Forgot password?" links to `#`. |
| Resend invite | Present | `api/users/[id]/resend-invite` (pending only, regenerates temp password). |
| 3 statuses Active/Pending/Deactivated | Present | List badges Active/Inactive/Pending (`dashboard/users/page.tsx`). |
| Edit user fields | Partial | Edit = full_name, full_name_ar, role, is_active only. No job title, skill categories, or company; phone captured at invite but not editable after; `users.hourly_rate` is read by invoicing (`dashboard/invoices/new/InvoiceForm.tsx:60-70`) but **no UI anywhere can set it** — labor charges silently compute as 0. |
| Custom roles in role dropdown | Missing | No custom roles. |
| Deactivate / reactivate retaining data | Present | `is_active` toggle; web middleware blocks `is_active=false` (`middleware.ts`). |
| Deactivation logs out immediately | **Partial (broken on mobile)** | Web blocks on next navigation (no session revocation). Mobile `AuthContext.tsx:51` checks only the platform `disabled` flag, **never `is_active`** — a tenant-deactivated user keeps full mobile access (RLS is org-scoped, not status-scoped). |
| Deactivated excluded from notification lists | Partial | Recipient queries (e.g. admin fan-out on request submit) do not visibly filter `is_active`. |
| Delete: permanent, confirm, references blanked, WO guard | Present/Partial | `api/users/delete/route.ts`: confirm UI, deletes the auth user (email freed), nulls 8 FK columns, **hard-blocks delete while WOs are assigned (exceeds the docs' soft guideline)**. Gap: `work_orders.additional_workers uuid[]` keeps dangling ids (db audit §3.9). |
| Self-delete own account | Partial | Mobile only (`request_account_deletion` RPC, soft-delete); web blocks delete-on-self. |
| Self-service email change | Missing | No profile editing on web or mobile. |
| Password policy (10 chars, mixed case, number) | Missing | Supabase defaults; nothing in code. |
| Change password (web + mobile); reset (web + mobile) | Missing | Grep confirms zero `resetPasswordForEmail`/password-update calls in either app. |

### 2. Role permission matrices (req §2.1–2.3, 40 items: 1 Present / 4 Partial / 35 Missing)

- **Limited Admin (9 items — 1 Partial, 8 Missing):** `manager` is the closest analog (cannot create admins, write field-configs, or delete users) but has none of the granular rules (no delete-only-own-created, no restricted-settings messaging, no hourly-rate visibility split — no rate UI exists at all).
- **Technician vs Limited Technician (8 items — 1 Present, 3 Partial, 4 Missing):** Bulk "Change Assignee" **Present** (`dashboard/work-orders/page.tsx:95-102`). Technician visibility is **inconsistent across platforms**: the web WO list applies no role filter (`work-orders/page.tsx:85` — technicians see all org WOs) while mobile filters technicians to `assigned_to = me` (`WorkOrdersScreen`). No Limited Technician role, no assigned-only enforcement in RLS, no CSV worker/team assignment columns, team assignment grants no visibility.
- **Custom Roles (23 items):** entirely Missing — no roles table, no permission toggles, no Settings → User Roles.

### 3. Teams (req §3, 8 items: 5 Present / 1 Partial / 2 Missing)

Present: teams CRUD (`dashboard/teams/*`, `teams`+`team_members`, sprint-k-05), unlimited memberships, exactly one team per WO (`work_orders.team_id`). Partial: members limited to technicians+managers (admins excluded — minor deviation). Missing: **team-assignment notification is unwired** — `notifyWOTeamAssigned` is defined at `web/src/lib/notifications/workOrderNotifications.ts:71` but never called anywhere; and teams cannot be assigned to assets/locations at all.

### 4. People & Teams section UI (req §4, 8 items: 2 Present / 1 Partial / 5 Missing)

Present: separate Users/Teams nav entries (functional equivalent of tabs), status per row plus role-count stat cards (**exceeds** — UpKeep has no role summary cards). Partial: deactivated users always listed (no "Include Deactivated" filter). Missing: **user search, role filter, sorting** (grep of `dashboard/users/page.tsx` finds no search/filter state), people/teams CSV import/export, user skill categories.

### 5. Location-based permissions (req §5, 21 items: 21 Missing)

Entirely absent — build-web §10: "no per-user site scoping"; RLS is org-scoped only (db audit §2.1). No `is_location_based`, no per-user site grants, no scoped parts/assets/WO/analytics/notification visibility.

### 6. Notifications (req §6, 15 items: 3 Present / 5 Partial / 7 Missing)

| Item | Status | Evidence |
|---|---|---|
| Per-user own settings, toggle page, auto-save | Present | Settings → Notifications tab, `user_notification_preferences.preferences`, catalog `lib/notificationTypes.ts`. |
| Email sections per category | Partial | Categories exist (WO General/Requests/PO/Parts/Summary) but several types have **no emitting code** (mentions, followed WOs, daily summary) and the PO section references a module that doesn't exist. |
| Requester notified after approval | Partial | Approved/rejected/status emails wired (`lib/email.ts`, `/api/requests/notify-status`). |
| @-mention in comments | Missing | Pref key exists; comments are plain text on web and mobile. |
| Automated workflow settings | Missing | — |
| Shift status On/Off/On-Call; Off-Shift muting | Missing | No shift concept. |
| Mobile push | **Partial (broken)** | Mobile registers tokens to `users.push_token` (`mobile/src/lib/notifications.ts:42-45`) but `/api/push` reads the never-populated `user_devices` table → every send returns "No active devices" (db audit §3.7). The orphaned `supabase/functions/send-push` reads the right column but is uncalled and unauthenticated. |
| Mobile notifications hub / tap-to-open | Missing | Home bell is decorative; no response listener, no deep links (`build-mobile.md` §1, §4). |
| Web bell/notifications popover | Missing | Sidebar count badges only. |
| No self-notifications | Partial | Comment notify targets the counterparty; status-change pushes to assignee+creator are not verified to exclude the actor. |

### 7. Multi-site module (req §7, 7 items: 7 Missing — different model)

No account linking or site switching under one login; mobile is single-org. **The build exceeds the docs in a different direction**: native multi-tenancy with per-org multiple sites (`multi_site` flag) and a full platform back office with cross-tenant analytics (`app/platform/**`) — UpKeep sells cross-site reporting as an enterprise add-on. Cross-org membership for a single end-user remains absent.

### 8. PM structure & concepts (req §8, 9 items: 3 Present / 4 Partial / 2 Missing)

Present: auto-generation via hourly cron (`app/api/cron/pm-generate/route.ts`, CRON_SECRET fail-closed), unique sequential WO numbers (`wo_number`), WOs link back via `work_orders.pm_schedule_id` (sprint-j). Partial: flat one-row-per-schedule model — no Trigger→Schedules→Records grouping (multi-asset create inserts N independent rows, `pm-schedules/new/page.tsx`); Details carry only title/description/duration — generated WOs are hardcoded `priority: 'medium'` with no category, checklist, parts, files, or signature (`pm-generate/route.ts:107-120`); records have asset/site/single assignee but no timezone or team/additional workers. Missing: meter and hybrid schedule types; the fixed-vs-completion-based distinction (fixed only).

### 9. PM creation & editing (req §9, 9 items: 4 Present / 2 Partial / 2 Missing / 1 N/A)

Present: create flow with quick templates, "create first work order now" checkbox, weekly days-of-week picker, edit details/schedule (`pm-schedules/new`, `[id]/edit`). Partial: no add-schedule-to-existing-trigger grouping; edit has no creation cadence. Missing: completion-based mode entirely. **Exceeds docs:** per-row "Generate WO now" button, PM calendar view (`pm-schedules/calendar`), PM compliance dashboard (`pm-schedules/compliance`), and asset Decommission auto-suspending its PM schedules.

### 10. Calendar frequencies (req §10, 12 items: 4 Present / 4 Partial / 4 Missing)

Seven fixed presets mapped to day counts (`FREQ_TO_DAYS`, `pm-generate/route.ts:15-23`).

| Frequency | Status |
|---|---|
| Every N days / weeks / months / years (arbitrary N) | Partial — presets only; monthly=30d and annual=365d so calendar dates **drift** over time |
| Weeks by days-of-week | Present (`days_of_week int[]`, honored by cron `nextDueOnDaysOfWeek`) |
| Specific days of month / month by day-of-month / nth weekday of month | Missing |
| Start date required | Present (first due date* on create) |
| End date optional; stops generation | Present (cron deactivates past `end_date`, lines 89-93, 135) |
| Per-schedule timezone | Missing (UTC day math; org timezone setting not applied) |

### 11. PM timing controls (req §11, 3 items: 2 Partial / 1 Missing)

Due time = whatever time the first due timestamp carried (rolls forward unchanged) — no separate trigger-time vs due-time. Creation cadence: **`pm_schedules.lead_time_days` is written but never read** — the cron hardcodes a 2-day-ahead cutoff (`pm-generate/route.ts:68`; dead column per db audit §3.9). No exact generation time (hourly cron granularity).

### 12. Meter-based scheduling (req §12, 6 items: 6 Missing)

No meters module at all — confirmed absent in web (§18), mobile (§7), and DB inventories. No conditions (Every/Less Than/Greater Than/Exactly), values, or meter due frequency/interval. Headline parity gap; blocked on a meters module existing first.

### 13. Seasonal / inactive periods (req §13, 6 items: 2 Partial / 3 Missing / 1 N/A)

The edit page has a "Seasonal schedule" checkbox with start/end month selects (`pm-schedules/[id]/edit/page.tsx:204-218`) and the detail page displays the window (`[id]/page.tsx:290`), **but the cron never selects or checks `is_seasonal`/`seasonal_start_month`/`seasonal_end_month`** (`pm-generate/route.ts:72` column list) — WOs keep generating inside the declared inactive window. Broken feature, not just a gap. Also: single month-range only (no multiple arbitrary date ranges), not settable at creation, no import/export of inactive periods.

### 14. PM lifecycle (req §14, 12 items: 8 Present / 2 Partial / 1 Missing / 1 N/A)

Present: Pause/Resume (`is_active` toggle, `pm-schedules/page.tsx:141`), paused schedules stay visible, end-date termination, Archive (permanent: `is_archived=true, is_active=false`, hidden from default list — matches "cannot unarchive"), bulk archive via checkboxes, deleting a WO leaves the PM intact. Partial: pause does **not** remove open not-yet-started PM WOs; resume keeps the stale `next_due_at`, so a long-paused schedule fires immediately overdue instead of preserving remaining time. Missing/Partial: deleting a PM leaves its open WOs orphaned (FK `SET NULL`) instead of removing open + keeping completed.

### 15. PM navigation & visibility (req §15, 7 items: 4 Partial / 3 N/A)

List has stats, actions, and an Archived toggle but no filters or import/export. Detail shows Next Due / Last Generated / Compliance and a Generated Work Orders tab — but that tab **matches WOs by a title+asset/site heuristic even though `pm_schedule_id` is a real FK** (build-web §5), so history can be wrong after renames. No expandable Last/Next/Next-Trigger columns on the list. **Exceeds docs:** per-schedule compliance % and the compliance dashboard have no UpKeep-checklist equivalent.

### 16. PM import/export (req §16, 29 items: 29 Missing)

No PM CSV import or export of any kind (templates, schedules, or combined). Assets/sites/spaces/inventory/vendors all have CSV flows, so the pattern exists to copy.

### 17. Recurring WO → PM migration (req §17, 7 items: 1 Present / 1 Partial / 5 N/A)

UpKeep-legacy migration mechanics are N/A. One-time WOs creatable: Present. One trap: the WO create form's "recurring" checkbox + frequency selector is **informational only** (build-web §2/§5) — users will believe they created recurrence when nothing will ever generate.

---

### To-Dos

- [ ] **1C-01 — Add password reset and change-password flows (web + mobile)** (Severity: Critical)
  - What: No user can reset or change a password; a locked-out sole admin is unrecoverable, and the login page's "Forgot password?" is a dead `href="#"` link (`login/client/page.tsx:168`). Wire it to a real flow using `supabase.auth.resetPasswordForEmail` + a `/auth/reset` page; add Change Password (current + new + confirm) in web Settings → Account and mobile Profile; enforce a 10-char/upper/lower/number policy client-side and in Supabase auth settings.
  - Where: `web/src/app/login/client/page.tsx`, new `web/src/app/auth/reset/page.tsx`, `web/src/app/dashboard/settings/page.tsx`, `mobile/src/screens/LoginScreen.tsx`, `mobile/src/screens/ProfileScreen.tsx`.
  - Accept: a user receives a reset email and sets a new password without admin help; logged-in users change passwords on both platforms; policy-violating passwords are rejected.

- [ ] **1C-02 — Enforce tenant deactivation (`is_active`) on mobile** (Severity: Critical)
  - What: `mobile/src/context/AuthContext.tsx:51` only signs out on the platform `disabled` flag — a tenant-admin-deactivated user (`is_active=false`) retains full mobile access indefinitely. Check `is_active === false` in the same profile fetch and force sign-out; additionally call `auth.admin.signOut(userId)` from the deactivate route so existing sessions die server-side.
  - Where: `mobile/src/context/AuthContext.tsx`, `web/src/app/api/users/[id]/route.ts` (deactivate path).
  - Accept: deactivating a user in the web dashboard kicks their mobile session on next app foreground/fetch; reactivating restores login.

- [ ] **1C-03 — Fix push notification pipeline schema split** (Severity: Critical)
  - What: Mobile writes tokens to `users.push_token`/`push_platform` but `/api/push` reads the never-populated `user_devices` table, so every push send returns "No active devices". Pick one store (simplest: point `/api/push` at `users.push_token`), and delete or secure the orphaned `supabase/functions/send-push` edge function (currently unauthenticated with service role).
  - Where: `web/src/app/api/push/route.ts:68`, `mobile/src/lib/notifications.ts:42-45`, `supabase/functions/send-push/index.ts`.
  - Accept: a status change on a WO assigned to a mobile-logged-in technician delivers a real push; the edge function is removed or requires auth.

- [ ] **1C-04 — Make seasonal PM schedules actually skip inactive months** (Severity: Critical)
  - What: `is_seasonal`/`seasonal_start_month`/`seasonal_end_month` are editable and displayed but the generation cron ignores them — WOs generate year-round. Select the columns in the cron, skip generation when the due date falls in the inactive window, and roll `next_due_at` past the window (handle wrap-around ranges like Oct–Apr).
  - Where: `web/src/app/api/cron/pm-generate/route.ts` (column list line 72 + loop), mirror in `dashboard/pm-schedules/pm-utils.ts` and the "generate now" action; also add the seasonal fields to the create form (edit-only today).
  - Accept: a May–Sep seasonal schedule generates nothing for an October due date and resumes in May; wrap-around ranges covered by a test.

- [ ] **1C-05 — Harden invite temp passwords** (Severity: High)
  - What: Temp passwords are `'Serviq' + Math.random-base36 + '!1'` (~41 bits, predictable prefix), echoed in JSON responses, never expire, and are never forced to change. Use `crypto.randomBytes`, stop returning the password in API responses (email-only, or switch to reset-link invites once 1C-01 lands), and force a password change on first login.
  - Where: `web/src/app/api/users/route.ts`, `api/users/[id]/resend-invite/route.ts`, `api/platform/tenants` create, `web/src/middleware.ts` (must-change redirect).
  - Accept: temp password is CSPRNG-generated; API responses contain no password; first login lands on a mandatory change-password screen.

- [ ] **1C-06 — Wire team-assignment notifications** (Severity: High)
  - What: `notifyWOTeamAssigned` is defined but never invoked. Call it when a WO is created or edited with a new/changed `team_id`, notifying all team members per their preferences.
  - Where: `web/src/lib/notifications/workOrderNotifications.ts:71`, WO create/edit paths (`app/api/work-orders/route.ts`, `dashboard/work-orders/new` + `[id]/edit` follow-up updates).
  - Accept: assigning a team to a WO notifies every active team member exactly once.

- [ ] **1C-07 — Exclude deactivated users from notification fan-outs** (Severity: High)
  - What: Recipient queries (org admin/manager fan-out on request submit, WO assigned/status, team notify) do not filter account status. Add `is_active = true AND disabled = false` (or a shared recipient helper) and clear `push_token` on deactivation.
  - Where: `web/src/lib/NotificationService.ts`, `web/src/lib/notifications/*.ts`, `api/requests/submit`, deactivate path in `api/users/[id]/route.ts`.
  - Accept: a deactivated user receives no email/push from any trigger.

- [ ] **1C-08 — Wire `lead_time_days` into PM generation (creation cadence)** (Severity: High)
  - What: The cron hardcodes a 2-day-ahead cutoff and never reads the existing `lead_time_days` column, so longer configured lead times silently don't happen. Compute the cutoff per schedule (`next_due_at − lead_time_days`) and expose the field in PM create/edit forms.
  - Where: `web/src/app/api/cron/pm-generate/route.ts:68-76`, `dashboard/pm-schedules/new/page.tsx`, `[id]/edit/page.tsx`.
  - Accept: a schedule with `lead_time_days=14` gets its WO 14 days before due; default remains 2.

- [ ] **1C-09 — Add completion-based (floating) PM scheduling** (Severity: High)
  - What: Add `schedule_mode` (`fixed` | `after_completion`) to `pm_schedules`. For `after_completion`, don't roll `next_due_at` at generation; compute it from the generated WO's completion (`completed_at + interval`) in the WO close route. First WO is always created immediately for completion-based schedules.
  - Where: DB migration; `api/cron/pm-generate/route.ts`; `api/work-orders/[id]/close/route.ts` (roll forward when `pm_schedule_id` set); PM create/edit forms.
  - Accept: a completion-based schedule generates the next WO only after the previous completes; fixed schedules unchanged.

- [ ] **1C-10 — True calendar recurrence: arbitrary intervals, day-of-month anchoring, timezone** (Severity: High)
  - What: Replace the 7-preset `FREQ_TO_DAYS` day-count model (monthly=30d, annual=365d — drifts off calendar dates) with interval+unit (every N days/weeks/months/years), day-of-month lists (1st/15th), nth-weekday-of-month (first Monday), and timezone-aware date math (org timezone at minimum). Keep the presets as UI shortcuts.
  - Where: migration on `pm_schedules`; one shared roll-forward function used by both `api/cron/pm-generate/route.ts` and `pm-utils.ts` (currently duplicated with a "keep in sync" comment); PM forms.
  - Accept: a monthly-on-the-1st schedule stays on the 1st across month lengths; "every 2 months" and "first Monday" both supported; existing schedules migrate cleanly.

- [ ] **1C-11 — Meters module + meter-based and hybrid PM triggers** (Severity: High; Phase 2)
  - What: The build has no meters at all. Add `meters` (name, unit, asset_id, site_id) and `meter_readings` (value, read_at, read_by) with org-scoped RLS; reading entry on web asset detail and mobile; then meter PM schedules (condition Every/Less Than/Greater Than/Exactly + value; due frequency Minutes–Years + interval) and hybrid calendar+meter (whichever fires first). Evaluate triggers on reading insert or in the hourly cron.
  - Where: DB migration; new `web/src/app/dashboard/meters/*`; asset detail tab; a mobile reading screen; `api/cron/pm-generate` or a dedicated evaluation path; PM forms.
  - Accept: a reading crossing an "every 500" threshold generates the WO; a hybrid schedule fires on whichever of date/usage comes first; per-meter reading history is visible.

- [ ] **1C-12 — PM details parity: priority, category, checklist, signature on generated WOs** (Severity: High)
  - What: Generated WOs are hardcoded `priority: 'medium'` with no category or tasks. Add priority, category, `checklist_template_id`, and `requires_signature` to `pm_schedules`; on generation copy priority/category to the WO and expand the checklist into `work_order_tasks` rows (both tables exist from sprint-k-03).
  - Where: migration; `api/cron/pm-generate/route.ts:107-120`; PM create/edit forms; "generate now" action.
  - Accept: a PM with a checklist + high priority yields WOs carrying both; signature-required PMs enforce the existing typed sign-off at close.

- [ ] **1C-13 — Consistent technician visibility + assigned-only scoping (Limited Technician)** (Severity: High; Phase 2)
  - What: Web shows technicians all org WOs (no role filter, `dashboard/work-orders/page.tsx:85`) while mobile filters to assigned-only — pick one semantic, then add an opt-in per-user "sees only assigned/created" restriction (new role value or boolean) enforced in RLS across WOs/assets, with team assignment granting visibility.
  - Where: `dashboard/work-orders/page.tsx`, new RLS migration, `mobile/src/screens/WorkOrdersScreen.tsx`, teams join in the visibility predicate.
  - Accept: web and mobile show the same WO set for the same technician; a restricted technician sees only WOs where they are creator/assignee/additional worker/team member — enforced at the DB layer (direct PostgREST query returns the same set).

- [ ] **1C-14 — Location-based permissions (per-user site scoping)** (Severity: High; Phase 2)
  - What: Add `is_location_based` + a `user_site_access` table; scope WOs, assets, spaces, inventory, requests, PM schedules, notifications, and reports to granted sites (WOs with no site stay visible to all, per the docs). Admin UI on user edit to pick sites.
  - Where: DB migration + RLS predicates (web and mobile inherit automatically if scoping lives in policies); `dashboard/users/[id]/edit`.
  - Accept: a Site-A-only user cannot see Site B assets/WOs via UI or direct API; unchecking the flag restores full visibility; zero-site users see nothing.

- [ ] **1C-15 — Admin-editable user fields: hourly rate, job title, phone, skill categories** (Severity: High)
  - What: `users.hourly_rate` drives invoice labor charges but no UI can set it (labor always computes 0 — functional gap in a shipped billing feature). Add hourly rate (admin-only), job title, editable phone, and skill categories (from the fixed WO category list) to invite/edit forms and the field catalog.
  - Where: `dashboard/users/new` + `[id]/edit`, `api/users/route.ts` + `[id]/route.ts`, `lib/field-catalog.ts`; migration for `job_title`, `categories text[]`.
  - Accept: an admin-set hourly rate flows into `InvoiceForm` labor math; managers cannot see or edit hourly rate; categories filterable later.

- [ ] **1C-16 — Pause removes open PM WOs; resume rebaselines next due** (Severity: Medium)
  - What: Pausing leaves open generated WOs and a stale `next_due_at`, so resume fires an immediately-overdue WO. On pause, delete/cancel open not-started WOs linked via `pm_schedule_id`; on resume, recompute `next_due_at` preserving the remaining interval (store `paused_at`).
  - Where: `dashboard/pm-schedules/page.tsx:141` (toggleActive), `[id]/page.tsx`; small migration for `paused_at`.
  - Accept: pause removes open unstarted PM WOs; a 100-day schedule paused at day 50 comes due ~50 days after resume, not immediately.

- [ ] **1C-17 — PM delete: remove open generated WOs, keep completed** (Severity: Medium)
  - What: Deleting a PM only `SET NULL`s the FK, orphaning open auto-generated WOs. On delete, remove open (`new/assigned`) WOs with that `pm_schedule_id`; completed/closed keep history.
  - Where: PM delete handlers in `dashboard/pm-schedules/page.tsx` and `[id]/page.tsx`.
  - Accept: the delete confirm states how many open WOs will be removed; completed WOs survive with a blanked PM link.

- [ ] **1C-18 — Use `pm_schedule_id` for the Generated Work Orders tab** (Severity: Medium)
  - What: The PM detail's Work Orders tab matches by title+asset/site heuristic even though `work_orders.pm_schedule_id` exists — history breaks after renames. Query by the FK.
  - Where: `web/src/app/dashboard/pm-schedules/[id]/page.tsx`.
  - Accept: the tab lists exactly the WOs with matching `pm_schedule_id`, including after the PM title changes.

- [ ] **1C-19 — Fix or remove the informational "recurring" checkbox on WO create** (Severity: Medium)
  - What: The WO create form offers recurring + frequency but nothing ever generates — a silent trap for users expecting recurrence. Either create a linked PM schedule from those inputs on submit, or drop the checkbox and link to "Create PM Schedule" instead.
  - Where: `web/src/app/dashboard/work-orders/new/page.tsx`, `api/work-orders/route.ts`.
  - Accept: checking recurring produces a real PM schedule visible in the PM list (or the option no longer exists).

- [ ] **1C-20 — User list search, filters, and sorting** (Severity: Medium)
  - What: The Users page has no search or filters. Add name/email search, role filter, an active/deactivated filter (hide deactivated by default with an "Include deactivated" toggle), and column sort — same patterns as the WO list.
  - Where: `web/src/app/dashboard/users/page.tsx`.
  - Accept: email search narrows the list; role filter and deactivated toggle work; default view hides deactivated users.

- [ ] **1C-21 — Self-service profile editing (name, phone, email)** (Severity: Medium)
  - What: Users cannot edit anything about themselves. Add profile editing (web Settings → Account, mobile Profile) for full_name, full_name_ar, phone; email change via `supabase.auth.updateUser({ email })` with password re-auth and confirmation email, syncing `users.email` after confirm.
  - Where: `web/src/app/dashboard/settings/page.tsx`, `mobile/src/screens/ProfileScreen.tsx`; small API route for the `users.email` sync.
  - Accept: users update their own phone/name on both platforms; email change requires the current password and becomes the login identifier after confirmation.

- [ ] **1C-22 — Scrub `additional_workers` arrays on user delete** (Severity: Medium)
  - What: User delete nulls 8 FK columns but leaves the deleted id inside `work_orders.additional_workers uuid[]`, violating the "references become blank" rule and dangling in UI resolution.
  - Where: `web/src/app/api/users/delete/route.ts` (`UPDATE work_orders SET additional_workers = array_remove(additional_workers, $id)` via RPC or filtered update).
  - Accept: after deletion, no WO row contains the deleted id in `additional_workers`.

- [ ] **1C-23 — Web in-app notification center + working mobile hub** (Severity: Medium)
  - What: No web bell/popover; the mobile Home bell is decorative and pushes can't be tapped to open anything. Back a web bell popover with `notification_log` (recent per-user items, mark-read), add a mobile notifications list, and add an Expo notification-response listener + minimal deep link (`scheme` + `linking` config) to open the target WO.
  - Where: `web/src/components/Sidebar.tsx`/top bar + small API; `mobile/src/screens/HomeScreen.tsx`, `mobile/src/lib/notifications.ts`, `mobile/src/navigation/index.tsx`, `mobile/app.json`.
  - Accept: web bell lists recent notifications; tapping a push opens the relevant WO detail; the hub shows missed notifications.

- [ ] **1C-24 — @-mention notifications in WO comments** (Severity: Medium)
  - What: The `wo_mention` preference exists with no emitter and comments are plain text. Add @ autocomplete (org users) in the web comment box, parse mentions on submit, notify via NotificationService.
  - Where: WO detail comments tab (`dashboard/work-orders/[id]/page.tsx`), `lib/notifications/workOrderNotifications.ts`.
  - Accept: @-mentioning a user notifies them per their prefs; nothing sent when the pref is off.

- [ ] **1C-25 — PM CSV import/export** (Severity: Medium; Phase 2)
  - What: No PM import/export exists (assets/sites/inventory already have the pattern). Export all schedules (title, description, frequency fields, asset/site names, assignee email, start/end dates, seasonal fields, paused/archived) and import with per-row validation (referenced asset/site/user must exist), supporting update-by-ID.
  - Where: new `dashboard/pm-schedules/import` + `export` pages modeled on `dashboard/assets/import|export`.
  - Accept: export→edit→import round-trip updates schedules; bad rows are reported per-row without aborting the batch.

- [ ] **1C-26 — Group multiple schedules under one PM trigger** (Severity: Medium; Phase 2)
  - What: Multi-asset PM creation inserts independent rows sharing nothing; editing shared details means editing N rows. Add a `pm_triggers` parent (shared WO details from 1C-12) with child schedules (frequency + asset/site/assignee each); list grouped by trigger.
  - Where: DB migration; `dashboard/pm-schedules/*` list/detail/forms; cron stays per-schedule.
  - Accept: one trigger holds a 3-month and a 6-month schedule for different assets; editing the shared WO title updates future WOs from both.

- [ ] **1C-27 — Multiple arbitrary inactive periods per PM** (Severity: Low; Phase 2)
  - What: Extend the single seasonal month-range (after 1C-04 fixes it) to N date-range windows (`pm_inactive_periods` table or jsonb array), editable at create/edit, honored by the cron.
  - Where: migration; `pm-schedules/new` + `[id]/edit`; `api/cron/pm-generate`.
  - Accept: a PM with two windows (e.g. Ramadan + summer shutdown) skips both and resumes after each.

- [ ] **1C-28 — Users & teams CSV import/export** (Severity: Low)
  - What: Bulk-invite users via CSV (name, email, role, phone) reusing the invite API per row; export user/team lists. Pattern exists for assets/vendors.
  - Where: new `dashboard/users/import` page + export buttons on users/teams lists.
  - Accept: a 20-row CSV creates 20 pending invites with per-row error reporting; export round-trips.

- [ ] **1C-29 — Hide or wire orphaned notification toggles** (Severity: Low)
  - What: Settings shows toggles with no emitting code (followed WOs, daily summary, WOs-due-next-week, mentions until 1C-24) and a Purchase Orders section for a module that doesn't exist. Filter unimplemented types out of the UI until each gains an emitter.
  - Where: `web/src/lib/notificationTypes.ts`, `dashboard/settings/NotificationsTab.tsx`.
  - Accept: every visible toggle corresponds to a real send path.

- [ ] **1C-30 — Shift status (On Shift / Off Shift) notification muting** (Severity: Low; Phase 2)
  - What: Add a shift status on the user profile (web + mobile); Off Shift suppresses all email/push via one predicate in `NotificationService.notify()` (the shared chokepoint).
  - Where: migration (`users.shift_status`), `web/src/lib/NotificationService.ts`, profile UIs.
  - Accept: an Off-Shift user receives nothing; On Shift restores delivery.

- [ ] **1C-31 — Batch invite (multiple emails in one flow)** (Severity: Low)
  - What: Invite form accepts one user at a time; add "+ Add another" rows submitting sequentially to the existing API with per-row results.
  - Where: `web/src/app/dashboard/users/new/page.tsx`.
  - Accept: three users invited in one submit, per-row success/error shown.

- [ ] **1C-32 — Custom roles with permission toggles** (Severity: Low; Phase 3)
  - What: Enterprise-tier custom roles (create/view/edit/delete toggles per module, "partial" = own-created only), starting from full permissions. Large RBAC effort — only worth it for enterprise deals; the 4-role model + field configs covers the current market.
  - Where: new `roles`/`role_permissions` tables + RLS/route integration, Settings → User Roles UI.
  - Accept: a custom role denied Assets-Delete cannot delete assets via UI or API; the role appears in the user-edit dropdown.

- [ ] **1C-33 — Multi-account linking / site switching under one login** (Severity: Low; Phase 3)
  - What: UpKeep-style linking of multiple org accounts with a profile switcher. The build's multi-tenant platform + multi-site orgs covers most real cases; needed only for users belonging to multiple customer orgs.
  - Where: auth model (one auth user ↔ many `users` rows), org switcher in Sidebar + mobile Profile.
  - Accept: a user in two orgs switches context without re-login; data stays strictly org-scoped after the switch.

---

# Section 1D — Assets & Locations: Requirements vs. Build

Compared the 183 line items in `req-assets-locations.md` (UpKeep Assets + Locations parity checklist) against the current Serviq-FM build (web `web/src/app/dashboard/assets/**`, `sites/**`, `spaces/**`; mobile `mobile/src/screens/Assets*/CreateAsset*`; DB per `build-db-security.md`). Result: **Present 57 / Partial 17 / Missing 109**. Core asset CRUD, the 4-level asset hierarchy, QR labels, and the 2-level Sites→Spaces location model are solid; the Enterprise-tier feature families (downtime/reliability, depreciation, check-in/out, operation-hour schedules, org-defined custom fields, 6-level locations, floor plans) are almost entirely absent, and locations lack a detail page with tabs. Depth claims were verified in code: `web/src/app/api/assets/hierarchy.ts` enforces `MAX_ASSET_DEPTH = 4` with cycle detection; locations are exactly 2 levels (Site → Space with a `floor` attribute). (Related known defect on asset detail — the permanently empty PM History tab — is ticketed in section 1B as **1B-17**; not duplicated here.)

---

## 1. Assets — Core Create/Edit (26 items: 21 Present, 3 Partial, 2 Missing)

| Requirement | Status | Evidence / note |
|---|---|---|
| WO tied to exact asset+location at creation; no parent roll-up | Present | `work_orders.site_id/asset_id/space_id` snapshotted at insert; asset detail WO tab queries by exact `asset_id` (`web/src/app/dashboard/assets/[id]/page.tsx`) |
| Rename asset updates name on all WOs (incl. historical) | Present | WOs join asset name by id at render — automatic |
| Changing asset location does NOT retro-update WO locations | Present | WO keeps its own `site_id` from creation time |
| Assets can exist without a location | Present | `site_id` is an optional dropdown in `assets/new/page.tsx` (field-config can toggle) |
| Reporting for location-less assets under the asset | Present | Asset detail WO tab + lifecycle-cost sum |
| Plan availability | Present (different model) | Serviq gates by its own feature flags/plans, not UpKeep tiers |
| 4-level hierarchy (parent→…→great-grandchild) | Present | `api/assets/hierarchy.ts` (`MAX_ASSET_DEPTH = 4`, cycle + depth guard incl. subtree height on move); `dashboard/assets/asset-hierarchy.ts` flatten helpers |
| Set/expand parent picker | Present (equivalent) | Depth-indented parent `<select>` on create/edit instead of expandable tree |
| Child asset may live at a different location than parent | Present | Child site auto-fills from parent but is overridable (`assets/new/page.tsx:69`) |
| Deleting parent deletes descendants (with warning) | **Missing** | DB is `parent_asset_id ... ON DELETE SET NULL` (sprint-k-04) — children are **silently orphaned to top level**; delete confirms (`assets/page.tsx:48-49,79`) never mention children |
| Assets nav, Create button, core fields (name/desc/model/serial/category) | Present | `assets/new/page.tsx` — plus manufacturer, purchase, warranty, lifespan, photos (10) |
| "Set Location" control / sublocation picker with expansion | **Partial** | Site dropdown + free-text `sub_location`. No hierarchical location picker, and **`assets.space_id` exists in the DB (sprint-b) but no asset form ever sets it** — Space linkage only visible via WO "Space Assets" tab |
| Edit asset, location editable any time | Present | `assets/[id]/edit/page.tsx`, PATCH `/api/assets/[id]` |
| Mobile create + save | Present | `mobile/src/screens/CreateAssetScreen.tsx` (entry via Assets tab "+" rather than Home "+" — equivalent) |
| Mobile edit | **Partial** | Edit works, but purchase date, warranty, cost, status, photos, parent asset are not editable on mobile |
| Admins edit any asset | Present | Org-scoped PATCH |
| Technicians edit only assets they created | **Missing** | `/api/assets/[id]/route.ts` has no role or `created_by` check — any org member (incl. requester via API) can edit any asset |
| Naming-convention guidance | Present | Placeholder examples on the form ("e.g. Carrier AC Unit - Room 204") |

**Exceeds docs:** per-org field configuration (required/optional/hidden per form field, server-enforced via `lib/fieldEnforcement.ts`); bilingual AR name + machine-translate button; auto QR on save; duplicate-open-WO warning when an asset is picked on WO create; decommission workflow (retire + suspend PMs + auto-WO); asset CSV import/export with per-row errors.

## 2. Asset Custom Fields (12 items: 1 Partial, 11 Missing)

**Partial**: assets carry a free key/value `custom_fields` JSONB with an add/remove UI on the detail page (`assets/[id]/page.tsx` `CustomFieldsTab`). Everything schema-level is **Missing**: no Settings→Assets→Fields tab, no admin-defined field definitions or format types, custom fields do not appear on create/edit forms, not filterable, not available as list columns, no edit/delete-across-all-assets semantics, not exportable, no dashboard reporting. The JSONB column is a good substrate to build on.

## 3. Downtime & Reliability (19 items: 2 Present, 2 Partial, 15 Missing)

| Area | Status | Note |
|---|---|---|
| Asset status exists | Partial | `active / under_maintenance / retired` (+ `online/offline` in the WO Space-Assets commissioning panel) — not operational/not-operational reliability semantics |
| Filter/search assets by status | Present | Status radio filter on `assets/page.tsx` |
| Completing WO doesn't auto-reset status | Present | Nothing auto-resets (trivially true) |
| "Not operational" red highlight on list | Partial | `under_maintenance`/`retired` badges exist, no red reliability flag |
| Change status from Reliability panel / from within a WO / from mobile | Missing | Status changes only via asset-detail quick actions on web; mobile cannot change asset status |
| Custom asset statuses (Settings tab) | Missing | Statuses are hardcoded strings |
| Manual downtime entry (duration/status/start) | Missing | No downtime table or UI anywhere (`build-web.md` §18 confirms) |
| Uptime/Downtime %, downtime log, 30-day filter, totals | Missing | No reliability panel |

## 4. Depreciation (4 items: 1 Partial, 3 Missing)

Inputs partially exist: `purchase_date`, `purchase_cost`, `expected_lifespan_years` on the asset form. **Missing**: residual price field, the depreciation calculation, the Depreciation panel (rate / end-of-useful-life / current value), and the timeline view. `build-web.md` §18 lists depreciation as absent.

## 5. Check-In / Check-Out (16 items: 16 Missing)

Nothing exists — no per-asset enablement, procedures, check-out/check-in flows (web or mobile), activity log of custody, or cascading parent→child check-in/out settings. Enterprise-tier feature; nothing in schema either.

## 6. Asset Schedules / Operation Hours (10 items: 10 Missing)

No schedules module (name, operating days, hour ranges, multi-range days), no Operation Hours dropdown on asset forms, and no uptime calculation to feed. Depends on §3 existing first.

## 7. Work Orders Tab within Assets (3 items: 1 Present, 2 Missing)

Asset detail has a Work Orders tab listing all WOs for the asset (`assets/[id]/page.tsx:236`) — **Present**. Quick filters (status/priority/assignee) and the extended Filters panel on that tab — **Missing** (it's a plain table; the main WO list page has rich filters but no asset filter param either).

## 8. QR Codes / Barcodes (16 items: 6 Present, 4 Partial, 6 Missing)

| Requirement | Status | Note |
|---|---|---|
| QR support for assets | Present | Auto-generated `SERVIQ-<ts>-<rand>` string on create (web + mobile + CSV import) |
| UPC/barcode support | Partial | QR only — mobile scanner is `barcodeTypes: ['qr']` (`mobile/src/screens/QRScannerScreen.tsx`); no Code128/EAN/UPC |
| Mobile scan pulls up asset | Present | Resolves URL/UUID/`qr_code`, org-verified |
| Auto QR generation | Present | On save, not on barcode entry |
| Attach an existing barcode number to an asset | Missing | `qr_code` is not user-editable on any form |
| Download/save QR | Partial | Asset detail QR tab + print — but renders via **external `api.qrserver.com`** (availability + leaks asset ids to a third party); bulk PDF is local (`qrcode` → `@react-pdf`) |
| Multi-select → Download Labels | Present | `POST /api/assets/export-qr` from list multi-select |
| All-assets QR download w/ random barcode backfill | Partial | Every asset already gets a QR at creation (backfill unnecessary), but export is selection-based, no one-click "all assets" |
| Avery 1"×2⅝" label format | Missing | Layouts are 2/4/6-per-A4 cards (`api/assets/export-qr/route.tsx:13-19`) — arguably **exceeds** docs with selectable densities, but no label-sheet format |
| Label fields: location, barcode #, asset name | Partial | Renders name + subtitle + category; no barcode number or location name line |
| 30/page, 5000+ export, 50-char column fallback, logo | Missing | Max 6/page; no scale testing/pagination rules; no logo |
| Omit assets w/o barcode | Present (moot) | All assets have codes |

**Exceeds docs:** Spaces also get QR codes (`qr_token` → public occupant request portal `/r/{token}`) with their own bulk PDF export and floor filter — UpKeep has no location-QR request flow.

## 9. Archive / Delete (6 items: 5 Present, 1 Missing)

Retire status ≈ archive: "Retire" quick action on detail, `retired` filter on the list, "Mark Active" to restore — **Present** (equivalent semantics). Multi-select delete with confirmation — **Present** (`assets/page.tsx:48-49`, browser `confirm`). Permanent delete — Present. **Missing**: descendant handling on parent delete (see §1 / AL-01 — orphans instead of cascade-with-warning).

## 10. Locations — Structure & Hierarchy (8 items: 4 Present, 4 Missing)

| Requirement | Status | Note |
|---|---|---|
| 2-level hierarchy (base plans) | Present | Site → Space (`floor` attribute on space) — `dashboard/sites/**`, `spaces` table (sprint-b) |
| Up to 6 levels (Enterprise); spaces nesting sub-locations | Missing | No `parent_space_id`; spaces cannot nest |
| No limit on location count | Present | None imposed (multi-site flag gates a 2nd *site* on single-site plans — plan-based, matches spirit) |
| WO tied to exact location; location-only WOs | Present | `work_orders.site_id` + `space_id`; asset optional on WO create |
| Move location to a different parent (sub-locs move too) | Missing | Space edit form (name/floor/description) cannot change `site_id`; sites have no parent |
| Location-based permissions | Missing | No per-user site scoping (`build-web.md` §10) |

## 11. Locations — List UI (5 items: 3 Present, 2 Partial)

Sites nav entry, "Add Site" button, CSV import/export — **Present** (`dashboard/sites/page.tsx`). Expandable in-list tree of sublocations — **Partial**: spaces live on a separate per-site page (`sites/[id]/spaces/page.tsx`, grouped by floor) rather than expanding inline.

## 12. Location Detail Tabs (6 items: 6 Missing)

There is **no site detail page** — only edit and a spaces list. Details / Work Orders / Assets / Files / Parts / Floor Plans tabs are all missing. The underlying data exists for three of them (`work_orders.site_id`, `assets.site_id`, `inventory_items.site_id`), so a tabbed site page is mostly UI work; Files and Floor Plans need storage/schema.

## 13. Create Location & Sub-Location (7 items: 4 Present, 3 Missing)

Present: required name (plus AR name — exceeds), address + city, immediate list refresh, sub-location creation per site ("Add Space"). Missing: GPS coordinates, assigning workers/teams/vendors/customers to a location, creating a sub-location by setting a Parent Location field on a generic create form.

## 14. Edit Location (6 items: 2 Present, 1 Partial, 3 Missing)

Web edit — **Present** (`sites/[id]/edit/page.tsx`: name EN/AR, city, address, invoicing_enabled). Field parity — **Partial** (no parent location, no team/customer/vendor assignment). Mobile — **Missing**: the mobile app has no locations screens at all (`build-mobile.md` navigation: Home/WorkOrders/Assets/Profile only).

## 15. Floor Plans (8 items: 8 Missing)

No floor plan upload, viewer, or mapping points (asset/custom points, colors, repositioning). `build-web.md` §18: "Floor plans / maps / geolocation — none."

## 16. Location Import / Update (31 items: 9 Present, 3 Partial, 19 Missing)

Present: sites CSV import/export and spaces CSV import (`/api/spaces/bulk-import`) / export; Name and Address columns; "export current" as an update-prep path; basic file choose. Partial: per-row error surfacing exists on the *asset* importer (`assets/import/page.tsx`) but the guided review is thin for locations; template download exists for assets, unclear/absent for sites. Missing: only `.csv` (no tsv/xls/xlsx/xml), **no update-by-ID matching (imports create only)**, no manual row entry, no column-matching step with warnings/green checks, no ignore-column, no review step with error export or Find-and-Replace bulk update, no partial-failure report with downloadable error rows, no Parent Location / Latitude / Longitude / Assigned-email / Team / Customer / Vendor columns.

---

### To-Dos

- [ ] **AL-01 — Handle descendants when deleting a parent asset** (Severity: High)
  - What: `assets.parent_asset_id` is `ON DELETE SET NULL`, so deleting a parent silently promotes children to top level with no warning. Before delete (single + bulk), count descendants via the existing subtree walker and show a warning listing them, with an explicit choice: cascade-delete descendants or keep-and-promote.
  - Where: web `web/src/app/dashboard/assets/page.tsx` (`handleDelete`, `deleteSelected`), `web/src/app/dashboard/assets/asset-hierarchy.ts` (descendants helper exists), delete API/DB (`web/src/app/api/assets/[id]`).
  - Accept: deleting a parent with children shows the descendant count and options; cascade removes the whole subtree; promote is explicit, never silent.

- [ ] **AL-02 — Org-defined custom asset fields** (Severity: High; Phase 2)
  - What: Admin-managed custom field definitions (name, format type: text/number/date/dropdown) under Settings → Assets → Fields; render them on asset create/edit forms; expose as list filters and optional columns; include in CSV export. Store values in the existing `assets.custom_fields` JSONB; definitions in a new `asset_field_defs` table with org-scoped RLS.
  - Where: db new table + migration; web `dashboard/settings` new tab, `dashboard/assets/new|[id]/edit|page.tsx`, `assets/export/page.tsx`.
  - Accept: admin creates a field and it appears on the create form, as a filter, and as a column; deleting a field warns and removes the key from all assets; export includes custom columns.

- [ ] **AL-03 — Asset downtime & reliability tracking** (Severity: High; Phase 2)
  - What: New `asset_downtime_events` table (asset_id, status, started_at, duration/ended_at, created_by, org RLS). Asset detail Reliability panel: current status dropdown, Add Downtime (duration/status/start time), uptime/downtime %, downtime log with date filter (default 30 days) and total. Allow setting asset status from the WO detail page and from mobile WO flow. Highlight not-operational assets in red on the list.
  - Where: db migration; web `dashboard/assets/[id]/page.tsx`, `dashboard/work-orders/[id]/page.tsx`, `dashboard/assets/page.tsx`; mobile `WorkOrderDetailScreen.tsx`.
  - Accept: adding a downtime event changes uptime %; log filterable by range with total; status changeable from a WO on web and mobile; completing a WO does not auto-reset status.

- [ ] **AL-04 — Custom asset statuses** (Severity: Medium; Phase 2)
  - What: Org-defined asset statuses (Settings → Assets → Status tab) usable as downtime statuses alongside built-ins; store in a small org-scoped table.
  - Where: db table; web settings tab; status pickers in `assets/[id]` and downtime entry (depends on AL-03).
  - Accept: an admin-created status appears in status/downtime dropdowns and on the asset list badge.

- [ ] **AL-05 — Asset depreciation** (Severity: Medium; Phase 2)
  - What: Add `residual_price` column (purchase_date/purchase_cost/expected_lifespan_years exist); when all four are set, show a Depreciation panel on asset detail: straight-line rate, end of useful life, current value, plus a year-by-year timeline view.
  - Where: db `assets` column; web `dashboard/assets/new`, `[id]/edit`, `[id]/page.tsx`; `lib/field-catalog.ts` entry.
  - Accept: with all four inputs the panel shows correct straight-line values; with any missing it shows a "complete fields" hint; timeline renders per-year values.

- [ ] **AL-06 — Asset check-in/check-out with cascading** (Severity: Medium; Phase 3)
  - What: Per-asset toggle + optional procedure text; Check Out / Check In actions (web + mobile) with optional notes; custody activity log (who/when/notes); org-level setting to cascade parent check-in/out to children that have the feature enabled, logging cascade attribution per child.
  - Where: db `asset_checkouts` table + asset columns; web `assets/[id]/edit` + detail; mobile `AssetDetailScreen.tsx`; settings toggle.
  - Accept: checked-out asset shows holder + check-in button; activity log records both directions with notes; with cascade on, parent checkout checks out enabled children and each child's log says so.

- [ ] **AL-07 — Asset operation-hours schedules** (Severity: Low; Phase 3)
  - What: Named schedules (operating days, one or more From–To ranges per day) in Settings → Assets; assignable per asset via dropdown; uptime/downtime % (AL-03) computed against scheduled hours; historic downtime keeps the schedule in effect at the time.
  - Where: db `asset_schedules` table + `assets.schedule_id`; web settings + asset forms + reliability calc.
  - Accept: multiple ranges per day savable; assigning a schedule changes uptime % going forward only.

- [ ] **AL-08 — Filters on the asset detail Work Orders tab** (Severity: Medium)
  - What: Add quick filters (status, priority, assignee) and a Filters panel (title search, category, team, created/updated/completed dates, reactive vs PM) to the asset detail WO tab. Reuse the filter components/logic from the WO list page.
  - Where: web `web/src/app/dashboard/assets/[id]/page.tsx` (workorders tab).
  - Accept: filtering by status/priority/assignee narrows the tab list; clear-filters restores all.

- [ ] **AL-09 — Editable barcode numbers + non-QR barcode scanning** (Severity: Medium)
  - What: Expose a barcode/QR value field on asset create/edit (web + mobile) so existing physical labels can be attached (`qr_code` column already exists); widen the mobile scanner to Code128/EAN-13/UPC-A/DataMatrix and resolve by the same column.
  - Where: web `dashboard/assets/new|edit`; mobile `CreateAssetScreen.tsx`, `QRScannerScreen.tsx` (`barcodeTypes`).
  - Accept: entering an existing barcode number then scanning that barcode on mobile opens the asset; uniqueness enforced per org.

- [ ] **AL-10 — Label-sheet export format + label fields** (Severity: Low)
  - What: Add an Avery 1"×2⅝" (30-per-page, 3-column) layout option to the QR label PDF, print the barcode number and site/location name on each label, and add a select-all → export-all-assets path.
  - Where: web `web/src/app/api/assets/export-qr/route.tsx`, `dashboard/assets/page.tsx`.
  - Accept: 30 labels/page aligned to Avery 5160/94200 geometry; labels show name + barcode + location; export works with all assets selected.

- [ ] **AL-11 — Generate asset-detail QR locally instead of api.qrserver.com** (Severity: Medium)
  - What: The asset detail QR tab renders via external `api.qrserver.com` (third-party dependency + leaks asset identifiers). The bulk export already generates QRs locally with the `qrcode` package — reuse it (data-URL) for the detail tab and print view.
  - Where: web `web/src/app/dashboard/assets/[id]/page.tsx` (QR tab).
  - Accept: QR tab renders with network access to Supabase only; print still works; no requests to qrserver.com.

- [ ] **AL-12 — Technician asset-edit ownership rule** (Severity: Low)
  - What: Enforce "technicians may edit only assets they created" (requesters: none): check role + `created_by` in the PATCH route and hide the Edit button accordingly on web/mobile. Confirm this is desired product behavior before shipping — current build allows all org members.
  - Where: web `web/src/app/api/assets/[id]/route.ts`; `dashboard/assets/**` edit buttons; mobile `AssetDetailScreen.tsx`.
  - Accept: technician editing another user's asset gets 403; admins/managers unaffected.

- [ ] **AL-13 — Site detail page with tabs (Details / Work Orders / Assets / Files / Parts)** (Severity: High)
  - What: Add `dashboard/sites/[id]/page.tsx` with tabs: Details (name/address/spaces summary), Work Orders (by `site_id`), Assets (by `site_id`), Parts (`inventory_items.site_id`), Files (new per-site uploads via existing `/api/upload` pattern + a `site_files` table or storage prefix). Link site cards to it.
  - Where: web new page under `dashboard/sites/[id]/`; storage bucket policy if Files added.
  - Accept: each tab lists only records for that site; Files upload/download works org-scoped.

- [ ] **AL-14 — Nested sub-locations (deeper hierarchy)** (Severity: Medium; Phase 3)
  - What: Add `spaces.parent_space_id` self-FK with depth cap (target 6 total levels for Enterprise, gate by plan/flag), cycle guard mirroring `api/assets/hierarchy.ts`, tree rendering on the spaces page, and WO/asset pickers that expand nested spaces.
  - Where: db migration; web `sites/[id]/spaces/**`, space form, `api/spaces/*`.
  - Accept: a space can parent another space; depth 7 rejected server-side; WO created on a nested space reports under that exact space.

- [ ] **AL-15 — Site GPS coordinates and assignments** (Severity: Medium)
  - What: Add latitude/longitude fields and team/vendor/customer/worker assignment to site create/edit (teams and vendors tables exist; customer = nothing today, scope to teams/vendors/users first).
  - Where: db `sites` columns + join table for assignees; web `sites/new`, `sites/[id]/edit`, field catalog.
  - Accept: coordinates persist and display; an assigned team shows on the site (and site detail page per AL-13).

- [ ] **AL-16 — Location-based permissions (per-user site scoping)** (Severity: Medium; Phase 2)
  - What: Optional per-user allowed-sites list; filter lists (WOs, assets, spaces, requests) and pickers to allowed sites; enforce in RLS or API scoping, not just UI.
  - Where: db `user_sites` table + policy updates; web list queries + `middleware`/API scoping; mobile queries.
  - Accept: a user scoped to Site A cannot fetch Site B's assets/WOs via direct PostgREST call.

- [ ] **AL-17 — Floor plans with mapping points** (Severity: Medium; Phase 3)
  - What: Floor Plans tab on site detail (needs AL-13): upload named plan images (name, area, image); click-to-place mapping points (asset or custom label) with color selection and drag-to-reposition; points link to asset detail.
  - Where: db `floor_plans` + `floor_plan_points` tables; storage bucket; web `sites/[id]` new tab.
  - Accept: plan uploads and renders; a placed asset point navigates to that asset; point position/color editable.

- [ ] **AL-18 — Mobile locations (browse + edit)** (Severity: Medium)
  - What: Add a Locations screen set to the mobile app: list sites (search), site detail (spaces, WOs), and edit (name/address) for admin/manager, mirroring web edit fields.
  - Where: mobile `src/navigation/index.tsx`, new screens under `src/screens/`.
  - Accept: manager edits a site name on mobile and it appears on web; requester/technician see read-only.

- [ ] **AL-19 — Location import wizard upgrades** (Severity: Medium; Phase 2)
  - What: Upgrade sites/spaces import: include the record ID column so re-imports update instead of duplicate; add a column-matching step (warn on unmatched, dropdown remap, ignore); review step with row-level validation errors and export-error-rows; support .xlsx (parse via a light sheet parser); add lat/long, parent-location, team/vendor/user-email columns as those fields land (AL-14/15).
  - Where: web `dashboard/sites/page.tsx` import path, `api/spaces/bulk-import/route.ts` (add upsert-by-id), possibly a shared importer component with `assets/import/page.tsx`.
  - Accept: re-importing an exported file with a changed name updates the existing site (no duplicate); invalid rows are reported and downloadable; xlsx file imports.

- [ ] **AL-20 — Re-parent spaces + inline site→space tree** (Severity: Low)
  - What: Allow changing a space's `site_id` on the space edit form (org-checked), and add an expand affordance on the Sites list that reveals that site's spaces inline.
  - Where: web `dashboard/spaces/[sid]/edit`, `api/spaces/[id]`, `dashboard/sites/page.tsx`.
  - Accept: moving a space re-homes it (its assets/WOs keep their own site_id snapshots); expanding a site card lists its spaces without navigation.

- [ ] **AL-21 — Wire assets.space_id into asset forms** (Severity: Medium)
  - What: `assets.space_id` exists in the DB and drives the WO "Space Assets" commissioning tab, but no asset form ever sets it — location is a free-text `sub_location`. Add a Space picker (filtered by selected site) to asset create/edit on web (and mobile), keeping `sub_location` as an optional note.
  - Where: web `dashboard/assets/new/page.tsx`, `[id]/edit/page.tsx`, `api/assets` POST/PATCH allowlist, field catalog; mobile `CreateAssetScreen.tsx`.
  - Accept: an asset assigned to a space appears in that space's WO Space-Assets panel; changing site clears a mismatched space.

- [ ] **AL-22 — Mobile asset edit: full field coverage** (Severity: Medium)
  - What: Mobile edit omits status, purchase date, warranty expiry, purchase cost, photos, and parent asset. Add status selector, date/cost fields, photo add (reuse the WO photo pipeline), and a parent-asset picker that calls the same server-side hierarchy validation.
  - Where: mobile `src/screens/CreateAssetScreen.tsx`, `AssetDetailScreen.tsx`; reuse `web/src/app/api/assets/[id]` PATCH or direct Supabase with an RPC depth check.
  - Accept: technician can retire an asset and set warranty expiry from mobile; parent assignment respects the 4-level cap.

- [ ] **AL-23 — "Include child assets / sub-levels" roll-up filter** (Severity: Low)
  - What: The base no-roll-up behavior is correct, but there is no way to opt in to including descendants when filtering work orders by an asset (or a site's spaces). Add an "include child assets" toggle wherever WOs are filtered by asset.
  - Where: web `dashboard/work-orders/page.tsx` (asset filter, if added) and `dashboard/assets/[id]/page.tsx` WO tab (pairs with AL-08); reuse `getDescendantIds` from `dashboard/assets/asset-hierarchy.ts`.
  - Accept: with the toggle on, a parent asset's WO tab also lists its children's WOs (visibly attributed to the child); off, exact matches only.

---

# Section 2 — Market Comparison: Serviq-FM vs CMMS/CAFM Leaders

Compared the current Serviq-FM build (web + mobile + DB inventories: `build-web.md`, `build-mobile.md`, `build-db-security.md`) against UpKeep and MaintainX (SMB/mid-market bar — Limble/Fiix/eMaint track the same envelope), and IBM Maximo and Facilio (enterprise bar), across 14 capability areas. **Headline: Serviq-FM is fully competitive in 3 of 14 areas (work orders, occupant requests, multi-site), partial in 5 (PM, assets, inventory, mobile, reporting), and absent in 6 (meters, dispatch/scheduling, API/integrations, IoT, security certifications, AI).** Its genuine differentiators — native Arabic/RTL, ZATCA Phase-2 e-invoicing, per-tenant form configuration, and a multi-tenant platform-ops back office — are things none of the four comparators offer for the Saudi market. The biggest parity blockers for SMB deals are mobile offline mode, meters, purchase orders, dispatch calendar, and a working push pipeline; enterprise items (SSO/SCIM, API/webhooks, IoT/BMS, energy analytics) are labeled Phase 2/3 below.

## 2.1 Capability comparison table

Legend: **Has** = production-grade parity · **Partial** = exists but missing table-stakes depth · **No** = absent.

| Capability area | Serviq-FM today | UpKeep | MaintainX | IBM Maximo | Facilio |
|---|---|---|---|---|---|
| Work orders | **Has** | Has | Has | Has | Has |
| Preventive maintenance | **Partial** (calendar-only) | Has (calendar + meter) | Has | Has | Has |
| Assets / EAM | **Partial** | Has | Has | Has (full EAM) | Has |
| Meters & readings | **No** | Has | Has | Has | Has (incl. utility/BMS) |
| Inventory & purchasing | **Partial** (parts only, no PO) | Has | Has | Has (full procurement) | Has |
| Requests / occupant portal | **Has** | Has | Has | Has (service requests) | Has (tenant portal) |
| Scheduling / dispatch board | **No** | Has | Has | Has (incl. crews/labor) | Has |
| Mobile + offline | **Partial** (app yes, offline no) | Has | Has (offline-first) | Has (Maximo Mobile) | Has |
| Reporting / BI | **Partial** (fixed PDFs) | Has | Has | Has (Cognos/BIRT) | Has (energy/portfolio BI) |
| Integrations / public API | **No** | Has (API, Zapier) | Has (API, integrations) | Has (REST/OSLC, MIF) | Has (low-code platform) |
| IoT / condition monitoring | **No** | Has (UpKeep Edge sensors) | Partial (via integrations) | Has (Monitor/Predict) | Has (core strength: BMS/FDD) |
| Multi-site / portfolio | **Has** | Has | Has | Has | Has |
| Security & compliance certs (SOC 2/ISO, SSO, MFA) | **No** | Has (SOC 2, SSO) | Has (SOC 2, SAML) | Has (full enterprise) | Has (SOC 2, ISO 27001) |
| AI features | **No** | Has (AI assist) | Has (CoPilot) | Has (Predict/watsonx) | Has (FDD/predictive) |

## 2.2 Per-area status and nuance

**Work orders — Present.** Six-status lifecycle with server-enforced close, tasks/checklists with templates, comments with email notify, photos with retention policy, parts consumption, digital sign-off, per-WO PDF export, audit history, team + additional-worker assignment, duplicate-open-WO warning (`build-web.md` §2). Mobile covers status transitions, comments, photo upload, and a wall-clock work timer (`build-mobile.md` §2.4). Gaps vs leaders: no failure/problem-cause-remedy codes, no web-side labor time logs (only started→completed diff), mobile cannot edit, assign, or complete checklists. **Exceeds market:** server-side per-tenant field-config enforcement (`web/src/lib/fieldEnforcement.ts`, `build-web.md` §0) is a Maximo-Application-Designer-class capability UpKeep/MaintainX do not offer at this depth.

**Preventive maintenance — Partial.** Calendar-based generation via hourly cron with fail-closed auth, compliance dashboard, month calendar, days-of-week, multi-asset creation, end dates, archive (`build-web.md` §5). Missing table stakes: meter/usage-based triggers, checklists attached to schedules (checklists only apply at manual WO creation), `lead_time_days` column written but never read by the cron (`build-db-security.md` §3.9), no workload balancing. Mobile is read-only (upcoming widget only, `build-mobile.md` §2.2).

**Assets — Partial.** 4-level parent hierarchy with server depth guard, QR codes + bulk QR PDF export (2/4/6 per A4, floor filter), CSV import/export, JSONB custom fields, lifecycle cost roll-up, decommission workflow that suspends PMs and creates a WO (`build-web.md` §3). Missing vs leaders: depreciation, downtime/uptime tracking, criticality ranking (the asset-health PDF references `criticality`/`last_pm_at` columns nothing populates), document/manual attachments, meters. Mobile asset detail lacks photos, QR display, and a create-WO shortcut (`build-mobile.md` §2.7).

**Meters — Missing.** No module, screens, or tables anywhere (`build-web.md` §18, `build-mobile.md` §7). Every comparator has runtime/gauge meters driving PM.

**Inventory & purchasing — Partial.** Parts CRUD with min-level alerts, CSV import/export, WO parts consumption decrementing stock, invoice line-item parsing (`build-web.md` §7). Missing: purchase orders (only notification stubs exist), stock transaction ledger (adjust-stock notes are discarded), multi-warehouse, barcode support, reorder automation.

**Requests — Present.** Anonymous per-space QR portal → triage queue → approve-to-WO with priority/due-date → bilingual tracking stepper via tokenized link, with email + push notifications throughout (`build-web.md` §8). **Exceeds market for property verticals:** the anonymous space-QR + no-login tracking flow fits compound/hotel/school occupants better than UpKeep's or MaintainX's account-based request portals. Gaps: the logged-in `/request` wizard bypasses the approval queue (inserts straight into `work_orders`), and requesters have no history view.

**Scheduling / dispatch — Missing.** No WO calendar, no dispatch/planner board, no drag-drop assignment, no technician workload view (`build-web.md` §18). Only bulk-assign on the list page and a PM-only calendar. This is a daily-workflow gap for maintenance managers — both UpKeep and MaintainX ship calendar/workload views.

**Mobile + offline — Partial.** Real native app (Expo SDK 54) with EN/AR, QR scan-to-asset, photos, timer, OTA updates, store collateral (`build-mobile.md`). Missing: **offline mode entirely** (WatermelonDB is in `package.json` but never imported — `build-mobile.md` §7); push notification **delivery is functionally broken** — mobile writes tokens to `users.push_token` while `/api/push` reads the never-populated `user_devices` table (`build-db-security.md` §3.7); no notification tap/deep-linking; no checklists, assignment, WO editing, parts, signatures, or free date picker. MaintainX's offline-first mobile is its core selling point; this is the single largest SMB parity gap.

**Reporting / BI — Partial.** Four standard PDF reports, dashboard KPIs and Recharts breakdowns, per-WO/inspection/dashboard PDFs (`build-web.md` §13). The "Report Builder" panel is decorative; "Schedule" shows a coming-soon alert. Missing: custom report builder, scheduled email reports, MTTR/MTBF, cost dashboards, SLA breach reports, CSV export of reports. Some dashboard deltas are hard-coded decorations (`build-web.md` §1) — remove or wire to real data before a competitive demo.

**Integrations / API — Missing.** The `api_access` feature flag persists but gates nothing; there is no public API, no webhooks, no Zapier/Make connector (`build-web.md` §0, §18). Even SMB buyers now shortlist on "does it have an API."

**IoT / condition monitoring — Missing.** The assets page has a non-functional "Smart Monitoring / IoT" promo card only (`build-web.md` §3). Facilio's entire wedge is BMS/FDD; UpKeep sells its own sensors. Phase 3 territory, but the promo card sets an expectation the product can't meet.

**Multi-site — Present.** Site → space (floor) model with per-site invoicing gates, space QR tokens, CSV import/export, `multi_site` plan flag (`build-web.md` §4). Gap vs leaders: no per-user site scoping (any user sees all org sites — `build-web.md` §10), and no deeper location tree (building/wing/zone).

**Security & compliance certifications — Missing as a market capability.** Password-only auth, no MFA, no SSO/SAML/SCIM, no self-service password reset (`build-db-security.md` §2.4), no SOC 2 / ISO 27001 program, and open RLS holes on seven tables plus a public `requests` SELECT policy (`build-db-security.md` §2.2) that would fail any security questionnaire. Counterpoint worth stating in sales collateral once fixed: the org-scoped tenancy pattern, session-bound HMAC impersonation, and platform audit trail (`build-web.md` §16) are genuinely well-built foundations.

**AI features — Missing.** The on-demand machine translation button on WO/asset detail (`build-web.md` §0) is useful but is not an AI CMMS feature. UpKeep, MaintainX (CoPilot), Maximo (Predict/Assist), and Facilio all ship AI-assisted triage, procedure generation, or predictive maintenance.

**Where the build exceeds the comparison set (defensible differentiation):**
- **ZATCA Phase-2 TLV QR VAT invoicing** (`web/src/lib/zatca.ts`, `build-web.md` §12) — none of the four comparators produce compliant Saudi e-invoices natively.
- **Bilingual EN/AR with RTL, per-record Arabic fields, and machine translation** (`build-web.md` §0) — Maximo/Facilio support Arabic locales at enterprise cost; UpKeep/MaintainX do not meaningfully.
- **Platform admin back office** — MRR/ARR + churn dashboards, tenant health scoring, HMAC-signed impersonation, offboarding with full data export (`build-web.md` §16). Not buyer-facing, but SaaS operational maturity most seed-stage CMMS vendors lack.
- **Vertical inspection templates with auto-WO on failed items** (`build-web.md` §6) — parity with paid inspection add-ons at UpKeep/MaintainX, tuned to Saudi verticals (school/retail/compound/hotel).
- **Per-tenant form-field configuration with server enforcement** (`build-web.md` §0) — an enterprise-tier capability shipped early.

### To-Dos

- [ ] **MKT-01 — Fix the broken mobile push notification pipeline** (Severity: Critical)
  - What: Mobile registers Expo tokens to `users.push_token`/`push_platform`, but `/api/push` reads the never-populated `user_devices` table, so every push to a mobile-registered user 404s with "No active devices." Pick one schema (recommend `user_devices` for multi-device) and wire both writer and reader to it; delete or secure the orphaned `send-push` edge function.
  - Where: `mobile/src/lib/notifications.ts`, `web/src/app/api/push/route.ts`, `supabase/functions/send-push/index.ts`, `web/src/app/api/users/delete/route.ts`.
  - Accept: A push sent on WO assignment arrives on a real device; `notification_log` shows `status=sent`; sign-out deactivates the device row.

- [ ] **MKT-02 — Ship self-service password reset** (Severity: Critical)
  - What: No `resetPasswordForEmail` exists anywhere; a locked-out sole admin has no recovery path. Add "Forgot password" to both web login pages and mobile LoginScreen using Supabase's built-in reset email + a `/auth/reset` page to set the new password.
  - Where: `web/src/app/login/client/page.tsx`, `web/src/app/login/employee/page.tsx`, new `web/src/app/auth/reset/page.tsx`, `mobile/src/screens/LoginScreen.tsx`.
  - Accept: Reset email delivers a working link; new password logs in; flow works in AR and EN.

- [ ] **MKT-03 — Build mobile offline mode with sync queue** (Severity: High)
  - What: Technicians in plant rooms/basements need to view assigned WOs and log status changes, comments, photos, and time offline, syncing when connectivity returns. WatermelonDB is already in `mobile/package.json` (unused) — use it or a simpler AsyncStorage write-queue for a first cut (cache assigned WOs + queue mutations, server-wins conflict policy).
  - Where: `mobile/src/` (new `lib/offline/` module), `WorkOrdersScreen.tsx`, `WorkOrderDetailScreen.tsx`.
  - Accept: Airplane mode → open assigned WO, change status, add comment/photo → reconnect → all changes persist to Supabase; queued state is visible to the user.

- [ ] **MKT-04 — Add meters and meter-based PM triggers** (Severity: High)
  - What: New `meters` (asset-linked, unit, type) and `meter_readings` tables with org-scoped RLS; reading entry on web asset detail and mobile; PM schedules gain a meter-trigger mode (generate WO when reading crosses interval/threshold) alongside calendar mode.
  - Where: DB migration; `web/src/app/dashboard/assets/[id]/page.tsx` (new Meters tab), `web/src/app/dashboard/pm-schedules/*`, `web/src/app/api/cron/pm-generate/route.ts`; mobile asset detail.
  - Accept: Reading history renders with a trend; a meter-based PM generates a WO when the interval elapses; readings are org-isolated under RLS.

- [ ] **MKT-05 — Build purchase orders and a stock transaction ledger** (Severity: High)
  - What: PO module (draft → submitted → approved → received, vendor-linked, line items, receive-into-stock) and an `inventory_transactions` ledger recording every stock movement (WO consumption, adjustment with the currently-discarded note, PO receipt). Notification stubs (`purchaseOrderNotifications.ts`, `po_*` pref keys) already exist — wire them.
  - Where: New `web/src/app/dashboard/purchase-orders/*`, DB migration, `web/src/app/dashboard/inventory/[id]/page.tsx` (ledger tab), WO Parts Used handler.
  - Accept: Receiving a PO increments stock and writes a ledger row; adjust-stock notes persist; item detail shows full movement history.

- [ ] **MKT-06 — Add a work-order calendar / dispatch board** (Severity: High)
  - What: Calendar (month/week) and per-technician workload lane view of WOs by due date, with drag-to-reassign/reschedule and an unassigned queue. The PM calendar (`pm-schedules/calendar/page.tsx`) is a starting pattern.
  - Where: New `web/src/app/dashboard/work-orders/calendar/page.tsx` (or `/dispatch`), reusing `api/work-orders/[id]` PATCH.
  - Accept: Manager drags a WO between technicians/days and the change persists + notifies the assignee; overdue WOs are visually flagged.

- [ ] **MKT-07 — Bring mobile work-order execution to parity** (Severity: High)
  - What: Add to mobile WO detail: task/checklist completion (`work_order_tasks` is never queried on mobile), assign/reassign picker, edit of title/priority/due, parts consumption, close-out signature capture, and a real date-time picker on create (currently 5 preset pills only).
  - Where: `mobile/src/screens/WorkOrderDetailScreen.tsx`, `CreateWorkOrderScreen.tsx`; reuse web conventions for `work_order_tasks` and parts comments.
  - Accept: Technician completes a checklist and consumes a part from mobile; stock decrements; manager reassigns a WO from mobile and the assignee is notified.

- [ ] **MKT-08 — Real report builder, scheduled reports, and MTTR/MTBF/cost KPIs** (Severity: High)
  - What: Wire the decorative Report Builder (date range + category filters) to actual queries with CSV + PDF output; add MTTR, MTBF (needs downtime data — see MKT-14), SLA-breach counts, and cost-by-asset/site rollups; implement scheduled email reports via a cron (the "Schedule" button currently alerts "coming soon"). Also remove hard-coded KPI deltas on the dashboard.
  - Where: `web/src/app/dashboard/reports/page.tsx`, `web/src/app/api/reports/*`, new cron route + `report_schedules` table, `lib/notifications/reportNotifications.ts` (stub exists), `components/pages/DashboardOverviewPage.tsx`.
  - Accept: A filtered custom report downloads as CSV and PDF with real data; a weekly scheduled report email arrives; MTTR renders from `started_at→completed_at`.

- [ ] **MKT-09 — SLA escalation engine (basic now; contract SLAs Phase 2)** (Severity: High)
  - What: Cron that detects due-soon/overdue WOs and fires the existing-but-never-invoked `notifyWOOverdue` helper, with escalate-to-manager after N hours. Phase 2: per-priority/per-site SLA policies (response + resolution targets) and breach reporting for FM contract compliance.
  - Where: New `web/src/app/api/cron/sla-escalate/route.ts` (mirror `pm-generate` auth), `web/src/lib/notifications/workOrderNotifications.ts`; Phase 2 adds an `sla_policies` table.
  - Accept: An overdue WO produces exactly one escalation email/push to assignee and manager; escalations are logged in `notification_log`.

- [ ] **MKT-10 — Route logged-in requesters through the approval queue and give them history** (Severity: High)
  - What: The `/request` wizard inserts straight into `work_orders` (`source='requester'`), bypassing triage. Change it to insert into `requests` (status pending) and add a "My Requests" list with status for logged-in requesters. Mobile requesters currently can't submit anything — add the same flow there as a sub-item.
  - Where: `web/src/app/request/page.tsx`, `web/src/app/dashboard/requests/*`; new mobile screen.
  - Accept: A requester submission appears in the triage queue; approve creates the WO and the requester sees status progression in their history view.

- [ ] **MKT-11 — Per-user site scoping** (Severity: High)
  - What: Optional restriction of technicians/requesters to specific sites (a `user_sites` join table + filters in lists, dropdowns, and RLS or route checks). All comparators scope users to locations; multi-site Saudi operators (compounds, retail chains) will ask on day one.
  - Where: DB migration; `web/src/app/dashboard/users/[id]/edit`, list-page queries, mobile screen queries.
  - Accept: A site-scoped technician sees only WOs/assets for their sites on web and mobile; admins remain unscoped.

- [ ] **MKT-12 — In-app notification center + realtime updates** (Severity: Medium)
  - What: Web bell with unread list backed by an in-app notification channel (NotificationService already logs to `notification_log`), and Supabase realtime subscriptions on WO list/detail so multi-user boards don't go stale. Mobile: make the inert Home bell open a list and add a notification tap → deep-link handler (no `linking` config exists today).
  - Where: `web/src/lib/NotificationService.ts`, new bell component in `web/src/components/Sidebar.tsx`/topbar; `mobile/src/lib/notifications.ts` (response listener), `mobile/src/navigation/index.tsx` (linking config).
  - Accept: A WO assignment shows an unread badge in-app; tapping a push on mobile opens that WO; a status change by user B appears for user A without manual refresh.

- [ ] **MKT-13 — Attach checklists to PM schedules and honor lead_time_days** (Severity: Medium)
  - What: Let a PM schedule reference a `checklist_templates` row so generated WOs include tasks; make the cron read the existing-but-dead `lead_time_days` column instead of the hardcoded 2-day cutoff.
  - Where: `web/src/app/dashboard/pm-schedules/new` + `[id]/edit`, `web/src/app/api/cron/pm-generate/route.ts` (WO-shape block + the 2-day cutoff around line 68).
  - Accept: A cron-generated PM WO contains the template's tasks; a schedule with `lead_time_days=7` generates 7 days ahead.

- [ ] **MKT-14 — Asset downtime tracking and criticality** (Severity: Medium)
  - What: Add downtime logging (out-of-service → back-in-service periods, derivable from `under_maintenance` status changes plus manual entry) and a criticality field on the asset form; populate the `criticality`/`last_pm_at` columns the asset-health PDF already references but nothing writes. Feeds MTBF/uptime % in MKT-08.
  - Where: DB migration (`asset_downtime` table), `web/src/app/dashboard/assets/[id]/*` forms and detail, `web/src/app/api/reports/standard/[type]` (asset-health).
  - Accept: Marking an asset under-maintenance opens a downtime record closed on reactivation; asset detail shows uptime %; the asset-health report displays real criticality.

- [ ] **MKT-15 — Failure codes on work-order closure** (Severity: Medium)
  - What: Optional problem/cause/remedy code picklists captured at completion, feeding a top-failure-modes report. Standard in Limble/Fiix/Maximo; increasingly expected mid-market.
  - Where: DB migration (`failure_codes` + columns on `work_orders`), `web/src/app/api/work-orders/[id]/close/route.ts`, close modal on WO detail, reports.
  - Accept: Closing a WO can record problem/cause/remedy; a report ranks failure codes by asset category.

- [ ] **MKT-16 — Web labor time logs and rates** (Severity: Medium)
  - What: Mobile has a timer writing `time_log` comment strings + `actual_hours`; web has nothing. Add manual time entries (multiple workers, per-entry duration) in a real `work_order_time_logs` table (replacing comment-string parsing), used by invoicing instead of the started→completed diff.
  - Where: DB migration; WO detail new Time tab (`web/src/app/dashboard/work-orders/[id]/page.tsx`), `web/src/app/dashboard/invoices/new/InvoiceForm.tsx`, mobile timer writes to the same table.
  - Accept: Two technicians log time on one WO; invoice labor derives from summed logs; mobile timer entries appear on web.

- [ ] **MKT-17 — Asset and WO document attachments** (Severity: Medium)
  - What: Upload manuals/warranty certificates/O&M docs (PDF etc.) on assets and WOs, not just photos. Store in an org-scoped private bucket with signed URLs (avoid repeating the public-bucket pattern flagged in the security audit); validate content type and size (upload route currently checks neither).
  - Where: `web/src/app/api/upload/route.ts`, asset + WO detail tabs; DB `documents` table or `document_urls` columns.
  - Accept: A PDF manual uploads to an asset and is downloadable only by org members; upload rejects >20MB or disallowed types.

- [ ] **MKT-18 — Client invoice lifecycle and vendor invoice status updates** (Severity: Medium)
  - What: Client (ZATCA) invoices have no status/payment tracking; vendor invoices have statuses but no UI to change them after creation. Add draft/sent/paid/void + paid-date to client invoices and status transitions to the vendor invoice tab. Add a DB unique constraint on `invoices.invoice_number` (JS timestamp generation is collision-possible).
  - Where: `web/src/app/dashboard/invoices/page.tsx`, `web/src/app/api/invoices/*`, `web/src/app/dashboard/vendors/[id]/page.tsx`; DB status columns + unique index.
  - Accept: Invoice can be marked paid with a date; outstanding-AR total shows on the invoices list; duplicate invoice numbers are impossible.

- [ ] **MKT-19 — Public REST API + webhooks** (Severity: High; Phase 2)
  - What: Tenant-scoped API keys, versioned REST endpoints for WOs/assets/sites/requests/inventory, and webhook subscriptions (wo.created, wo.status_changed, request.submitted). Makes the existing `api_access` feature flag real; UpKeep/MaintainX both expose APIs at mid tiers.
  - Where: New `web/src/app/api/v1/**`, `api_keys` + `webhook_subscriptions` tables, flag enforcement in `web/src/lib/featureFlags.ts`; rate limiting required (none exists today).
  - Accept: A key-authenticated GET/POST on work orders respects org scoping and the flag; a webhook fires with HMAC signature on WO creation; keys are revocable.

- [ ] **MKT-20 — SSO (SAML/OIDC) and SCIM provisioning** (Severity: High; Phase 2)
  - What: Enterprise/government Saudi buyers require Azure AD/Entra SSO. Supabase supports SAML SSO natively — wire domain-based IdP routing on the login pages; add SCIM (or scheduled directory sync) for user provisioning/deprovisioning mapped to Serviq roles.
  - Where: `web/src/app/login/*`, Supabase auth config, `web/src/app/api/users` provisioning path, mobile login.
  - Accept: A user at an SSO-enabled tenant authenticates via Entra ID on web and mobile; deprovisioning in the IdP deactivates the Serviq user.

- [ ] **MKT-21 — MFA (TOTP) for tenant and platform admins** (Severity: High)
  - What: Supabase supports TOTP MFA — expose enrollment in Settings → Account and enforce it for `platform_admins` (they can impersonate any tenant, making them the highest-value target).
  - Where: `web/src/app/dashboard/settings/page.tsx`, `web/src/app/login/employee/page.tsx` + middleware AAL check for `/platform/*`.
  - Accept: A platform admin cannot reach `/platform` without a second factor; tenant users can opt in; recovery codes are issued.

- [ ] **MKT-22 — SOC 2 readiness program** (Severity: Medium; Phase 2)
  - What: Process + engineering prerequisites for SOC 2 Type II (the cert every security questionnaire asks for): close the no-RLS tables and public bucket listings from the security audit, commit schema as real migrations under `supabase/migrations/`, add security headers/CSP, rate limiting, a tenant-admin-visible audit log page, and documented policies.
  - Where: DB policies (see `build-db-security.md` §4 P0 list), `web/next.config.mjs`, `supabase/migrations/`, new tenant audit page.
  - Accept: All tables have RLS or revoked grants; anon key cannot read any cross-tenant data; a security-questionnaire answer sheet exists.

- [ ] **MKT-23 — IoT/BMS condition monitoring** (Severity: Medium; Phase 3)
  - What: Ingest endpoint (MQTT/HTTP) for sensor and BMS readings mapped to assets/meters, threshold rules that auto-create WOs, and a readings dashboard. Facilio-class differentiation for Saudi smart-building mandates; depends on MKT-04 (meters) and MKT-19 (API). Until then, remove or reword the non-functional "Smart Monitoring / IoT" promo card.
  - Where: New ingest service/edge function, rules table, asset detail condition tab; `web/src/app/dashboard/assets/page.tsx` (promo card).
  - Accept: A simulated temperature feed breaching a threshold auto-creates a high-priority WO linked to the asset.

- [ ] **MKT-24 — Energy analytics** (Severity: Medium; Phase 3)
  - What: Utility meter tracking (electricity/water/gas) per site with consumption dashboards, cost trends, and anomaly flags — Facilio/Maximo territory, relevant to Saudi ESCO/Vision-2030 efficiency programs. Builds on MKT-04 meter infrastructure.
  - Where: Web reports/dashboards; meters tables with `type=utility`; per-site rollups.
  - Accept: Monthly kWh per site charts with cost; month-over-month anomaly highlighted.

- [ ] **MKT-25 — Space & move management + floor plans** (Severity: Medium; Phase 3)
  - What: Extend the site→space model with floor-plan uploads (image/SVG pin-drop for assets/spaces), occupancy attributes, and move requests — the CAFM half of the product for compound/office portfolios. No floor plans/maps/geolocation exist today.
  - Where: `web/src/app/dashboard/sites/[id]/spaces/*`, storage bucket for plans, `spaces` schema extension.
  - Accept: A floor plan renders with clickable space pins that open the space/asset; a move request follows the request approval workflow.

- [ ] **MKT-26 — AI assist features** (Severity: Medium; Phase 2)
  - What: Match the CoPilot class: AI-drafted WO descriptions/checklists from a photo or short prompt, request auto-categorization/priority suggestion at triage, and PM interval suggestions from WO history. Arabic-first prompting is the differentiator competitors can't easily copy.
  - Where: New `web/src/app/api/ai/*` routes (server-side LLM calls), WO create form, requests triage page; extend the existing `TranslateButton` pattern.
  - Accept: Approving a request shows an AI-suggested category/priority the manager can accept; WO create can generate a task list from the title in EN and AR.

- [ ] **MKT-27 — Implement custom branding per tenant** (Severity: Low)
  - What: The `custom_branding` flag persists but gates nothing. Apply tenant logo + accent color to dashboard chrome, invoice PDFs, and notification emails.
  - Where: `organisations` (logo_url/brand_color), settings Organisation tab, `web/src/app/api/invoices/generate`, `web/src/lib/email.ts`.
  - Accept: With the flag on, an uploaded logo appears in the sidebar, invoice PDF, and request emails; flag off falls back to Serviq branding.

- [ ] **MKT-28 — Barcode formats beyond QR for parts and assets** (Severity: Low)
  - What: Mobile scanner reads QR only (`barcodeTypes: ['qr']`). Add Code128/EAN/DataMatrix so existing manufacturer part/asset labels scan, and allow scan-to-find in inventory once parts exist on mobile (pairs with MKT-07).
  - Where: `mobile/src/screens/QRScannerScreen.tsx` (barcodeTypes array), inventory lookup by SKU.
  - Accept: An EAN-13 label on a part resolves to the inventory item; unknown codes offer create-new.

---

# Section 3 — FM Operator's Lens (20-year GCC FM practitioner review)

I evaluated the current Serviq-FM build (web inventory `build-web.md`, mobile inventory `build-mobile.md`, data/security audit `build-db-security.md`, spot-checked against the repo) against what a hard+soft FM contract in Saudi actually needs day-to-day: reactive triage, SLA regimes with penalties, statutory compliance, contractor control, energy, stores, month-end client packs, and Saudi-calendar realities. Verdict: this is a competent **light CMMS for a single in-house maintenance team** — the reactive WO loop, QR occupant portal, PM generation, and ZATCA invoicing genuinely work. It is **not yet an FM contract platform**: of ~18 requirement areas I scored, roughly 5 are Present, 7 Partial, 6 Missing. The three things that would make me walk away today: push notifications to technicians are functionally broken (schema split), there is no SLA/escalation engine (my penalty exposure lives or dies on this), and there is zero statutory-compliance tracking (civil defense will not accept "we have a PM schedule").

---

## Comparison by requirement area

### A. Reactive call handling & dispatch

| Feature | Status | Evidence |
|---|---|---|
| WO lifecycle (new→assigned→in_progress→on_hold→completed→closed) with sign-off gate | **Present** | `web/src/app/dashboard/work-orders/[id]/page.tsx` (nextStatuses map, typed sign-off, close via `/api/work-orders/[id]/close`) |
| Occupant QR request portal + anonymous tracking link | **Present** — exceeds expectations | `web/src/app/(public)/r/[token]/page.tsx`, `/track/[token]`, `api/requests/submit` |
| Triage queue (approve→WO with priority/due, reject with reason, requester emails) | **Present** | `web/src/app/dashboard/requests/page.tsx`, `api/requests/[id]/approve` |
| Logged-in requester flow routes through triage | **Partial** | `web/src/app/request/page.tsx` inserts straight into `work_orders` with `source='requester'` — bypasses the approval queue the dashboard team lives in. Two intake paths, one uncontrolled. |
| Dispatcher board (calendar/drag-drop, technician workload view) | **Missing** | Calendar exists only for PM (`pm-schedules/calendar/page.tsx`). Dispatcher assigns from a table with no view of who is loaded. |
| Push notification to technician on assignment | **Partial → functionally broken** | Mobile writes tokens to `users.push_token` (`mobile/src/lib/notifications.ts`); web `/api/push` reads `user_devices`, which nothing populates (`build-db-security.md` §3.7). Every push returns "No active devices". My dispatcher assigns a critical WO and the technician finds out when he next opens the app. |
| Notification tap → open WO on mobile | **Missing** | No response listener, no deep linking (`mobile/src/navigation/index.tsx`, no `linking` prop). Home bell is decorative. |
| Realtime board updates | **Missing** | Zero Supabase realtime subscriptions in web or mobile; a control-room screen goes stale. |

**Exceeds docs**: per-space QR posters with bulk PDF export (2/4/6-up A4, floor filter) is exactly how you mobilize a tower — better than most mid-market CMMS I've deployed.

### B. SLA / KPI regime (penalty clauses)

| Feature | Status | Evidence |
|---|---|---|
| Per-WO SLA hours + due banners (overdue/amber/green) | **Present** | WO detail SLA banner, `due_at` logic |
| SLA policy engine (priority × category × site → response/resolution matrix, auto-applied) | **Missing** | SLA is a manually typed hours field per WO. On a 3,000-WO/month contract nobody types SLA hours; the matrix must come from the contract. |
| Escalation on breach (notify supervisor → contract manager) | **Missing (half-built)** | `notifyWOOverdue` exists in `web/src/lib/notifications/workOrderNotifications.ts:170` and `wo-hooks.ts:127`, but the hooks file's own comment says "call from a cron" — no cron exists. Verified by grep. |
| Response vs resolution split, SLA stop-the-clock (on_hold reason codes) | **Missing** | `on_hold` has no reason code and no clock impact — my penalty deductions will be disputed with no evidence. |
| MTTR/MTBF, SLA-breach report | **Missing** | `build-web.md` §13 explicitly lists these absent. |

This is the single biggest commercial gap. GCC FM contracts are SLA-penalty contracts; a CMMS that can't prove response/resolution compliance per priority band is a data-entry tool, not a defense.

### C. PPM & statutory / civil-defense compliance

| Feature | Status | Evidence |
|---|---|---|
| PM schedules (7 frequencies, days-of-week, multi-asset, end date, pause/archive) | **Present** | `web/src/app/dashboard/pm-schedules/*`, hourly cron `api/cron/pm-generate` |
| PM compliance % dashboard | **Present** | `pm-schedules/compliance/page.tsx` |
| PM checklists attached to schedules | **Missing** | Cron generates bare WOs with no task list (`build-web.md` §5 "Not present"). A fire-pump weekly test WO without its checklist is worthless as an evidence record. |
| Seasonal schedules (Ramadan/summer shift) | **Partial** | `is_seasonal` + `seasonal_start/end_month` columns display on PM detail but **no UI to set them** and the cron ignores them. Half a feature. |
| `lead_time_days` honored by generator | **Partial** | Column written, cron hardcodes 2 days (`pm-generate/route.ts:68`) — schedules needing 2-week material lead silently generate late. |
| Statutory certificate register (civil defense, elevator, fire NFPA/SBC, water tank/legionella, pressure vessels) with expiry alerts + document upload | **Missing** | Grep for permit/certificate/legionella across `web/src` hits only marketing copy. No document library exists at all (`build-web.md` §17). This alone disqualifies the product for any building where I sign the civil-defense file. |
| Meter/usage-based PM triggers | **Missing** | `build-web.md` §18, confirmed no meter tables/screens anywhere. |
| Inspections with templates, scoring, auto-WO on fail | **Present** — exceeds expectations | `dashboard/inspections/*`; failed pass_fail items auto-create high-priority WOs — genuinely good. Photo item type is stubbed ("upload available after submission" never implemented). |

### D. Contractors, vendors, permits-to-work

| Feature | Status | Evidence |
|---|---|---|
| Vendor register (VAT/CR numbers, specialisation, rating, vendor invoices log) | **Present** | `dashboard/vendors/*` |
| Assign WO to vendor | **Partial — data hazard** | WO edit writes the **vendor id into `assigned_to`**, the same column that otherwise holds user ids (`build-web.md` §11). Joins to `users` silently break, technician-filter queries mis-count. This is a landmine. |
| Vendor invoice status workflow | **Partial** | Statuses exist (pending/approved/paid/disputed) but "no UI to change status after creation" — every vendor invoice is pending forever. |
| Permit-to-work (hot work, confined space, work-at-height) + contractor induction | **Missing** | Nothing in repo. For hard-services subcontracting in KSA this is a Phase-2 must, not a nice-to-have. |
| Vendor SLA / performance derived from WO data | **Missing** | Rating is a manually clicked star. |

### E. Utilities & energy

**Missing entirely.** No meters, no readings, no kWh/water tracking, no tariffs, no benchmarking (grep confirmed: only marketing pages mention energy). For mixed-use portfolios where I bill tenants back for utilities and chase EUI targets, I'd run a spreadsheet next to this product — which is how CMMS deployments die.

### F. Asset lifecycle, condition, CAPEX

| Feature | Status | Evidence |
|---|---|---|
| Asset register with 4-level hierarchy, QR, warranty dates, custom fields, CSV import/export | **Present** | `dashboard/assets/*`, `api/assets/hierarchy.ts` |
| Lifecycle cost (sum of closed-WO actual_cost) | **Present** | Asset detail |
| Decommission flow (retire + suspend PMs + auto-WO) | **Present** — exceeds expectations | Asset detail quick actions |
| PM History tab | **Partial (broken)** | UI exists but data never loaded — always empty (`build-web.md` §3). A broken tab in front of a client is worse than no tab. |
| Downtime tracking / availability % | **Missing** | Asset-health PDF references `criticality`/`last_pm_at` columns no form populates. |
| Condition surveys / condition grade, remaining life, CAPEX plan | **Missing** | Inspections could seed this but there is no condition score or forward plan. |
| Warranty claim workflow | **Missing** | Expiry alerts exist; no claim record, no "this repair was under warranty — don't pay" gate on WO costs. |

### G. Budgets & cost centers

**Missing.** Only `purchase_cost`, `actual_cost`, invoice totals. No cost centers, no budget vs actual, no per-site P&L (grep for budget/cost-center/capex: marketing copy only). A contract FM cannot run monthly commercial reviews out of this system. (Phase 2, but table stakes for enterprise tier.)

### H. Soft services (cleaning, pest, landscaping, waste)

**Partial.** The 12 fixed WO categories (`web/src/app/dashboard/work-orders/page.tsx`, `mobile/src/lib/categories.ts`) include HVAC/Electrical/…/Vehicle/Other — **no Cleaning, Pest Control, Landscaping, or Waste categories**, and the list is hardcoded, not org-configurable. Inspections partially cover cleaning audits. Area-based soft-services scheduling doesn't fit the asset-centric PM model. Minimum fix: configurable categories.

### I. Space / tenant management & fit-out

**Partial.** Sites → Spaces (floor attribute) with QR per space is solid (`dashboard/sites/[id]/spaces`). But there is no tenant entity, no lease/occupancy link, no fit-out request type, no tenant billback. The `vertical` field (school/retail/compound/hotel) shows the ambition without the substance. Phase 2.

### J. Mobilization / handover of new contracts

**Partial — decent.** CSV import for assets, spaces, sites, inventory, vendors + per-org form-field configuration (`web/src/lib/field-catalog.ts`, admin Form Fields tab — genuinely differentiating, exceeds docs) + platform tenant creation with feature flags. Missing: asset import doesn't support parent hierarchy or space assignment, and there is no bulk PM-schedule import — creating 400 PM schedules by hand during mobilization is a week of clerk time.

### K. Month-end client reporting

| Feature | Status | Evidence |
|---|---|---|
| 4 standard PDF reports (asset health, technician performance, PM compliance, WO register) + dashboard PDF | **Present** | `api/reports/standard/[type]` |
| Scheduled/emailed monthly pack | **Missing** | "Schedule" button → `alert('coming soon')` (`dashboard/reports/page.tsx`). |
| Custom report builder | **Missing (decorative)** | Date-range and category checkboxes are not wired; the button downloads the fixed WO register. Shipping a fake control is worse than not shipping it. |
| SLA breach / MTTR / cost reports | **Missing** | `build-web.md` §13. |
| Hard-coded KPI decorations ("+12%", "-5%") on dashboard/WO stats | **Partial (integrity issue)** | `build-web.md` §1, §2. A client rep who spots a fake delta stops trusting every number on the page. |

### L. Spare parts / stores

| Feature | Status | Evidence |
|---|---|---|
| Item register, min levels, low-stock alerts, WO parts consumption decrementing stock, parts → invoice | **Present** | `dashboard/inventory/*`, WO Parts Used tab |
| Stock transaction ledger | **Missing** | Adjust Stock note is "not persisted anywhere" (`build-web.md` §7). My storekeeper cannot answer "who took 40 filters in May". Stock without an audit trail is shrinkage. |
| Purchase orders / reorder | **Missing** | Only notification stubs (`lib/notifications/purchaseOrderNotifications.ts`) and Settings toggles for a module that doesn't exist — actively confusing to admins. |
| Multi-store, parts barcode, reservations | **Missing** | `build-web.md` §7. |
| Mobile parts consumption | **Missing** | Technician in the field cannot book parts (`build-mobile.md` §7) — parts get booked "later", i.e. never, and invoices under-recover. |

### M. Emergency / incident management

**Missing.** `critical` priority is the entire emergency story. No incident record, no escalation tree, no incident report output for client/civil defense. Phase 2, but a compound or mall operator asks in the first demo.

### N. Saudi-specific fit

| Feature | Status | Evidence |
|---|---|---|
| Bilingual EN/AR, per-record AR fields, machine-translate button | **Present** | `web/src/context/LanguageContext.tsx`, `components/TranslateButton.tsx` |
| ZATCA Phase-2 TLV QR on client invoices, VAT/CR fields on org & vendors, 15% VAT | **Present** — exceeds expectations | `web/src/lib/zatca.ts`, `api/invoices/generate` |
| ZATCA-safe sequential invoice numbering | **Partial** | `INV-<year>-<timestamp-suffix>` generated in JS, no DB uniqueness (`build-db-security.md` §3.9). ZATCA e-invoicing expects a tamper-evident sequential counter; collisions or gaps are an audit finding. |
| Invoice statuses / payments / credit notes | **Missing** | `build-web.md` §12 — issue-only billing. |
| Hijri calendar display | **Missing** | Grep: zero hits repo-wide. Low priority but expected in gov/education verticals. |
| Prayer-time / Ramadan-aware scheduling | **Missing** | Zero hits for prayer/ramadan/hijri. Seasonal PM columns (see §C) are the natural hook. |
| Mobile true RTL layout | **Partial** | Text-alignment only, no `I18nManager.forceRTL` (`build-mobile.md` §4/§6). Arabic-first technicians get a half-mirrored app. |

### O. Field team experience (mobile) — where my technicians live

Mobile can: view/filter WOs, change status, comment, photos, wall-clock timer, QR-scan assets, create WOs/assets (`build-mobile.md` §2). That is a fair v1 field app. What breaks the day:

| Gap | Status | Evidence |
|---|---|---|
| WO tasks/checklists on mobile | **Missing** | Web has `work_order_tasks`; mobile never queries them (`build-mobile.md` §7). Technician "completes" a WO with the checklist untouched — PM evidence chain broken. |
| Offline mode | **Missing** | WatermelonDB in package.json, never imported. Plant rooms, basements, parking levels in KSA towers have no signal; every action fails. |
| Assign/reassign, edit WO fields, free due-date picker | **Missing** | No assignee picker anywhere; due date limited to 5 presets. Supervisors can't run a shift from a phone. |
| PM action from mobile | **Missing** | Read-only "upcoming" widget; no PM detail/completion/generation. |
| Signatures, parts, failure codes on mobile | **Missing** | `build-mobile.md` §7. |
| Any role can change any WO status (incl. Reopen closed) | **Partial (control gap)** | `build-mobile.md` §2.4/§5 — no role gating on transitions; requesters can complete WOs. Mobile "Complete" also skips `/api/work-orders/[id]/close`, i.e. the close-out-photo field-config enforcement and sign-off that web enforces. |
| Forgot password | **Missing** | No reset flow web or mobile (`build-db-security.md` §2.4). 60 technicians × temp passwords = my coordinator's full-time job. |

### P. Customer due-diligence red flags (would surface in my client's IT security review)

Not my lens to fix, but as a buyer: anon-key-readable `platform_audit_logs`/`mrr_snapshots`/`notification_log`/preferences, `requests` table `SELECT USING (true)` exposing every tenant's requester names/phones/emails, public listing on `work-order-media`/`requests` buckets, unauthenticated `send-push` edge function (`build-db-security.md` §2.2, §2.7). Any GCC enterprise or government client's security questionnaire kills the deal on these before FM features are even discussed.

---

### To-Dos

- [ ] **FM-01 — Fix push-token schema split so technicians actually receive pushes** (Severity: Critical)
  - What: Mobile registers Expo tokens on `users.push_token/push_platform`; web `/api/push` reads the never-populated `user_devices` table, so all pushes return "No active devices". Pick one store (simplest: make `/api/push` read `users.push_token`); delete or gate the orphaned `supabase/functions/send-push`.
  - Where: `web/src/app/api/push/route.ts`, `mobile/src/lib/notifications.ts`, `supabase/functions/send-push/index.ts`, cleanup path in `web/src/app/api/users/delete/route.ts`.
  - Accept: assigning a WO to a mobile-logged-in technician delivers an Expo push; Push Audit tab shows a success row; `user_devices` either populated or removed from code.

- [ ] **FM-02 — Wire overdue-WO escalation cron** (Severity: Critical)
  - What: `notifyWOOverdue`/`onWOOverdue` exist but nothing invokes them. Add a Vercel cron (reuse the `pm-generate` Bearer CRON_SECRET fail-closed pattern) that finds WOs past `due_at` not completed/closed, notifies assignee + org managers once per breach, and records an escalation marker to prevent re-sends.
  - Where: new `web/src/app/api/cron/wo-overdue/route.ts`, `vercel.json`, `web/src/lib/notifications/wo-hooks.ts`.
  - Accept: a WO past `due_at` triggers exactly one email+push to assignee and managers; re-runs don't duplicate; cron fails closed without secret.

- [ ] **FM-03 — SLA policy matrix + response/resolution measurement** (Severity: High)
  - What: Org-level SLA policies (priority × optional category/site → response mins + resolution hours). Auto-set `due_at` on WO create/approve from the matrix; record `first_response_at` (first assignee action); add on-hold reason codes with clock-stop flag; expose breach fields for reporting.
  - Where: db new `sla_policies` table + WO columns (`first_response_at`, `hold_reason`); `web/src/app/api/work-orders/route.ts`, `api/requests/[id]/approve`, WO detail; a Settings tab for the matrix.
  - Accept: creating a critical WO auto-fills due_at from policy; reporting distinguishes response vs resolution breaches; clock-stop hold time excluded from resolution calc.

- [ ] **FM-04 — Statutory compliance certificate register** (Severity: High)
  - What: Certificates/licenses per site or asset (type: civil defense, elevator, fire system, water tank/legionella, pressure vessel, custom; number, issuer, issue/expiry, document upload) with an expiry dashboard + email alerts at 90/30/7 days and optional link to a renewal PM schedule.
  - Where: db `compliance_certificates` table + storage prefix; new `web/src/app/dashboard/compliance/*`; alerts via existing NotificationService + daily cron; upload via existing `/api/upload`.
  - Accept: certificate expiring in 20 days appears in an "expiring" list and fires an alert; attachment downloadable; expired certificates flagged red on the site page.

- [ ] **FM-05 — Attach checklists to PM schedules and stamp them onto generated WOs** (Severity: High)
  - What: Add `checklist_template_id` to `pm_schedules`; on generation insert the template items into `work_order_tasks` for the new WO (template CRUD and tasks table already exist).
  - Where: db `pm_schedules.checklist_template_id`; `web/src/app/api/cron/pm-generate/route.ts`, PM new/edit forms, "create first WO now" block in `pm-schedules/new/page.tsx`.
  - Accept: PM WO generated by cron carries the template's tasks; done_by/done_at evidence visible on the WO Tasks tab.

- [ ] **FM-06 — Mobile: work-order tasks/checklists tab** (Severity: High)
  - What: Add a Tasks tab to `WorkOrderDetailScreen` reading/toggling `work_order_tasks` (is_done, done_by, done_at) — parity with web. Warn or block "Complete" while tasks are open.
  - Where: `mobile/src/screens/WorkOrderDetailScreen.tsx`; RLS already org-scoped on `work_order_tasks`.
  - Accept: technician ticks checklist items on mobile with done_by/done_at recorded; completing with open tasks prompts confirmation.

- [ ] **FM-07 — Route mobile Complete through the server close endpoint + role-gate transitions** (Severity: High)
  - What: Mobile status changes bypass `/api/work-orders/[id]/close` (field-config close-out enforcement, sign-off, audit attribution) and have no role gating — requesters can complete/reopen WOs. Call the close API from mobile and gate transitions by role (requester: none; technician: own WOs only).
  - Where: `mobile/src/screens/WorkOrderDetailScreen.tsx`; reuse `web/src/app/api/work-orders/[id]/close/route.ts`.
  - Accept: mobile Complete enforces required close-out photos when configured; requester role sees no status buttons; audit rows created for mobile transitions.

- [ ] **FM-08 — Self-service password reset (web + mobile) + forced change on first login** (Severity: High)
  - What: Add `resetPasswordForEmail` flow: forgot-password link on both login pages, reset page consuming the recovery link; mobile links to the web reset. Force password change on first login after a temp-password invite.
  - Where: `web/src/app/login/*`, new `web/src/app/reset-password/page.tsx`, `mobile/src/screens/LoginScreen.tsx`, invite flow `web/src/app/api/users/route.ts`.
  - Accept: locked-out user resets via email without admin help; first login with temp password forces a change.

- [ ] **FM-09 — Stop writing vendor ids into work_orders.assigned_to** (Severity: High)
  - What: The WO edit "External Vendors" optgroup writes a vendor id into `assigned_to`, which otherwise holds user ids (vendor detail already queries `assigned_vendor_id`). Write to `assigned_vendor_id` instead, null the other column, migrate existing rows where `assigned_to` matches a vendor id.
  - Where: `web/src/app/dashboard/work-orders/[id]/edit/page.tsx`, `web/src/types/work-order.ts`, one-off SQL migration, WO list/detail rendering.
  - Accept: assigning a vendor no longer inserts a non-user uuid into `assigned_to`; technician filters/counts exclude vendor-assigned WOs; vendor detail Work Orders tab still lists them.

- [ ] **FM-10 — Inventory transaction ledger** (Severity: High)
  - What: `inventory_transactions` table (item, qty ±, type: adjust/consume-WO/receive, note, user, WO id, created_at). Write from Adjust Stock (persist the currently-discarded note) and WO Parts Used; History tab on item detail.
  - Where: db new table + RLS (copy the sprint-k 4-policy pattern); `web/src/app/dashboard/inventory/[id]/page.tsx`, WO Parts Used handler.
  - Accept: every stock change has a ledger row with who/why; item detail shows history; adjust-stock note persisted.

- [ ] **FM-11 — Scheduled monthly client report pack** (Severity: High)
  - What: Replace the `alert('coming soon')` with real scheduling: per-org config (recipients, which of the 4 standard reports, monthly/weekly) + a cron that renders the existing PDF endpoints and emails via Resend.
  - Where: db `report_schedules` table; `web/src/app/dashboard/reports/page.tsx`, new `api/cron/scheduled-reports/route.ts`, reuse `api/reports/standard/[type]`.
  - Accept: configured schedule emails the PDFs on the 1st of the month; failures logged to `notification_log`.

- [ ] **FM-12 — SLA breach / MTTR report + remove fake KPI deltas** (Severity: High)
  - What: Add an "SLA Performance" standard report (per priority: count, % within SLA, avg response, avg resolution/MTTR, breach list) on FM-03 fields. Delete or genuinely compute the hard-coded "+12%"/"-5%"/"8 scheduled" decorations on dashboard and WO-list stats.
  - Where: `web/src/app/api/reports/standard/[type]/route.tsx`, `web/src/components/pages/DashboardOverviewPage.tsx`, `dashboard/work-orders/page.tsx`.
  - Accept: report totals reconcile with the WO register for the same period; no hard-coded percentage strings remain.

- [ ] **FM-13 — Route logged-in requester wizard through the requests queue** (Severity: High)
  - What: `/request` inserts directly into `work_orders` (`source='requester'`), skipping triage. Insert into `requests` (status pending) like the QR flow so all demand hits one queue.
  - Where: `web/src/app/request/page.tsx`, reuse `api/requests/submit` logic (authenticated variant).
  - Accept: submission from `/request` appears in the dashboard Requests pending tab, not as an unassigned WO; requester gets the tracking stepper.

- [ ] **FM-14 — Mobile offline queue for the technician loop** (Severity: High; Phase 2)
  - What: Cache assigned WOs + queue status changes/comments/photos/task ticks offline; replay on reconnect (NetInfo + persisted mutation queue; WatermelonDB is already in package.json if fuller sync is wanted).
  - Where: `mobile/src/` new sync layer; `WorkOrderDetailScreen`, `WorkOrdersScreen`.
  - Accept: airplane-mode status change + photo survive app restart and sync on reconnect; user sees queued/synced state.

- [ ] **FM-15 — Dispatch board (technician-day calendar for WOs)** (Severity: Medium)
  - What: Week/day view of open WOs by assignee with an unassigned lane; assign/reschedule from the board (drag-drop optional later). Reuse the PM calendar grid approach.
  - Where: new `web/src/app/dashboard/work-orders/board/page.tsx`; PATCH via existing `/api/work-orders/[id]`.
  - Accept: dispatcher sees per-technician columns for a day; assigning from the board updates `assigned_to`/`due_at` and fires existing assignment notifications.

- [ ] **FM-16 — Meter readings + meter-based PM triggers** (Severity: Medium; Phase 2)
  - What: `meters` (asset-linked, unit, type) + `meter_readings` tables; reading entry on web + mobile asset detail; PM trigger "every N units" evaluated by the PM cron alongside date triggers.
  - Where: db new tables; `web/src/app/dashboard/assets/[id]`, `api/cron/pm-generate/route.ts`, `mobile/src/screens/AssetDetailScreen.tsx`.
  - Accept: generator-hours reading crossing the threshold generates the PM WO; readings history visible per asset.

- [ ] **FM-17 — Purchase orders (minimal): raise, receive into stock** (Severity: Medium; Phase 2)
  - What: PO with vendor, line items from inventory, statuses draft/sent/received/cancelled; receiving writes FM-10 ledger rows and bumps stock. Wires the already-seeded `po_*` notification types; until built, hide the PO toggles in Settings.
  - Where: db `purchase_orders`/`purchase_order_items`; new `web/src/app/dashboard/purchase-orders/*`; `web/src/lib/notifications/purchaseOrderNotifications.ts`.
  - Accept: low-stock item → PO → receive updates stock with ledger entries; PO notification prefs actually fire.

- [ ] **FM-18 — Seasonal/Ramadan PM window UI + cron enforcement** (Severity: Medium)
  - What: Expose `is_seasonal`/`seasonal_start_month`/`seasonal_end_month` in PM create/edit forms and make the cron skip generation outside the window (columns already display on PM detail). Ramadan v1 = set the Hijri-shifted window per year manually.
  - Where: `web/src/app/dashboard/pm-schedules/new/page.tsx`, `[id]/edit`, `api/cron/pm-generate/route.ts`.
  - Accept: a schedule with window Apr–Oct generates nothing in December; the window shown on PM detail is now settable.

- [ ] **FM-19 — Honor pm_schedules.lead_time_days in the cron** (Severity: Medium)
  - What: Replace the hardcoded 2-day generation cutoff with the row's `lead_time_days` (default 2); expose the field on PM forms.
  - Where: `web/src/app/api/cron/pm-generate/route.ts:68`, PM new/edit forms, keep `pm-utils.ts` in sync.
  - Accept: schedule with lead_time_days=14 generates its WO 14 days before next_due_at.

- [ ] **FM-20 — Org-configurable WO categories incl. soft services** (Severity: Medium)
  - What: Move the hardcoded 12-category list to a per-org table seeded with the current list plus Cleaning, Pest Control, Landscaping, Waste; admin CRUD in Settings; web + mobile read from it.
  - Where: db `wo_categories`; WO forms/filters in `web/src/app/dashboard/work-orders/*`, `mobile/src/lib/categories.ts` (fetch instead of constant).
  - Accept: admin adds "Pest Control"; it appears in web filters and the mobile create form; existing WOs unaffected.

- [ ] **FM-21 — Invoice status workflows (vendor + client)** (Severity: Medium)
  - What: Vendor invoices: status-change UI (pending→approved→paid / disputed) with note. Client invoices: status (draft/issued/paid/void) + paid date + filter on the list.
  - Where: `web/src/app/dashboard/vendors/[id]/page.tsx`, `dashboard/invoices/page.tsx`, small schema additions.
  - Accept: vendor invoice moves to paid and the vendor "Total Paid" KPI reflects it; client invoice list filterable by unpaid.

- [ ] **FM-22 — DB-safe sequential client invoice numbering (ZATCA)** (Severity: Medium)
  - What: Replace JS `INV-<year>-<timestamp>` with a per-org DB counter under a unique constraint (mirror `next_tenant_invoice_number` but race-safe: counter row with `UPDATE ... RETURNING` or advisory lock) for ZATCA sequentiality and collision safety.
  - Where: SQL migration + `web/src/app/api/invoices/create/route.ts`.
  - Accept: concurrent invoice creation yields gapless unique numbers per org; unique index prevents duplicates.

- [ ] **FM-23 — Fix empty PM History tab on asset detail** (Severity: Medium)
  - What: Tab renders but never loads data. Query closed WOs with `pm_schedule_id` for the asset (link exists since sprint-j) — or remove the tab.
  - Where: `web/src/app/dashboard/assets/[id]/page.tsx`.
  - Accept: asset with completed PM WOs shows them under PM History; no perpetual empty state.

- [ ] **FM-24 — Warranty claim tracking on work orders** (Severity: Medium)
  - What: When a WO's asset is in warranty (warranty_expiry ≥ today), banner it on WO create/detail and allow marking "warranty claim" with claim ref + status (raised/accepted/rejected/credited); exclude accepted-claim costs from asset lifecycle cost.
  - Where: WO detail/edit pages, small `warranty_claim` columns or table, asset lifecycle-cost calc in `dashboard/assets/[id]`.
  - Accept: WO on in-warranty asset shows a warranty banner; claim status filterable; accepted claims excluded from lifecycle cost.

- [ ] **FM-25 — Mobile: assign/reassign, real date-time picker, notification deep links** (Severity: Medium)
  - What: Assignee picker on create/detail for admin/manager; replace the 5-preset due date with a native datetime picker; add an `expo-notifications` response listener + `linking` config so tapping a push opens the WO.
  - Where: `mobile/src/screens/CreateWorkOrderScreen.tsx`, `WorkOrderDetailScreen.tsx`, `mobile/src/navigation/index.tsx`, `mobile/app.json` (scheme), `mobile/src/lib/notifications.ts`.
  - Accept: manager assigns from phone; technician's push tap opens the WO detail; arbitrary due date settable.

- [ ] **FM-26 — Permit-to-work module** (Severity: Medium; Phase 2/3)
  - What: PTW record linked to WO/vendor: type (hot work, confined space, height, electrical isolation), validity window, approver sign-off, attached method statement, auto-expiry; WO banner when a PTW is required/open.
  - Where: db `permits` table + storage; new `web/src/app/dashboard/permits/*`; WO detail link.
  - Accept: a vendor WO can require an approved PTW before moving to in_progress; expired permits flagged.

- [ ] **FM-27 — Incident/emergency log** (Severity: Medium; Phase 3)
  - What: Incident record (type, severity, site, linked WOs, timeline entries, closure report PDF) distinct from WOs; "raise incident" shortcut from a critical WO.
  - Where: new db table + `web/src/app/dashboard/incidents/*`; PDF via the existing @react-pdf pattern.
  - Accept: incident aggregates its WOs and exports a client-shareable PDF report.

- [ ] **FM-28 — Utilities/energy dashboard** (Severity: Medium; Phase 3)
  - What: On FM-16 meters: monthly kWh/m³ per site, cost per tariff, month-over-month chart in Reports; CSV export.
  - Where: `web/src/app/dashboard/reports/page.tsx` + meter tables.
  - Accept: site utility trend chart renders from readings; export matches entered data.

- [ ] **FM-29 — Cost centers & budget vs actual** (Severity: Medium; Phase 3)
  - What: Cost-center entity (per site or contract) assignable on WOs/POs; annual budget lines; committed (open-WO estimates) vs actual report per cost center per month.
  - Where: db `cost_centers`, `budgets`; WO/PO forms; Reports.
  - Accept: WO actual_cost rolls up to its cost center; budget variance report per month.

- [ ] **FM-30 — Hijri date display + prayer-time-aware calendar shading** (Severity: Low; Phase 3)
  - What: Show the Hijri equivalent alongside Gregorian on dashboards/PDF report headers (`Intl.DateTimeFormat('en-SA-u-ca-islamic-umalqura')` — zero dependencies); optionally shade prayer windows on the PM/dispatch calendar.
  - Where: shared date-format helper in `web/src/lib/`, calendar pages, `lib/pdf-report-styles.ts` headers.
  - Accept: report header shows both calendars; org-settings toggle controls it.

- [ ] **FM-31 — True RTL layout on mobile** (Severity: Low)
  - What: Adopt `I18nManager` RTL flip (or systematic row-reverse styling) so Arabic mode mirrors layout, not just text alignment; fold the inline `lang === 'ar'` ternaries into the i18n dictionary.
  - Where: `mobile/src/context/LangContext.tsx`, screens/styles.
  - Accept: Arabic mode renders mirrored navigation/cards; no mixed-direction rows.

---

# Section 4 — Asset Log (non-MEP asset/inventory register): build-ready spec

Compared the client's Asset Log requirement (register of Furniture / IT Devices / Appliances / Signage / custom types, QR-labelled, space-assigned, with lifecycle + cost + condition tracking) against the current build (build-web.md, build-mobile.md, build-db-security.md, spot-checked repo). **The module itself is 100% missing — 0 of 7 requirement areas exist** — but roughly 70–80% of the enabling plumbing already exists and is directly reusable: QR generation (`qrcode` npm + `@react-pdf/renderer` batch PDFs), the sites→spaces hierarchy with `qr_token`, mobile QR scanning + photo pipeline, CSV import/export patterns, the `vendors` table (suppliers), `audit_logs`, and the org-scoped 4-policy RLS template. Net-new: 5 tables + 1 RPC, ~7 API routes, 6 web pages, 2 mobile screens, 3 report types. 15 to-dos.

## Comparison vs current build

| Requirement area | Status | Evidence / notes |
|---|---|---|
| Non-MEP item register (separate module) | **Missing** | No table/page exists. Furniture/IT/Signage exist only as *category strings* on MEP `assets` and WOs (build-web.md §2/§3) — merging into `assets` is explicitly out per client; separate tables required. |
| QR label per unit (generate, print, scan-to-open) | **Missing** (foundation **Present**) | No asset-log QR, but the exact pattern exists: spaces bulk QR PDF `web/src/app/api/spaces/export-qr/route.tsx` (`qrcode` → dataURL → A4 grid, 2/4/6 per page), space QR modal w/ PNG download+print (build-web.md §4), assets QR export `web/src/app/api/assets/export-qr/route.tsx`. Reuse wholesale. |
| Assign to spaces + assignment history | **Missing** (spaces **Present**) | `spaces` table with org RLS + `qr_token uuid UNIQUE` exists (build-db-security.md §1.3, `docs/superpowers/sql/sprint-i-02-spaces-qr-token.sql`). MEP assets have a bare `space_id` with **no history** — no movement/transfer log exists for any entity. |
| Lifecycle: commission/decommission + statuses | **Missing** | MEP assets have a Decommission quick-action (retire + auto-WO, build-web.md §3) and a WO-detail Space-Assets commission panel — MEP-only, no dates/reasons/disposal notes, and statuses (`active/under_maintenance/retired`) don't match the required set (`in_storage/in_use/under_repair/damaged/disposed`). |
| Cost tracking (purchase, depreciated value, replacement, repair log, warranty, supplier, invoice ref) | **Missing** | build-web.md §18: "Cost centers / budgets / depreciation — absent". MEP assets carry only `purchase_cost` + `warranty_expiry`; no repair-expense ledger, no replacement/current value, no supplier link, no invoice ref. `vendors` table is reusable as the supplier FK (build-web.md §11). Warranty ≤30d badges exist on MEP assets (reusable UI pattern); no warranty *alerts* (no cron invokes any notify helper — build-web.md §15). |
| Condition / usability tracking | **Missing** (adjacent **Partial**) | No condition rating anywhere. Inspections (build-web.md §6) do checklist audits of spaces/MEP assets — workflow-oriented, not per-item usable/not-usable state; don't overload it. |
| Reports (register by space, value summary, warranty expiry) | **Missing** (framework **Present**) | Standard-report PDF framework exists: `web/src/app/api/reports/standard/[type]/route.tsx` + `web/src/lib/pdf-report-styles.ts` (build-web.md §13). No register/value reports of any kind. |
| Mobile: scan → item, move, condition update | **Missing** (scanner **Present**) | `mobile/src/screens/QRScannerScreen.tsx` resolves QR → MEP asset only (URL match / bare UUID / `qr_code` column, org-verified). Camera→compress→`media`-bucket photo pipeline exists (build-mobile.md §2.4). No move or condition flows. |
| CSV import/export | Pattern **Present** | Assets CSV import w/ per-row errors + export pages (build-web.md §3); service-role bulk import `web/src/app/api/spaces/bulk-import` (build-web.md §4). Clone for asset-log. |

**Where the build exceeds the docs/requirement:** the spaces QR infrastructure (unique tokens, batch PDF layouts, public token resolver) is stronger than what the client asked for and is the exact skeleton to clone; `audit_logs` (with impersonation attribution) gives lifecycle/status history for free — no extra event table needed for status changes.

---

## 1. Data model

New migration `docs/superpowers/sql/sprint-l-01-asset-log.sql` (idempotent, styled after `docs/superpowers/sql/sprint-k-03-wo-tasks-checklists.sql`). All enums as CHECK constraints (repo convention — no PG enum types). All 5 tables get the standard 4-policy org RLS (`organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid())` for SELECT/INSERT/UPDATE/DELETE) **in the same file that creates them** (this repo has shipped RLS-less tables before — build-db-security.md §2.2), plus `organisation_id` and FK indexes.

### `asset_log_types` (org-defined item types)
- `id uuid PK`, `organisation_id → organisations CASCADE`, `name text NOT NULL`, `name_ar text`, `icon text` (optional), `is_active bool default true`, `created_at`.
- Seed 5 defaults per org on first use (app-side, like `seedFieldConfigsForOrg`): Furniture, IT Device, Appliance, Signage, Other. Admin/manager add custom types inline from the item form ("+ New type").

### `asset_log_items` (the register)
- Identity: `id uuid PK`, `organisation_id CASCADE`, `item_number bigint GENERATED ALWAYS AS IDENTITY` (rendered `AL-0001`, same convention as `wo_number`), `qr_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid()` + index (clone of `sprint-i-02-spaces-qr-token.sql`).
- Descriptive: `name text NOT NULL`, `name_ar`, `description`, `type_id → asset_log_types SET NULL`, `brand`, `model`, `serial_number`, `photo_urls text[] default '{}'`, `custom_fields jsonb default '{}'` (assets convention).
- Quantity model: `tracking_mode text CHECK (tracking_mode IN ('unit','bulk')) default 'unit'`, `quantity int NOT NULL default 1 CHECK (quantity >= 1)`, plus CHECK `(tracking_mode='unit' AND quantity=1) OR tracking_mode='bulk'`.
- Location (current, denormalized from latest movement): `site_id → sites SET NULL`, `space_id → spaces SET NULL`. Assignment is to spaces only — **no person-assignment columns, per client decision**.
- Status: `status text CHECK (status IN ('in_storage','in_use','under_repair','damaged','disposed')) default 'in_storage'`.
- Lifecycle: `commissioned_at date`, `commissioned_by → users SET NULL`, `decommissioned_at date`, `decommissioned_by → users SET NULL`, `decommission_reason text`, `disposal_notes text`.
- Cost: `purchase_date date`, `purchase_cost numeric(12,2)`, `replacement_cost numeric(12,2)`, `current_value_override numeric(12,2)`, `expected_lifespan_years int`, `supplier_id → vendors SET NULL` (reuse vendors as suppliers — no new suppliers table), `invoice_ref text`. Effective current value = override ?? straight-line `max(0, purchase_cost * (1 - age_years/expected_lifespan_years))`, computed in `web/src/lib/asset-log.ts` — no depreciation table/cron.
- Warranty: `warranty_provider text`, `warranty_expiry date`, `warranty_alert_sent_at timestamptz` (cron dedupe stamp).
- Condition: `condition_rating int CHECK (condition_rating BETWEEN 1 AND 5)`, `is_usable bool default true`, `condition_notes text`, `last_condition_review_at timestamptz`, `condition_review_interval_months int` (null = no periodic review; "review due" = `last_condition_review_at + interval < now()`).
- Meta: `created_by → users SET NULL`, `created_at`, `updated_at`.
- Indexes: `(organisation_id, status)`, `space_id`, `site_id`, `type_id`, `qr_token`, `warranty_expiry`.

### `asset_log_movements` (assignment history: which space, when, by whom)
- `id uuid PK`, `organisation_id CASCADE`, `item_id → asset_log_items CASCADE`, `from_space_id → spaces SET NULL`, `to_space_id → spaces SET NULL` (null = unassigned/storage without a space), `from_space_name text`, `to_space_name text` (snapshots so history survives space deletion), `quantity int default 1` (batches move whole in v1; column future-proofs partial moves), `note text`, `moved_by → users SET NULL`, `moved_at timestamptz default now()`.
- Index `(item_id, moved_at desc)`. An initial movement row is written at item creation when a space is chosen.

### `asset_log_repairs` (damage/repair expense ledger)
- `id uuid PK`, `organisation_id CASCADE`, `item_id CASCADE`, `description text NOT NULL`, `cost numeric(12,2) NOT NULL default 0`, `repaired_at date default current_date`, `vendor_id → vendors SET NULL`, `work_order_id → work_orders SET NULL` (optional link when the repair ran through a WO), `created_by SET NULL`, `created_at`. Index `item_id`.

### `asset_log_condition_reviews` (periodic review log)
- `id uuid PK`, `organisation_id CASCADE`, `item_id CASCADE`, `rating int NOT NULL CHECK (rating BETWEEN 1 AND 5)`, `is_usable bool NOT NULL`, `notes text`, `photo_urls text[] default '{}'`, `reviewed_by SET NULL`, `reviewed_at timestamptz default now()`. Index `item_id`.
- On insert, app code copies `rating`/`is_usable` onto the item + stamps `last_condition_review_at`.

### RPC `move_asset_log_item(p_item_id uuid, p_to_space_id uuid, p_note text)`
- SECURITY DEFINER with `SET search_path = public` (follow `request_account_deletion` in `docs/superpowers/sql/account-deletion.sql` — NOT the flawed `get_dau_mau` pattern). Verifies the caller's org owns the item AND the target space (or space is null); inserts the movement row (with name snapshots) and updates `asset_log_items.space_id`/`site_id` (site derived from the target space) atomically. `REVOKE ALL FROM public; GRANT EXECUTE TO authenticated`. One code path for web and mobile (mobile talks to PostgREST directly — repo convention).
- Status/lifecycle change history: reuse `audit_logs` with `entity_type='asset_log_item'` (same as WOs) — no sixth table.

## 2. API / routes (web, `web/src/app/api/asset-log/`)

Reads are client-side Supabase under RLS (repo convention for list/detail pages). Writes follow the standard route pattern: cookie auth → load caller profile → org from profile (never from body) → role check → service-role write + `audit_logs` insert.

| Route | Method | Roles | Behavior |
|---|---|---|---|
| `api/asset-log/route.ts` | POST | admin/manager/technician | Create item (+ initial movement row if space given, + audit log). Seeds default types for the org if none exist. |
| `api/asset-log/[id]/route.ts` | PATCH / DELETE | PATCH: admin/manager/technician; DELETE: admin only | Update fields / hard delete (blocked unless status=`disposed` — see edge cases). |
| `api/asset-log/[id]/decommission/route.ts` | POST | admin/manager | Body `{date, reason, disposal_notes}` → stamps decommission fields, status `disposed`, audit log. Also handles re-commission (clears fields, status `in_storage`). |
| `api/asset-log/[id]/repairs/route.ts` | POST | admin/manager/technician | Insert repair row; optional `set_status: 'under_repair'\|'in_use'`. |
| `api/asset-log/export-qr/route.tsx` | POST | any org member | Clone of `api/spaces/export-qr/route.tsx`: `{itemIds, layout: 2\|4\|6}` → A4 QR-grid PDF. QR encodes `${APP_URL}/al/{qr_token}`; label lines: name, `AL-0001`, type, current space. |
| `api/asset-log/bulk-import/route.ts` | POST | admin/manager | CSV rows (clone `api/spaces/bulk-import`): resolves site/space/type by name (auto-creates unknown types), per-row errors. |
| `app/al/[token]/page.tsx` | GET (page) | signed-in | Scan landing: server component looks up `qr_token` scoped to caller org → redirect to `/dashboard/asset-log/{id}`; middleware sends unauthenticated scanners to login first. |

Moves and condition reviews need no bespoke routes: web calls the same `move_asset_log_item` RPC; condition reviews insert client-side under RLS (parity with WO comments/tasks).

## 3. Web UI (`web/src/app/dashboard/asset-log/`)

- **Nav**: add "Asset Log" to `web/src/components/Sidebar.tsx` directly under Assets (visible to all roles, like Assets; writes role-gated). ~40 new EN/AR keys in `web/src/context/LanguageContext.tsx`.
- **List `page.tsx`**: stats cards (Total items · Total current value SAR · In Use · Under Repair + Damaged · Warranty expiring ≤30d). Table columns: `AL-####`, Name (+AR), Type, Site → Space, Qty, Status badge, Condition (1–5 stars + Not-usable chip), Current value, Warranty (Expired / ≤30d badges — reuse the assets-list pattern). Filters: search (name/serial/AL#/brand), type dropdown, status chips, site→space cascading dropdowns, usable toggle, warranty-expiring toggle, review-due toggle; default view hides `disposed` (toggle to include). Checkbox multi-select → **bulk QR PDF (2/4/6 per page)** + bulk delete (admin). Buttons: New Item, Import CSV, Export CSV (client-generated, assets-export pattern).
- **Create/Edit `new/page.tsx`, `[id]/edit/page.tsx`**: sections — Identity (name EN*/AR, type* with inline "+ new type", brand, model, serial, description, photos ≤10 via `/api/upload`), Quantity (unit/bulk toggle + qty), Location (site → space selects), Purchase & Cost (purchase date, cost, replacement cost, lifespan years, current-value override, supplier from vendors, invoice ref), Warranty (provider, expiry), Condition (rating, usable, review interval months). No field-config integration in v1 (Phase 2).
- **Detail `[id]/page.tsx`**: header — name + AR, `AL-####` chip, status badge, type chip, warranty banner (expired/≤30d), review-due banner. Quick actions: **QR modal** (client-side `qrcode.toDataURL`, PNG download + print — spaces-modal pattern; do NOT copy the assets-detail external `api.qrserver.com` call), **Move** (site→space picker + note → RPC), status buttons (In Storage / In Use / Under Repair / Damaged), **Commission** (stamps date+by, status `in_use`), **Decommission** (modal: date, reason, disposal notes), Edit. Tabs:
  - **Overview** — descriptive/location/lifecycle fields, photos, custom fields.
  - **Costs** — purchase cost, computed current value (straight-line, override shown), replacement cost, total repair spend, supplier + invoice ref.
  - **Repairs** — ledger table (date, description, cost SAR, vendor, linked WO) + add-entry form; footer total.
  - **Movements** — timeline: from-space → to-space, by whom, when, note (name snapshots).
  - **Warranty** — provider, expiry, days remaining, alert status.
  - **Condition** — review history (rating, usable, notes, photos) + "Log review" form.

## 4. Mobile additions (`mobile/src/`)

- **Scanner**: extend `screens/QRScannerScreen.tsx` — add payload match `al/([0-9a-f-]{36})` plus fallback lookup on `asset_log_items.qr_token` when the asset lookups miss (always org-verified), then `navigation.replace('AssetLogDetail', { id })`. Register the new stack screen in `navigation/index.tsx`. No new tab — items are reached by scanning (browse list is Phase 2).
- **`AssetLogDetailScreen`**: header (name, `AL-####`, status badge, not-usable chip), details card (type, site/space, brand/model/serial, condition stars; purchase/current value shown to admin/manager), photos, last 5 movements. Actions (hidden for `requester`):
  - **Move** — site then space via existing `components/SelectField.tsx` + optional note → `supabase.rpc('move_asset_log_item', ...)`.
  - **Update condition** — rating pills 1–5, usable toggle, notes, optional photo via the existing camera→compress→`media`-bucket pipeline → insert `asset_log_condition_reviews` + update item (two RLS writes; acceptable — RPC not needed here).
- i18n keys added to `mobile/src/i18n/index.ts` (EN+AR).

## 5. Reports

Add three types to `web/src/app/api/reports/standard/[type]/route.tsx` (existing @react-pdf landscape-table framework, `advanced_reporting`-gated like the rest):
1. **`asset-log-register`** — grouped site → floor → space: item, type, qty, status, condition, current value; per-space and grand totals.
2. **`asset-log-value`** — by type and by site: count, purchase total, current (depreciated) total, replacement total, repair spend to date; disposed excluded from current value.
3. **`asset-log-warranty`** — warranty expiring ≤90d or expired: item, space, provider, expiry, days left.

Plus an ungated, filter-aware CSV export from the list page. Warranty **alerts**: weekly cron `app/api/cron/asset-log-warranty/route.ts` (Bearer `CRON_SECRET`, fail-closed — clone `api/cron/pm-generate` auth) notifies org admins/managers via `NotificationService` when warranties enter the 30-day window; dedupe via `warranty_alert_sent_at`; new pref key `asset_log_warranty_expiring` in `web/src/lib/notificationTypes.ts`.

## 6. Edge cases & decisions

- **Bulk vs serialized**: `tracking_mode='unit'` (qty 1, one QR label per physical unit) vs `'bulk'` (one row, qty N, one QR opening the batch — e.g. 40 identical chairs). v1 rule: a bulk batch lives in ONE space and moves whole; a **Split** action (web detail) carves off a new row with reduced qty (new QR/AL-number, movement rows on both) for partial moves or per-unit promotion. Ceiling documented: per-unit serialization of a batch = "split into unit rows".
- **Transfers between sites**: moving to a space of another site is allowed; the RPC derives the new `site_id` from the target space; movement history is the audit trail. Reports group by current site so value rollups stay correct.
- **Decommissioned retention**: `disposed` items are never auto-deleted — hidden by the default list filter, retained in history and reports. Hard DELETE is admin-only and blocked unless status=`disposed` (prevents accidental loss of live records); movements/repairs/reviews cascade with the item.
- **Space deletion**: `space_id SET NULL` → item shows "Unassigned" (list filter surfaces these); movement history keeps readable snapshots via `from/to_space_name`.
- **Separation from MEP Assets**: zero shared tables/columns; only shared FKs are `sites/spaces/vendors/users/work_orders`. A repair *may* link to a WO, but Asset Log items are deliberately not selectable on WO forms in v1.
- **Label re-print**: `qr_token` is immutable; damaged labels re-print from the QR modal or bulk export any time.
- **VAT/ZATCA**: register values are SAR bookkeeping only — no VAT computation involved (invoicing module untouched).

---

### To-Dos

- [ ] **AG-1 — Create Asset Log schema migration (5 tables + RPC + RLS)** (Severity: High)
  - What: Write `docs/superpowers/sql/sprint-l-01-asset-log.sql` per §1: `asset_log_types`, `asset_log_items`, `asset_log_movements`, `asset_log_repairs`, `asset_log_condition_reviews` with all CHECK constraints and indexes, 4-policy org RLS on every table, and SECURITY DEFINER RPC `move_asset_log_item` (org-verified internally, `SET search_path=public`, EXECUTE granted to authenticated only). Idempotent, styled after `docs/superpowers/sql/sprint-k-03-wo-tasks-checklists.sql`.
  - Where: db — `docs/superpowers/sql/sprint-l-01-asset-log.sql` (run in Supabase SQL editor before deploying dependent tasks).
  - Accept: (1) all 5 tables reject cross-org SELECT/INSERT via anon-key PostgREST calls; (2) `move_asset_log_item` moves an item + writes a movement row atomically and errors on a space belonging to another org; (3) `tracking_mode='unit'` rows cannot have quantity > 1 (DB CHECK).

- [ ] **AG-2 — Build Asset Log write API routes** (Severity: High)
  - What: Implement POST `api/asset-log`, PATCH/DELETE `api/asset-log/[id]`, POST `api/asset-log/[id]/decommission`, POST `api/asset-log/[id]/repairs` per §2 — standard pattern: cookie auth → profile org (never from body) → role gate (create/update/repairs: admin/manager/technician; decommission: admin/manager; delete: admin, only when `disposed`) → service-role write + `audit_logs` row (`entity_type='asset_log_item'`). Item create seeds default `asset_log_types` if the org has none and writes the initial movement row when a space is set.
  - Where: web — `web/src/app/api/asset-log/**`; helper `web/src/lib/asset-log.ts` (current-value calc, status/label maps).
  - Accept: (1) requester role gets 403 on all writes; (2) decommission stamps date/by/reason/disposal notes and sets status `disposed`; (3) DELETE on a non-disposed item returns 400.

- [ ] **AG-3 — Web: Asset Log list page + sidebar nav** (Severity: High)
  - What: Add an "Asset Log" nav item to `components/Sidebar.tsx` (below Assets) and build `app/dashboard/asset-log/page.tsx` per §3: stats cards, table (AL-#, name, type, site→space, qty, status, condition, current value, warranty badges), filters (search, type, status chips, site/space, usable, warranty-expiring, review-due, include-disposed toggle), multi-select. EN/AR strings in `context/LanguageContext.tsx`.
  - Where: web — `web/src/components/Sidebar.tsx`, `web/src/app/dashboard/asset-log/page.tsx`, `web/src/context/LanguageContext.tsx`.
  - Accept: (1) list shows only caller-org items and hides `disposed` by default; (2) each filter narrows results and combines with search; (3) page renders fully in Arabic with RTL alignment.

- [ ] **AG-4 — Web: item create/edit forms + inline type management** (Severity: High)
  - What: Build `new/page.tsx` and `[id]/edit/page.tsx` per §3 (identity, unit/bulk quantity, location site→space, purchase/cost incl. supplier-from-vendors and invoice ref, warranty, condition sections; photos via `/api/upload`), with an inline "+ new type" control creating an `asset_log_types` row.
  - Where: web — `web/src/app/dashboard/asset-log/new/page.tsx`, `[id]/edit/page.tsx`.
  - Accept: (1) creating an item with a space produces the item + an initial movement row; (2) switching to `unit` mode forces qty=1 in the UI and the API rejects unit+qty>1; (3) a newly added custom type appears immediately in the type dropdown and list filter.

- [ ] **AG-5 — Web: item detail page with tabs + lifecycle actions** (Severity: High)
  - What: Build `[id]/page.tsx` per §3: header badges/banners; quick actions (QR modal via client-side `qrcode.toDataURL` — not the external qrserver call, Move via RPC, status buttons, Commission, Decommission modal, Edit); tabs Overview / Costs / Repairs / Movements / Warranty / Condition. Costs tab computes straight-line current value from `lib/asset-log.ts` with override display; Repairs tab has an add form; Condition tab has a "Log review" form that inserts a review and syncs the item row.
  - Where: web — `web/src/app/dashboard/asset-log/[id]/page.tsx`, `web/src/lib/asset-log.ts`.
  - Accept: (1) Move updates the current space and appends a movement visible in the tab; (2) Decommission modal captures date/reason/disposal notes and flips status to `disposed`; (3) logging a condition review updates the header rating/usable state and `last_condition_review_at`.

- [ ] **AG-6 — QR: token landing route + bulk label PDF export** (Severity: High)
  - What: (a) `app/al/[token]/page.tsx` server component: authenticated lookup of `asset_log_items.qr_token` scoped to the caller's org → redirect to detail (404 otherwise). (b) POST `api/asset-log/export-qr/route.tsx` cloned from `api/spaces/export-qr/route.tsx`: `{itemIds, layout 2|4|6}` → A4 PDF grid; QR encodes `${APP_URL}/al/{qr_token}`; label shows name, AL-number, type, space. Wire the list-page multi-select button.
  - Where: web — `web/src/app/al/[token]/page.tsx`, `web/src/app/api/asset-log/export-qr/route.tsx`.
  - Accept: (1) scanning a printed label while signed in opens the item detail; a token from another org 404s; (2) exporting 10 items at 6-per-page yields a correctly labelled 2-page PDF; (3) an unauthenticated scan redirects to login and then through to the item.

- [ ] **AG-7 — Web: CSV import/export** (Severity: Medium)
  - What: `import/page.tsx` (template download + per-row error report, assets-import pattern) posting to service-role `api/asset-log/bulk-import`, which resolves site/space/type by name (auto-creating unknown types) and validates status/mode enums; client-side filter-aware CSV export button on the list page.
  - Where: web — `web/src/app/dashboard/asset-log/import/page.tsx`, `web/src/app/api/asset-log/bulk-import/route.ts`.
  - Accept: (1) the template CSV round-trips (export → import) without errors; (2) a row with an unknown space reports a row-numbered error while valid rows insert; (3) import is rejected for non-admin/manager callers.

- [ ] **AG-8 — Mobile: scan QR → Asset Log item detail** (Severity: High)
  - What: Extend `QRScannerScreen.tsx` payload resolution with the `al/{uuid}` URL pattern and an `asset_log_items.qr_token` fallback (org-verified, tried after the existing asset lookups miss); add `AssetLogDetailScreen` (info card, condition stars, current space, photos, last 5 movements) registered in `navigation/index.tsx`; EN/AR strings in `i18n/index.ts`.
  - Where: mobile — `mobile/src/screens/QRScannerScreen.tsx`, new `mobile/src/screens/AssetLogDetailScreen.tsx`, `mobile/src/navigation/index.tsx`, `mobile/src/i18n/index.ts`.
  - Accept: (1) scanning an item label opens its detail while MEP-asset QRs still resolve to AssetDetail; (2) another org's item token shows "not found"; (3) the screen renders in Arabic.

- [ ] **AG-9 — Mobile: move item + condition update with photo** (Severity: High)
  - What: On `AssetLogDetailScreen` add Move (site→space via `SelectField` + note → `supabase.rpc('move_asset_log_item')`) and Update Condition (rating 1–5 pills, usable toggle, notes, optional photo through the existing compress→`media`-bucket pipeline → insert `asset_log_condition_reviews` + update the item row). Hide both actions for role `requester`.
  - Where: mobile — `mobile/src/screens/AssetLogDetailScreen.tsx` (+ small modal components if needed).
  - Accept: (1) a move from mobile appears in the web Movements tab with correct from/to and user; (2) a condition update with photo persists and updates the web header state; (3) requester sees a read-only detail.

- [ ] **AG-10 — Reports: register by space, value summary, warranty expiry** (Severity: Medium)
  - What: Add `asset-log-register`, `asset-log-value`, `asset-log-warranty` types to `api/reports/standard/[type]/route.tsx` per §5 (landscape @react-pdf tables using `lib/pdf-report-styles.ts`), with download cards on `dashboard/reports/page.tsx`.
  - Where: web — `web/src/app/api/reports/standard/[type]/route.tsx`, `web/src/app/dashboard/reports/page.tsx`.
  - Accept: (1) register groups site→floor→space with per-space totals; (2) value report totals purchase/current/replacement/repair-spend by type and site, excluding disposed items from current value; (3) warranty report lists ≤90d/expired items sorted by expiry.

- [ ] **AG-11 — Warranty expiry alert cron + notification preference** (Severity: Medium)
  - What: Weekly Vercel cron `api/cron/asset-log-warranty/route.ts` (Bearer `CRON_SECRET`, fail-closed like `api/cron/pm-generate`): find non-disposed items with `warranty_expiry` within 30 days and `warranty_alert_sent_at` null → notify org admins/managers via `NotificationService`, stamp `warranty_alert_sent_at`. Add pref key `asset_log_warranty_expiring` to `lib/notificationTypes.ts` and a `vercel.json` cron entry.
  - Where: web — `web/src/app/api/cron/asset-log-warranty/route.ts`, `web/src/lib/notificationTypes.ts`, `web/vercel.json`.
  - Accept: (1) cron without/with wrong bearer returns 401; (2) an item expiring in 20 days triggers exactly one email/push per opted-in admin across repeated runs; (3) users with the pref off receive nothing.

- [ ] **AG-12 — Bulk-batch split action** (Severity: Medium)
  - What: "Split" on bulk items (web detail): qty N → carve off M into a new row (same fields, new `qr_token`/AL-number, optional different target space), movement rows written on both sides, audit-logged. Server route for atomicity.
  - Where: web — `web/src/app/api/asset-log/[id]/split/route.ts`, detail-page action.
  - Accept: (1) splitting 40 → 10 leaves 30 on the original and creates a 10-qty row with its own QR; (2) quantities validated (0 < M < N); (3) both rows show the split in Movements.

- [ ] **AG-13 — Condition review due reminders** (Severity: Low; Phase 2)
  - What: Extend the AG-11 cron (same route, second query) to notify admins/managers of items whose `last_condition_review_at + condition_review_interval_months` has passed, batched into one digest per org per run; pref key `asset_log_review_due`.
  - Where: web — `web/src/app/api/cron/asset-log-warranty/route.ts`, `web/src/lib/notificationTypes.ts`.
  - Accept: (1) overdue-review items produce one digest notification per org per run; (2) items without an interval are never flagged.

- [ ] **AG-14 — Field-config integration for Asset Log forms** (Severity: Low; Phase 2)
  - What: Register `asset_log_new` / `asset_log_edit` pages in `lib/field-catalog.ts`, wire `useFieldConfig` into the forms and `enforceFieldConfig` into the POST/PATCH routes so per-org required/optional/hidden works like the assets forms.
  - Where: web — `web/src/lib/field-catalog.ts`, asset-log form pages, `api/asset-log` routes.
  - Accept: (1) hiding a field in Settings → Form Fields removes it from the form and the API drops it; (2) marking a field required rejects submissions missing it server-side.

- [ ] **AG-15 — Mobile: Asset Log browse list** (Severity: Low; Phase 2)
  - What: Simple mobile list screen (search + status/type chips, reusing the AssetsScreen layout) reachable from a Home quick action, so items are findable without a printed label.
  - Where: mobile — new `mobile/src/screens/AssetLogListScreen.tsx`, `mobile/src/navigation/index.tsx`, `mobile/src/screens/HomeScreen.tsx` quick action.
  - Accept: (1) list is org-scoped and searchable by name/serial; (2) tapping a row opens `AssetLogDetail`.

---

# Section 5 — Senior Developer Review & Platform-Owner (Admin Panel) Assessment

This section reviews Serviq-FM (Next.js 14 web + Supabase + Expo mobile, bilingual EN/AR, ZATCA VAT) against production-ERP engineering standards, and separately assesses the Platform Admin panel against what a commercial SaaS owner needs. Evidence: `build-db-security.md` (deep data-layer audit), `build-web.md`, `build-mobile.md`, plus direct repo spot-checks. Headline numbers: **7 tables with no RLS at all**, a `SELECT USING (true)` policy exposing all tenants' requester PII to anyone holding the anon key, **zero version-controlled migrations for the 19 base tables**, **zero CI** (no `.github/workflows`), **one orphan test file** in the entire repo (`web/src/components/design-system/Button.test.tsx`, no test runner configured), no error tracking (no Sentry/PostHog/Datadog in either `package.json`), no rate limiting, no CSP, and a push-notification pipeline that is functionally dead end-to-end (mobile writes tokens to `users.push_token`; web reads `user_devices`, which nothing populates). On the positive side: the June-2026 review criticals (unauthenticated `/api/users`, IDOR on approve, etc.) are all verified fixed, API routes follow a consistent auth→profile→org-scope→service-role pattern, impersonation is HMAC-signed and session-bound, and the offboarding flow (full export + 30-day signed URL + account teardown) exceeds what most early SaaS products ship.

## 5.1 Engineering review — status by area

### Security

| Item | Status | Evidence |
|---|---|---|
| Org-scoped RLS on core tenant tables (WOs, assets, sites, sprint-K tables) | **Present** | build-db §2.1; sprint-K SQL has full 4-policy RLS |
| API route auth/org-scoping/role-gating | **Present** | build-db §2.6 — all routes verified; June criticals fixed |
| RLS on `tenant_feature_flags`, `platform_audit_logs`, `mrr_snapshots`, `account_deletion_requests`, `notification_types`, `user_notification_preferences`, `notification_log` | **Missing** | build-db §2.2.1 — anon key can read platform financials, audit logs, notification prefs |
| `requests` table tenant isolation | **Missing** | `SELECT USING (true)` policy — cross-tenant PII dump (names/emails/phones/tracking tokens), build-db §2.2.2 |
| Storage bucket hardening | **Partial** | `media` hardened (sprint-k-01); `work-order-media` + `requests` still allow public listing, anon INSERT, cross-tenant UPDATE (build-db §2.2.3) |
| SECURITY DEFINER RPC safety | **Partial** | `request_account_deletion`/`set_first_login_at` correct; `get_dau_mau`/`get_users_with_login` have no in-function auth, no `SET search_path` (build-db §2.8) |
| `send-push` edge function auth | **Missing** | `supabase/functions/send-push/index.ts` — service role, zero authorization (build-db §2.7) |
| Password reset | **Missing** | No `resetPasswordForEmail` anywhere; sole locked-out admin unrecoverable (build-db §2.4) |
| Temp-password hygiene | **Missing** | `'Serviq'+Math.random()` (~41 bits), echoed in JSON responses, no forced change (build-db §2.4, §2.10) |
| Rate limiting | **Missing** | None anywhere; public submit + uploads unthrottled (build-db §2.9) |
| CSP / security headers / CSRF | **Missing** | `next.config.mjs` has none (build-db §2.9) |
| MFA / SSO | **Missing** | Password-only on all three login surfaces |
| Impersonation | **Present** | HMAC, constant-time, session-bound, 4h TTL, audited (build-db §2.5). *Exceeds typical builds.* Minor: signing key falls back to a hash of the service-role key |
| Input validation | **Partial** | Hand-rolled per route + `enforceFieldConfig`; no schema validation lib; upload route checks path but not content-type/size (build-db §2.9) |
| Email HTML escaping | **Present** | `lib/escapeHtml.ts` at every interpolation site |

### Data layer & correctness

| Item | Status | Evidence |
|---|---|---|
| Version-controlled migrations | **Missing** | No `supabase/migrations/`; 19 base tables have no SQL in repo — DB cannot be rebuilt from source (build-db caveat, §2.2.5) |
| Push notifications end-to-end | **Missing (broken)** | Token schema split: mobile writes `users.push_token` (`mobile/src/lib/notifications.ts:42-45`); `/api/push` reads `user_devices` which nothing writes → every send is 404 (build-db §3.7) |
| `/request` wizard correctness | **Missing (broken)** | Inserts directly into `work_orders` with `source: 'requester'` (`web/src/app/request/page.tsx:101,108` — verified) which bypasses the requests approval queue and likely violates the live DB CHECK (`manual|pm_schedule`), i.e. the insert fails outright |
| PM cron lead time | **Missing (broken)** | Cron selects `lead_time_days` but hardcodes `addDays(now, 2)` cutoff (`api/cron/pm-generate/route.ts:68` — verified); schedules with longer lead times silently ignored |
| Asset PM History tab | **Missing (broken)** | `setPmHistory` never called (`dashboard/assets/[id]/page.tsx:70` — verified); tab always shows 0 |
| Vendor assignment integrity | **Missing (broken)** | WO edit writes vendor id into `assigned_to` (a users FK column) — build-web §11; poisons notifications and joins |
| Invoice numbering | **Partial** | `INV-<year>-<epoch>` in JS, no unique constraint; `next_tenant_invoice_number` MAX-scan race (build-db §3.9) — ZATCA requires unique sequential numbers |
| `team_members` org integrity | **Partial** | Client-attested `organisation_id`, no composite FK — cross-org rows mintable (build-db §2.2.4) |
| `additional_workers` referential integrity | **Partial** | uuid[] with no FK; user delete leaves dangling ids (build-db §3.9) |
| 6-month media retention | **Partial** | `media_expires_at` + UI warnings exist; no purge job anywhere (build-web §17) |

### Performance & scalability

| Item | Status | Evidence |
|---|---|---|
| Server-side pagination | **Missing** | 9 of 13 web list pages full-table fetch; WO page paginates client-side after fetching everything; mobile lists unbounded (build-db §3.1) |
| Dashboard aggregation | **Partial** | `Promise.all` + narrow columns, but full-row fetch + client aggregation; `api/reports/dashboard` does 4 full-table selects (build-db §3.2). Some KPI deltas are hard-coded fakes ("+12%") shown to users (build-web §1) |
| Middleware cost | **Partial** | 2–3 serialized round-trips (GoTrue + 1–2 PostgREST) per `/dashboard/*` navigation, uncached (build-db §3.4); token refresh `setAll` is a no-op |
| Notification fan-out | **Partial** | Per-recipient preference read + log insert + internal HTTP hop to own `/api/push` (build-db §3.3) |
| Indexing | **Present** | Repo-defined tables well-indexed; base-table indexes unverifiable without live-DB check (build-db §3.5) |
| Realtime | **Missing** | Zero subscriptions in web or mobile; multi-user boards go stale (build-db §3.6) |

### Architecture, code quality, duplication

| Item | Status | Evidence |
|---|---|---|
| Consistent API auth pattern | **Present** | build-db §2.1 — but the auth→profile→org boilerplate is copy-pasted into ~25 routes; `lib/auth-helper.ts` helpers exist and are mostly unused (build-db §3.7) |
| Web/mobile code sharing | **Missing** | Mobile re-implements categories, status colors, WO queries; no shared types package; mobile has no services layer — every screen queries Supabase inline (build-mobile intro) |
| PM roll-forward logic | **Partial** | Duplicated in cron, `pm-utils.ts` ("keep in sync" comment), and hand-rolled again in `pm-schedules/new/page.tsx` (build-db §3.7) |
| File placement | **Partial** | `api/assets/hierarchy.ts` is a lib inside the route tree; second hierarchy lib in the page tree; SQL lives in `docs/superpowers/sql/` while `supabase/` holds one orphaned function (build-db §3.8) |
| Dead weight | **Partial** | `nodemailer` (web, unused — verified in package.json), `@nozbe/watermelondb` (mobile, never imported — verified), `lib/brand.ts` legacy, orphaned `send-push` function, stale `?run=1` doc in CONTEXT.md |
| Inline styles / styling consistency | **Partial** | Tailwind + inline-style mix (build-web intro); workable now, drags on theming/custom-branding later — noted, not a to-do on its own |

### Testing, CI, observability, DR

| Item | Status | Evidence |
|---|---|---|
| CI pipeline | **Missing** | No `.github/workflows` (verified); no typecheck/test scripts in either package.json (only `next lint`) |
| Test coverage | **Missing** | One orphan test file repo-wide, no runner configured (verified) |
| Error tracking / observability | **Missing** | No Sentry/PostHog/Datadog/Axiom in deps (verified); `console.error` only; no alerting when the PM cron or MRR snapshot silently fails |
| Backup / DR | **Missing** | No migrations to rebuild from (see above); Supabase PITR posture undocumented; offboard exports are the only tenant-level export mechanism |
| Env documentation | **Partial** | `mobile/.env.example` exists; no `web/.env.example`; mobile Supabase URL/key hardcoded, blocking rotation without an app release (build-db §2.10) |

### Mobile app

| Item | Status | Evidence |
|---|---|---|
| Core field flows (WO list/detail/status/comments/photos/timer, assets, QR) | **Present** | build-mobile §2 — solid: compressed uploads, read-modify-write photo retry, SecureStore chunking |
| Offline mode | **Missing** | No NetInfo/queue/cache; WatermelonDB dep unused (build-mobile §7) |
| Notification tap → navigation / deep links | **Missing** | No response listener, no `linking` config, inert Home bell (build-mobile §4) |
| Role gating on writes | **Partial** | Any signed-in role (incl. requester) can change status, log time, upload photos (build-mobile §5) |
| WO edit/assign, checklists, parts, PM completion | **Missing** | build-mobile §7 — web-only |
| Password reset, biometrics | **Missing** | build-mobile §2.1 |
| Full RTL layout flip | **Partial** | Text-alignment only; no `I18nManager.forceRTL` (build-mobile §6) |

**Where the build exceeds expectations:** session-bound HMAC impersonation with audit attribution; offboarding with full data export; last-active-admin safety rails; per-org form-field configuration with server enforcement; systematic email HTML escaping; ZATCA Phase-2 TLV QR on client invoices; mobile SecureStore chunking adapter and photo-upload concurrency retry.

### To-Dos

- [ ] **DV-01 — Enable RLS on the 7 unprotected tables** (Severity: Critical)
  - What: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + policies (or revoke PostgREST grants) on `tenant_feature_flags`, `platform_audit_logs`, `mrr_snapshots`, `account_deletion_requests`, `notification_types`, `user_notification_preferences`, `notification_log`. Platform tables get no-access policies (service role bypasses RLS); user prefs get self-scoped policies; `notification_types` gets authenticated read-only.
  - Where: new SQL migration (db); source files `docs/superpowers/sql/sprint-f-01-foundation.sql`, `account-deletion.sql`, sprint-d plan SQL.
  - Accept: `anon`-key PostgREST requests to all 7 tables return empty/403; existing web flows (settings notifications tab, platform dashboard) still work via service role.

- [ ] **DV-02 — Drop the public SELECT policy on `requests`** (Severity: Critical)
  - What: Remove the `"public can track own request"` `SELECT USING (true)` policy. The `/track/[token]` page already reads via service role, so nothing breaks.
  - Where: db migration; verify `web/src/app/(public)/track/[token]/page.tsx` still renders.
  - Accept: anon-key `select * from requests` returns 0 rows; tracking page still shows request status by token.

- [ ] **DV-03 — Harden `work-order-media` and `requests` storage buckets** (Severity: Critical)
  - What: Replicate sprint-k-01: drop public SELECT (listing) on both buckets, scope `requests` INSERT (size/MIME/path prefix), restrict `work-order-media` UPDATE to owner instead of any authenticated user of any tenant.
  - Where: db migration mirroring `docs/superpowers/sql/sprint-k-01-*.sql`.
  - Accept: anon listing of both buckets fails; cross-tenant authenticated overwrite of a WO photo fails; public request photo upload via the portal still works.

- [ ] **DV-04 — Lock down SECURITY DEFINER RPCs and the `send-push` edge function** (Severity: Critical)
  - What: Add `SET search_path = public` + in-function platform-admin checks (or `REVOKE EXECUTE FROM authenticated`) on `get_dau_mau` and `get_users_with_login`; delete `supabase/functions/send-push` (nothing calls it, and `/api/push` supersedes it) or add caller auth.
  - Where: db migration; `supabase/functions/send-push/index.ts`; `web/src/lib/push.ts` (points at the edge function — retarget to `/api/push`).
  - Accept: tenant-user `supabase.rpc('get_users_with_login', ...)` fails; no code path still references the deleted/secured function.

- [ ] **DV-05 — Fix the push-token schema split so push actually delivers** (Severity: Critical)
  - What: Pick one store (simplest: keep `users.push_token`/`push_platform` that mobile already writes) and point `/api/push` at it; delete the `user_devices` read path or backfill it. Then wire the mobile notification-tap listener (see DV-19).
  - Where: `web/src/app/api/push/route.ts:68`, `web/src/app/api/users/delete/route.ts` (user_devices cleanup), `mobile/src/lib/notifications.ts`.
  - Accept: a WO status change sends an Expo push that arrives on a device registered via the mobile app; Push Audit tab logs `sent` not `error`.

- [ ] **DV-06 — Commit the full schema as real Supabase migrations** (Severity: Critical)
  - What: `supabase db pull` (or `pg_dump --schema-only`) against project `cnpsplprnnabhrjjeqwp` into `supabase/migrations/`, covering all 31 tables, the `tenant_health` view, functions, triggers, RLS policies, and storage policies. This is the DR baseline — today the DB cannot be rebuilt from source.
  - Where: new `supabase/migrations/`; retire `docs/superpowers/sql/` as the schema source of truth.
  - Accept: `supabase db reset` on a fresh local project produces a schema the app boots against; base-table RLS policies are reviewable in the repo.

- [ ] **DV-07 — Fix or remove the `/request` wizard's direct work_orders insert** (Severity: Critical)
  - What: The logged-in requester wizard inserts into `work_orders` with `source: 'requester'` (`web/src/app/request/page.tsx:101,108`), which bypasses the approval queue and likely violates the live `source` CHECK (`manual|pm_schedule`) — i.e. it fails outright. Route it into the `requests` table so it lands in the triage queue like portal submissions.
  - Where: `web/src/app/request/page.tsx` (web).
  - Accept: a requester submission appears in `/dashboard/requests` as pending; no direct `work_orders` insert from the wizard; submission succeeds against the live CHECK.

- [ ] **DV-08 — Self-service password reset (web + mobile)** (Severity: High)
  - What: `resetPasswordForEmail` + recovery-redirect page on web; "Forgot password" link on all three login surfaces (mobile can open the web reset URL — no in-app flow needed).
  - Where: `web/src/app/login/client/page.tsx`, `login/employee`, new `web/src/app/reset-password/page.tsx`; `mobile/src/screens/LoginScreen.tsx`.
  - Accept: a locked-out sole admin can regain access without platform-staff intervention; recovery link sets a new password and lands in the dashboard.

- [ ] **DV-09 — CSPRNG temp passwords, force change on first login, stop echoing them** (Severity: High)
  - What: Replace `'Serviq'+Math.random()` with `crypto.randomBytes`-derived passwords; require a password change on first login (or switch invites to Supabase invite links); remove the temp password from the `/api/users` JSON response (email-only delivery). Keep the deliberate on-screen display at platform tenant-creation if desired, but generate it properly.
  - Where: `web/src/app/api/users/route.ts`, `api/users/[id]/resend-invite/route.ts`, `api/platform/tenants/route.ts`.
  - Accept: temp passwords are ≥128-bit CSPRNG output; invite API response contains no password; first login forces a change.

- [ ] **DV-10 — Rate-limit public and auth-adjacent endpoints** (Severity: High)
  - What: Add per-IP rate limiting (Upstash Ratelimit or Vercel WAF rules) on `/api/requests/submit`, `/api/upload`, the `requests` bucket path, login pages, and `/api/push`. Also add content-type + size validation to `/api/upload` while in there.
  - Where: `web/src/middleware.ts` or per-route; `web/src/app/api/upload/route.ts`.
  - Accept: >N submits/min from one IP get 429; a 100 MB or non-image upload to a photo field is rejected.

- [ ] **DV-11 — Read `lead_time_days` in the PM cron** (Severity: High)
  - What: Replace the hardcoded 2-day cutoff with per-schedule lead time: fetch schedules where `next_due_at <= now + lead_time_days` (move the filter into SQL, e.g. `next_due_at <= now() + (lead_time_days || ' days')::interval` via an RPC or filter post-fetch).
  - Where: `web/src/app/api/cron/pm-generate/route.ts:68-76` (web); the column already exists (sprint-j-01).
  - Accept: a schedule with `lead_time_days=7` gets its WO generated 7 days ahead; default-2 schedules unchanged.

- [ ] **DV-12 — Stop writing vendor ids into `work_orders.assigned_to`** (Severity: High)
  - What: Add a nullable `assigned_vendor_id → vendors` column (the vendor detail page already queries by that name, per build-web §11) and write vendor picks there; keep `assigned_to` users-only. Migrate existing vendor-id rows.
  - Where: db migration; `web/src/app/dashboard/work-orders/[id]/edit/page.tsx`; WO detail rendering; notification triggers that assume `assigned_to` is a user.
  - Accept: assigning a vendor no longer breaks assignee display/notifications; vendor detail "Work Orders" tab shows vendor-assigned WOs.

- [ ] **DV-13 — Make invoice numbers collision-proof** (Severity: High)
  - What: `invoices.invoice_number`: DB unique constraint + per-org Postgres sequence (or `INSERT ... ON CONFLICT` retry) instead of `Date.now()` in JS. `next_tenant_invoice_number`: wrap in an advisory lock or use a sequence. ZATCA expects unique sequential numbering.
  - Where: db migration; `web/src/app/api/invoices/create/route.ts:68-85`; `docs/superpowers/sql/sprint-i-03` function.
  - Accept: unique index exists on `(organisation_id, invoice_number)`; concurrent invoice creation produces no duplicates.

- [ ] **DV-14 — Server-side pagination on list pages (web + mobile)** (Severity: High)
  - What: `.range()`-based pagination with server-side filtering/count on the 9 unpaginated web lists (sites, users, vendors, inventory, teams, invoices, requests, assets, pm-schedules, inspections) and convert the WO page's client-side slicing to server-side; add `.limit()` + load-more to mobile `WorkOrdersScreen`/`AssetsScreen`.
  - Where: `web/src/app/dashboard/*/page.tsx`; `mobile/src/screens/WorkOrdersScreen.tsx`, `AssetsScreen.tsx`.
  - Accept: list pages issue queries with `range` headers; a 5,000-WO org loads the WO list in <2s with correct filtered counts.

- [ ] **DV-15 — Set up CI: typecheck, lint, build for web and mobile** (Severity: High)
  - What: GitHub Actions workflow running `tsc --noEmit`, `next lint`, `next build` (web) and `tsc --noEmit` (mobile) on PRs to main. Add a test runner (vitest) and seed it with tests for the highest-risk pure logic: `lib/zatca.ts`, `pm-utils.ts` roll-forward, `lib/fieldEnforcement.ts`, `api/assets/hierarchy.ts` depth/cycle guard.
  - Where: new `.github/workflows/ci.yml`; `web/package.json`, `mobile/package.json`.
  - Accept: a PR with a type error fails CI; the 4 seed test suites run and pass in CI.

- [ ] **DV-16 — Add error tracking and cron-failure alerting** (Severity: High)
  - What: Sentry (web + mobile) for unhandled errors; instrument `pm-generate` and `mrr-snapshot` crons to alert (Sentry cron monitors or a simple email on catch) instead of failing silently. Today nothing tells the owner PM generation stopped.
  - Where: `web/sentry.*.config`, `mobile/App.tsx`; `api/cron/pm-generate/route.ts`, `api/platform/cron/mrr-snapshot/route.ts`.
  - Accept: a thrown error in an API route appears in Sentry with org context; a cron that fails or misses a schedule fires an alert.

- [ ] **DV-17 — Enforce `team_members` org integrity in the DB** (Severity: High)
  - What: Composite FKs — `(team_id, organisation_id) → teams(id, organisation_id)` and `(user_id, organisation_id) → users(id, organisation_id)` (add the needed unique constraints) — so the client-attested `organisation_id` can't mint cross-org membership rows.
  - Where: db migration extending `docs/superpowers/sql/sprint-k-05`.
  - Accept: inserting a team_members row whose team belongs to another org fails at the DB.

- [ ] **DV-18 — Security headers + CSP** (Severity: Medium)
  - What: Add `headers()` in `next.config.mjs`: CSP (allow self + Supabase URL + `api.qrserver.com` until DV-27 removes it), `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS.
  - Where: `web/next.config.mjs`.
  - Accept: response headers present on all pages; dashboard, uploads, QR rendering, and PDF export still work under the CSP.

- [ ] **DV-19 — Mobile notification tap → deep link to the WO** (Severity: Medium)
  - What: Add `Notifications.addNotificationResponseReceivedListener`, a `linking` config/scheme, and include `wo_id` in push payloads so tapping a "WO assigned" push opens `WorkOrderDetail`. Depends on DV-05.
  - Where: `mobile/src/lib/notifications.ts`, `mobile/src/navigation/index.tsx`, `mobile/app.json` (scheme); `web/src/app/api/push/route.ts` (payload data).
  - Accept: tapping a push with the app cold/backgrounded lands on the correct WO detail screen.

- [ ] **DV-20 — Server-side dashboard aggregates + remove fake KPI decorations** (Severity: Medium)
  - What: Replace full-table fetch + client aggregation with `count`-head queries or one RPC returning the KPI set; delete the hard-coded "+12%"/"-5%"/"8 scheduled" decorations (or compute them for real). Same for `api/reports/dashboard`.
  - Where: `web/src/components/pages/DashboardOverviewPage.tsx:64-68`, `web/src/app/api/reports/dashboard/route.tsx:20-23`, WO list stat cards.
  - Accept: dashboard issues no `select('*')` on work_orders; every number shown derives from real data.

- [ ] **DV-21 — Extract `requireOrgUser()` and adopt it across API routes** (Severity: Medium)
  - What: One helper (auth → users profile → org id → optional role check) in `lib/auth-helper.ts` (extend the existing `getOrgId`/`getScopedSupabaseClient`), then sweep the ~25 routes that copy-paste the boilerplate. Also move `api/assets/hierarchy.ts` into `lib/` and merge with `dashboard/assets/asset-hierarchy.ts`; dedupe the PM roll-forward logic to one module used by cron + UI.
  - Where: `web/src/lib/auth-helper.ts`, `web/src/app/api/**`, `web/src/lib/` (hierarchy, pm-utils).
  - Accept: no route re-implements the auth/profile/org lookup; one hierarchy lib; cron and `pm-utils.ts` import the same roll-forward function.

- [ ] **DV-22 — Batch NotificationService fan-out** (Severity: Medium)
  - What: One `.in('user_id', ids)` preference read and one bulk `notification_log` insert per event; call the push logic directly instead of `fetch(appUrl + '/api/push')` (extract the send into a lib both use).
  - Where: `web/src/lib/NotificationService.ts:63-123`, `web/src/app/api/push/route.ts`.
  - Accept: a portal submit to a 20-admin org performs ≤5 DB operations and zero self-HTTP hops.

- [ ] **DV-23 — Implement the promised media purge job** (Severity: Medium)
  - What: Cron that deletes storage objects and clears `photo_urls` for WOs past `media_expires_at` (the 6-month retention the UI already promises), with a platform audit trail.
  - Where: new `web/src/app/api/cron/media-purge/route.ts` + `vercel.json` cron entry (db/storage).
  - Accept: WOs with `media_expires_at < now()` have photos removed on the next run; the WO detail warning disappears after purge.

- [ ] **DV-24 — Wire the overdue-WO escalation notifier** (Severity: Medium)
  - What: Cron invoking the existing `notifyWOOverdue` helper for WOs past `due_at` and not completed (once per WO, tracked via flag or notification_log dedupe).
  - Where: `web/src/lib/notifications/workOrderNotifications.ts`; new cron route + `vercel.json`.
  - Accept: an overdue WO triggers exactly one escalation email/push to assignee + manager per breach.

- [ ] **DV-25 — Role-gate mobile write actions** (Severity: Medium)
  - What: Requesters (and arguably technicians on non-assigned WOs) shouldn't change status, log time, or upload photos. Gate the mobile action buttons by role/assignment; mirror at the RLS or route layer where feasible.
  - Where: `mobile/src/screens/WorkOrderDetailScreen.tsx`; db policy if worth enforcing server-side.
  - Accept: a requester account sees read-only WO detail; technician can act only on WOs assigned to them (or their team).

- [ ] **DV-26 — Shared services layer for mobile + shared constants** (Severity: Medium)
  - What: Extract mobile's inline Supabase queries into `mobile/src/services/` (workOrders, assets, auth) and lift shared constants (categories, status/priority palettes) into one module mirrored from web types — precondition for offline (DV-30) and sane maintenance.
  - Where: `mobile/src/services/` (new), `mobile/src/lib/categories.ts`, screens.
  - Accept: no screen file contains a `.from('work_orders')` call; category/status values verifiably identical to web's.

- [ ] **DV-27 — Render asset QR codes locally instead of api.qrserver.com** (Severity: Medium)
  - What: The asset detail QR tab hits an external third-party service (`api.qrserver.com`) with asset data — availability + privacy smell. Use the same local QR generation the PDF export path already uses.
  - Where: `web/src/app/dashboard/assets/[id]/page.tsx` (QR tab).
  - Accept: no external QR host in network traffic; QR renders and prints offline.

- [ ] **DV-28 — Fix the dead PM History tab on asset detail** (Severity: Medium)
  - What: `pmHistory` state is never populated. Load completed PM-sourced WOs for the asset (`work_orders` where `asset_id` = X and `pm_schedule_id is not null`) or remove the tab.
  - Where: `web/src/app/dashboard/assets/[id]/page.tsx:70,405-419`.
  - Accept: an asset with completed PM WOs shows them in the tab; count in the tab label is real.

- [ ] **DV-29 — Realtime (or polling) refresh for WO list/detail** (Severity: Medium, Phase 2)
  - What: Supabase `postgres_changes` subscription on `work_orders` scoped to org for the web WO list and mobile list — status changes appear without manual refresh. Polling every 60s is an acceptable lazy first cut.
  - Where: `web/src/app/dashboard/work-orders/page.tsx`; `mobile/src/screens/WorkOrdersScreen.tsx`.
  - Accept: a status change by user A appears on user B's open WO list within 60s without a manual refresh.

- [ ] **DV-30 — Mobile offline queue for field techs** (Severity: Medium, Phase 2)
  - What: Cache assigned WOs locally, queue status changes/comments/photos while offline, replay on reconnect (NetInfo + AsyncStorage queue is enough — either use the already-installed WatermelonDB or remove it, don't leave it dead).
  - Where: `mobile/src/` services layer (after DV-26); `mobile/package.json`.
  - Accept: airplane-mode status change + comment sync when connectivity returns; conflict = last-write-wins with a logged comment.

- [ ] **DV-31 — Repo hygiene sweep** (Severity: Low)
  - What: Remove `nodemailer` (web) and `@nozbe/watermelondb` (mobile, unless DV-30 adopts it); delete `lib/brand.ts`; fix stale `?run=1` cron doc in CONTEXT.md; add `web/.env.example` listing the 10 env vars; move mobile Supabase URL/key to `app.json` extra/env; set a dedicated `IMPERSONATION_SIGNING_KEY` in prod; scrub `additional_workers` arrays on user delete; fix the middleware `setAll` no-op token refresh.
  - Where: `web/package.json`, `mobile/package.json`, `web/src/lib/brand.ts`, `CONTEXT.md`, `mobile/src/lib/supabase.ts`, `web/src/middleware.ts:89-98`, `api/users/delete/route.ts`.
  - Accept: `npm ls nodemailer` empty; fresh clone can configure web from `.env.example`; no dangling worker ids after user deletion.

- [ ] **DV-32 — Full RTL layout flip on mobile** (Severity: Low)
  - What: Adopt `I18nManager.forceRTL` (with the required restart flow) or systematic `flexDirection` mirroring; today Arabic gets text alignment only, which reads wrong for a Saudi-first product.
  - Where: `mobile/src/context/LangContext.tsx`, screens.
  - Accept: in Arabic, tab bar, cards, and chevrons mirror; no truncated/overlapping labels on the 4 main screens.

## 5.2 Platform Admin panel — business-owner assessment

What exists is a respectable v1 back office (build-web §16): MRR/ARR dashboard with snapshot history, DAU/MAU, tenant health scoring with "needs attention" triage, per-tenant billing metadata, 5 feature flags, session-bound impersonation, platform audit log, a health page (Supabase latency, email stats), manual tenant invoices with per-org numbering, tenant creation, per-user kill switches, and a genuinely good offboarding flow (export-zip → signed URL → account teardown → reactivate). That covers *observing* the business. What's missing is everything that *runs* the business without the owner doing manual work: money collection, plan enforcement, self-serve growth, and being told when things break.

| Owner need | Status | Evidence / gap |
|---|---|---|
| Revenue dashboard (MRR/ARR/churn/DAU/MAU) | **Present** | `platform/dashboard`, `mrr_snapshots` cron (build-web §16) |
| Tenant health & churn-risk triage | **Present** | `tenant_health` view, health buckets — *exceeds typical v1* |
| Impersonation with audit attribution | **Present** | build-web §16, build-db §2.5 — *exceeds typical v1* |
| Offboarding + data export | **Present** | `lib/offboardExport.ts`, 30-day signed URL — *exceeds typical v1* |
| Platform audit log | **Present** | `platform/audit` (but table lacks RLS — DV-01) |
| Subscription billing automation | **Missing** | Stripe IDs stored "for reference"; plan/MRR hand-edited (`platform/tenants/[id]/billing/BillingForm.tsx`) |
| Self-serve signup → trial → upgrade | **Missing** | Tenants only created by platform admin; tenant "upgrade" is a mailto (build-web §14) |
| Plan-limit enforcement (seats/WOs/storage) | **Missing** | Flags are boolean feature gates only; no quantitative limits anywhere |
| Dunning / payment-failure handling | **Missing** | `billing_status` is a manually-set label; nothing emails tenants or restricts access |
| Usage metering | **Missing** | No per-tenant seat/WO/storage counters surfaced to owner or tenant |
| Announcements / changelog to tenants | **Missing** | No mechanism |
| Support tooling | **Partial** | Impersonation + contract_notes exist; no ticket/contact log, no support inbox integration |
| Tenant data export/import (onboarding) | **Partial** | Export exists at offboarding only; CSV import exists per-entity (assets/sites/spaces/inventory) but no full-tenant import or competitor-migration path |
| GDPR/PDPL posture | **Partial** | Account-deletion RPC (soft) + offboard export exist; no PDPL docs, no data-residency statement (Supabase region), no retention enforcement (media purge missing — DV-23), soft-deletes never hard-purged |
| Public status page | **Missing** | `platform/health` is internal-only, pull-based |
| Product analytics | **Missing** | No PostHog/analytics dependency (verified) |
| Feature-flag UI | **Partial** | 5 flags with UI; `api_access`/`custom_branding` gate nothing (build-web §0); no plan→flag defaults |
| Platform SLA monitoring/alerting | **Missing** | No error tracking, no cron-failure alerts, no uptime pager — the owner finds out from customers |

### To-Dos

- [ ] **AP-01 — Stripe subscription billing automation** (Severity: High)
  - What: Stripe Products/Prices for free/starter/pro/enterprise; Checkout for upgrades; webhook handler syncing `plan`, `billing_status`, `mrr_cents`, `renews_at`, `stripe_*` ids on `organisations`. Replaces hand-edited BillingForm values (keep manual override for enterprise contracts).
  - Where: new `web/src/app/api/stripe/webhook/route.ts`, `platform/tenants/[id]/billing/BillingForm.tsx`, db (no schema change needed — columns exist).
  - Accept: completing a Stripe Checkout flips the org's plan and MRR without admin touch; a failed charge sets `billing_status='failed'` via webhook.

- [ ] **AP-02 — Plan-limit definition and enforcement (seats/WOs/storage)** (Severity: High)
  - What: A per-plan limits map (users, active WOs/month, storage GB, sites) checked server-side at user invite, WO create, upload, and site create; friendly upgrade-prompt errors. Store limits in code (one constants file) — no admin CRUD needed yet.
  - Where: new `web/src/lib/planLimits.ts`; enforcement in `api/users/route.ts`, `api/work-orders/route.ts`, `api/upload/route.ts`, `api/sites/route.ts`; mobile create paths inherit via RLS-adjacent route checks where applicable.
  - Accept: a free-plan org hitting its seat limit gets a 403 with upgrade messaging; platform tenant detail shows usage vs limit.

- [ ] **AP-03 — Self-serve signup → trial → upgrade funnel** (Severity: High)
  - What: Public signup page creating org + admin (trial plan with expiry date on `organisations`), email verification, trial-expiry banner + read-only lockout after expiry, in-app upgrade CTA into AP-01's Checkout. Reuse the existing platform tenant-creation service logic.
  - Where: new `web/src/app/signup/`, `api/signup/route.ts` (reuse `api/platform/tenants` logic), `middleware.ts` (trial-expired gate), db migration (`trial_ends_at`).
  - Accept: a stranger can create a working trial org with no platform-admin involvement; expired trials are gated with an upgrade path; new signups appear in the platform tenants list.

- [ ] **AP-04 — Platform alerting: errors, cron failures, uptime** (Severity: High)
  - What: The owner must be paged, not discover outages from tenants. Wire DV-16's Sentry to email/Slack alerts; add uptime monitoring (UptimeRobot/Better Stack) on the app + a synthetic login check; alert on email-delivery failure spikes (data already in `notification_log`).
  - Where: external services + `web/src/app/api/cron/*` instrumentation; optionally a `platform/health` alert-threshold config.
  - Accept: killing the PM cron or taking the site down produces an owner notification within 15 minutes.

- [ ] **AP-05 — Dunning flow** (Severity: Medium)
  - What: On `billing_status='failed'` (from AP-01 webhook): automated email sequence (day 0/3/7), banner in tenant dashboard, restrict to read-only after grace period, auto-flag in "needs attention". Uses existing Resend + middleware gates.
  - Where: new cron `api/platform/cron/dunning/route.ts`, `lib/email.ts` templates, `middleware.ts` (grace-period gate).
  - Accept: a tenant with failed billing gets the email sequence and becomes read-only after N days; paying via the emailed link restores access.

- [ ] **AP-06 — Usage metering per tenant** (Severity: Medium)
  - What: Nightly per-tenant usage snapshot (active users, WOs created 30d, storage bytes, sites) into a `tenant_usage` table; surface in platform tenant detail (usage vs plan limit bars) and tenant Settings (so tenants see their own consumption).
  - Where: db migration; new cron route; `platform/tenants/[id]` Overview tab; `dashboard/settings` Organisation tab.
  - Accept: owner can see any tenant's seat/WO/storage usage trend; numbers match live counts within 24h.

- [ ] **AP-07 — Announcements & changelog to tenants** (Severity: Medium)
  - What: Platform-admin CRUD for announcements (title EN/AR, body, severity, audience: all/plan/tenant, active window) + dismissible banner in the tenant dashboard shell. Doubles as the maintenance-window channel.
  - Where: db migration (`platform_announcements` + per-user dismissals); `platform/announcements` page; banner in `app/dashboard/layout.tsx`.
  - Accept: publishing an announcement shows it to targeted tenants in both languages; dismissal persists per user.

- [ ] **AP-08 — PDPL/data-protection posture** (Severity: Medium)
  - What: Saudi PDPL basics for selling to enterprise: document Supabase region/data residency, publish a DPA + data-inventory doc, add hard-delete completion for `account_deletion_requests` (a purge cron finishing what the soft-delete starts), and honor retention via DV-23. Mostly docs + one cron.
  - Where: `docs/` (DPA, residency statement), new purge cron; `web/src/app/privacy-policy/page.tsx` updates.
  - Accept: deletion requests are hard-purged within a stated SLA (e.g. 30 days); a prospect security questionnaire can be answered from the docs.

- [ ] **AP-09 — On-demand tenant data export + import** (Severity: Medium)
  - What: Reuse `lib/offboardExport.ts` as an on-demand "Export tenant data" button (tenant admin settings + platform tenant detail) without offboarding; add a guided full-tenant import (sites→spaces→assets→users CSV bundle) for onboarding migrations from UpKeep/spreadsheets.
  - Where: `web/src/lib/offboardExport.ts` (extract), `dashboard/settings`, `platform/tenants/[id]`, new import wizard reusing existing per-entity CSV importers.
  - Accept: tenant admin downloads a complete zip of their data on demand; a 4-file CSV bundle onboards a new tenant with linked sites/spaces/assets.

- [ ] **AP-10 — Public status page** (Severity: Low)
  - What: Hosted status page (Better Stack / Instatus free tier) covering app, API, Supabase; link it in the footer and from error states. Do not build one.
  - Where: external service; `web/src/app/page.tsx` footer link.
  - Accept: status.serviq URL reflects an induced outage; linked from the marketing site.

- [ ] **AP-11 — Product analytics** (Severity: Low)
  - What: PostHog (EU or self-host if PDPL-sensitive) on web + mobile: page/screen views, feature events (WO created, invoice generated, import used), grouped per tenant — feeds pricing/packaging and churn analysis.
  - Where: `web/src/app/layout.tsx` provider, key API routes; `mobile/App.tsx`.
  - Accept: owner can answer "which tenants used invoicing this month" from the analytics dashboard.

- [ ] **AP-12 — Make dead feature flags real or remove them** (Severity: Low)
  - What: `api_access` and `custom_branding` persist but gate nothing. Either wire minimal behavior (custom_branding: logo + accent color on tenant dashboard and invoice PDFs; api_access: defer until a public API exists) or drop them from the flags UI to stop selling vapor.
  - Where: `platform/tenants/[id]/flags/FlagsForm.tsx`, `lib/featureFlags.ts`; invoice PDF template if branding is chosen.
  - Accept: every toggle in the flags UI observably changes tenant behavior; also add plan→default-flag mapping on tenant creation.

- [ ] **AP-13 — ZATCA-compliant platform invoices + auto-generation** (Severity: Low)
  - What: The platform's own `tenant_invoices` lack the ZATCA TLV QR the product already generates for tenants' client invoices (`lib/zatca.ts`) — Serviq itself sells in KSA. Add QR/VAT fields to the tenant-invoice PDF and auto-draft monthly invoices from plan/MRR for non-Stripe (bank-transfer) tenants.
  - Where: `web/src/lib/zatca.ts` (reuse), tenant-invoice PDF route, optional cron.
  - Accept: a generated tenant invoice carries a valid ZATCA TLV QR; monthly drafts appear for active bank-transfer tenants.

---
**Severity counts:** Engineering (DV): 7 Critical, 10 High, 13 Medium, 2 Low = 32. Admin/business (AP): 4 High, 5 Medium, 4 Low = 13. Total: 45 to-dos (7 Critical, 14 High, 18 Medium, 6 Low).
