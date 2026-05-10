# ServIQ-FM — Project Context & Task Tracker

**ServIQ-FM** is a bilingual (Arabic + English) Facility Management SaaS platform targeting the Saudi/GCC market. Phase 1 beta launch in progress.

> **How to use this file:** Mark tasks `[x]` when done. Each sprint links to its design doc and plan. Update at the start of each session.

---

## Legend
- `[x]` Done
- `[ ]` Pending
- `[~]` In Progress
- `[!]` Blocked

---

## Completed Work

### Weeks 1 & 2 — Dashboard Brand + ESLint + Mobile Foundation
- [x] Dashboard layout with branded sidebar (navy/teal gradient)
- [x] All dashboard pages: work orders, assets, sites, users, vendors, inventory, PM schedules, reports, settings, inspections
- [x] Bilingual support EN/AR via LanguageContext + `t()` helper
- [x] Brand constants (`C`, `F`, `cardStyle`, `primaryBtn`, etc.) in `web/src/lib/brand.ts`
- [x] Next.js `<Image>` migration across all pages
- [x] ESLint clean — zero warnings or errors
- [x] Mobile: Expo SDK 54, technician app scaffolded, push notifications, QR scanner

### Week 3 — ZATCA Invoicing, Security, Vercel Deploy
- [x] `@react-pdf/renderer` installed
- [x] ZATCA Phase 2 TLV QR encoder (`web/src/lib/zatca.ts`)
- [x] Invoice PDF generation API (`web/src/app/api/invoices/generate/route.ts`)
- [x] Download invoice button on closed work orders
- [x] Invoices list page (`web/src/app/dashboard/invoices/page.tsx`)
- [x] Invoices nav item in Sidebar
- [x] Security checks passed (org_id scoping, env files gitignored, no hardcoded URLs)
- [x] Vercel production deployed — auto-deploy from `main`
- [ ] **EAS production build (iOS + Android) — PENDING (Task 7 from Week 3 plan)**

### Pre-Mobile Sprint — Landing Page & Auth Polish
- [x] Landing page at `/` — full branded ServIQ-FM marketing page
- [x] `/login` now redirects to `/login/employee`
- [x] `/login/client` — client-facing tenant login portal
- [x] `/login/employee` — employee/platform admin login portal
- [x] `/auth/logout` POST route created (was 404)
- [x] DNS instructions provided (Hostinger A record → 76.76.21.21, CNAME www → cname.vercel-dns.com)

---

## Active Sprints

---

### Sprint A — Quick Fixes *(~0.5 day)*
**Goal:** Two small bugs with outsized UX impact.

- [x] **A1 — Logout redirect**
  - `web/src/app/auth/logout/route.ts` — redirect changed to `/login/client`

- [x] **A2 — Work order sequential numbering**
  - `wo_number` column + Supabase trigger added (run SQL in Supabase editor — see plan)
  - Displays as `WO-0001`, `WO-0002` in list and detail pages
  - Search by WO number supported

---

### Sprint B — Spaces & Public Request Portal *(COMPLETE)*
**Goal:** Rooms/spaces within sites with QR codes; public request form pre-filled with space context; admin approves/rejects requests which become work orders.

**Design doc:** `docs/superpowers/specs/2026-05-05-sprint-b-spaces-request-portal-design.md`
**Plan:** `docs/superpowers/plans/2026-05-05-sprint-b-spaces-request-portal.md`

#### B1 — Spaces within Sites
- [x] `spaces` table + RLS policies (run SQL in Supabase editor)
- [x] `/dashboard/sites/[id]/spaces` — list page, floor-grouped, QR modal
- [x] `/dashboard/sites/[id]/spaces/new` + `/[sid]/edit` — add/edit forms
- [x] QR code per space via `qrcode` npm package; download PNG + print
- [x] **Bulk export**: `/api/spaces/export-qr` → PDF via `@react-pdf/renderer`, 2/4/6 per A4 page
- [x] Spaces button added to each site card on `/dashboard/sites`
- [x] `space_id` column added to `assets` + `work_orders` tables (run SQL)

#### B2 — Public Request Portal
- [x] `(public)` route group with minimal layout (ServIQ-FM logo only)
- [x] `/r/[token]` — 4-panel public request form (requester info, details, attachments, location)
- [x] `POST /api/requests/submit` — inserts to `requests` table, sends confirmation email
- [x] Confirmation screen after submit with tracking info

#### B3 — Requests Dashboard (Admin)
- [x] `requests` table + RLS policies (run SQL in Supabase editor)
- [x] `/dashboard/requests` — list with All/Pending/Approved/Rejected tabs, pending count badge
- [x] `/dashboard/requests/[id]` — detail with approve/reject modals
- [x] `POST /api/requests/[id]/approve` — creates WO, links request, sends approval email
- [x] `POST /api/requests/[id]/reject` — sets rejected status, sends rejection email
- [x] Requests nav item + red pending badge added to Sidebar

#### B4 — Work Order Status Notifications to Requester
- [x] Email utility `web/src/lib/email.ts` — Nodemailer + Hostinger SMTP
- [x] `/track/[token]` — public requester tracking page with status timeline
- [x] `POST /api/requests/notify-status` — sends status update email
- [x] `doStatusUpdate` in WO detail page hooks into notify-status for in_progress/completed/finished

#### B5 — Space-aware WO Detail (Technician View)
- [x] Space Assets tab appears in WO detail when `space_id` is set
- [x] Lists assets assigned to the space with Commission/Decommission buttons + confirmation dialog
- [x] Action logged to activity log on asset status change

**⚠️ Manual DB steps required (Supabase SQL editor):** See `docs/superpowers/plans/2026-05-05-sprint-b-spaces-request-portal.md` Task 2
**⚠️ Env vars required:** `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM`, `NEXT_PUBLIC_APP_URL`, `SUPABASE_SERVICE_ROLE_KEY`

---

### Sprint C — Invoice Redesign *(~2–3 days)*
**Goal:** Replace the current single-cost auto-invoice with a manual, 3-line itemised invoice.

**Design doc:** `docs/superpowers/specs/` *(to be written)*

- [x] **C1 — Remove auto-invoice**
  - Invoice is no longer auto-generated on WO close
  - When WO moves to `completed`: if site has `invoicing_enabled = true`, show "Generate Invoice" button

- [x] **C2 — Invoice creation flow (3-line breakdown)**
  1. **Service Charges** — fixed fee (editable, pre-filled if WO has a value)
  2. **Labor Charges** — auto-calculated: `Σ(activity hours) × technician hourly_rate`
     - `hourly_rate` on user profile
     - Activity durations pulled from WO activity log
  3. **Spare Parts** — list from WO parts_used (qty × unit cost per item)
  - Additional surcharges field (label + amount)
  - Preview: Subtotal → VAT 15% → Total
  - Confirm → saves invoice record + generates PDF

- [x] **C3 — PDF update**
  - Update `web/src/app/api/invoices/generate/route.ts` to accept line items
  - PDF shows: Service Charges / Labor Charges / Spare Parts as distinct rows

- [x] **C4 — Site invoicing toggle**
  - Add `invoicing_enabled` boolean to `sites` table
  - Toggle in site edit page

---

### Sprint D — Notifications *(~2–3 days)*
**Goal:** Welcome emails for new users; push and email notifications for work order events.

**Design doc:** `docs/superpowers/specs/` *(to be written)*

- [ ] **D1 — Email infrastructure**
  - Integrate Resend (simple API, good free tier) — add `RESEND_API_KEY` env var
  - Create `web/src/lib/email.ts` send wrapper

- [ ] **D2 — Welcome email on user creation**
  - After admin creates a user from `/dashboard/users/new`
  - Email: user's name, login URL, magic link or temp password

- [ ] **D3 — Push notifications audit**
  - Verify existing `web/src/lib/push.ts` works end-to-end on production
  - WO assignment → push to assigned technician
  - WO status change → push to relevant users

- [ ] **D4 — Email notifications for WO events**
  - WO assigned → email to technician
  - WO status changed → email to WO creator / original requester
  - WO overdue → email to assignee + manager

---

### Sprint E — Settings: Field Visibility *(~2–3 days)*
**Goal:** Admins can configure which fields on each form are mandatory, optional, or hidden.

**Design doc:** `docs/superpowers/specs/` *(to be written)*

- [ ] **E1 — Data model**
  - `field_configs` table: `(organisation_id, page, field_key, visibility: 'required'|'optional'|'hidden')`
  - Pages covered: `work_orders_new`, `work_orders_close`, `assets_new`, `sites_new`, `users_new`

- [ ] **E2 — Settings UI**
  - New "Form Fields" section in `/dashboard/settings`
  - Per page: list of fields with 3-way toggle (Required / Optional / Hidden)
  - Save → upserts `field_configs`

- [ ] **E3 — Forms respect config**
  - Work Orders new/close pages read `field_configs` — show/hide/enforce required
  - Assets new/edit — same
  - Work order close modal — same

---

### Sprint F — Employee Portal: Platform Super-Admin *(~5–7 days)*
**Goal:** Transform `/login/employee` into a full ServIQ-FM platform management portal (separate from tenant dashboards).

> `/login/employee` = ServIQ-FM staff portal (platform-level).  
> `/login/client` = tenant admin portal (organisation-level).

**Design doc:** `docs/superpowers/specs/` *(to be written)*

- [ ] **F1 — Platform auth separation**
  - `/platform/` route group with its own layout + sidebar
  - Auth guard checks `is_platform_admin` flag on user
  - `/login/employee` redirects to `/platform/dashboard` on success

- [ ] **F2 — Command Center Dashboard**
  - MRR / ARR / Churn rate metric cards
  - DAU / MAU across all tenants
  - Platform-wide active properties, work orders, staff counts
  - Health Score per client (login frequency + feature adoption)

- [ ] **F3 — Tenant Management**
  - Searchable list of all client organisations
  - Per-tenant: users, WO count, last active, plan, health score
  - "Login as Admin" — impersonate tenant admin for troubleshooting

- [ ] **F4 — Onboarding & Offboarding**
  - **Onboard:** Create tenant org, assign Tenant Admin role, show welcome checklist progress
  - **Offboard:** Export tenant data (CSV/JSON), disable all tenant users

- [ ] **F5 — Billing & Subscriptions**
  - View/change plan per tenant (free / starter / pro / enterprise)
  - Payment status (paid / failed / overdue)
  - Custom contract notes

- [ ] **F6 — Feature Flags**
  - Per-tenant toggles: `advanced_reporting`, `api_access`, `invoicing`, `multi_site`, `custom_branding`
  - Stored in `tenant_feature_flags` table

- [ ] **F7 — System Health & Audit Log**
  - Server health (Supabase + Vercel status)
  - Audit log: timestamp, actor, action, affected resource

---

## Backlog / Future
- [ ] Mobile EAS production build (iOS + Android) — deferred from Week 3
- [ ] Arabic PDF support in invoices (RTL text rendering)
- [ ] Bulk asset/inventory import via CSV
- [ ] PM compliance reporting improvements
- [ ] Mobile: offline mode for WO updates
- [ ] Client portal (read-only view for end-clients of tenants)
- [ ] White-labelling / custom domain per tenant
- [ ] Stripe integration for in-app billing

---

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Web frontend | Next.js 14, TypeScript, inline styles (no Tailwind) |
| Mobile | Expo SDK 54, React Native 0.81 |
| Backend/DB | Supabase (auth, postgres, storage, edge functions) |
| Charts | Recharts |
| Fonts | DM Sans (English), Readex Pro (Arabic) |

---

## Repository Structure

```
serviq-fm/
├── web/                          # Next.js 14 web app
│   ├── src/
│   │   ├── app/
│   │   │   ├── dashboard/        # All dashboard pages (see below)
│   │   │   ├── login/            # Branded login page
│   │   │   └── request/          # Public work request form
│   │   ├── components/
│   │   │   └── Sidebar.tsx       # Nav sidebar with language toggle
│   │   ├── context/
│   │   │   └── LanguageContext.tsx  # Bilingual t() hook + lang state
│   │   └── lib/
│   │       ├── brand.ts          # Brand constants (C, F, style helpers)
│   │       └── supabase.ts       # Supabase client
│   └── next.config.mjs           # eslint.ignoreDuringBuilds: true
├── mobile/                       # Expo React Native app
├── docs/superpowers/plans/       # Week 1–3 implementation plans
└── CONTEXT.md                    # This file
```

---

## Dashboard Pages

All pages are at `web/src/app/dashboard/[section]/page.tsx`:

| Route | Page |
|-------|------|
| `/dashboard` | KPI overview, recent activity, upcoming PM |
| `/dashboard/work-orders` | WO list with status/priority filters |
| `/dashboard/work-orders/new` | Create WO form |
| `/dashboard/work-orders/[id]` | WO detail with tabs (overview, comments, photos, parts, history) |
| `/dashboard/assets` | Asset list with category/status filters |
| `/dashboard/assets/[id]` | Asset detail with QR code, PM history, custom fields |
| `/dashboard/pm-schedules` | PM schedule list with calendar + compliance links |
| `/dashboard/pm-schedules/compliance` | PM compliance dashboard with progress bars |
| `/dashboard/sites` | Site card grid |
| `/dashboard/users` | User table with role stat cards |
| `/dashboard/vendors` | Vendor table with star ratings |
| `/dashboard/inventory` | Inventory table with low-stock alerts |
| `/dashboard/inspections` | Tabbed: inspection results + templates |
| `/dashboard/settings` | Tabbed: organisation info, storage policy, account |
| `/dashboard/reports` | KPI cards + 3 recharts (WO by status, WO by priority, assets by category) |

---

## Brand System (`web/src/lib/brand.ts`)

All pages import from `@/lib/brand`. **Never use hardcoded hex or font strings.**

```ts
// Colors
C.navy      = '#1E2D4E'   // Primary — headings, buttons, nav active
C.teal      = '#6DCFB0'   // Accent
C.blue      = '#1A7FC1'   // Links, info
C.mid       = '#3AAECC'   // Secondary accent
C.pageBg    = '#F8FAFC'   // Page background
C.white     = '#ffffff'
C.border    = '#E8ECF0'   // Card/table borders
C.textDark  = '#1E2D4E'   // Primary text
C.textMid   = '#4A5568'   // Secondary text
C.textLight = '#A0B0BF'   // Muted/placeholder
C.danger    = '#C62828'
C.warning   = '#F57F17'
C.success   = '#2E7D32'
C.dangerBg  = '#FEE2E2'
C.dangerBorder = '#FECACA'

// Fonts
F.en = 'DM Sans, sans-serif'
F.ar = 'Readex Pro, sans-serif'

// Style helpers (spread into style props)
cardStyle          // white card with border + borderRadius 12
pageStyle          // padding 2rem, maxWidth 1200, margin auto
primaryBtn         // navy background button
secondaryBtn       // white button with border
dangerBtn          // red tint button
tableHeaderCell    // uppercase 11px column header
tableCell          // 14px 16px padding body cell
inputStyle         // full-width input with brand border
labelStyle         // 12px semibold label above inputs
sectionCard        // cardStyle + 1.5rem padding + marginBottom
pageTitle          // 22px 700 navy heading
pageSubtitle       // 13px light subtitle
```

**Table pattern:**
```tsx
<div style={{ ...cardStyle, overflow: 'hidden', padding: 0 }}>
  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
    <thead>
      <tr style={{ background: C.pageBg, borderBottom: `1px solid ${C.border}` }}>
        <th style={tableHeaderCell}>Column</th>
      </tr>
    </thead>
    <tbody>
      <tr style={{ background: C.white }}>
        <td style={tableCell}>Value</td>
      </tr>
    </tbody>
  </table>
</div>
```

**Badge pattern:**
```tsx
// Active
{ background: '#DCFCE7', color: C.success }
// Warning / low
{ background: '#FEF3C7', color: C.warning }
// Danger / out
{ background: C.dangerBg, color: C.danger }
// Inactive / muted
{ background: C.pageBg, color: C.textMid }
```

---

## Language / Bilingual

- `useLanguage()` from `@/context/LanguageContext` provides `{ t, lang, setLang, isRTL }`
- `t('key')` returns translated string; falls back to English key if missing
- `lang === 'ar'` for conditional Arabic-only text not in translations
- `setLang` persists to `localStorage` + cookie, sets `document.documentElement.dir`
- Translation keys are in `LanguageContext.tsx` — both `en` and `ar` objects
- `LanguageProvider` wraps `web/src/app/dashboard/layout.tsx`

---

## Conventions

- **No Tailwind** — all styles are inline React style objects
- **No comments** except for non-obvious WHY
- **Working branch:** `main` (solo dev, commit directly)
- **TypeScript:** `npx tsc --noEmit` must pass clean before committing
- **Build:** `npm run build` must succeed (ESLint errors suppressed via `ignoreDuringBuilds`)
- **Local const shadowing:** If a file has a local `const inputStyle`/`cardStyle`/`labelStyle`, rename the local (e.g., `infoCard`) rather than shadowing brand imports
- **Supabase pattern:** All pages fetch `auth.getUser()` → `users` table for `organisation_id` → scoped queries

---

## Phase Status

| Week | Focus | Status |
|------|-------|--------|
| Week 1 | Web brand kit + manager experience | ✅ **COMPLETE** |
| Week 2 | Mobile technician experience + push notifications | ⬜ Pending |
| Week 3 | Launch polish | ⬜ Pending |

### Week 1 Commits (all on `main`)
```
44d2475  chore: skip ESLint during Next.js build
8e56f14  feat: add Reports page with recharts and sidebar nav item
1378ce1  feat: apply brand constants to remaining 6 dashboard pages
1faeece  feat: brand assets and PM schedules pages
f1c4d2c  feat: brand work orders pages
ea440b6  feat: apply brand kit to dashboard page
57e2a6a  fix: use F.en brand constant in dashboard layout font
322ac05  feat: brand login page and dashboard layout
f0f2857  feat: load DM Sans and Readex Pro fonts
f7656d2  fix: add as const to C/F, move danger colors into C
a53731c  feat: add brand constants file
```

---

## Week 2 Plan — Mobile Technician Experience

Plan file: `docs/superpowers/plans/2026-04-25-week2-mobile-technician.md`

Key tasks:
1. QR Scanner screen (`mobile/src/screens/QRScannerScreen.tsx`)
2. PM tasks section on Home screen
3. 24hr countdown timer on Work Order detail
4. Push notification registration (`mobile/src/lib/notifications.ts`)
5. Supabase Edge Function for server-side push (`supabase/functions/send-push/index.ts`)

Tech: Expo SDK 54, `expo-notifications`, `expo-camera`, Supabase Edge Functions
