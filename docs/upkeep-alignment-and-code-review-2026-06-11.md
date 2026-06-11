# Serviq-FM — UpKeep Feature Alignment & Code Review

**Date:** 2026-06-11
**Scope:** Web (Next.js 14) + Mobile (Expo RN) reviewed against 5 UpKeep requirement docs (Users & Teams, Work Orders, Assets, Locations, Preventive Maintenance), plus a full security/correctness code audit.
**Build health:** `tsc --noEmit` passes clean on both web and mobile.

---

## PART 1 — SECURITY & BUG FINDINGS (verified)

### 🔴 CRITICAL — fix before anything else

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| C1 | `POST /api/users` has **no authentication at all**. It accepts `organisation_id` + `role` from the request body and uses the **service-role key** to create the user. | `web/src/app/api/users/route.ts:5-105` | Anyone on the internet can create an **admin account in any tenant** → full account takeover. Temp password is even returned in the response. |
| C2 | `POST /api/users/delete` has **no authentication**. Takes `userId` from body, deletes profile + auth user via service role. | `web/src/app/api/users/delete/route.ts:4-90` | Anyone can delete arbitrary accounts across all tenants. |

### 🟠 HIGH

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| H1 | Request approve/reject endpoints authenticate but never check the caller belongs to the request's org or has a manager/admin role (cross-tenant IDOR, mutations run with service role). | `web/src/app/api/requests/[id]/approve/route.ts:9-78`, `.../reject/route.ts:5-43` | Any logged-in user of any tenant can approve/reject another org's requests. |
| H2 | `POST /api/push` is unauthenticated — accepts `userId`, `title`, `body` and sends Expo push. | `web/src/app/api/push/route.ts:16-95` | Push spam/phishing to any user's devices + user-ID enumeration (404 vs 200). |
| H3 | Notification endpoints unauthenticated; `woTitle`/`woNumber` interpolated **unescaped into email HTML**. | `web/src/app/api/notifications/wo-assigned/route.ts`, `wo-status/route.ts:38-44`, `requests/notify-status/route.ts` | Email/HTML injection + phishing from your trusted sending domain. |
| H4 | **Mobile**: WO photos go to the public `media` bucket (`public=true`, INSERT for any authenticated user, no org scoping; predictable filenames `wo-<id>-<ts>.jpg`). | `mobile/src/screens/WorkOrderDetailScreen.tsx:213-215` + `docs/superpowers/sql/sprint-i-01-storage-buckets.sql:17-58` | Any tenant's facility photos readable/overwritable cross-tenant. |
| H5 | **Mobile**: screens fetch with `useEffect(..., [])` but early-return when `profile` is null; on fresh sign-in profile resolves *after* mount → dashboard/lists render empty until pull-to-refresh. | `mobile/src/screens/HomeScreen.tsx:20`, `WorkOrdersScreen.tsx:72`, `AssetsScreen.tsx:31` | Empty app after login — looks broken to every new user. |
| H6 | **Mobile**: time tracker counts `setInterval` ticks instead of wall-clock; JS timers suspend when app is backgrounded/screen locks (i.e., while the tech actually works). `startTimeRef` exists but is unused. Navigating away discards a running timer. | `mobile/src/screens/WorkOrderDetailScreen.tsx:129-161` | Systematically under-logged labor hours. |
| H7 | **Mobile**: push token never cleared on sign-out (`clearPushToken` is dead code). | `mobile/src/lib/notifications.ts:48-53`, `AuthContext.tsx:58-60` | Previous user's WO notifications keep arriving on handed-over devices. |
| H8 | **Mobile**: auth session stored in plaintext AsyncStorage; `expo-secure-store` is installed & configured in app.json but never imported. | `mobile/src/lib/supabase.ts:8-14` | Long-lived refresh token extractable on rooted/backed-up devices. |

### 🟡 MEDIUM

- **M1** — `getOrgId()` uses a **module-level cache not keyed by user** (5-min TTL, shared across requests in a warm serverless instance). Today it only mis-attributes audit entries, but it's a latent cross-tenant leak if ever used for scoping. `web/src/lib/auth-helper.ts:6-63`
- **M2** — `GET /api/cron/pm-generate?run=1` **bypasses CRON_SECRET**; repeated calls roll `next_due_at` forward and can skip legitimate PM cycles. `web/src/app/api/cron/pm-generate/route.ts:114-124`
- **M3** — Public request-submit endpoint doesn't validate `site_id` belongs to `organisation_id`; requester fields interpolated unescaped into admin emails. `web/src/app/api/requests/submit/route.ts:5-92`
- **M4** — `POST /api/invoices/create` never verifies the work order belongs to the caller's org; no role check. `web/src/app/api/invoices/create/route.ts:24-77`
- **M5** — `POST /api/invoices/generate` (ZATCA PDF, contains VAT/CR/address) has no explicit auth — relies entirely on RLS. `web/src/app/api/invoices/generate/route.ts:38-49`
- **M6** — Impersonation cookie isn't bound to the current session and survives logout — privilege bleed on a shared browser. `web/src/middleware.ts:142-152`
- **M7** — **Mobile**: home KPIs computed from a `.limit(20)` sample → wrong counts for orgs with >20 open WOs; due-today items double-counted in overdue. `HomeScreen.tsx:24-50`
- **M8** — **Mobile**: reopening a completed WO keeps stale `completed_at` → corrupts SLA/completion reporting. `WorkOrderDetailScreen.tsx:111-117`
- **M9** — **Mobile**: photo array updated via client-side read-modify-write → concurrent uploads silently drop photos. `WorkOrderDetailScreen.tsx:216-220`
- **M10** — **Mobile**: QR scanner's URL/UUID branches skip the `organisation_id` check (only the qr_code branch filters); AssetDetail fetch has no org filter. `QRScannerScreen.tsx:25-42`
- **M11** — **Mobile**: PII (auth id/email, full profile JSON) logged to console in release builds. `AuthContext.tsx:39-47`
- **M12** — **Mobile**: RTL never applied at layout level (`I18nManager` unused); Arabic gets right-aligned text on LTR layouts.
- **M13** — **Mobile**: comment composer & search bars lack `KeyboardAvoidingView` (iOS keyboard covers input).

### 🟢 LOW (selected)

- Public space lookup falls back to raw UUID match, leaking space + org id without a QR token (`api/public/space-by-token/[token]/route.ts:20-38`).
- Work-orders list loads the entire table then paginates client-side (`dashboard/work-orders/page.tsx:84-92`).
- `dateTo` filter parsed in local time vs UTC `created_at` → off-by-offset boundary (`dashboard/work-orders/page.tsx:115`).
- Mobile: many hardcoded English strings (QRScanner screen entirely, status-change comments, overdue banners); status filter omits "closed".
- Mobile: `watermelondb` + `expo-file-system` shipped but unused (bundle weight); `runtimeVersion: appVersion` + EAS `autoIncrement` can desync OTA updates.
- Marketing page `web/src/app/features/assets/page.tsx` claims parent-child asset hierarchy which is **not implemented**.

### Verified-OK (no action)
- All `/api/platform/**` routes properly gate on `platform_admins`; org-scoped CRUD routes (assets, sites, spaces, work-orders, users/[id], field-configs) authenticate and scope by `organisation_id` correctly.
- Impersonation cookie HMAC sign/verify is sound (constant-time compare, httpOnly/secure/sameSite=strict).
- Mobile list queries correctly filter by org + technician assignment; Supabase anon key in the client is by design.
- AR/EN i18n resource files are in sync key-by-key on mobile.

---

## PART 2 — FEATURE ALIGNMENT vs UPKEEP

Legend: ✅ present ⚠️ partial ❌ missing — (Web / Mobile)

### Users & Teams
| Feature | Web | Mobile |
|---|---|---|
| 4 user roles (admin/manager/technician/requester) | ✅ | ✅ (display) |
| Invite by email + temp password + welcome email | ✅ | ❌ |
| Resend expired invite / Pending status | ❌ / ⚠️ (only active/inactive) | ❌ |
| Edit user (name, role, active) | ✅ | ❌ |
| Location-based permissions | ❌ | ❌ |
| Deactivate vs Delete (with active-WO block on delete) | ✅ | ❌ |
| **Teams** (groups assignable to WOs) | ❌ | ❌ |
| Admin can't change own role | ⚠️ UI-only, API not enforced | — |
| **Last-admin protection** (account must always have an admin) | ❌ | ❌ |
| Custom roles / granular permission matrix | ❌ | ❌ |

### Work Orders
| Feature | Web | Mobile |
|---|---|---|
| Create with title/desc/priority/category/due date/site/asset/photos | ✅ | ⚠️ (no create form; view/update only) |
| Estimated duration field | ❌ (only actual_hours) | ❌ |
| Asset auto-fills location | ❌ | ❌ |
| Additional workers / **team assignment** | ❌ | ❌ |
| **Tasks & checklists** (templates, per-task notes/images) | ❌ | ❌ |
| Photo upload / camera capture | ✅ | ✅ (camera+gallery+zoom) |
| Photo **annotation** (draw/text) | ❌ | ❌ |
| Video/PDF attachments | ❌ | ❌ |
| Status lifecycle + notifications (push+email) | ✅ | ✅ |
| Comments + activity log + system comments | ✅ | ✅ |
| Timer / time logging | ❌ | ✅ (but buggy — H6) |
| Hourly rates / labor cost calc | ❌ | ❌ |
| Parts usage + inventory deduction + cost | ✅ | ❌ |
| Filters (status/priority/category/tech/date) + search | ✅ | ⚠️ (status + title only) |
| Edit WO | ✅ | ❌ |
| Closeout photos + signoff | ✅ (no signature canvas) | ❌ |
| **Exceeds UpKeep:** recurring WOs, SLA countdown, duplicate detection, audit trail, AR/EN + translate, media expiry | | |

### Assets
| Feature | Web | Mobile |
|---|---|---|
| Create/edit/delete asset (full fields, field-config system) | ✅ | ❌ (view-only) |
| **Parent-child hierarchy (4 levels)** | ❌ (claimed in marketing only) | ❌ |
| Custom fields | ⚠️ per-asset key-value (no admin-defined schema) | ❌ |
| Status (active/maintenance/retired) | ✅ | ✅ |
| Downtime tracking / uptime metrics | ❌ | ❌ |
| WO history per asset | ✅ | ✅ |
| CSV import/export | ✅ | ❌ |
| QR generation + PDF labels | ✅ | ⚠️ (scan only, no display) |
| Check-in/check-out, depreciation calc, operating schedules (Enterprise) | ❌ | ❌ |
| Role-based edit restrictions (creator-only) | ❌ (any org user can edit) | — |

### Locations
| Feature | Web | Mobile |
|---|---|---|
| 2-level hierarchy (Sites → Spaces) | ✅ | ✅ |
| 6-level deep nesting (Enterprise) | ❌ | ❌ |
| CRUD + CSV import/export | ✅ | ❌ |
| **Location detail page with tabs** (Details/WOs/Assets/Files/Parts/Floor plans) | ❌ | ❌ |
| Assign workers/teams/vendors/customers to a location | ❌ | ❌ |
| GPS coordinates / maps / floor plans | ❌ | ❌ |
| Space-level WO filtering | ❌ (site-level only) | ❌ |
| **Exceeds UpKeep:** space-level QR → public WO/request creation, bilingual names, floor grouping | | |

### Preventive Maintenance
| Feature | Web | Mobile |
|---|---|---|
| Create PM with title/desc/frequency (daily→annual) | ✅ | ❌ (no PM screens at all) |
| Days-of-week / day-of-month selection | ❌ | ❌ |
| **Meter/usage-based & condition-based triggers** | ❌ | ❌ |
| Apply to assets (multi) / site / assignee | ✅ / ⚠️ single / ✅ single | ❌ |
| Start date / lead-time generation (hourly cron) | ✅ | ❌ |
| End date / "create first WO now" | ❌ / ❌ | ❌ |
| Pause/Resume | ✅ (no remaining-time baseline; un-started WOs not removed on pause) | ❌ |
| **Archive** (distinct from delete, multi-select) | ❌ (delete only) | ❌ |
| Multiple schedules per trigger | ⚠️ (creates separate PM records) | ❌ |
| Completion-based recurrence | ❌ | ❌ |
| List + calendar + **compliance dashboard** | ✅✅✅ (compliance exceeds UpKeep) | ❌ |
| Seasonal scheduling | ✅ (exceeds) | ❌ |
| Checklists / signature / import-export / audit trail | ❌ | ❌ |

---

## PART 3 — PRIORITIZED ACTION PLAN

**P0 — Security (this week):**
1. Add auth + role + org checks to C1, C2, H1, H2, H3 endpoints.
2. Lock down the `media` storage bucket (org-scoped paths + RLS) — H4.
3. Remove `?run=1` cron bypass (M2); key or remove the `getOrgId` cache (M1); bind impersonation cookie to session (M6).

**P1 — Mobile correctness:**
4. Fix profile-dependency on Home/WorkOrders/Assets effects (H5).
5. Fix timer to use wall-clock from `startTimeRef` (H6).
6. Clear push token on sign-out (H7); switch session storage to expo-secure-store (H8).
7. Fix KPI sampling (M7), stale `completed_at` (M8), photo-array race (M9), QR org checks (M10).

**P2 — Biggest competitive feature gaps (both platforms):**
8. Tasks & checklists on work orders (most-cited UpKeep capability that's absent).
9. Teams + additional workers on WOs.
10. Mobile create/edit for work orders and assets (currently view-only — UpKeep is mobile-first).
11. Parent-child asset hierarchy (also fixes the marketing-page claim).
12. Last-admin protection + pending/resend invite flow.

**P3 — Differentiation/parity polish:** meter-based PM triggers, PM archive + completion-based recurrence, location detail page with tabs, photo annotation on mobile, labor rates/cost rollup, location-based permissions.
