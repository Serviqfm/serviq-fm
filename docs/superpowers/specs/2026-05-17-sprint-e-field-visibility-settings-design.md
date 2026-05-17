# Sprint E — Settings: Field Visibility

**Date:** 2026-05-17
**Scope:** Tenant admins configure which fields on each entity form are Required, Optional, or Hidden
**Estimated effort:** 2–3 days
**Implementation strategy:** Agent-Foundation lands the catalog + helpers + Settings UI; five entity agents then wire up forms in parallel

---

## Overview

Tenant admins can set the visibility of each field on entity forms through a new "Form Fields" tab in `/dashboard/settings`. Each field can be:

- **Required** — must be filled; client renders with `required`; server rejects submissions missing it
- **Optional** — rendered, no validation
- **Hidden** — not rendered; server strips the field from the submission payload

Coverage spans 11 form pages across 5 entities: work_orders (new/edit/close), assets (new/edit), sites (new/edit), spaces (new/edit), users (new/edit).

**Enforcement is two-layer**: the client respects config for UX; the server independently re-enforces in every POST handler so "hidden" actually hides and "required" actually blocks. System-required fields (those backed by a DB NOT NULL or app-critical column) are locked to Required in the UI and re-enforced server-side regardless of any saved config row — defense in depth.

---

## Database Schema

SQL committed at `docs/superpowers/sql/sprint-e-01-foundation.sql`, run manually in Supabase SQL editor.

```sql
CREATE TABLE field_configs (
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

CREATE POLICY field_configs_org_select ON field_configs
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid())
  );
CREATE POLICY field_configs_org_write ON field_configs
  FOR ALL USING (
    organisation_id IN (
      SELECT organisation_id FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE INDEX idx_field_configs_org_page ON field_configs(organisation_id, page);
```

**Storage strategy: full.** Every `(page, field_key)` row is stored explicitly for each organisation in the steady state. Seeded once at org creation and via a one-time backfill script for existing orgs (see Phase 1). When a new field is added to the catalog in a future code change, the helper functions transparently fall back to the catalog default for any missing row — and the next "Save" in the Settings UI will persist a row for it. This keeps the per-org config as a stable snapshot once the admin has reviewed it.

---

## Field Catalog (TypeScript source of truth)

File: `web/src/lib/field-catalog.ts`

```ts
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

export type FieldMeta = {
  key: string                       // matches the form field name and the column name
  label_en: string
  label_ar: string
  type: FieldType
  default_visibility: FieldVisibility
  is_system_required: boolean       // if true, UI locks to Required; server always enforces
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
  // Phase 1 sample (full enumeration done by Agent-Foundation by reading each form file):
  work_orders_new: [
    { key: 'title',       label_en: 'Title',       label_ar: 'العنوان',         type: 'text',     default_visibility: 'required', is_system_required: true },
    { key: 'description', label_en: 'Description', label_ar: 'الوصف',           type: 'textarea', default_visibility: 'optional', is_system_required: false },
    { key: 'priority',    label_en: 'Priority',    label_ar: 'الأولوية',        type: 'select',   default_visibility: 'required', is_system_required: false },
    { key: 'category',    label_en: 'Category',    label_ar: 'الفئة',           type: 'text',     default_visibility: 'optional', is_system_required: false },
    { key: 'site_id',     label_en: 'Site',        label_ar: 'الموقع',          type: 'select',   default_visibility: 'required', is_system_required: true },
    { key: 'asset_id',    label_en: 'Asset',       label_ar: 'الأصل',           type: 'select',   default_visibility: 'optional', is_system_required: false },
    { key: 'assigned_to', label_en: 'Assigned to', label_ar: 'مسند إلى',        type: 'select',   default_visibility: 'optional', is_system_required: false },
    { key: 'due_at',      label_en: 'Due date',    label_ar: 'تاريخ الاستحقاق', type: 'date',     default_visibility: 'optional', is_system_required: false },
    { key: 'sla_hours',   label_en: 'SLA hours',   label_ar: 'ساعات SLA',       type: 'number',   default_visibility: 'optional', is_system_required: false },
    { key: 'photos',      label_en: 'Photos',      label_ar: 'الصور',           type: 'file',     default_visibility: 'optional', is_system_required: false },
  ],
  // ... 10 more pages enumerated by Agent-Foundation by reading every form
  // ...
}

export function isSystemRequired(page: FieldPage, key: string): boolean {
  return FIELD_CATALOG[page].find(f => f.key === key)?.is_system_required ?? false
}
```

**Catalog ownership:** Agent-Foundation enumerates the full catalog by reading every form file (estimated ~70 entries total across 11 pages). Phase-2 entity agents may append to the catalog for their own entity if they discover a missing field — never modify another entity's entries.

---

## Server-Side Helper

File: `web/src/lib/fieldEnforcement.ts`

```ts
import { FIELD_CATALOG, FieldPage, FieldVisibility, isSystemRequired } from './field-catalog'
import { createClient } from '@supabase/supabase-js'

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (typeof v === 'string' && v.trim() === '') return true
  if (Array.isArray(v) && v.length === 0) return true
  return false
}

// Merges stored rows with catalog defaults. System-required ALWAYS wins.
export async function getFieldConfig(
  orgId: string,
  page: FieldPage
): Promise<Map<string, FieldVisibility>> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
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
      merged.set(meta.key, 'required')   // defense in depth
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
      // Field not in catalog — pass through (e.g., system fields like organisation_id, created_by)
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
```

**Plus a seed helper exported from the same file:**

```ts
// Upserts catalog defaults for every (page, field_key) for this org.
// Idempotent. Called by Sprint F's POST /api/platform/tenants after creating an org,
// and by the one-off scripts/seed-field-configs.ts.
export async function seedFieldConfigsForOrg(orgId: string): Promise<void> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
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
  await supabase.from('field_configs').upsert(rows, { onConflict: 'organisation_id,page,field_key', ignoreDuplicates: true })
}
```

**Usage in POST handlers** (one-line guard before insert):

```ts
const result = await enforceFieldConfig(orgId, 'work_orders_new', body)
if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })
const { error } = await supabase.from('work_orders').insert({ ...result.cleaned, organisation_id: orgId, created_by: userId })
```

Each phase-2 agent adds this guard to its entity's POST routes.

---

## Client-Side Hook

File: `web/src/lib/useFieldConfig.ts`

```ts
'use client'
import { useEffect, useState } from 'react'
import { FieldPage, FieldVisibility } from './field-catalog'

export function useFieldConfig(page: FieldPage) {
  const [config, setConfig] = useState<Map<string, FieldVisibility> | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/field-configs?page=${page}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        setConfig(new Map(Object.entries(data.config) as [string, FieldVisibility][]))
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

**Usage in form components:**

```tsx
const { isHidden, isRequired, loading } = useFieldConfig('work_orders_new')
if (loading) return <Skeleton />

{!isHidden('description') && (
  <div>
    <label>Description{isRequired('description') && <span className="text-error"> *</span>}</label>
    <textarea name="description" required={isRequired('description')} />
  </div>
)}
```

---

## API Routes (Phase 1)

### `GET /api/field-configs?page=<FieldPage>`

Authenticated; uses caller's org_id from session. Returns:

```json
{ "config": { "title": "required", "description": "optional", "asset_id": "hidden", ... } }
```

Internally calls `getFieldConfig(orgId, page)`.

### `POST /api/field-configs/[page]`

Admin-only (RLS enforces). Body:

```json
{ "overrides": { "title": "required", "description": "hidden", ... } }
```

Server validates each `(page, field_key, visibility)` triple against the catalog (rejects unknown keys, rejects non-Required values for `is_system_required` fields), then upserts all rows with `organisation_id = caller_org`, `updated_by = caller_user_id`. Returns the merged config.

---

## Settings UI

New tab "Form Fields" in `/dashboard/settings`. Visible only when `user.role = 'admin'`.

**Layout:** left rail with 11 page names (en/ar from `PAGE_LABELS`); right panel renders the selected page's fields as a table:

| Field label | Visibility |
|-------------|------------|
| Title       | 🔒 Required (system) |
| Description | [ Required | Optional | Hidden ] |
| Priority    | [ Required | **Optional** | Hidden ] |
| Site        | 🔒 Required (system) |
| ...         | ... |

- 3-segment toggle component (Lumina-styled: pill group with `bg-primary` active, `bg-surface-container-low` inactive)
- System-required fields show a lock icon + read-only "Required (system)" label; no toggle rendered
- Save button at the bottom of the right panel — POST `/api/field-configs/[page]` with the current state for that page only (one page saved at a time to keep the API contract narrow)
- Toast "Saved" + re-fetch to confirm round-trip
- Reset button: reverts the on-screen state to whatever's currently persisted (does NOT reset to catalog defaults — that would be a destructive "Restore defaults" action and is out of scope for this sprint)

---

## Implementation Phases

### Phase 1 (SEQUENTIAL — Agent-Foundation)

1. SQL migration `docs/superpowers/sql/sprint-e-01-foundation.sql`:
   - `field_configs` table + RLS policies + index. That's it — no triggers, no auto-seed.

   **Seeding strategy** (the catalog is a TS file, so seeding has to happen from application code or a script, not from a DB trigger):
   - **Existing orgs:** Run `scripts/seed-field-configs.ts` once (see step 9). Iterates every org × every catalog entry, upserts to `field_configs`. Idempotent.
   - **New orgs (Sprint F's `/api/platform/tenants` POST):** Sprint F's tenant-create route will call a shared `seedFieldConfigsForOrg(orgId)` helper (lives in `web/src/lib/fieldEnforcement.ts`) after creating the org row.
   - **Safety net:** `getFieldConfig()` always falls back to the catalog default for any field with no stored row, so forms stay functional even if seeding hasn't run yet for a given org. Storage is "full" in the steady state, but the system tolerates partial seeding.
2. `web/src/lib/field-catalog.ts` — populated by reading every form file: `web/src/app/dashboard/work-orders/{new,[id]/edit,[id]/page}.tsx`, `assets`, `sites`, `spaces`, `users` equivalents. Each field on each form gets a catalog entry with sensible defaults.
3. `web/src/lib/fieldEnforcement.ts` — server helper
4. `web/src/lib/useFieldConfig.ts` — client hook
5. `web/src/app/api/field-configs/route.ts` — GET handler
6. `web/src/app/api/field-configs/[page]/route.ts` — POST handler
7. `web/src/app/dashboard/settings/FormFieldsTab.tsx` — Settings UI tab
8. Wire FormFieldsTab into `settings/page.tsx` tab nav (admin-only)
9. Seed script `scripts/seed-field-configs.ts` — run once to backfill existing orgs

Estimated: 1 day. User reviews before phase 2.

### Phase 2 (PARALLEL — 5 entity agents)

Each agent updates its entity's forms and POST routes. Read-only on Phase 1 outputs.

- **Agent-WorkOrders:**
  - Update `web/src/app/dashboard/work-orders/new/page.tsx` (use `useFieldConfig('work_orders_new')`)
  - Update `web/src/app/dashboard/work-orders/[id]/edit/page.tsx` (`'work_orders_edit'`)
  - Update the inline close-out form on `web/src/app/dashboard/work-orders/[id]/page.tsx` (the section that appears when transitioning to `completed`/`closed` status — `'work_orders_close'`)
  - Update server POST/PATCH handlers for work_orders to call `enforceFieldConfig()` before insert/update
- **Agent-Assets:**
  - Update `assets/new/page.tsx`, `assets/[id]/edit` (or detail page edit form), POST handler
- **Agent-Sites:**
  - Update `sites/new/page.tsx`, `sites/[id]/edit/page.tsx`, POST handler
- **Agent-Spaces:**
  - Update `sites/[id]/spaces/new/page.tsx`, `sites/[id]/spaces/[sid]/edit/page.tsx`, POST handler
- **Agent-Users:**
  - Update users create form (currently inline on `/dashboard/users` or a modal), `users/[id]/edit/page.tsx`, `/api/users` POST handler

**Coordination contract:**
1. Read this spec first.
2. Do NOT touch `web/src/lib/field-catalog.ts` except to **append** entries for your own entity if Agent-Foundation missed any.
3. Do NOT touch `web/src/lib/fieldEnforcement.ts`, `web/src/lib/useFieldConfig.ts`, or the `/api/field-configs/*` routes.
4. Use the existing Lumina classes from form pages (`inputCls`, `labelCls`).
5. For each form: wrap each catalog-known field in `{!isHidden('key') && <div>...</div>}`; pass `required={isRequired('key')}` to the input. System-required fields always render with `required` regardless of config.
6. For each POST/PATCH route: insert one call to `enforceFieldConfig(orgId, '<page>', payload)` before the DB write.
7. Return a summary: files changed, page IDs covered, any catalog entries appended.

### Phase 3 (coordinator, not an agent)

- Verify no two agents touched the same file
- Run `npx tsc --noEmit` and `npm run build`
- Manual QA: log in as admin, navigate to Settings → Form Fields, mark `description` as Hidden on `work_orders_new`, save, navigate to /dashboard/work-orders/new — Description field should be gone. Try POSTing description via dev tools — server should strip it. Mark `priority` as Hidden — should be gone. Mark `title` toggle should be disabled.

---

## Open Questions Resolved

1. **Enforcement layer:** Client + server. Server helper independently re-enforces. ✅
2. **Page scope:** Both new + edit forms across 5 entities = 11 pages total. ✅
3. **System-required handling:** Catalog flags fields with `is_system_required: true`. Settings UI locks them to Required; server helper ignores any saved override for those fields. ✅
4. **Per-role overrides:** Out of scope. One config per page, shared org-wide. Schema does NOT reserve a role column — if per-role becomes a need, a future sprint adds a column with a careful migration. ✅
5. **Storage strategy:** Full — every row stored explicitly per org. Backfill script seeds existing orgs; new orgs seeded at creation. ✅
6. **Catalog ownership:** TypeScript file (`web/src/lib/field-catalog.ts`) is the source of truth. Co-located with code, type-checked. ✅

---

## Required Manual Steps (post-implementation)

1. Run `docs/superpowers/sql/sprint-e-01-foundation.sql` in Supabase SQL editor
2. Run `npx tsx scripts/seed-field-configs.ts` (or equivalent) to backfill catalog defaults for every existing organisation. Idempotent — safe to re-run.
3. Test as admin: Settings → Form Fields → mark a field Hidden → save → confirm it disappears from the corresponding form

---

## Out of Scope (deferred)

- Per-role visibility overrides
- "Restore catalog defaults" admin action (destructive, needs confirmation flow)
- Conditional visibility (e.g., "show asset_id only if a site is selected") — only static visibility this sprint
- Field reordering or grouping
- Custom field definitions (admins inventing new fields beyond the catalog)
- Multilingual error messages (server returns English; client could translate but this sprint returns the raw server message)
