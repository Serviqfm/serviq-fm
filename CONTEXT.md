# ServIQ-FM — Project Context & Task Tracker

**ServIQ-FM** is a bilingual (Arabic + English) Facility Management SaaS platform targeting the Saudi/GCC market. Phase 1 beta launch in progress.

> **How to use this file:** Mark tasks `[x]` when done. Each sprint links to its design doc and plan. Update at the start of each session.

---

## 🔴 IMMEDIATE NEXT STEPS (May 19, 2026)

**Phase Lumina integration branch — `phase-lumina`:**
Integration branch containing Sprints A–G plus the user-deletion FK fix. Merges `zen-hellman` (Sprint G Lumina + Phase 4 + user-del FK fix) and `beautiful-jones` (Sprint E Field Visibility + Sprint F Platform Super-Admin) on top of `origin/main`. Build + tsc are clean (test-runner type deps for `Button.test.tsx` are the only outstanding tsc errors and are pre-existing — Next ignores them at build via `eslint.ignoreDuringBuilds`).

**Before merging `phase-lumina` to `main`, run these SQL migrations in the Supabase SQL editor in order:**
1. `docs/superpowers/sql/sprint-e-01-foundation.sql` — `field_configs` table + RLS + index
2. `docs/superpowers/sql/sprint-f-01-foundation.sql` — platform admin tables, impersonation log, audit log, feature flags
3. `docs/superpowers/sql/sprint-f-02-metrics.sql` — DAU/MAU function + MRR snapshot table

Then create a platform admin auth user in Supabase Auth and uncomment the `INSERT INTO platform_admins` block at the bottom of `sprint-f-01-foundation.sql` with that auth UID.

**`RESEND_FROM_EMAIL=noreply@serviqfm.com`** is already set in Vercel — do not re-do.

**Sprint F caveat (intentional, do not "fix"):**
- Feature-flag toggles at `web/src/app/platform/tenants/[id]/flags/FlagsForm.tsx` are **scaffolding by design**. They persist values to `tenant_feature_flags` and write audit entries, but do not yet gate any product features. UI surfaces a note explaining this. Real enforcement is follow-up work.

**Out of scope for this PR:** Mobile EAS production build (iOS + Android) — separate workstream.

**Sprint G Lumina Redesign — COMPLETE:**
- All pages converted to Lumina Tailwind design tokens
- `brand.ts` is **restored** on `phase-lumina` (zen-hellman had deleted it but several `origin/main` pages still import `C`, `F`, `primaryBtn`, `LUMINA_COLORS`). Keep until those imports are migrated.

---

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

### Sprint D — Notifications *(COMPLETE)*
**Goal:** Welcome emails for new users; push and email notifications for work order events.

**Design doc:** `docs/superpowers/specs/2026-05-11-sprint-d-notifications-design.md`
**Plan:** `docs/superpowers/plans/2026-05-11-sprint-d-notifications.md`

- [x] **D1 — Email infrastructure**
  - Resend API integration complete ✓
  - `web/src/lib/email.ts` replaced with Resend client ✓
  - Email templates defined ✓

- [x] **D2 — Welcome email on user creation**
  - Hook added to `/api/users` POST route ✓
  - Sends login URL + temp password ✓
  - Verified: Welcome emails delivered successfully ✓

- [x] **D3 — Push notifications audit**
  - `/api/push` route for Expo dispatch ✓
  - Notification log table for audit trail ✓
  - Test push button + delivery log in settings ✓

- [x] **D4 — Email notifications for WO events**
  - 8 WO notification functions implemented ✓
  - Integration guide in `web/src/lib/notifications/wo-hooks.ts` ✓
  - All respect user preferences ✓
  - **Fixed:** Sender/recipient email conflict resolved (noreply@serviqfm.com) ✓

**Additional:**
- [x] 17 notification types across 5 categories (WO, Requests, PO, Parts, Reports)
- [x] User notification preferences table + settings UI
- [x] Notification logging for audit + debugging
- [x] Build compiles successfully

**Email Delivery Issue Resolution:**
- Root cause: Notification emails sent from `admin@serviqfm.com` to technicians with same address
- Fix: Updated NotificationService default sender to `noreply@serviqfm.com`
- **PENDING:** Update `RESEND_FROM_EMAIL` environment variable in Vercel to `noreply@serviqfm.com` and redeploy

---

### Sprint G — Lumina UI Redesign *(COMPLETE — 2026-05-16)*
**Goal:** Rebuild entire Serviq-FM web UI using Lumina design system with Next.js/React/Tailwind.

**Plan:** `docs/superpowers/plans/2026-05-12-serviq-lumina-ui-redesign.md`  
**Date Completed:** 2026-05-16  
**Result:** All 50+ routes now use Lumina Tailwind tokens. `brand.ts` fully unused.

#### Phase 1: Foundation & Authentication (Tasks 1-3) ✅ COMPLETE
- [x] **Task 1 — Tailwind Config + Lumina Tokens** ✅ COMPLETE & APPROVED
  - Files: `web/src/lib/lumina-tokens.ts`, `web/tailwind.config.ts`, `web/src/app/globals.css`
  - LUMINA_COLORS: 44 color tokens (primary #006b54, secondary #00677d)
  - LUMINA_SPACING: 7 tokens (unit 4px → containerMax 1440px)
  - LUMINA_RADII: 6 tokens (sm/default 0.25rem → xl 0.75rem, fixed from plan mismatch)
  - Material Symbols Outlined font + star pattern background (4-pointed star #006b54, 0.03 opacity)
  - Commit: dce73fc

- [x] **Task 2 — Login Portal Selection Page** ✅ COMPLETE & APPROVED
  - Files: `web/src/components/auth/LoginPortalSelection.tsx`, `web/src/app/login/page.tsx`
  - 3-section layout (header, 2-column card grid, footer)
  - Client & Employee portal cards with icons, features, action buttons
  - Responsive (1 col mobile, 2 col desktop), hover effects with float animation
  - Commit: dce73fc

- [x] **Task 3 — Employee Login Form Page** ✅ COMPLETE & APPROVED
  - Files: `web/src/components/auth/EmployeeLoginForm.tsx`, `web/src/app/login/employee/page.tsx`
  - Split layout: left branded section (primary bg #006b54, hidden mobile), right form section
  - Form: email, password + visibility toggle, remember checkbox, login button, Azure SSO
  - Decorative blur circles, glass morphism header
  - Fixed issues: Typography (text-headline-h1 for 32px), star pattern verified
  - Commit: 37bb409 (fixes), dc2ebfe (implementation)

#### Phase 2: Dashboard & Layout (Tasks 4-7) ✅ COMPLETE
- [x] **Task 4 — Sidebar Navigation** ✅ COMPLETE & APPROVED
  - File: `web/src/components/layout/Sidebar.tsx`
  - Desktop-only (hidden md:flex), w-64 width, sticky top-0, z-50
  - Logo + "Serviq Lumina" title, Create Work Order button
  - 8 nav items with active state styling, user profile section
  - Commit: fdc2772

- [x] **Task 5 — Top Navigation Bar** ✅ COMPLETE & APPROVED
  - File: `web/src/components/layout/TopBar.tsx`
  - Sticky header with glass morphism (backdrop-blur-md)
  - Mobile menu, desktop nav (3 links), search bar, action buttons
  - Material Symbols icons, Next.js Link routing
  - Commit: cb89a9e

- [x] **Task 6 — Mobile Bottom Navigation** ✅ COMPLETE & APPROVED
  - File: `web/src/components/layout/MobileBottomNav.tsx`
  - Mobile-only, fixed bottom, glass morphism, FAB button
  - 4 nav items, active state via usePathname()
  - Commit: 6e75313

- [x] **Task 7 — Dashboard Layout Wrapper** ✅ COMPLETE & APPROVED
  - Files: `web/src/components/layout/LayoutWrapper.tsx`, `web/src/app/dashboard/layout.tsx`
  - Flex layout: Sidebar + Main (TopBar + content) + MobileBottomNav
  - Responsive padding (pb-20 mobile, pb-0 desktop)
  - Commit: 20b8232

#### Phase 3 & 4: Pages & Components ✅ COMPLETE
- [x] All shared components implemented inline per page (KPI cards, status badges, data tables)
- [x] All dashboard pages converted: work-orders, assets, inventory, pm-schedules, reports, requests, invoices, inspections, sites, users, vendors, settings
- [x] All form pages converted: work-orders/new, work-orders/[id], assets/[id], pm-schedules/[id], invoices/new
- [x] Auth pages converted: login (portal selection), login/client, login/employee
- [x] Public pages converted: request portal (4-step wizard), (public)/layout, track/[token], r/[token]
- [x] All brand.ts imports removed — zero remaining across entire codebase

---

## ✅ PHASE 1 COMPLETE - Ready for Dashboard Pages

**Design System Reference:**
- Colors: Primary #006b54 (teal), Secondary #00677d (navy), 40+ semantic colors
- Typography: Display-lg (48px), Headline-h1 (32px), Body-md (16px), Label-caps (12px)
- Spacing: unit 4px, stackSm 8px, stackMd 16px, stackLg 32px, gutter 24px, margin 32px
- Border Radius: 0.25rem, 0.5rem, 0.75rem, 9999px
- Fonts: DM Sans (English), Readex Pro (Arabic)
- Icons: Material Symbols Outlined

---

### Sprint E — Settings: Field Visibility *(COMPLETE — 2026-05-18)*
**Goal:** Admins can configure which fields on each form are mandatory, optional, or hidden.

**Design doc:** `docs/superpowers/specs/2026-05-17-sprint-e-field-visibility-settings-design.md`
**Plan:** `docs/superpowers/plans/2026-05-17-sprint-e-field-visibility-settings.md`

- [x] **E1 — Data model**
  - `field_configs` table: `(organisation_id, page, field_key, visibility: 'required'|'optional'|'hidden')`
  - 11 pages covered: work_orders {new, edit, close}, assets {new, edit}, sites {new, edit}, spaces {new, edit}, users {new, edit}
  - Catalog at `web/src/lib/field-catalog.ts` (~70 field entries; system-required flag per field)
  - Server helper `web/src/lib/fieldEnforcement.ts`: `getFieldConfig`, `enforceFieldConfig`, `seedFieldConfigsForOrg`
  - Client hook `web/src/lib/useFieldConfig.ts`

- [x] **E2 — Settings UI**
  - New "Form Fields" tab in `/dashboard/settings` (admin-only)
  - Component: `web/src/app/dashboard/settings/FormFieldsTab.tsx`
  - Left rail: 11 page nav buttons (bilingual); right panel: 3-segment toggles per field; system-required locked to Required
  - Save → `POST /api/field-configs/[page]` with `{ overrides }`

- [x] **E3 — Forms respect config**
  - All 5 entities wired: work_orders, assets, sites, spaces, users
  - Each entity has new server route(s) that call `enforceFieldConfig` before insert/update
  - All forms use `useFieldConfig` to wrap fields with `{!isHidden(key) && ...}` and pass `required={isRequired(key) || isSystemRequired(page, key)}`
  - Defense in depth: client UI hides + server-side enforcement strips hidden fields and rejects missing required fields

**⚠️ Manual DB steps required (Supabase SQL editor):**
1. Run `docs/superpowers/sql/sprint-e-01-foundation.sql` to create the `field_configs` table + RLS + index

**⚠️ Backfill required after deploy:**
2. `cd web && npx tsx scripts/seed-field-configs.ts` — seeds catalog defaults for every existing organisation. Idempotent.

---

### Sprint F — Employee Portal: Platform Super-Admin *(COMPLETE on `phase-lumina` — 2026-05-19)*
**Goal:** Transform `/login/employee` into a full ServIQ-FM platform management portal (separate from tenant dashboards).

> `/login/employee` = ServIQ-FM staff portal (platform-level).  
> `/login/client` = tenant admin portal (organisation-level).

**Design doc:** `docs/superpowers/specs/` *(to be written)*

- [x] **F1 — Platform auth separation**
  - `/platform/` route group with its own layout + sidebar
  - `web/src/middleware.ts` gates `/platform/*` against `platform_admins` (returns 404 to mask portal) and `/dashboard/*` against disabled/offboarded users
  - `/login/employee` redirects platform admins to `/platform/dashboard` on success
  - Runtime pinned to `nodejs` so impersonation-cookie signing (HMAC via `crypto`) works in middleware

- [x] **F2 — Command Center Dashboard**
  - `/platform/dashboard` — MRR / ARR / DAU / MAU / health score cards via `/api/platform/metrics`
  - MRR snapshot cron at `/api/platform/cron/mrr-snapshot` (vercel.json schedule)

- [x] **F3 — Tenant Management**
  - `/platform/tenants` list + `/platform/tenants/[id]` detail with tabs (overview, users, billing, flags, audit)
  - Impersonation enter/exit/status API + signed `sfm_imp` cookie + banner; all audit_logs writes carry `impersonated_by`

- [x] **F4 — Onboarding & Offboarding**
  - Onboarding form at `/platform/tenants/new` + POST handler
  - Offboard exports tenant data as zip (`jszip`), disables users; reactivate API restores

- [x] **F5 — Billing & Subscriptions**
  - Billing form + API with diff-based audit (plan, payment status, contract notes)

- [x] **F6 — Feature Flags (SCAFFOLDING)**
  - Per-tenant toggles persist to `tenant_feature_flags` + write audit entries
  - **No enforcement yet** — `useFeatureFlag` hook stub exists, but no product feature consults it. UI shows a note explaining this. Follow-up work.

- [x] **F7 — System Health & Audit Log**
  - `/platform/health` — Supabase + Vercel reachability
  - `/platform/audit` — unified audit feed across all tenants

**⚠️ Manual DB steps required before deploy (Supabase SQL editor, in order):**
1. `docs/superpowers/sql/sprint-f-01-foundation.sql` — platform tables + RLS
2. `docs/superpowers/sql/sprint-f-02-metrics.sql` — DAU/MAU function + MRR snapshot
3. Create platform admin in Supabase Auth, then uncomment the `INSERT INTO platform_admins` block at the bottom of `sprint-f-01-foundation.sql` with that UID

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
| Web frontend | Next.js 14, TypeScript, Tailwind CSS (Lumina design tokens) |
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

## Design System — Lumina Tailwind Tokens

`web/src/lib/brand.ts` is **deprecated and unused** as of Sprint G (2026-05-16). All styles use Tailwind with Lumina tokens defined in `web/tailwind.config.ts`.

**Core tokens:**
- `primary` = `#006b54` (green) — buttons, active states, primary actions
- `secondary` = `#00677d` (teal) — labels, secondary actions, links
- `on-primary` / `on-secondary` = contrast text
- `surface-container-lowest` = white card background
- `surface-container-low` = input backgrounds
- `outline-variant` = borders, dividers
- `on-surface` = primary text; `on-surface-variant` = secondary text; `outline` = muted text
- `error` = red danger color

**Lumina patterns (use these everywhere):**
```tsx
// Page wrapper
<div className="star-pattern bg-surface min-h-screen p-8">

// Card
<div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm">

// Input
<input className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" />

// Label
<label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5" />

// Primary button
<button className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20" />

// Secondary button
<button className="border border-outline-variant text-on-surface-variant px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-surface-container-low transition-colors" />

// Danger badge
<span className="bg-error/10 text-error border border-error/20 px-2.5 py-0.5 rounded-full text-xs font-semibold" />

// Warning (use hex, not Tailwind class)
<span className="bg-[#f57f17]/10 text-[#f57f17] border border-[#f57f17]/20" />
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

- **Tailwind CSS** — Lumina design tokens via `tailwind.config.ts`. No inline styles except dynamic values (percentages, RTL direction)
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
