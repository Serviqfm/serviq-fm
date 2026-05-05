# Sprint A — Quick Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two small but high-impact bugs: the post-logout 404 redirect, and add sequential WO numbers so staff can track work orders by a human-readable reference.

**Architecture:** A1 is a single-line change in the logout API route. A2 adds a `wo_number` integer column to `work_orders`, auto-assigned per-organisation via a Postgres trigger (no race conditions needed at this scale), a TypeScript type update, and UI changes to display and search by WO number.

**Tech Stack:** Next.js 14, Supabase (Postgres SQL editor for migration), TypeScript

---

## File Map

| Action | File | Change |
|--------|------|--------|
| Modify | `web/src/app/auth/logout/route.ts` | Redirect to `/login/client` instead of `/login` |
| Modify | `web/src/types/work-order.ts` | Add `wo_number: number \| null` field |
| Modify | `web/src/app/dashboard/work-orders/page.tsx` | Add WO# column, update search to match wo_number |
| Modify | `web/src/app/dashboard/work-orders/[id]/page.tsx` | Display WO number near title |
| SQL (Supabase editor) | — | Add column + trigger for auto-numbering |

---

## Task 1: Fix Logout Redirect

**Files:**
- Modify: `web/src/app/auth/logout/route.ts`

- [ ] **Open `web/src/app/auth/logout/route.ts` and change line 28:**

```typescript
// Before
return NextResponse.redirect(new URL('/login', request.url))

// After
return NextResponse.redirect(new URL('/login/client', request.url))
```

Full file after change:
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )

  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/login/client', request.url))
}
```

- [ ] **Verify locally:** Start the dev server (`cd web && npm run dev`), sign in, click Sign Out in the sidebar — confirm browser lands on `/login/client` not a 404.

- [ ] **Commit:**
```bash
git add web/src/app/auth/logout/route.ts
git commit -m "fix: redirect logout to /login/client"
```

---

## Task 2: Database Migration — Add wo_number Column + Trigger

This is run in the **Supabase SQL Editor** (Dashboard → SQL Editor → New query). There are no migration files in this project — run the SQL directly.

- [ ] **Run the following SQL in Supabase SQL Editor:**

```sql
-- Step 1: Add the wo_number column (nullable so existing rows aren't affected)
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS wo_number integer;

-- Step 2: Back-fill existing work orders with sequential numbers per organisation
-- This assigns numbers in created_at order within each org
WITH numbered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY organisation_id
      ORDER BY created_at ASC
    ) AS rn
  FROM work_orders
  WHERE wo_number IS NULL
)
UPDATE work_orders
SET wo_number = numbered.rn
FROM numbered
WHERE work_orders.id = numbered.id;

-- Step 3: Create the trigger function
CREATE OR REPLACE FUNCTION assign_wo_number()
RETURNS TRIGGER AS $$
BEGIN
  SELECT COALESCE(MAX(wo_number), 0) + 1
  INTO NEW.wo_number
  FROM work_orders
  WHERE organisation_id = NEW.organisation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Create the trigger (fires before each INSERT)
DROP TRIGGER IF EXISTS set_wo_number ON work_orders;
CREATE TRIGGER set_wo_number
  BEFORE INSERT ON work_orders
  FOR EACH ROW
  WHEN (NEW.wo_number IS NULL)
  EXECUTE FUNCTION assign_wo_number();
```

- [ ] **Verify in Supabase:** Run `SELECT id, organisation_id, wo_number, title FROM work_orders ORDER BY organisation_id, wo_number LIMIT 20;` — confirm existing rows have sequential numbers starting at 1.

- [ ] **Test the trigger:** Insert a new work order via the app UI, then check: `SELECT wo_number, title FROM work_orders ORDER BY created_at DESC LIMIT 3;` — the new row should have `wo_number = MAX(existing) + 1` for that org.

---

## Task 3: Update TypeScript Type

**Files:**
- Modify: `web/src/types/work-order.ts`

- [ ] **Add `wo_number` to the `WorkOrder` interface:**

```typescript
export type Priority = 'low' | 'medium' | 'high' | 'critical'
export type WorkOrderStatus = 'new' | 'assigned' | 'in_progress' | 'on_hold' | 'completed' | 'closed'

export interface WorkOrder {
  id: string
  organisation_id: string
  site_id: string | null
  asset_id: string | null
  created_by: string
  assigned_to: string | null
  title: string
  title_ar: string | null
  description: string | null
  priority: Priority
  status: WorkOrderStatus
  wo_number: number | null
  sla_hours: number | null
  due_at: string | null
  started_at: string | null
  completed_at: string | null
  closed_at: string | null
  photo_urls: string[]
  media_expires_at: string
  completion_notes: string | null
  actual_cost: number | null
  source: string
  created_at: string
  updated_at: string
  assignee?: { full_name: string } | null
  asset?: { name: string } | null
  site?: { name: string } | null
}
```

- [ ] **Run TypeScript check:**
```bash
cd web && npx tsc --noEmit
```
Expected: no new errors (wo_number is `| null` so all existing code still compiles).

---

## Task 4: Display WO Number in Work Orders List

**Files:**
- Modify: `web/src/app/dashboard/work-orders/page.tsx`

Two changes: (1) add a "WO #" column to the table, (2) include `wo_number` in the search filter.

- [ ] **Add `wo_number` to the search filter.** Find the `filtered` const (around line 85) and add a WO number match:

```typescript
const filtered = workOrders.filter(wo => {
  const woNum = wo.wo_number ? `WO-${String(wo.wo_number).padStart(4, '0')}` : ''
  const matchSearch = wo.title.toLowerCase().includes(search.toLowerCase()) ||
    wo.asset?.name?.toLowerCase().includes(search.toLowerCase()) ||
    wo.site?.name?.toLowerCase().includes(search.toLowerCase()) ||
    woNum.toLowerCase().includes(search.toLowerCase())
  const matchDateFrom = !dateFrom || new Date(wo.created_at) >= new Date(dateFrom)
  const matchDateTo = !dateTo || new Date(wo.created_at) <= new Date(dateTo + 'T23:59:59')
  return matchSearch && matchDateFrom && matchDateTo
})
```

- [ ] **Add the "WO #" column header.** Find the `<thead>` row (around line 231) — the column headers are mapped from an array. Change it to add "WO #" as the first data header (after the checkbox column):

```tsx
<tr style={{ background: C.pageBg, borderBottom: `1px solid ${C.border}` }}>
  <th style={{ padding: '10px 16px', width: 40 }}>
    <input type='checkbox' checked={selected.length === filtered.length && filtered.length > 0} onChange={toggleSelectAll} />
  </th>
  <th style={tableHeaderCell}>WO #</th>
  {[t('wo.col.title'),t('wo.col.asset'),t('wo.col.site'),t('assets.col.cat'),t('wo.col.priority'),t('wo.col.status'),t('wo.col.assigned'),t('wo.col.due'),t('common.created')].map(h => (
    <th key={h} style={tableHeaderCell}>{h}</th>
  ))}
</tr>
```

- [ ] **Add the WO # cell in the table rows.** Find the `<tr key={wo.id}` row (around line 243). Add a WO number cell immediately after the checkbox cell and before the title cell:

```tsx
<tr key={wo.id} style={{ background: isSelected ? '#EEF2FF' : overdue ? '#FFF8F8' : C.white }}>
  <td style={{ padding: '12px 16px' }}>
    <input type='checkbox' checked={isSelected} onChange={() => toggleSelect(wo.id)} />
  </td>
  <td style={{ ...tableCell, color: C.textMid, fontWeight: 500, whiteSpace: 'nowrap' as const }}>
    {wo.wo_number ? `WO-${String(wo.wo_number).padStart(4, '0')}` : '—'}
  </td>
  <td style={tableCell}>
    <Link href={'/dashboard/work-orders/' + wo.id} style={{ color: C.navy, fontWeight: 500, textDecoration: 'none', fontSize: 14, fontFamily: F.en }}>
      {wo.title}
    </Link>
    {overdue && <span style={{ marginLeft: 8, fontSize: 11, color: C.danger, background: '#fce4ec', padding: '1px 6px', borderRadius: 10, fontFamily: F.en }}>Overdue</span>}
  </td>
  <td style={tableCell}>{wo.asset?.name ?? '—'}</td>
  <td style={tableCell}>{wo.site?.name ?? '—'}</td>
  <td style={tableCell}>{wo.category ?? '—'}</td>
  <td style={tableCell}>
    {badge(wo.priority === 'critical' ? t('wo.priority.critical') : wo.priority === 'high' ? t('wo.priority.high') : wo.priority === 'medium' ? t('wo.priority.medium') : t('wo.priority.low'), pCfg)}
  </td>
  <td style={tableCell}>
    {badge(wo.status === 'new' ? t('wo.status.new') : wo.status === 'assigned' ? t('wo.status.assigned') : wo.status === 'in_progress' ? t('wo.status.in_progress') : wo.status === 'on_hold' ? t('wo.status.on_hold') : wo.status === 'completed' ? t('wo.status.completed') : t('wo.status.closed'), sCfg)}
  </td>
  <td style={tableCell}>{wo.assignee?.full_name ?? t('common.unassigned')}</td>
  <td style={{ ...tableCell, color: overdue ? C.danger : C.textMid }}>
    {wo.due_at ? format(new Date(wo.due_at), 'dd MMM yyyy') : '—'}
  </td>
  <td style={tableCell}>
    {format(new Date(wo.created_at), 'dd MMM yyyy')}
  </td>
</tr>
```

- [ ] **Verify:** Run `npm run dev`, open the work orders list — confirm the "WO #" column appears with values like `WO-0001`, `WO-0002`. Type "WO-000" in the search box — confirm it filters to matching rows.

- [ ] **TypeScript check:**
```bash
cd web && npx tsc --noEmit
```
Expected: no errors.

---

## Task 5: Display WO Number in Work Order Detail Page

**Files:**
- Modify: `web/src/app/dashboard/work-orders/[id]/page.tsx`

The detail page shows the WO title as a heading. We'll add the WO number as a subtle badge/subtitle beneath it.

- [ ] **Find where the WO title is rendered** (search for `wo.title` in the detail page JSX — it appears as the main heading). Add the WO number directly below it:

Find this pattern (the title heading area, roughly after `wo &&` check):
```tsx
{wo.title}
```

Add immediately after the title heading element (look for the `<h1>` or heading div containing `wo.title`):
```tsx
{wo.wo_number && (
  <span style={{
    display: 'inline-block',
    fontSize: 12,
    fontWeight: 600,
    color: C.textMid,
    background: C.pageBg,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: '2px 10px',
    marginTop: 6,
    fontFamily: F.en,
    letterSpacing: '0.03em',
  }}>
    {`WO-${String(wo.wo_number).padStart(4, '0')}`}
  </span>
)}
```

- [ ] **Verify:** Open a work order detail page — confirm the WO number badge appears beneath the title (e.g., `WO-0003`).

- [ ] **TypeScript check:**
```bash
cd web && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Commit both UI changes together:**
```bash
git add web/src/types/work-order.ts \
        web/src/app/dashboard/work-orders/page.tsx \
        web/src/app/dashboard/work-orders/[id]/page.tsx
git commit -m "feat: add sequential WO numbers (WO-0001 format) with search support"
```

---

## Task 6: Update CONTEXT.md

- [ ] **Mark Sprint A tasks as done in `CONTEXT.md`:**

Change:
```markdown
- [ ] **A1 — Logout redirect**
```
to:
```markdown
- [x] **A1 — Logout redirect**
```

And:
```markdown
- [ ] **A2 — Work order sequential numbering**
```
to:
```markdown
- [x] **A2 — Work order sequential numbering**
```

- [ ] **Commit:**
```bash
git add CONTEXT.md
git commit -m "docs: mark Sprint A complete in CONTEXT.md"
```

---

## Sprint A Complete Checklist

- [ ] Sign out → lands on `/login/client` (not 404)
- [ ] Work orders list shows `WO-0001`, `WO-0002`, … column
- [ ] Search "WO-000" filters the list correctly
- [ ] New work order created via UI gets the next sequential number for that org
- [ ] Work order detail page shows WO number badge under title
- [ ] `npx tsc --noEmit` passes clean
