# Sprint E — Field Visibility Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let tenant admins configure which fields on each entity form are Required, Optional, or Hidden, with two-layer enforcement (client UI + server validation).

**Architecture:** A TypeScript catalog (`field-catalog.ts`) is the source of truth for what fields exist on each form and which are system-required. A `field_configs` table stores per-org overrides. A server helper (`enforceFieldConfig`) gates every POST/PATCH handler; a client hook (`useFieldConfig`) drives form rendering. System-required fields are immutable in both layers — defense in depth.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Supabase (Postgres + RLS + service-role), Tailwind CSS (Lumina tokens). No test runner — verification is `npx tsc --noEmit` + `npm run build` + manual QA per CONTEXT.md conventions.

**Spec:** [docs/superpowers/specs/2026-05-17-sprint-e-field-visibility-settings-design.md](../specs/2026-05-17-sprint-e-field-visibility-settings-design.md)

---

## File Structure

**New files (Phase 1):**

| File | Responsibility |
|------|----------------|
| `docs/superpowers/sql/sprint-e-01-foundation.sql` | DDL: `field_configs` table, RLS policies, index |
| `web/src/lib/field-catalog.ts` | Catalog of every field on every form + page labels |
| `web/src/lib/fieldEnforcement.ts` | `getFieldConfig()`, `enforceFieldConfig()`, `seedFieldConfigsForOrg()` |
| `web/src/lib/useFieldConfig.ts` | Client hook reading config + helpers |
| `web/src/app/api/field-configs/route.ts` | GET handler — returns merged config for caller's org |
| `web/src/app/api/field-configs/[page]/route.ts` | POST handler — upserts overrides; admin-only |
| `web/src/app/dashboard/settings/FormFieldsTab.tsx` | Settings UI: page picker + field toggle table |
| `web/scripts/seed-field-configs.ts` | One-off backfill script for existing orgs |

**Modified files (Phase 1):**

| File | Change |
|------|--------|
| `web/src/app/dashboard/settings/page.tsx` | Add "Form Fields" tab in tab nav and render `FormFieldsTab` when active |

**Modified files (Phase 2 — each entity agent owns its slice):**

| File | Owner |
|------|-------|
| `web/src/app/dashboard/work-orders/new/page.tsx` | Agent-WorkOrders |
| `web/src/app/dashboard/work-orders/[id]/edit/page.tsx` | Agent-WorkOrders |
| `web/src/app/dashboard/work-orders/[id]/page.tsx` (close-out form) | Agent-WorkOrders |
| `web/src/app/dashboard/assets/new/page.tsx` | Agent-Assets |
| `web/src/app/dashboard/assets/[id]/edit/page.tsx` | Agent-Assets |
| `web/src/app/dashboard/sites/new/page.tsx` (or modal) | Agent-Sites |
| `web/src/app/dashboard/sites/[id]/edit/page.tsx` | Agent-Sites |
| `web/src/app/dashboard/sites/[id]/spaces/new/page.tsx` | Agent-Spaces |
| `web/src/app/dashboard/sites/[id]/spaces/[sid]/edit/page.tsx` | Agent-Spaces |
| `web/src/app/dashboard/users/new/page.tsx` | Agent-Users |
| `web/src/app/dashboard/users/[id]/edit/page.tsx` | Agent-Users |
| `web/src/app/api/users/route.ts` | Agent-Users |
| New work-order POST/PATCH server routes if missing | Agent-WorkOrders (currently inserts happen client-side; spec needs server route for enforcement) |
| Same for assets, sites, spaces | Each respective agent |

> **Note on enforcement architecture:** Most entity creates currently happen via client-side `supabase.from(X).insert()` using RLS-scoped session. For server-side enforcement to work, each entity needs a thin POST route that wraps the insert with `enforceFieldConfig`. Phase 2 agents add these routes if they don't exist and switch the form to fetch the new route.

---

# Phase 1 — Foundation

> **Single agent, sequential.** Must complete and merge before Phase 2 dispatches.

## Task 1: Create SQL migration file

**Files:**
- Create: `docs/superpowers/sql/sprint-e-01-foundation.sql`

- [ ] **Step 1: Create the SQL file with table, RLS, and index**

```sql
-- Sprint E — Foundation: field_configs table
-- Run in Supabase SQL editor.

CREATE TABLE IF NOT EXISTS field_configs (
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  page VARCHAR(50) NOT NULL,
  field_key VARCHAR(50) NOT NULL,
  visibility VARCHAR(10) NOT NULL
    CHECK (visibility IN ('required', 'optional', 'hidden')),
  updated_at TIMESTAMP DEFAULT now(),
  updated_by UUID REFERENCES users(id),
  PRIMARY KEY (organisation_id, page, field_key)
);

ALTER TABLE field_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS field_configs_org_select ON field_configs;
CREATE POLICY field_configs_org_select ON field_configs
  FOR SELECT USING (
    organisation_id IN (
      SELECT organisation_id FROM users WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS field_configs_org_write ON field_configs;
CREATE POLICY field_configs_org_write ON field_configs
  FOR ALL USING (
    organisation_id IN (
      SELECT organisation_id FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE INDEX IF NOT EXISTS idx_field_configs_org_page
  ON field_configs(organisation_id, page);
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/sql/sprint-e-01-foundation.sql
git commit -m "feat(sprint-e): add field_configs table SQL migration"
```

> **Manual step (the human runs this, not the agent):** Paste the contents of this file into the Supabase SQL editor and execute. Verify with `SELECT * FROM field_configs LIMIT 1;` — should return no rows but no error.

---

## Task 2: Create the field catalog file

**Files:**
- Create: `web/src/lib/field-catalog.ts`

This task requires reading every form file to enumerate every field with its `name=` attribute on inputs, selects, and textareas. The agent reads each form below in turn and adds entries to the catalog.

Forms to read:
- `web/src/app/dashboard/work-orders/new/page.tsx`
- `web/src/app/dashboard/work-orders/[id]/edit/page.tsx`
- `web/src/app/dashboard/work-orders/[id]/page.tsx` (the close-out form section that appears on status transition)
- `web/src/app/dashboard/assets/new/page.tsx`
- `web/src/app/dashboard/assets/[id]/edit/page.tsx`
- `web/src/app/dashboard/sites/new/page.tsx` (search if exists; sites may use a modal on `web/src/app/dashboard/sites/page.tsx` instead)
- `web/src/app/dashboard/sites/[id]/edit/page.tsx`
- `web/src/app/dashboard/sites/[id]/spaces/new/page.tsx`
- `web/src/app/dashboard/sites/[id]/spaces/[sid]/edit/page.tsx`
- `web/src/app/dashboard/users/new/page.tsx`
- `web/src/app/dashboard/users/[id]/edit/page.tsx`

- [ ] **Step 1: Write the catalog skeleton (types + empty registry)**

```ts
// web/src/lib/field-catalog.ts

export type FieldVisibility = 'required' | 'optional' | 'hidden'

export type FieldType =
  | 'text' | 'textarea' | 'select' | 'date' | 'datetime'
  | 'number' | 'file' | 'checkbox'

export type FieldPage =
  | 'work_orders_new'
  | 'work_orders_edit'
  | 'work_orders_close'
  | 'assets_new'
  | 'assets_edit'
  | 'sites_new'
  | 'sites_edit'
  | 'spaces_new'
  | 'spaces_edit'
  | 'users_new'
  | 'users_edit'

export const ALL_PAGES: FieldPage[] = [
  'work_orders_new', 'work_orders_edit', 'work_orders_close',
  'assets_new', 'assets_edit',
  'sites_new', 'sites_edit',
  'spaces_new', 'spaces_edit',
  'users_new', 'users_edit',
]

export type FieldMeta = {
  key: string
  label_en: string
  label_ar: string
  type: FieldType
  default_visibility: FieldVisibility
  is_system_required: boolean
}

export const PAGE_LABELS: Record<FieldPage, { en: string; ar: string }> = {
  work_orders_new:   { en: 'Create Work Order',   ar: 'إنشاء أمر عمل' },
  work_orders_edit:  { en: 'Edit Work Order',     ar: 'تعديل أمر العمل' },
  work_orders_close: { en: 'Close Work Order',    ar: 'إغلاق أمر العمل' },
  assets_new:        { en: 'Create Asset',        ar: 'إنشاء أصل' },
  assets_edit:       { en: 'Edit Asset',          ar: 'تعديل الأصل' },
  sites_new:         { en: 'Create Site',         ar: 'إنشاء موقع' },
  sites_edit:        { en: 'Edit Site',           ar: 'تعديل الموقع' },
  spaces_new:        { en: 'Create Space',        ar: 'إنشاء مساحة' },
  spaces_edit:       { en: 'Edit Space',          ar: 'تعديل المساحة' },
  users_new:         { en: 'Create User',         ar: 'إنشاء مستخدم' },
  users_edit:        { en: 'Edit User',           ar: 'تعديل المستخدم' },
}

export const FIELD_CATALOG: Record<FieldPage, FieldMeta[]> = {
  work_orders_new: [],
  work_orders_edit: [],
  work_orders_close: [],
  assets_new: [],
  assets_edit: [],
  sites_new: [],
  sites_edit: [],
  spaces_new: [],
  spaces_edit: [],
  users_new: [],
  users_edit: [],
}

export function isSystemRequired(page: FieldPage, key: string): boolean {
  return FIELD_CATALOG[page].find(f => f.key === key)?.is_system_required ?? false
}

export function getFieldMeta(page: FieldPage, key: string): FieldMeta | undefined {
  return FIELD_CATALOG[page].find(f => f.key === key)
}
```

- [ ] **Step 2: Populate work_orders_new (from `web/src/app/dashboard/work-orders/new/page.tsx:30-42`)**

The form's `useState` initializer at line ~30 lists every field. Map each to a catalog entry. System-required = DB NOT NULL or column required for any meaningful WO (title, site_id).

Replace the empty array for `work_orders_new`:

```ts
work_orders_new: [
  { key: 'title',                  label_en: 'Title',                label_ar: 'العنوان',           type: 'text',     default_visibility: 'required', is_system_required: true  },
  { key: 'description',            label_en: 'Description',          label_ar: 'الوصف',             type: 'textarea', default_visibility: 'optional', is_system_required: false },
  { key: 'priority',               label_en: 'Priority',             label_ar: 'الأولوية',          type: 'select',   default_visibility: 'required', is_system_required: false },
  { key: 'category',               label_en: 'Category',             label_ar: 'الفئة',             type: 'text',     default_visibility: 'optional', is_system_required: false },
  { key: 'site_id',                label_en: 'Site',                 label_ar: 'الموقع',            type: 'select',   default_visibility: 'required', is_system_required: true  },
  { key: 'asset_id',               label_en: 'Asset',                label_ar: 'الأصل',             type: 'select',   default_visibility: 'optional', is_system_required: false },
  { key: 'assigned_to',            label_en: 'Assigned to',          label_ar: 'مسند إلى',          type: 'select',   default_visibility: 'optional', is_system_required: false },
  { key: 'due_at',                 label_en: 'Due date',             label_ar: 'تاريخ الاستحقاق',   type: 'date',     default_visibility: 'optional', is_system_required: false },
  { key: 'sla_hours',              label_en: 'SLA hours',            label_ar: 'ساعات SLA',         type: 'number',   default_visibility: 'optional', is_system_required: false },
  { key: 'is_recurring',           label_en: 'Recurring',            label_ar: 'متكرر',             type: 'checkbox', default_visibility: 'optional', is_system_required: false },
  { key: 'recurrence_frequency',   label_en: 'Recurrence frequency', label_ar: 'تكرار',             type: 'select',   default_visibility: 'optional', is_system_required: false },
  { key: 'photos',                 label_en: 'Photos',               label_ar: 'الصور',             type: 'file',     default_visibility: 'optional', is_system_required: false },
],
```

- [ ] **Step 3: Populate work_orders_edit**

Read `web/src/app/dashboard/work-orders/[id]/edit/page.tsx` to see which fields are editable. Typically a subset of new (e.g., status, assigned_to, priority, due_at can be changed; title/site_id might be locked but still rendered). For each field on that form, add an entry. Use the same labels as new. `title` and `site_id` remain `is_system_required: true`.

- [ ] **Step 4: Populate work_orders_close**

Read the close-out section in `web/src/app/dashboard/work-orders/[id]/page.tsx`. Look for the form fields that appear when transitioning status to `completed` or `closed`. Specifically (from the grep at line ~40):
- `closeoutPhotos` (file upload, system-required: true — see the alert at line 91 "Please attach at least one close-out photo")
- Plus any completion notes / actual hours / actual cost fields if they exist

```ts
work_orders_close: [
  { key: 'closeout_photos', label_en: 'Close-out photos', label_ar: 'صور الإغلاق', type: 'file',     default_visibility: 'required', is_system_required: true  },
  { key: 'completion_notes', label_en: 'Completion notes', label_ar: 'ملاحظات الإكمال', type: 'textarea', default_visibility: 'optional', is_system_required: false },
  { key: 'actual_hours',    label_en: 'Actual hours',     label_ar: 'الساعات الفعلية', type: 'number',  default_visibility: 'optional', is_system_required: false },
  { key: 'actual_cost',     label_en: 'Actual cost',      label_ar: 'التكلفة الفعلية', type: 'number',  default_visibility: 'optional', is_system_required: false },
],
```

If `actual_hours` / `actual_cost` / `completion_notes` are NOT on the close-out form, omit them. Only catalog fields that actually exist as form inputs.

- [ ] **Step 5: Populate assets_new (from `web/src/app/dashboard/assets/new/page.tsx:19-33`)**

```ts
assets_new: [
  { key: 'name',                  label_en: 'Name',                  label_ar: 'الاسم',             type: 'text',     default_visibility: 'required', is_system_required: true  },
  { key: 'category',              label_en: 'Category',              label_ar: 'الفئة',             type: 'text',     default_visibility: 'optional', is_system_required: false },
  { key: 'site_id',               label_en: 'Site',                  label_ar: 'الموقع',            type: 'select',   default_visibility: 'optional', is_system_required: false },
  { key: 'sub_location',          label_en: 'Sub-location',          label_ar: 'الموقع الفرعي',     type: 'text',     default_visibility: 'optional', is_system_required: false },
  { key: 'serial_number',         label_en: 'Serial number',         label_ar: 'الرقم التسلسلي',    type: 'text',     default_visibility: 'optional', is_system_required: false },
  { key: 'manufacturer',          label_en: 'Manufacturer',          label_ar: 'الصانع',            type: 'text',     default_visibility: 'optional', is_system_required: false },
  { key: 'model',                 label_en: 'Model',                 label_ar: 'الموديل',           type: 'text',     default_visibility: 'optional', is_system_required: false },
  { key: 'purchase_date',         label_en: 'Purchase date',         label_ar: 'تاريخ الشراء',      type: 'date',     default_visibility: 'optional', is_system_required: false },
  { key: 'purchase_cost',         label_en: 'Purchase cost',         label_ar: 'تكلفة الشراء',      type: 'number',   default_visibility: 'optional', is_system_required: false },
  { key: 'warranty_expiry',       label_en: 'Warranty expiry',       label_ar: 'انتهاء الضمان',     type: 'date',     default_visibility: 'optional', is_system_required: false },
  { key: 'expected_lifespan_years', label_en: 'Expected lifespan (yrs)', label_ar: 'العمر المتوقع (سنوات)', type: 'number', default_visibility: 'optional', is_system_required: false },
  { key: 'description',           label_en: 'Description',           label_ar: 'الوصف',             type: 'textarea', default_visibility: 'optional', is_system_required: false },
  { key: 'location_notes',        label_en: 'Location notes',        label_ar: 'ملاحظات الموقع',    type: 'text',     default_visibility: 'optional', is_system_required: false },
  { key: 'photos',                label_en: 'Photos',                label_ar: 'الصور',             type: 'file',     default_visibility: 'optional', is_system_required: false },
],
```

- [ ] **Step 6: Populate assets_edit, sites_new, sites_edit, spaces_new, spaces_edit by reading each form file**

For each, read the file, find the `useState({...form fields})` initializer, map each form field to a catalog entry. Use sensible defaults: `name` and primary identifier are system-required; everything else defaults to optional unless the existing form uses HTML `required` attribute, in which case default_visibility is `required` (but not necessarily system-required).

Apply the same pattern as Steps 5 (assets_new). Each entity has its `useState` declaring its form fields.

- [ ] **Step 7: Populate users_new (from `web/src/app/dashboard/users/new/page.tsx:15-21`)**

```ts
users_new: [
  { key: 'full_name',    label_en: 'Full name (English)', label_ar: 'الاسم الكامل (إنجليزي)', type: 'text',   default_visibility: 'required', is_system_required: true  },
  { key: 'full_name_ar', label_en: 'Full name (Arabic)',  label_ar: 'الاسم الكامل (عربي)',    type: 'text',   default_visibility: 'optional', is_system_required: false },
  { key: 'email',        label_en: 'Email',               label_ar: 'البريد الإلكتروني',      type: 'text',   default_visibility: 'required', is_system_required: true  },
  { key: 'role',         label_en: 'Role',                label_ar: 'الدور',                  type: 'select', default_visibility: 'required', is_system_required: true  },
  { key: 'phone',        label_en: 'Phone',               label_ar: 'الهاتف',                 type: 'text',   default_visibility: 'optional', is_system_required: false },
],
```

- [ ] **Step 8: Populate users_edit**

Read `web/src/app/dashboard/users/[id]/edit/page.tsx` — pattern matches users_new but typically without email (and possibly with `is_active`). Catalog entries should reflect what's actually editable.

- [ ] **Step 9: Verify with tsc**

Run: `cd web && npx tsc --noEmit`
Expected: clean. If errors, fix them in the catalog file (most likely a key mismatch).

- [ ] **Step 10: Commit**

```bash
git add web/src/lib/field-catalog.ts
git commit -m "feat(sprint-e): add field catalog with 11 page entries"
```

---

## Task 3: Create the server-side helper

**Files:**
- Create: `web/src/lib/fieldEnforcement.ts`

- [ ] **Step 1: Write the helper file**

```ts
// web/src/lib/fieldEnforcement.ts

import { createClient } from '@supabase/supabase-js'
import { FIELD_CATALOG, FieldPage, FieldVisibility } from './field-catalog'

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (typeof v === 'string' && v.trim() === '') return true
  if (Array.isArray(v) && v.length === 0) return true
  return false
}

function getServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function getFieldConfig(
  orgId: string,
  page: FieldPage
): Promise<Map<string, FieldVisibility>> {
  const supabase = getServiceRoleClient()
  const { data } = await supabase
    .from('field_configs')
    .select('field_key, visibility')
    .eq('organisation_id', orgId)
    .eq('page', page)
  const overrides = new Map<string, FieldVisibility>(
    data?.map(r => [r.field_key, r.visibility as FieldVisibility]) ?? []
  )
  const merged = new Map<string, FieldVisibility>()
  for (const meta of FIELD_CATALOG[page]) {
    if (meta.is_system_required) {
      merged.set(meta.key, 'required')
    } else {
      merged.set(meta.key, overrides.get(meta.key) ?? meta.default_visibility)
    }
  }
  return merged
}

export async function enforceFieldConfig<T extends Record<string, unknown>>(
  orgId: string,
  page: FieldPage,
  payload: T
): Promise<{ cleaned: Partial<T> } | { error: string }> {
  const config = await getFieldConfig(orgId, page)
  const cleaned: Partial<T> = {}
  for (const [key, value] of Object.entries(payload)) {
    const visibility = config.get(key)
    if (visibility === undefined) {
      cleaned[key as keyof T] = value as T[keyof T]
      continue
    }
    if (visibility === 'hidden') continue
    if (visibility === 'required' && isEmpty(value)) {
      return { error: `Field "${key}" is required.` }
    }
    cleaned[key as keyof T] = value as T[keyof T]
  }
  for (const [key, vis] of config) {
    if (vis === 'required' && (!(key in cleaned) || isEmpty(cleaned[key as keyof T]))) {
      return { error: `Field "${key}" is required.` }
    }
  }
  return { cleaned }
}

export async function seedFieldConfigsForOrg(orgId: string): Promise<void> {
  const supabase = getServiceRoleClient()
  const rows: { organisation_id: string; page: string; field_key: string; visibility: FieldVisibility }[] = []
  for (const [page, fields] of Object.entries(FIELD_CATALOG)) {
    for (const meta of fields) {
      rows.push({
        organisation_id: orgId,
        page,
        field_key: meta.key,
        visibility: meta.is_system_required ? 'required' : meta.default_visibility,
      })
    }
  }
  if (rows.length === 0) return
  await supabase
    .from('field_configs')
    .upsert(rows, { onConflict: 'organisation_id,page,field_key', ignoreDuplicates: true })
}
```

- [ ] **Step 2: Verify with tsc**

Run: `cd web && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/fieldEnforcement.ts
git commit -m "feat(sprint-e): add server-side field enforcement helper"
```

---

## Task 4: Create the GET API route

**Files:**
- Create: `web/src/app/api/field-configs/route.ts`

- [ ] **Step 1: Write the route**

The route uses `createClient` from `@/lib/supabase` to bind to the user's session (so `auth.getUser()` and the RLS-aware `from('users')` query work). The merged config comes from `getFieldConfig` which internally uses the service-role client.

```ts
// web/src/app/api/field-configs/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { getFieldConfig } from '@/lib/fieldEnforcement'
import { FieldPage, ALL_PAGES } from '@/lib/field-catalog'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('organisation_id')
    .eq('id', user.id)
    .single()
  if (!profile?.organisation_id) {
    return NextResponse.json({ error: 'No organisation' }, { status: 403 })
  }

  const page = req.nextUrl.searchParams.get('page') as FieldPage | null
  if (!page || !ALL_PAGES.includes(page)) {
    return NextResponse.json({ error: 'Invalid or missing page param' }, { status: 400 })
  }

  const config = await getFieldConfig(profile.organisation_id, page)
  return NextResponse.json({ config: Object.fromEntries(config) })
}
```

- [ ] **Step 2: Verify with tsc**

Run: `cd web && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/api/field-configs/route.ts
git commit -m "feat(sprint-e): add GET /api/field-configs route"
```

---

## Task 5: Create the POST API route (admin-only)

**Files:**
- Create: `web/src/app/api/field-configs/[page]/route.ts`

- [ ] **Step 1: Write the route**

```ts
// web/src/app/api/field-configs/[page]/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { FIELD_CATALOG, FieldPage, FieldVisibility, ALL_PAGES } from '@/lib/field-catalog'

export async function POST(req: NextRequest, { params }: { params: { page: string } }) {
  const page = params.page as FieldPage
  if (!ALL_PAGES.includes(page)) {
    return NextResponse.json({ error: 'Invalid page' }, { status: 400 })
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('organisation_id, role')
    .eq('id', user.id)
    .single()
  if (!profile?.organisation_id || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const body = (await req.json()) as { overrides?: Record<string, FieldVisibility> }
  const overrides = body.overrides ?? {}

  // Validate every key is in catalog; reject non-Required for system-required fields
  const catalogForPage = FIELD_CATALOG[page]
  const catalogKeys = new Set(catalogForPage.map(f => f.key))
  for (const [key, vis] of Object.entries(overrides)) {
    if (!catalogKeys.has(key)) {
      return NextResponse.json({ error: `Unknown field "${key}" for page "${page}"` }, { status: 400 })
    }
    if (!['required', 'optional', 'hidden'].includes(vis)) {
      return NextResponse.json({ error: `Invalid visibility "${vis}"` }, { status: 400 })
    }
    const meta = catalogForPage.find(f => f.key === key)
    if (meta?.is_system_required && vis !== 'required') {
      return NextResponse.json({ error: `Field "${key}" is system-required and cannot be changed` }, { status: 400 })
    }
  }

  // Upsert via service-role (bypass RLS — we've already done the role check)
  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const rows = Object.entries(overrides).map(([key, vis]) => ({
    organisation_id: profile.organisation_id,
    page,
    field_key: key,
    visibility: vis,
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  }))

  if (rows.length > 0) {
    const { error } = await supabaseAdmin
      .from('field_configs')
      .upsert(rows, { onConflict: 'organisation_id,page,field_key' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Return the freshly merged config
  const { getFieldConfig } = await import('@/lib/fieldEnforcement')
  const config = await getFieldConfig(profile.organisation_id, page)
  return NextResponse.json({ config: Object.fromEntries(config) })
}
```

- [ ] **Step 2: Verify with tsc**

Run: `cd web && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/api/field-configs/[page]/route.ts
git commit -m "feat(sprint-e): add POST /api/field-configs/[page] route"
```

---

## Task 6: Create the client-side hook

**Files:**
- Create: `web/src/lib/useFieldConfig.ts`

- [ ] **Step 1: Write the hook**

```ts
// web/src/lib/useFieldConfig.ts
'use client'

import { useEffect, useState } from 'react'
import { FieldPage, FieldVisibility } from './field-catalog'

export function useFieldConfig(page: FieldPage) {
  const [config, setConfig] = useState<Map<string, FieldVisibility> | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/field-configs?page=${encodeURIComponent(page)}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        if (data.config) {
          setConfig(new Map(Object.entries(data.config) as [string, FieldVisibility][]))
        } else {
          setConfig(new Map())
        }
      })
      .catch(() => {
        if (!cancelled) setConfig(new Map())
      })
    return () => { cancelled = true }
  }, [page])

  return {
    config,
    loading: config === null,
    isHidden: (key: string) => config?.get(key) === 'hidden',
    isRequired: (key: string) => config?.get(key) === 'required',
    isOptional: (key: string) => config?.get(key) === 'optional',
  }
}
```

- [ ] **Step 2: Verify with tsc**

Run: `cd web && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/useFieldConfig.ts
git commit -m "feat(sprint-e): add useFieldConfig client hook"
```

---

## Task 7: Create the Settings UI tab component

**Files:**
- Create: `web/src/app/dashboard/settings/FormFieldsTab.tsx`

- [ ] **Step 1: Write the component**

```tsx
// web/src/app/dashboard/settings/FormFieldsTab.tsx
'use client'

import { useEffect, useState } from 'react'
import { useLanguage } from '@/context/LanguageContext'
import {
  FIELD_CATALOG, FieldPage, FieldVisibility, PAGE_LABELS, ALL_PAGES
} from '@/lib/field-catalog'

const visibilities: FieldVisibility[] = ['required', 'optional', 'hidden']

export default function FormFieldsTab() {
  const { lang } = useLanguage()
  const [selectedPage, setSelectedPage] = useState<FieldPage>('work_orders_new')
  const [config, setConfig] = useState<Map<string, FieldVisibility>>(new Map())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    fetch(`/api/field-configs?page=${selectedPage}`)
      .then(r => r.json())
      .then(data => {
        if (data.config) setConfig(new Map(Object.entries(data.config) as [string, FieldVisibility][]))
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load configuration')
        setLoading(false)
      })
  }, [selectedPage])

  function setFieldVis(key: string, vis: FieldVisibility) {
    setConfig(prev => {
      const next = new Map(prev)
      next.set(key, vis)
      return next
    })
  }

  async function save() {
    setSaving(true)
    setError('')
    const overrides: Record<string, FieldVisibility> = {}
    // Only send entries for non-system-required fields
    for (const meta of FIELD_CATALOG[selectedPage]) {
      if (meta.is_system_required) continue
      const vis = config.get(meta.key) ?? meta.default_visibility
      overrides[meta.key] = vis
    }
    try {
      const res = await fetch(`/api/field-configs/${selectedPage}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Save failed')
        setSaving(false)
        return
      }
      if (data.config) setConfig(new Map(Object.entries(data.config) as [string, FieldVisibility][]))
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid grid-cols-[220px_1fr] gap-6">
      <nav className="space-y-1">
        {ALL_PAGES.map(page => (
          <button
            key={page}
            onClick={() => setSelectedPage(page)}
            className={selectedPage === page
              ? 'block w-full text-start px-3 py-2 rounded-lg bg-primary/10 text-primary text-sm font-semibold'
              : 'block w-full text-start px-3 py-2 rounded-lg text-sm text-on-surface-variant hover:bg-surface-container-low transition-colors'}
          >
            {PAGE_LABELS[page][lang === 'ar' ? 'ar' : 'en']}
          </button>
        ))}
      </nav>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6">
        <h3 className="text-base font-semibold text-on-surface mb-5">
          {PAGE_LABELS[selectedPage][lang === 'ar' ? 'ar' : 'en']}
        </h3>

        {loading ? (
          <div className="text-on-surface-variant text-sm">Loading…</div>
        ) : (
          <div className="space-y-3">
            {FIELD_CATALOG[selectedPage].map(meta => {
              const vis = meta.is_system_required ? 'required' : (config.get(meta.key) ?? meta.default_visibility)
              return (
                <div key={meta.key} className="flex items-center justify-between gap-4 py-2 border-b border-outline-variant/40 last:border-0">
                  <div>
                    <div className="text-sm text-on-surface font-medium">
                      {lang === 'ar' ? meta.label_ar : meta.label_en}
                      {meta.is_system_required && <span className="ml-2 text-[11px] text-on-surface-variant">🔒 {lang === 'ar' ? 'مطلوب من النظام' : 'Required by system'}</span>}
                    </div>
                    <div className="text-[11px] text-on-surface-variant">{meta.key} · {meta.type}</div>
                  </div>
                  <div className="flex gap-1 bg-surface-container-low rounded-full p-1">
                    {visibilities.map(v => (
                      <button
                        key={v}
                        onClick={() => !meta.is_system_required && setFieldVis(meta.key, v)}
                        disabled={meta.is_system_required && v !== 'required'}
                        className={vis === v
                          ? 'px-3 py-1 rounded-full bg-primary text-on-primary text-xs font-semibold'
                          : 'px-3 py-1 rounded-full text-xs text-on-surface-variant disabled:opacity-30 hover:bg-surface-container-lowest transition-colors'}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {error && (
          <div className="mt-4 bg-error/10 border border-error/20 rounded-lg px-3 py-2 text-error text-sm">
            {error}
          </div>
        )}

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving || loading}
            className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20 disabled:opacity-50"
          >
            {saving ? (lang === 'ar' ? 'جاري الحفظ…' : 'Saving…') : (lang === 'ar' ? 'حفظ' : 'Save')}
          </button>
          {saved && (
            <span className="text-primary text-sm font-semibold">
              {lang === 'ar' ? 'تم الحفظ' : 'Saved'}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify with tsc**

Run: `cd web && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/dashboard/settings/FormFieldsTab.tsx
git commit -m "feat(sprint-e): add FormFieldsTab component for settings"
```

---

## Task 8: Wire FormFieldsTab into Settings page

**Files:**
- Modify: `web/src/app/dashboard/settings/page.tsx`

- [ ] **Step 1: Add import**

At the top of the file, near the other tab imports (`NotificationsTab`, `PushAuditTab`):

```ts
import FormFieldsTab from './FormFieldsTab'
```

- [ ] **Step 2: Extend the tab state type**

Find the line `const [activeTab, setActiveTab] = useState<...>(...)` and add `'form_fields'` to the union:

```ts
const [activeTab, setActiveTab] = useState<'organisation' | 'storage' | 'account' | 'notifications' | 'push_audit' | 'form_fields'>('organisation')
```

- [ ] **Step 3: Add the tab button to the tab nav array (admin-only)**

Find the array `[{ key: 'organisation', label: ... }, ...]` rendered around line ~95. Add this entry, conditional on admin role. Modify so the array is computed at render time:

Find the `<div className="flex gap-0 mb-8 border-b border-outline-variant">` block. Replace the inline array with a computed one:

```tsx
{(() => {
  const tabs = [
    { key: 'organisation' as const, label: lang === 'ar' ? 'المؤسسة' : 'Organisation' },
    { key: 'storage' as const,      label: lang === 'ar' ? 'التخزين' : 'Storage' },
    { key: 'account' as const,      label: lang === 'ar' ? 'الحساب' : 'Account' },
    { key: 'notifications' as const, label: lang === 'ar' ? 'الإشعارات' : 'Notifications' },
    { key: 'push_audit' as const,   label: lang === 'ar' ? 'تدقيق الرسائل' : 'Push Audit' },
  ]
  if (user?.role === 'admin') {
    tabs.push({ key: 'form_fields' as const, label: lang === 'ar' ? 'حقول النماذج' : 'Form Fields' })
  }
  return tabs.map(tab => (
    <button
      key={tab.key}
      onClick={() => setActiveTab(tab.key)}
      className={activeTab === tab.key
        ? 'px-4 py-2.5 text-sm font-semibold border-b-2 border-primary text-primary'
        : 'px-4 py-2.5 text-sm text-on-surface-variant border-b-2 border-transparent hover:text-on-surface transition-colors'}
    >
      {tab.label}
    </button>
  ))
})()}
```

- [ ] **Step 4: Render the tab content**

Find where the other tabs render (e.g., `{activeTab === 'notifications' && <NotificationsTab />}`). Add:

```tsx
{activeTab === 'form_fields' && user?.role === 'admin' && <FormFieldsTab />}
```

- [ ] **Step 5: Verify with tsc + build**

Run: `cd web && npx tsc --noEmit && npm run build`
Expected: both clean.

- [ ] **Step 6: Manual QA**

Start dev server (`cd web && npm run dev`), log in as admin, navigate to `/dashboard/settings`, verify "Form Fields" tab appears. Click it — verify the page list on the left + field list on the right. Click "Save" with no changes — verify no error.

- [ ] **Step 7: Commit**

```bash
git add web/src/app/dashboard/settings/page.tsx
git commit -m "feat(sprint-e): wire FormFieldsTab into settings nav"
```

---

## Task 9: Create the backfill script

**Files:**
- Create: `web/scripts/seed-field-configs.ts`

- [ ] **Step 1: Write the script**

```ts
// web/scripts/seed-field-configs.ts
// Usage: cd web && npx tsx scripts/seed-field-configs.ts
// Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL in env.

import { createClient } from '@supabase/supabase-js'
import { FIELD_CATALOG, FieldVisibility } from '../src/lib/field-catalog'

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env')
    process.exit(1)
  }
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: orgs, error: orgsErr } = await supabase
    .from('organisations')
    .select('id, name')
  if (orgsErr) {
    console.error('Failed to fetch organisations:', orgsErr.message)
    process.exit(1)
  }
  console.log(`Found ${orgs?.length ?? 0} organisations`)

  for (const org of orgs ?? []) {
    const rows: { organisation_id: string; page: string; field_key: string; visibility: FieldVisibility }[] = []
    for (const [page, fields] of Object.entries(FIELD_CATALOG)) {
      for (const meta of fields) {
        rows.push({
          organisation_id: org.id,
          page,
          field_key: meta.key,
          visibility: meta.is_system_required ? 'required' : meta.default_visibility,
        })
      }
    }
    if (rows.length === 0) continue
    const { error } = await supabase
      .from('field_configs')
      .upsert(rows, { onConflict: 'organisation_id,page,field_key', ignoreDuplicates: true })
    if (error) {
      console.error(`Failed for org ${org.id} (${org.name}):`, error.message)
    } else {
      console.log(`✓ Seeded ${rows.length} rows for ${org.name}`)
    }
  }
  console.log('Done.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: Add tsx as a dev dependency if not present**

Run: `cd web && cat package.json` (or read the file) — check if `tsx` is in devDependencies. If not, install it:

```bash
cd web && npm install --save-dev tsx
```

- [ ] **Step 3: Verify with tsc**

Run: `cd web && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add web/scripts/seed-field-configs.ts web/package.json web/package-lock.json
git commit -m "feat(sprint-e): add field_configs backfill script"
```

> **Manual step (the human runs this after deploying):** `cd web && npx tsx scripts/seed-field-configs.ts` once to backfill existing orgs.

---

## Phase 1 Completion Gate

Before Phase 2 dispatches, the coordinator should verify:

- [ ] `npx tsc --noEmit` clean
- [ ] `npm run build` clean
- [ ] `GET /api/field-configs?page=work_orders_new` returns 200 with a config object when called as a logged-in user
- [ ] `POST /api/field-configs/work_orders_new` with admin user, body `{ overrides: { description: 'hidden' } }` returns 200; subsequent GET returns `description: 'hidden'`
- [ ] Same POST with non-admin returns 403
- [ ] Same POST with `{ overrides: { title: 'hidden' } }` returns 400 (system-required guard)
- [ ] Settings → Form Fields tab renders for admin, hidden for non-admin

---

# Phase 2 — Per-Entity Form Wiring

> **Dispatch 5 agents in parallel. Each reads this section + the spec, then implements its entity. Do NOT touch files outside your slice.**

## Coordination contract for every Phase-2 agent

1. Read `docs/superpowers/specs/2026-05-17-sprint-e-field-visibility-settings-design.md` first.
2. Do NOT touch: `web/src/lib/field-catalog.ts` (except to **append** entries if you find a missing field for your entity — never modify other entities' entries), `web/src/lib/fieldEnforcement.ts`, `web/src/lib/useFieldConfig.ts`, `web/src/app/api/field-configs/**`, `web/src/app/dashboard/settings/**`.
3. Use existing Lumina classes (see CONTEXT.md "Design System" section).
4. For each form page: import `useFieldConfig`; wrap each catalog-known field in `{!isHidden('key') && ...}`; pass `required={isRequired('key')}` to inputs. System-required fields always pass `required={true}` regardless of config.
5. For each POST/PATCH route: insert `enforceFieldConfig(orgId, '<page>', payload)` before insert/update. On error, return 400 with `{ error: result.error }`.
6. If a form currently inserts client-side via `supabase.from(X).insert(...)`, you must either (a) add a thin server route that does the insert + enforcement, OR (b) keep the client insert and document that enforcement is client-only for that path. Prefer (a) for security.
7. Run `cd web && npx tsc --noEmit && npm run build` before declaring done.

## Agent-WorkOrders task list

**Files:**
- Modify: `web/src/app/dashboard/work-orders/new/page.tsx`
- Modify: `web/src/app/dashboard/work-orders/[id]/edit/page.tsx`
- Modify: `web/src/app/dashboard/work-orders/[id]/page.tsx` (close-out form section)
- Create: `web/src/app/api/work-orders/route.ts` (if no server POST exists; current pattern uses client `.insert()`)
- Create: `web/src/app/api/work-orders/[id]/route.ts` (PATCH for edit) — same caveat

- [ ] **Step 1: Update `work-orders/new/page.tsx` for client-side config**

At the top of the component, add:

```ts
import { useFieldConfig } from '@/lib/useFieldConfig'
import { isSystemRequired } from '@/lib/field-catalog'

// inside component body:
const { isHidden, isRequired, loading: configLoading } = useFieldConfig('work_orders_new')
```

For each form field in the JSX, wrap it:

```tsx
{!isHidden('description') && (
  <div>
    <label className={labelCls}>{lang === 'ar' ? 'الوصف' : 'Description'}{(isRequired('description') || isSystemRequired('work_orders_new', 'description')) && <span className="text-error"> *</span>}</label>
    <textarea name="description" value={form.description} onChange={handleChange}
      required={isRequired('description') || isSystemRequired('work_orders_new', 'description')}
      className={inputCls} />
  </div>
)}
```

Repeat for every form field in the catalog: `title`, `description`, `priority`, `category`, `site_id`, `asset_id`, `assigned_to`, `due_at`, `sla_hours`, `is_recurring`, `recurrence_frequency`, `photos`.

Show a loading state when `configLoading`:

```tsx
if (configLoading) return <div className="p-8 text-on-surface-variant">Loading form…</div>
```

- [ ] **Step 2: Switch work-orders/new submit from client-insert to server route**

Current code (around line ~100+ of the page) likely does `supabase.from('work_orders').insert(...)`. Replace with a `fetch('/api/work-orders', { method: 'POST', body: JSON.stringify(form) })`.

- [ ] **Step 3: Create `web/src/app/api/work-orders/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { enforceFieldConfig } from '@/lib/fieldEnforcement'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('organisation_id').eq('id', user.id).single()
  if (!profile?.organisation_id) {
    return NextResponse.json({ error: 'No organisation' }, { status: 403 })
  }

  const body = await req.json() as Record<string, unknown>
  const enforcement = await enforceFieldConfig(profile.organisation_id, 'work_orders_new', body)
  if ('error' in enforcement) {
    return NextResponse.json({ error: enforcement.error }, { status: 400 })
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data, error } = await admin.from('work_orders').insert({
    ...enforcement.cleaned,
    organisation_id: profile.organisation_id,
    created_by: user.id,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ work_order: data })
}
```

- [ ] **Step 4: Same pattern for the edit page**

`web/src/app/dashboard/work-orders/[id]/edit/page.tsx`:
- Add `useFieldConfig('work_orders_edit')`
- Wrap each field per Step 1
- Submit hits new `PATCH /api/work-orders/[id]`

Create `web/src/app/api/work-orders/[id]/route.ts` with `PATCH` handler that runs `enforceFieldConfig(orgId, 'work_orders_edit', body)` then updates the row.

- [ ] **Step 5: Same pattern for the close-out form**

Find the close-out form section in `web/src/app/dashboard/work-orders/[id]/page.tsx`. Add `useFieldConfig('work_orders_close')`. Wrap close-out fields. On submit, the close-out submission probably also goes through a route or a client update — apply the enforcement equivalent.

- [ ] **Step 6: Verify with tsc + build**

`cd web && npx tsc --noEmit && npm run build` — clean.

- [ ] **Step 7: Manual QA**

Log in as admin, mark `description` as Hidden on `work_orders_new` via Settings → Form Fields → Save. Open `/dashboard/work-orders/new` — Description field should be gone. Open browser devtools, run `await fetch('/api/work-orders', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ title: 'X', site_id: '<id>', description: 'sneaky' }) })`. Verify the inserted row has no description (server stripped it).

- [ ] **Step 8: Commit**

```bash
git add web/src/app/dashboard/work-orders web/src/app/api/work-orders
git commit -m "feat(sprint-e): wire work_orders forms to field config + server enforcement"
```

## Agent-Assets task list

**Files:**
- Modify: `web/src/app/dashboard/assets/new/page.tsx`
- Modify: `web/src/app/dashboard/assets/[id]/edit/page.tsx`
- Create: `web/src/app/api/assets/route.ts`
- Create: `web/src/app/api/assets/[id]/route.ts`

- [ ] **Step 1–6:** Same shape as Agent-WorkOrders steps 1–6, but for `assets_new` and `assets_edit` pages, and `assets` table. Use the catalog entries from Task 2 Step 5.

- [ ] **Step 7: Manual QA**

Mark `serial_number` as Hidden on `assets_new`. Open `/dashboard/assets/new` — field gone. Submit a new asset via UI — verify no error. Mark `name` Hidden via API call to `/api/field-configs/assets_new` — verify 400 response (system-required guard).

- [ ] **Step 8: Commit**

```bash
git add web/src/app/dashboard/assets web/src/app/api/assets
git commit -m "feat(sprint-e): wire asset forms to field config + server enforcement"
```

## Agent-Sites task list

**Files:**
- Modify: `web/src/app/dashboard/sites/new/page.tsx` OR the inline create modal on `web/src/app/dashboard/sites/page.tsx` (whichever exists — check with `Glob` first)
- Modify: `web/src/app/dashboard/sites/[id]/edit/page.tsx`
- Create: `web/src/app/api/sites/route.ts`
- Create: `web/src/app/api/sites/[id]/route.ts`

- [ ] **Step 1: Locate the create form**

Check `web/src/app/dashboard/sites/page.tsx` for a modal, and `web/src/app/dashboard/sites/new/page.tsx` for a dedicated page. Use whichever exists. If both exist, prefer the dedicated page.

- [ ] **Steps 2–7:** Same pattern as Agent-WorkOrders for `sites_new` and `sites_edit`.

- [ ] **Step 8: Commit**

```bash
git add web/src/app/dashboard/sites web/src/app/api/sites
git commit -m "feat(sprint-e): wire site forms to field config + server enforcement"
```

## Agent-Spaces task list

**Files:**
- Modify: `web/src/app/dashboard/sites/[id]/spaces/new/page.tsx`
- Modify: `web/src/app/dashboard/sites/[id]/spaces/[sid]/edit/page.tsx`
- Create: `web/src/app/api/spaces/route.ts`
- Create: `web/src/app/api/spaces/[id]/route.ts`

- [ ] **Steps 1–7:** Same pattern as Agent-WorkOrders for `spaces_new` and `spaces_edit`.

- [ ] **Step 8: Commit**

```bash
git add web/src/app/dashboard/sites/[id]/spaces web/src/app/api/spaces
git commit -m "feat(sprint-e): wire spaces forms to field config + server enforcement"
```

## Agent-Users task list

**Files:**
- Modify: `web/src/app/dashboard/users/new/page.tsx`
- Modify: `web/src/app/dashboard/users/[id]/edit/page.tsx`
- Modify: `web/src/app/api/users/route.ts` (already exists — add enforcement)
- Create: `web/src/app/api/users/[id]/route.ts` (if not exists — for PATCH on edit)

- [ ] **Step 1: Update `users/new/page.tsx` per the Agent-WorkOrders pattern (Step 1)**

The form already hits `/api/users` POST, so no client-insert switch needed.

- [ ] **Step 2: Add enforcement to `/api/users` POST**

In `web/src/app/api/users/route.ts`, before the existing `supabaseAdmin.auth.admin.createUser` call, add:

```ts
import { enforceFieldConfig } from '@/lib/fieldEnforcement'
// ...
const enforcement = await enforceFieldConfig(organisation_id, 'users_new', { email, full_name, full_name_ar, role, phone })
if ('error' in enforcement) {
  return NextResponse.json({ error: enforcement.error }, { status: 400 })
}
const cleaned = enforcement.cleaned as { email: string; full_name: string; full_name_ar?: string; role: string; phone?: string }
// Use cleaned fields below instead of the raw body
```

Then use `cleaned.email`, `cleaned.full_name`, etc. in the rest of the route.

- [ ] **Step 3: Update `users/[id]/edit/page.tsx` for `users_edit` config**

Same pattern: `useFieldConfig('users_edit')`, wrap each field, switch the submit to hit a new `/api/users/[id]` PATCH route.

- [ ] **Step 4: Create `/api/users/[id]` PATCH route**

```ts
// web/src/app/api/users/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { enforceFieldConfig } from '@/lib/fieldEnforcement'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase
    .from('users').select('organisation_id, role').eq('id', user.id).single()
  if (!profile?.organisation_id) {
    return NextResponse.json({ error: 'No organisation' }, { status: 403 })
  }
  if (profile.role !== 'admin' && profile.role !== 'manager') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json() as Record<string, unknown>
  const enforcement = await enforceFieldConfig(profile.organisation_id, 'users_edit', body)
  if ('error' in enforcement) {
    return NextResponse.json({ error: enforcement.error }, { status: 400 })
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { error } = await admin.from('users').update({
    ...enforcement.cleaned,
    updated_at: new Date().toISOString(),
  }).eq('id', params.id).eq('organisation_id', profile.organisation_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 5: Verify tsc + build, manual QA, commit**

```bash
cd web && npx tsc --noEmit && npm run build
```

Manual QA: log in as admin, mark `phone` as Hidden on `users_new`, create a new user — phone field gone. Mark `email` as Hidden — should fail with 400 (system-required).

```bash
git add web/src/app/dashboard/users web/src/app/api/users
git commit -m "feat(sprint-e): wire user forms to field config + server enforcement"
```

---

# Phase 3 — Integration & Verification

Coordinator runs these tasks; not dispatched to agents.

- [ ] **Step 1: Verify no two agents touched the same file**

```bash
git log --since='phase 2 start' --pretty=format: --name-only | sort | uniq -c | sort -rn | head -20
```

Expected: each file appears once. If a file appears multiple times, manually review.

- [ ] **Step 2: Final tsc + build**

```bash
cd web && npx tsc --noEmit && npm run build
```

Expected: both clean.

- [ ] **Step 3: End-to-end manual QA**

Cover one full cycle per entity:

1. Log in as admin
2. Go to Settings → Form Fields
3. Pick `work_orders_new`, mark `priority` as Hidden, Save
4. Navigate to `/dashboard/work-orders/new` — verify Priority field is gone
5. Submit a work order — should succeed
6. Open browser devtools, try to POST with priority included:
   ```js
   fetch('/api/work-orders', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ title: 'Test', site_id: '<site_id>', priority: 'high' }) })
   ```
7. Verify the inserted row in Supabase has `priority IS NULL` (server stripped it)
8. Repeat the cycle for one more entity (e.g., assets)

- [ ] **Step 4: Update CONTEXT.md**

In `CONTEXT.md`, mark Sprint E as complete and note:
- Required manual steps: run SQL file, run backfill script
- Files added during Phase 1 and Phase 2

```bash
git add CONTEXT.md
git commit -m "docs: mark Sprint E complete in CONTEXT.md"
```

- [ ] **Step 5: Push or PR**

Either push the branch or open a PR. The user decides — coordinator asks rather than acting.

---

# Required Manual Steps (post-implementation)

1. Run `docs/superpowers/sql/sprint-e-01-foundation.sql` in Supabase SQL editor.
2. After Phase 1 deploys, run: `cd web && npx tsx scripts/seed-field-configs.ts` to backfill existing orgs.
3. Test as admin: Settings → Form Fields → toggle a field → Save → verify behavior on the corresponding form.

---

# Out of Scope (deferred)

- Per-role overrides
- "Restore catalog defaults" admin action
- Conditional visibility (e.g., "show asset_id only if site_id is set")
- Field reordering, grouping, or custom-field definitions
- Multilingual server-side error messages
