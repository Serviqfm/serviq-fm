# Week 1 — Web Brand Kit + Manager Experience

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply full brand kit to all web pages, ship reporting dashboard with real charts, and deliver a polished demo-ready manager experience.

**Architecture:** Shared brand constants file feeds all inline-styled pages. Google Fonts loaded in root layout. Recharts for reporting. No Tailwind classes — all pages use inline styles referencing brand constants.

**Tech Stack:** Next.js 14, Supabase, Recharts, Google Fonts (DM Sans + Readex Pro)

---

## File Map

| Action | File |
|--------|------|
| Create | `web/src/lib/brand.ts` — brand color + font + style constants |
| Modify | `web/src/app/layout.tsx` — load Google Fonts |
| Modify | `web/src/app/globals.css` — CSS font-face + reset |
| Modify | `web/src/app/dashboard/layout.tsx` — brand background |
| Modify | `web/src/app/dashboard/page.tsx` — brand dashboard |
| Modify | `web/src/app/dashboard/work-orders/page.tsx` — brand |
| Modify | `web/src/app/dashboard/work-orders/[id]/page.tsx` — brand + detail improvements |
| Modify | `web/src/app/dashboard/work-orders/new/page.tsx` — brand |
| Modify | `web/src/app/dashboard/assets/page.tsx` — brand |
| Modify | `web/src/app/dashboard/assets/[id]/page.tsx` — brand |
| Modify | `web/src/app/dashboard/pm-schedules/page.tsx` — brand |
| Modify | `web/src/app/dashboard/pm-schedules/compliance/page.tsx` — brand + real data |
| Modify | `web/src/app/dashboard/sites/page.tsx` — brand |
| Modify | `web/src/app/dashboard/users/page.tsx` — brand |
| Modify | `web/src/app/dashboard/vendors/page.tsx` — brand |
| Modify | `web/src/app/dashboard/inventory/page.tsx` — brand |
| Modify | `web/src/app/dashboard/inspections/page.tsx` — brand |
| Modify | `web/src/app/dashboard/settings/page.tsx` — brand |
| Modify | `web/src/app/login/page.tsx` — brand login page |
| Create | `web/src/app/dashboard/reports/page.tsx` — reporting dashboard with charts |
| Modify | `web/src/app/dashboard/layout.tsx` — add Reports link reference |
| Modify | `web/src/components/Sidebar.tsx` — add Reports nav item |

---

## Task 1: Brand Constants File

**Files:**
- Create: `web/src/lib/brand.ts`

- [ ] **Create `web/src/lib/brand.ts`** with all brand constants:

```typescript
// ── Serviq-FM Brand Constants ──────────────────────────────────────────────

export const C = {
  navy:       '#1E2D4E',
  teal:       '#6DCFB0',
  blue:       '#1A7FC1',
  mid:        '#3AAECC',
  lightTeal:  '#B8DDD8',
  pageBg:     '#F8FAFC',
  white:      '#ffffff',
  border:     '#E8ECF0',
  textDark:   '#1E2D4E',
  textMid:    '#4A5568',
  textLight:  '#A0B0BF',
  danger:     '#C62828',
  warning:    '#F57F17',
  success:    '#2E7D32',
  gradient:   'linear-gradient(135deg, #6DCFB0, #3AAECC, #1A7FC1)',
}

export const F = {
  en: 'DM Sans, sans-serif',
  ar: 'Readex Pro, sans-serif',
}

// Reusable style helpers
export const cardStyle = {
  background: C.white,
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  padding: '1.25rem',
} as const

export const pageStyle = {
  padding: '2rem',
  maxWidth: 1200,
  margin: '0 auto',
} as const

export const primaryBtn = {
  background: C.navy,
  color: C.white,
  border: 'none',
  borderRadius: 8,
  padding: '9px 20px',
  cursor: 'pointer',
  fontWeight: 500,
  fontSize: 14,
  fontFamily: F.en,
} as const

export const secondaryBtn = {
  background: C.white,
  color: C.navy,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: '9px 20px',
  cursor: 'pointer',
  fontWeight: 500,
  fontSize: 14,
  fontFamily: F.en,
} as const

export const dangerBtn = {
  background: '#FEE2E2',
  color: C.danger,
  border: `1px solid #FECACA`,
  borderRadius: 8,
  padding: '9px 20px',
  cursor: 'pointer',
  fontWeight: 500,
  fontSize: 14,
} as const

export const tableHeaderStyle = {
  background: C.pageBg,
  borderBottom: `1px solid ${C.border}`,
} as const

export const tableHeaderCell = {
  padding: '10px 16px',
  fontSize: 11,
  fontWeight: 600,
  color: C.textLight,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
  textAlign: 'left' as const,
  fontFamily: F.en,
} as const

export const tableCell = {
  padding: '14px 16px',
  fontSize: 13,
  color: C.textMid,
  borderBottom: `1px solid ${C.border}`,
  fontFamily: F.en,
} as const

export const inputStyle = {
  width: '100%',
  padding: '9px 12px',
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  fontSize: 14,
  fontFamily: F.en,
  color: C.textDark,
  background: C.white,
  boxSizing: 'border-box' as const,
} as const

export const labelStyle = {
  display: 'block' as const,
  fontSize: 12,
  fontWeight: 600,
  color: C.textMid,
  marginBottom: 6,
  fontFamily: F.en,
} as const

export const sectionCard = {
  background: C.white,
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  padding: '1.5rem',
  marginBottom: '1.5rem',
} as const

export const pageTitle = {
  fontSize: 22,
  fontWeight: 700,
  color: C.navy,
  margin: 0,
  fontFamily: F.en,
} as const

export const pageSubtitle = {
  fontSize: 13,
  color: C.textLight,
  margin: '4px 0 0',
  fontFamily: F.en,
} as const
```

- [ ] **Verify:** Run `cd web && npx tsc --noEmit` — no errors.

- [ ] **Commit:**
```bash
git add web/src/lib/brand.ts
git commit -m "feat: add brand constants file"
```

---

## Task 2: Google Fonts + Global CSS

**Files:**
- Modify: `web/src/app/layout.tsx`
- Modify: `web/src/app/globals.css`

- [ ] **Update `web/src/app/layout.tsx`:**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Serviq FM",
  description: "Facility Management Platform",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Readex+Pro:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Replace `web/src/app/globals.css`** with:

```css
*, *::before, *::after {
  box-sizing: border-box;
}

html, body {
  margin: 0;
  padding: 0;
  font-family: 'DM Sans', sans-serif;
  background: #F8FAFC;
  color: #1E2D4E;
  -webkit-font-smoothing: antialiased;
}

[dir="rtl"] body,
[dir="rtl"] * {
  font-family: 'Readex Pro', sans-serif;
}

a { color: inherit; text-decoration: none; }

button { font-family: inherit; }

input, select, textarea {
  font-family: inherit;
  outline: none;
}

input:focus, select:focus, textarea:focus {
  border-color: #1A7FC1 !important;
  box-shadow: 0 0 0 3px rgba(26,127,193,0.12);
}

::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: #F8FAFC; }
::-webkit-scrollbar-thumb { background: #B8DDD8; border-radius: 3px; }
```

- [ ] **Verify:** Run `cd web && npm run dev` — fonts load in browser with no console errors.

- [ ] **Commit:**
```bash
git add web/src/app/layout.tsx web/src/app/globals.css
git commit -m "feat: load DM Sans and Readex Pro fonts"
```

---

## Task 3: Brand Dashboard Layout + Login Page

**Files:**
- Modify: `web/src/app/dashboard/layout.tsx`
- Modify: `web/src/app/login/page.tsx`

- [ ] **Update `web/src/app/dashboard/layout.tsx`:**

```tsx
import Sidebar from '@/components/Sidebar'
import { LanguageProvider } from '@/context/LanguageContext'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <div style={{ display: 'flex', minHeight: '100vh', background: '#F8FAFC' }}>
        <Sidebar />
        <main style={{ flex: 1, minWidth: 0, overflowY: 'auto', fontFamily: "'DM Sans', sans-serif" }}>
          {children}
        </main>
      </div>
    </LanguageProvider>
  )
}
```

- [ ] **Replace `web/src/app/login/page.tsx`:**

```tsx
'use client'

import { type FormEvent, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { C, F } from '@/lib/brand'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false) }
    else router.push('/dashboard')
  }

  return (
    <div style={{ minHeight: '100vh', background: C.pageBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 400, padding: '0 1.5rem' }}>

        {/* Logo mark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '2.5rem', justifyContent: 'center' }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: C.navy, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 19, fontWeight: 800, fontFamily: F.en, background: C.gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>S</span>
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: F.en }}>
              <span style={{ color: C.navy }}>Serviq</span><span style={{ color: C.teal }}>FM</span>
            </div>
            <div style={{ fontSize: 10, color: C.textLight, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: F.en }}>Facility Management</div>
          </div>
        </div>

        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: '2rem' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.navy, margin: '0 0 0.25rem', fontFamily: F.en }}>Sign in</h1>
          <p style={{ fontSize: 13, color: C.textLight, margin: '0 0 1.5rem' }}>Welcome back to Serviq FM</p>

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 6, fontFamily: F.en }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, fontFamily: F.en, color: C.textDark, background: C.white, boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 6, fontFamily: F.en }}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, fontFamily: F.en, color: C.textDark, background: C.white, boxSizing: 'border-box' }} />
            </div>
            {error && <p style={{ color: C.danger, marginBottom: '1rem', fontSize: 13, background: '#FEE2E2', padding: '10px 12px', borderRadius: 8 }}>{error}</p>}
            <button type="submit" disabled={loading}
              style={{ width: '100%', padding: '11px', background: C.navy, color: C.white, border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14, fontFamily: F.en, opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Verify:** Open browser at `http://localhost:3000/login` — branded login page with logo, correct fonts.

- [ ] **Commit:**
```bash
git add web/src/app/dashboard/layout.tsx web/src/app/login/page.tsx
git commit -m "feat: brand login page and dashboard layout"
```

---

## Task 4: Brand the Main Dashboard Page

**Files:**
- Modify: `web/src/app/dashboard/page.tsx`

- [ ] **Add import at top of `web/src/app/dashboard/page.tsx`:**

```tsx
import { C, F, cardStyle, pageStyle } from '@/lib/brand'
```

- [ ] **Replace hardcoded color values** throughout the file using find-and-replace:
  - `'#1a1a2e'` → `C.navy`
  - `'#f7f7f5'` → `C.pageBg`
  - `'#2e7d32'` → `C.success`
  - `'#c62828'` → `C.danger`
  - `'#f57f17'` → `C.warning`
  - `background: 'white'` → `background: C.white`
  - `border: '1px solid #eee'` → `` border: `1px solid ${C.border}` ``
  - `borderRadius: 12` stays
  - `fontFamily` on all text elements → `fontFamily: F.en`

- [ ] **Update stat card colors** — replace the raw hex colors in `statCards` array with brand constants. Cards with overdue > 0 use `C.danger`, success use `C.success`, default use `C.navy`.

- [ ] **Update greeting section** — set `fontSize: 24, fontWeight: 700, color: C.navy, fontFamily: F.en`.

- [ ] **Verify:** Dashboard loads with brand colors and DM Sans font.

- [ ] **Commit:**
```bash
git add web/src/app/dashboard/page.tsx
git commit -m "feat: apply brand kit to dashboard page"
```

---

## Task 5: Brand Work Orders Pages

**Files:**
- Modify: `web/src/app/dashboard/work-orders/page.tsx`
- Modify: `web/src/app/dashboard/work-orders/new/page.tsx`
- Modify: `web/src/app/dashboard/work-orders/[id]/page.tsx`

- [ ] **In `work-orders/page.tsx` — add import:**
```tsx
import { C, F, cardStyle, primaryBtn, secondaryBtn, tableHeaderCell, tableCell, inputStyle } from '@/lib/brand'
```

- [ ] **Apply brand to `work-orders/page.tsx`:**
  - Page background: `C.pageBg`
  - Page title: `color: C.navy, fontFamily: F.en, fontSize: 22, fontWeight: 700`
  - "New Work Order" button: use `primaryBtn` spread
  - Table container: use `cardStyle` spread + `overflow: 'hidden'`
  - Table header row: `background: C.pageBg`
  - Header cells: use `tableHeaderCell` spread
  - Body cells: use `tableCell` spread
  - Search input: use `inputStyle` spread
  - Filter selects: use `inputStyle` spread
  - Row hover: `background: '#F8FAFC'` on `onMouseEnter`/`onMouseLeave`
  - Replace all `#1a1a2e` → `C.navy`

- [ ] **Apply same brand pattern to `work-orders/new/page.tsx`:**
  - Form card: `sectionCard` from brand
  - Labels: `labelStyle`
  - Inputs + selects: `inputStyle`
  - Submit button: `primaryBtn`
  - Cancel button: `secondaryBtn`
  - Page title: `pageTitle`

- [ ] **Improve `work-orders/[id]/page.tsx`:**
  - Tab bar: active tab uses `background: C.navy, color: C.white`, inactive uses `color: C.textMid`
  - Status workflow buttons: map status to correct colors (`C.teal` for complete, `C.danger` for reopen, `C.navy` for progress)
  - Add a top status banner: colored strip at top of detail showing current status with icon
  - Apply `pageTitle`, `cardStyle`, `primaryBtn`, `tableCell` throughout

- [ ] **Verify:** Visit `/dashboard/work-orders` — clean table layout with DM Sans, navy headings, teal accents.

- [ ] **Commit:**
```bash
git add web/src/app/dashboard/work-orders/
git commit -m "feat: brand work orders pages"
```

---

## Task 6: Brand Assets + PM Schedules Pages

**Files:**
- Modify: `web/src/app/dashboard/assets/page.tsx`
- Modify: `web/src/app/dashboard/assets/[id]/page.tsx`
- Modify: `web/src/app/dashboard/pm-schedules/page.tsx`
- Modify: `web/src/app/dashboard/pm-schedules/compliance/page.tsx`

- [ ] **Brand `assets/page.tsx`** — same pattern as work orders:
  - Import brand constants
  - Apply `cardStyle`, `tableHeaderCell`, `tableCell`, `primaryBtn`, `inputStyle`
  - Asset status badges: active = `background: '#DCFCE7', color: '#166534'`; under maintenance = `background: '#FEF3C7', color: '#92400E'`; retired = `background: '#F1F5F9', color: C.textMid`

- [ ] **Brand `assets/[id]/page.tsx`** — detail page:
  - Top section: asset name `pageTitle`, subtitle with site + category
  - Tab bar: same style as work order detail
  - Info grid: `cardStyle` with `labelStyle` + value pairs
  - QR code tab: already functional, just brand the button

- [ ] **Brand `pm-schedules/page.tsx`:**
  - Apply table brand pattern
  - Status pills: active = teal background, paused = warning background
  - Frequency badge: small pill `background: C.pageBg, color: C.textMid, border: border`

- [ ] **Brand `pm-schedules/compliance/page.tsx`:**
  - Ensure page shows real compliance % per asset category pulled from Supabase
  - Progress bars: fill color = `C.teal` for ≥80%, `C.warning` for 50–79%, `C.danger` for <50%
  - Summary card at top: overall compliance % in large number `color: C.navy`

- [ ] **Verify:** Navigate `/dashboard/assets` and `/dashboard/pm-schedules` — consistent branded look.

- [ ] **Commit:**
```bash
git add web/src/app/dashboard/assets/ web/src/app/dashboard/pm-schedules/
git commit -m "feat: brand assets and PM schedules pages"
```

---

## Task 7: Brand Remaining Pages

**Files:**
- Modify: `web/src/app/dashboard/sites/page.tsx`
- Modify: `web/src/app/dashboard/users/page.tsx`
- Modify: `web/src/app/dashboard/vendors/page.tsx`
- Modify: `web/src/app/dashboard/inventory/page.tsx`
- Modify: `web/src/app/dashboard/inspections/page.tsx`
- Modify: `web/src/app/dashboard/settings/page.tsx`

- [ ] **Brand `sites/page.tsx`:**
  - Import brand constants, apply `cardStyle`, `tableHeaderCell`, `tableCell`, `primaryBtn`
  - Site cards (if card layout): apply `cardStyle`, site name in `C.navy`, address in `C.textMid`

- [ ] **Brand `users/page.tsx`:**
  - Same table pattern
  - Role badges: admin = navy, manager = blue, technician = teal, requester = light grey
  - Status badges: active = green, inactive = grey

- [ ] **Brand `vendors/page.tsx`** and **`inventory/page.tsx`** and **`inspections/page.tsx`:**
  - Same table pattern for all three
  - Apply `inputStyle` to all search fields

- [ ] **Brand `settings/page.tsx`:**
  - Tab buttons: active tab `background: C.navy, color: C.white, border: 'none'`, inactive `background: C.white, color: C.textMid, border: border`
  - Section cards: `sectionCard`
  - Replace remaining `#1a1a2e` → `C.navy`

- [ ] **Verify:** Navigate through all sidebar pages — consistent brand throughout.

- [ ] **Commit:**
```bash
git add web/src/app/dashboard/sites/ web/src/app/dashboard/users/ web/src/app/dashboard/vendors/ web/src/app/dashboard/inventory/ web/src/app/dashboard/inspections/ web/src/app/dashboard/settings/
git commit -m "feat: brand all remaining dashboard pages"
```

---

## Task 8: Add Reports Nav Item + Reporting Dashboard

**Files:**
- Modify: `web/src/components/Sidebar.tsx`
- Create: `web/src/app/dashboard/reports/page.tsx`

- [ ] **Install recharts:**
```bash
cd web && npm install recharts
```

- [ ] **Add Reports to NAV array in `web/src/components/Sidebar.tsx`:**

Add after the `dashboard` entry:
```tsx
{ key: 'reports', href: '/dashboard/reports', en: 'Reports', ar: 'التقارير', exact: false },
```

Add to `ICONS`:
```tsx
reports: <SvgIcon d="M3 3v18h18M7 16l4-4 4 4 4-4" />,
```

- [ ] **Create `web/src/app/dashboard/reports/page.tsx`:**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import { C, F, cardStyle, pageStyle, pageTitle, pageSubtitle } from '@/lib/brand'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend
} from 'recharts'
import { differenceInHours, format, startOfMonth, subMonths } from 'date-fns'

export default function ReportsPage() {
  const supabase = createClient()
  const { lang } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [mttrByMonth, setMttrByMonth] = useState<any[]>([])
  const [woByStatus, setWoByStatus] = useState<any[]>([])
  const [pmCompliance, setPmCompliance] = useState<any[]>([])
  const [costByMonth, setCostByMonth] = useState<any[]>([])
  const [summary, setSummary] = useState({ totalWOs: 0, avgMTTR: 0, pmRate: 0, totalCost: 0 })

  useEffect(() => { loadReports() }, [])

  async function loadReports() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) return
    const orgId = profile.organisation_id

    const sixMonthsAgo = subMonths(new Date(), 6).toISOString()

    const [
      { data: closedWOs },
      { data: allWOs },
      { data: pmSchedules },
    ] = await Promise.all([
      supabase.from('work_orders').select('id, status, started_at, completed_at, actual_cost, created_at')
        .eq('organisation_id', orgId).in('status', ['completed', 'closed']).gte('created_at', sixMonthsAgo),
      supabase.from('work_orders').select('id, status').eq('organisation_id', orgId),
      supabase.from('pm_schedules').select('id, title, is_active, last_completed_at').eq('organisation_id', orgId),
    ])

    // MTTR by month (last 6 months)
    const monthMap: Record<string, { total: number; count: number }> = {}
    ;(closedWOs ?? []).forEach(wo => {
      if (!wo.started_at || !wo.completed_at) return
      const month = format(new Date(wo.created_at), 'MMM')
      const hrs = differenceInHours(new Date(wo.completed_at), new Date(wo.started_at))
      if (!monthMap[month]) monthMap[month] = { total: 0, count: 0 }
      monthMap[month].total += hrs
      monthMap[month].count += 1
    })
    setMttrByMonth(Object.entries(monthMap).map(([month, v]) => ({ month, mttr: Math.round(v.total / v.count) })))

    // WO by status
    const statusCount: Record<string, number> = {}
    ;(allWOs ?? []).forEach(w => { statusCount[w.status] = (statusCount[w.status] || 0) + 1 })
    setWoByStatus(Object.entries(statusCount).map(([status, count]) => ({ status, count })))

    // PM compliance by schedule
    const active = (pmSchedules ?? []).filter(p => p.is_active)
    const done = active.filter(p => p.last_completed_at)
    const rate = active.length > 0 ? Math.round((done.length / active.length) * 100) : 0
    setPmCompliance([
      { name: lang === 'ar' ? 'مكتملة' : 'Completed', value: done.length, color: C.teal },
      { name: lang === 'ar' ? 'معلقة' : 'Pending', value: active.length - done.length, color: C.border },
    ])

    // Cost by month
    const costMap: Record<string, number> = {}
    ;(closedWOs ?? []).forEach(wo => {
      if (!wo.actual_cost) return
      const month = format(new Date(wo.created_at), 'MMM')
      costMap[month] = (costMap[month] || 0) + Number(wo.actual_cost)
    })
    setCostByMonth(Object.entries(costMap).map(([month, cost]) => ({ month, cost })))

    const wosWithTime = (closedWOs ?? []).filter(w => w.started_at && w.completed_at)
    const totalHrs = wosWithTime.reduce((s, w) => s + differenceInHours(new Date(w.completed_at), new Date(w.started_at)), 0)

    setSummary({
      totalWOs: (allWOs ?? []).length,
      avgMTTR: wosWithTime.length > 0 ? Math.round(totalHrs / wosWithTime.length) : 0,
      pmRate: rate,
      totalCost: (closedWOs ?? []).reduce((s, w) => s + Number(w.actual_cost || 0), 0),
    })
    setLoading(false)
  }

  if (loading) return <div style={{ padding: '2rem', color: C.textLight }}>Loading reports...</div>

  return (
    <div style={pageStyle}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={pageTitle}>{lang === 'ar' ? 'التقارير والتحليلات' : 'Reports & Analytics'}</h1>
        <p style={pageSubtitle}>{lang === 'ar' ? 'آخر 6 أشهر' : 'Last 6 months'}</p>
      </div>

      {/* Summary KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: '2rem' }}>
        {[
          { label: lang === 'ar' ? 'إجمالي أوامر العمل' : 'Total Work Orders', value: summary.totalWOs, color: C.navy },
          { label: lang === 'ar' ? 'متوسط وقت الإصلاح' : 'Avg MTTR (hrs)', value: summary.avgMTTR + 'h', color: summary.avgMTTR > 24 ? C.danger : C.success },
          { label: lang === 'ar' ? 'الالتزام بالصيانة' : 'PM Compliance', value: summary.pmRate + '%', color: summary.pmRate >= 80 ? C.success : summary.pmRate >= 50 ? C.warning : C.danger },
          { label: lang === 'ar' ? 'التكلفة الإجمالية' : 'Total Cost (SAR)', value: summary.totalCost > 0 ? summary.totalCost.toLocaleString() : '—', color: C.navy },
        ].map(kpi => (
          <div key={kpi.label} style={cardStyle}>
            <p style={{ fontSize: 11, color: C.textLight, margin: '0 0 8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: F.en }}>{kpi.label}</p>
            <p style={{ fontSize: 28, fontWeight: 700, margin: 0, color: kpi.color, fontFamily: F.en }}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* MTTR Chart + WO Status */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: '2rem' }}>
        <div style={cardStyle}>
          <p style={{ fontSize: 14, fontWeight: 600, color: C.navy, margin: '0 0 1rem', fontFamily: F.en }}>
            {lang === 'ar' ? 'متوسط وقت الإصلاح حسب الشهر' : 'MTTR by Month (hours)'}
          </p>
          {mttrByMonth.length === 0
            ? <p style={{ fontSize: 13, color: C.textLight }}>No data yet</p>
            : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={mttrByMonth}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: C.textMid }} />
                  <YAxis tick={{ fontSize: 12, fill: C.textMid }} />
                  <Tooltip />
                  <Bar dataKey="mttr" fill={C.blue} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
        </div>

        <div style={cardStyle}>
          <p style={{ fontSize: 14, fontWeight: 600, color: C.navy, margin: '0 0 1rem', fontFamily: F.en }}>
            {lang === 'ar' ? 'أوامر العمل حسب الحالة' : 'Work Orders by Status'}
          </p>
          {woByStatus.length === 0
            ? <p style={{ fontSize: 13, color: C.textLight }}>No data yet</p>
            : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={woByStatus} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis type="number" tick={{ fontSize: 12, fill: C.textMid }} />
                  <YAxis dataKey="status" type="category" tick={{ fontSize: 11, fill: C.textMid }} width={90} />
                  <Tooltip />
                  <Bar dataKey="count" fill={C.teal} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
        </div>
      </div>

      {/* PM Compliance + Cost */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={cardStyle}>
          <p style={{ fontSize: 14, fontWeight: 600, color: C.navy, margin: '0 0 1rem', fontFamily: F.en }}>
            {lang === 'ar' ? 'الالتزام بالصيانة الوقائية' : 'PM Compliance'}
          </p>
          {pmCompliance.reduce((s, p) => s + p.value, 0) === 0
            ? <p style={{ fontSize: 13, color: C.textLight }}>No PM schedules yet</p>
            : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pmCompliance} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {pmCompliance.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
        </div>

        <div style={cardStyle}>
          <p style={{ fontSize: 14, fontWeight: 600, color: C.navy, margin: '0 0 1rem', fontFamily: F.en }}>
            {lang === 'ar' ? 'تكلفة الصيانة الشهرية (ر.س)' : 'Monthly Maintenance Cost (SAR)'}
          </p>
          {costByMonth.length === 0
            ? <p style={{ fontSize: 13, color: C.textLight }}>No cost data yet</p>
            : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={costByMonth}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: C.textMid }} />
                  <YAxis tick={{ fontSize: 12, fill: C.textMid }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="cost" stroke={C.mid} strokeWidth={2} dot={{ fill: C.mid }} />
                </LineChart>
              </ResponsiveContainer>
            )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Verify:** Visit `/dashboard/reports` — 4 KPI cards, 4 charts load. With empty data shows "No data yet".

- [ ] **Commit:**
```bash
git add web/src/components/Sidebar.tsx web/src/app/dashboard/reports/
git commit -m "feat: add reporting dashboard with recharts"
```

---

## Task 9: Language Toggle — Web End-to-End

**Files:**
- Modify: `web/src/app/dashboard/page.tsx` — ensure all strings use `t()`
- Modify: `web/src/app/dashboard/work-orders/page.tsx` — verify `t()` usage
- Modify: `web/src/app/layout.tsx` — add `suppressHydrationWarning` to html tag

- [ ] **Add `suppressHydrationWarning` to html tag in `layout.tsx`:**

```tsx
<html lang="en" suppressHydrationWarning>
```

- [ ] **Add RTL font switching to `globals.css`** (already added in Task 2 above).

- [ ] **Verify language toggle in browser:**
  1. Open `/dashboard`
  2. Click `العربية` in sidebar footer
  3. Confirm: page direction flips to RTL, nav labels switch to Arabic, Readex Pro font loads
  4. Click `English` — confirms switches back
  5. Refresh page — language persists (stored in localStorage + cookie)

- [ ] **Fix any pages where Arabic text is missing** — check for hardcoded English strings not wrapped in `t()` and add translation keys to `LanguageContext.tsx`.

- [ ] **Commit:**
```bash
git add web/src/app/layout.tsx
git commit -m "feat: language toggle end-to-end web"
```

---

## Task 10: TypeScript Build Verification

- [ ] **Run full TypeScript check:**
```bash
cd web && npx tsc --noEmit
```
Expected: no output (zero errors).

- [ ] **Run Next.js build:**
```bash
cd web && npm run build
```
Expected: build completes successfully, no errors in terminal.

- [ ] **Fix any build errors** before proceeding to Week 2.

- [ ] **Commit:**
```bash
git add -A
git commit -m "fix: resolve all build errors after brand pass"
```

---

## Demo Checkpoint — End of Week 1

Walk through this flow in the browser:

1. `/login` — branded login page ✓
2. `/dashboard` — KPI cards, activity feed, brand colours ✓
3. `/dashboard/work-orders` — table with status/priority badges ✓
4. `/dashboard/work-orders/new` — branded form ✓
5. `/dashboard/assets` — asset list with status badges ✓
6. `/dashboard/pm-schedules` — schedule list ✓
7. `/dashboard/reports` — 4 charts ✓
8. `/dashboard/settings` — 3 tabs working ✓
9. Language toggle → Arabic RTL → back to English ✓
