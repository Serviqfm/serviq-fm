# Serviq-FM — Project Context

**Serviq-FM** is a bilingual (Arabic + English) Facility Management SaaS platform targeting the Saudi/GCC market. Phase 1 beta launch in progress.

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
