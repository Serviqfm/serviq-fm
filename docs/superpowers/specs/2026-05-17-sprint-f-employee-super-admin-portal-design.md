# Sprint F — Employee Portal: Platform Super-Admin

**Date:** 2026-05-17
**Scope:** Full implementation of F1–F7 in one design doc; phased parallel dispatch in implementation
**Estimated effort:** 5–7 days
**Currency:** SAR everywhere (no USD)
**Implementation strategy:** Agent-Foundation lands sequentially, then six agents work the F2–F7 screens in parallel

---

## Overview

Sprint F transforms `/login/employee` from a tenant-admin login into a separate **platform super-admin portal** at `/platform/*`. Platform admins (ServIQ-FM staff) can manage every tenant organisation in the system: view command-center metrics, create/offboard tenants, impersonate tenant admins for support, edit billing records, toggle per-tenant feature flags, and review a cross-tenant audit log.

`/login/employee` = ServIQ-FM staff portal (platform-level).
`/login/client` = tenant admin portal (organisation-level, unchanged by this sprint).

---

## Routes

```
/login/employee           Existing form; POST now checks platform_admins first, then users
/platform/                New route group, gated by middleware
  /dashboard              F2 Command Center
  /tenants                F3 tenant list with search/filter
  /tenants/new            F4a create tenant
  /tenants/[id]           F3 tenant detail (tabs: Overview, Users, Billing, Flags, Audit)
  /tenants/[id]/billing   F5 billing record (reachable via Billing tab)
  /tenants/[id]/flags     F6 feature flags (reachable via Flags tab)
  /tenants/[id]/offboard  F4b offboarding confirm flow
  /audit                  F7 unified audit feed
  /health                 F7 system health
/api/platform/...         Server endpoints for mutations
/api/impersonation/enter  Sets impersonation cookie (POST)
/api/impersonation/exit   Clears impersonation cookie (POST)
```

`/platform/*` gets its own layout — sidebar reuses Lumina tokens but with platform-specific nav (Dashboard / Tenants / Audit / Health) and a distinct visual marker (red accent strip in header) so platform admins always know they're not in a tenant view.

---

## Database Schema

All SQL is run manually in the Supabase SQL editor (per existing convention). SQL files committed to `docs/superpowers/sql/sprint-f-*.sql`.

### New tables

```sql
-- F1: Platform admin identity (separate from tenant users)
CREATE TABLE platform_admins (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT now(),
  last_sign_in_at TIMESTAMP
);

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
-- RLS: platform admins can read their own row; all writes go via service-role.
CREATE POLICY platform_admins_self_read ON platform_admins
  FOR SELECT USING (id = auth.uid());

-- F6: Per-tenant feature flags (scaffolding only — no enforcement in this sprint)
CREATE TABLE tenant_feature_flags (
  organisation_id UUID PRIMARY KEY REFERENCES organisations(id) ON DELETE CASCADE,
  advanced_reporting BOOLEAN DEFAULT false,
  api_access BOOLEAN DEFAULT false,
  invoicing BOOLEAN DEFAULT true,
  multi_site BOOLEAN DEFAULT true,
  custom_branding BOOLEAN DEFAULT false,
  updated_at TIMESTAMP DEFAULT now(),
  updated_by UUID REFERENCES platform_admins(id)
);
-- No RLS — only reachable via service-role API routes.

-- F7: Platform-admin actions
CREATE TABLE platform_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_admin_id UUID REFERENCES platform_admins(id),
  action VARCHAR(100) NOT NULL,
  target_organisation_id UUID REFERENCES organisations(id),
  target_user_id UUID,
  details JSONB,
  created_at TIMESTAMP DEFAULT now()
);
CREATE INDEX idx_platform_audit_logs_org ON platform_audit_logs(target_organisation_id, created_at DESC);
CREATE INDEX idx_platform_audit_logs_admin ON platform_audit_logs(platform_admin_id, created_at DESC);
CREATE INDEX idx_platform_audit_logs_action ON platform_audit_logs(action, created_at DESC);

-- F2: Daily MRR snapshots for the 6-month trend chart
CREATE TABLE mrr_snapshots (
  snapshot_date DATE PRIMARY KEY,
  mrr_cents BIGINT NOT NULL,
  arr_cents BIGINT NOT NULL,
  active_tenants INTEGER NOT NULL,
  paying_tenants INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);
```

### Action types for `platform_audit_logs.action`

| action | details JSONB |
|--------|---------------|
| `tenant.create` | `{ org_id, org_name, plan, first_admin_email }` |
| `tenant.offboard` | `{ org_id, org_name, export_url, users_disabled_count }` |
| `tenant.reactivate` | `{ org_id, org_name }` |
| `tenant.plan_change` | `{ org_id, plan: { from, to }, mrr_cents: { from, to }, billing_status: { from, to } }` |
| `flag.toggle` | `{ org_id, flag, from: bool, to: bool }` |
| `impersonation.start` | `{ org_id, org_name, ttl_minutes: 240 }` |
| `impersonation.end` | `{ org_id, duration_seconds }` |
| `user.disable` | `{ user_id, org_id, reason }` |
| `user.enable` | `{ user_id, org_id }` |

### Extensions to existing tables

```sql
-- F4 + F5: Billing + offboarding fields on organisations
ALTER TABLE organisations
  ADD COLUMN plan VARCHAR(20) DEFAULT 'free',
  ADD COLUMN billing_status VARCHAR(20) DEFAULT 'paid',
  ADD COLUMN mrr_cents INTEGER DEFAULT 0,
  ADD COLUMN renews_at DATE,
  ADD COLUMN contract_notes TEXT,
  ADD COLUMN stripe_customer_id VARCHAR(255),
  ADD COLUMN stripe_subscription_id VARCHAR(255),
  ADD COLUMN offboarded_at TIMESTAMP,
  ADD COLUMN offboarded_by UUID REFERENCES platform_admins(id),
  ADD COLUMN offboard_export_url TEXT;

-- Constraint: plan ∈ {free, starter, pro, enterprise}; billing_status ∈ {paid, failed, overdue}
ALTER TABLE organisations
  ADD CONSTRAINT organisations_plan_check
    CHECK (plan IN ('free', 'starter', 'pro', 'enterprise')),
  ADD CONSTRAINT organisations_billing_status_check
    CHECK (billing_status IN ('paid', 'failed', 'overdue'));

-- F4: Platform-level disabled flag for tenant users
-- Distinct from existing `is_active` (which is the tenant admin's own toggle).
-- A user must satisfy BOTH `is_active = true` AND `disabled = false` to log in.
-- `disabled` is only set/cleared by platform-admin offboard/reactivate flows; tenant admins
-- cannot toggle it. This preserves a user's prior `is_active` state across reactivation —
-- if user_X was inactive before offboard, reactivation must not silently re-enable them.
ALTER TABLE users ADD COLUMN disabled BOOLEAN DEFAULT false;

-- F7: Impersonation attribution on tenant audit log
ALTER TABLE audit_logs ADD COLUMN impersonated_by UUID REFERENCES platform_admins(id);

-- Backfill: every existing org needs a feature flag row
INSERT INTO tenant_feature_flags (organisation_id)
SELECT id FROM organisations
ON CONFLICT (organisation_id) DO NOTHING;
```

### Health-score view (F2 + F3)

```sql
CREATE OR REPLACE VIEW tenant_health AS
SELECT
  o.id,
  o.name,
  o.plan,
  o.billing_status,
  o.mrr_cents,
  o.offboarded_at,
  -- Activity score (60 pts)
  COALESCE(
    LEAST(24, GREATEST(0,
      24 - EXTRACT(EPOCH FROM (now() - MAX(au.last_sign_in_at))) / 86400
    ))
  , 0)::INTEGER AS recency_pts,
  LEAST(18, COALESCE(
    (SELECT COUNT(*) FROM users
      WHERE organisation_id = o.id AND disabled = false)
  , 0) * 3)::INTEGER AS users_pts,
  LEAST(18, COALESCE(
    (SELECT COUNT(*) FROM work_orders
      WHERE organisation_id = o.id
      AND created_at > now() - INTERVAL '30 days')
  , 0))::INTEGER AS wo_pts,
  -- Billing score (40 pts)
  (CASE o.billing_status
    WHEN 'paid' THEN 40
    WHEN 'overdue' THEN 20
    WHEN 'failed' THEN 0
   END)::INTEGER AS billing_pts,
  -- Total score
  (
    COALESCE(LEAST(24, GREATEST(0, 24 - EXTRACT(EPOCH FROM (now() - MAX(au.last_sign_in_at))) / 86400)), 0)::INTEGER
    + LEAST(18, COALESCE((SELECT COUNT(*) FROM users WHERE organisation_id = o.id AND disabled = false), 0) * 3)::INTEGER
    + LEAST(18, COALESCE((SELECT COUNT(*) FROM work_orders WHERE organisation_id = o.id AND created_at > now() - INTERVAL '30 days'), 0))::INTEGER
    + (CASE o.billing_status WHEN 'paid' THEN 40 WHEN 'overdue' THEN 20 WHEN 'failed' THEN 0 END)::INTEGER
  ) AS total_score
FROM organisations o
LEFT JOIN users u ON u.organisation_id = o.id
LEFT JOIN auth.users au ON au.id = u.id
GROUP BY o.id, o.name, o.plan, o.billing_status, o.mrr_cents, o.offboarded_at;

-- Buckets: total_score ≥ 80 = Healthy, 50–79 = At Risk, < 50 = Churning
```

### Bootstrap

Bootstrap requires two steps because `/login/employee` only logs in — it does not create auth users.

1. **Create the auth user in Supabase Auth dashboard** (or via SQL using `supabase.auth.admin.createUser` from a one-off script): set email = `sharing.maaz@gmail.com`, choose a password, mark email confirmed. Copy the generated `auth.users.id` UUID.
2. **Insert the platform_admins row** with that UUID:

```sql
-- Run once after Agent-Foundation lands. Replace placeholder with the UUID from step 1.
INSERT INTO platform_admins (id, email, full_name)
VALUES ('<auth_uid_from_supabase_auth_dashboard>', 'sharing.maaz@gmail.com', 'Maaz');
```

After both steps, log in at `/login/employee` with that email + password — should land on `/platform/dashboard`.

---

## Auth Flow & Middleware

### `/login/employee` POST handler

```
1. supabase.auth.signInWithPassword(email, password) → session
2. SELECT id FROM platform_admins WHERE id = session.user.id
     match → UPDATE platform_admins SET last_sign_in_at = now(); redirect /platform/dashboard
3. SELECT u.organisation_id, u.is_active, u.disabled, o.offboarded_at
     FROM users u JOIN organisations o ON o.id = u.organisation_id
     WHERE u.id = session.user.id
     match AND is_active = true AND disabled = false AND offboarded_at IS NULL → redirect /dashboard
     otherwise (any falsy condition above) → signOut; redirect /login/employee?reason=disabled
4. No row in either table → signOut; redirect /login/employee?reason=no_access
```

`/login/client` is unchanged — it only hits step 3.

### Root `middleware.ts`

File path: `web/src/middleware.ts` (Next.js auto-detects middleware in the `src/` root when present, matching the existing `src/`-based project layout).

Matcher: `['/platform/:path*', '/dashboard/:path*']`

For `/platform/*`:
- No session → `redirect('/login/employee')`
- Session but no `platform_admins` row → `rewrite('/404')` (mask portal existence; do NOT show 403)
- Otherwise → pass through

For `/dashboard/*`:
- No session → `redirect('/login/client')`
- Session AND valid `impersonating_org_id` cookie → pass through (auth-helper handles scope)
- Session AND no impersonation cookie AND (`users.is_active = false` OR `users.disabled = true` OR `organisations.offboarded_at NOT NULL`) → signOut, redirect `/login/client?reason=disabled`
- Otherwise → pass through

### Impersonation cookie

Signed HMAC payload `{ platform_admin_id, org_id, issued_at }`. HttpOnly, Secure, SameSite=Strict. TTL **4 hours**. Set by `POST /api/impersonation/enter`, cleared by `POST /api/impersonation/exit`. Signing secret: new env var `IMPERSONATION_SIGNING_KEY` (32 bytes random hex).

`/api/impersonation/enter` request: `{ org_id }`. Server verifies caller is a platform admin, signs cookie, logs `platform_audit_logs` action='impersonation.start', returns 200.

`/api/impersonation/exit` request: empty. Server verifies caller is a platform admin, reads current cookie, logs `platform_audit_logs` action='impersonation.end' with computed `duration_seconds`, clears cookie.

### `auth-helper.ts` updated

```ts
export async function getOrgId(): Promise<{
  orgId: string | null
  userId: string | null
  impersonating: boolean
  actorPlatformAdminId?: string
}> {
  // 1. Check impersonation cookie first
  const cookieStore = cookies()
  const impersonation = cookieStore.get('impersonating_org_id')
  if (impersonation) {
    const verified = verifyImpersonationCookie(impersonation.value)
    if (verified.valid) {
      return {
        orgId: verified.orgId,
        userId: verified.platformAdminId,
        impersonating: true,
        actorPlatformAdminId: verified.platformAdminId,
      }
    }
  }
  // 2. Normal flow (existing caching, returns user's org)
  // ... existing implementation ...
  return { orgId, userId, impersonating: false }
}

// New: returns either user's Supabase client or service-role client depending on impersonation
export function getScopedSupabaseClient(impersonating: boolean) {
  if (impersonating) {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
  }
  return createClient() // existing browser/SSR client
}
```

Every existing audit-log write in `/dashboard/*` routes adds one field:

```ts
const { impersonating, actorPlatformAdminId } = await getOrgId()
await supabase.from('audit_logs').insert({
  // existing fields...
  impersonated_by: impersonating ? actorPlatformAdminId : null,
})
```

### RLS strategy

**Option A (chosen):** Service-role for impersonation traffic. Tenant routes detect `impersonating=true` and use the service-role client from `getScopedSupabaseClient()`. RLS policies stay strict for normal tenant users; no changes to existing tenant-table RLS policies. Trade-off: every existing query must route through `getOrgId() + getScopedSupabaseClient()` — Agent-Foundation owns this refactor. Phase 2 agents inherit the helper.

---

## Per-Feature UI

### F2 — Command Center (`/platform/dashboard`)

**Top row: 4 KPI cards (Lumina pattern)**
- **MRR (SAR)** — `SUM(mrr_cents) WHERE billing_status='paid' AND offboarded_at IS NULL` (display in SAR with formatter)
- **ARR (SAR)** — `MRR × 12`
- **Active Tenants** — `COUNT(*) WHERE offboarded_at IS NULL`
- **Churn 30d** — `count_offboarded_last_30d / count_active_30d_ago * 100`

**Second row: 2 cards**
- **DAU** — `SELECT COUNT(DISTINCT au.id) FROM auth.users au JOIN users u ON u.id = au.id WHERE au.last_sign_in_at > now() - INTERVAL '1 day'`. The inner join to `users` (not `platform_admins`) naturally excludes platform admins.
- **MAU** — same query, 30-day window

**Charts (Recharts)**
- Line chart, full width: **MRR over last 6 months** — from `mrr_snapshots` table, one point per day
- Bar chart, half width: **Top 10 tenants by WO count, last 30d**
- Donut, half width: **Tenants by plan**

**Footer table: Tenants needing attention**
- `tenant_health` rows where `total_score < 50` OR `billing_status != 'paid'` OR offboarded in last 30d
- Columns: org name, health bucket pill, plan, MRR, last activity

**Data source:** `/api/platform/metrics` returns precomputed object. Computed fresh per request (no cache layer this sprint).

**Daily snapshot cron**
- Vercel Cron config: `crons: [{ path: "/api/platform/cron/mrr-snapshot", schedule: "0 0 * * *" }]`
- Endpoint guarded by `CRON_SECRET` env var (Vercel auto-sets `Authorization: Bearer ${CRON_SECRET}`)
- Computes today's MRR/ARR/active/paying counts, `INSERT INTO mrr_snapshots ON CONFLICT (snapshot_date) DO UPDATE`

### F3 — Tenant Management

**`/platform/tenants` — list page**
- Search by name (icontains)
- Filters: plan (multi), health bucket (multi), billing_status (multi), include offboarded toggle
- Table columns: Name, Plan badge, Health bucket pill, MRR (SAR), Last user login, # users, # WOs (30d), Status
- Row click → detail page

**`/platform/tenants/[id]` — detail page, tabbed**
- **Overview**: org name, address, plan, billing status, MRR, renews_at, contract_notes (read-only here), health score breakdown (recency/users/wo/billing pts → total), last 5 entries from `audit_logs` filtered to this org
- **Users**: tenant users list (name, email, role, last_sign_in_at, disabled toggle). Toggle disabled writes to `users.disabled` + `platform_audit_logs` action='user.disable' / 'user.enable'
- **Billing**: → F5 form (inline in tab)
- **Feature Flags**: → F6 toggles (inline in tab)
- **Audit**: org-scoped feed merging `platform_audit_logs WHERE target_organisation_id = X` + `audit_logs WHERE organisation_id = X`, sorted desc, 25/page
- **Header action buttons**: "Login as Admin" (POSTs to `/api/impersonation/enter` with this org_id, then `window.location = '/dashboard'`), "Offboard" (red, opens confirm modal)

**Impersonation banner**
- Sticky top banner inside `/dashboard/*` layout — only renders when `impersonating_org_id` cookie present
- Red background (`bg-error/10 text-error border-error/20`), text: "Impersonating: {org_name}", right side: "Exit impersonation" button → POST `/api/impersonation/exit` → `window.location = '/platform/tenants/{org_id}'`

### F4 — Onboarding & Offboarding

**`/platform/tenants/new`**
- Form fields: Org name, Plan (radio: free / starter / pro / enterprise), First admin email, First admin full name
- POST `/api/platform/tenants` (matches existing `/api/users` POST pattern, see `web/src/app/api/users/route.ts`):
  1. `INSERT INTO organisations` with given plan, `mrr_cents=0`, `billing_status='paid'`
  2. `INSERT INTO tenant_feature_flags` (defaults)
  3. Generate `tempPassword = 'Serviq' + random + '!1'`
  4. `supabaseAdmin.auth.admin.createUser({ email, password: tempPassword, email_confirm: true })` → returns auth user
  5. `INSERT INTO users` with `id=authUser.id, role='admin', organisation_id=new_org_id, is_active=true, disabled=false, invited_at=now()`
  6. Send welcome email via existing `notifyWelcomeEmail()` from `@/lib/notifications/workOrderNotifications` (login URL = `/login/client`, includes temp password)
  7. `INSERT INTO platform_audit_logs` action='tenant.create'
  8. On any step failure after step 4: rollback by `supabaseAdmin.auth.admin.deleteUser(authUser.id)` (mirroring existing pattern)
  9. Return new org_id; client redirects to `/platform/tenants/[new_id]`

**`/platform/tenants/[id]/offboard`**
- Confirm modal lists what will happen (export + soft-delete + email)
- POST `/api/platform/tenants/[id]/offboard`:
  1. Generate export bundle: zip containing one CSV per tenant-scoped table (`organisations`, `users`, `sites`, `spaces`, `assets`, `work_orders`, `pm_schedules`, `invoices`, `audit_logs`, `requests`, `inspection_results`, `notification_log`, `tenant_feature_flags`)
  2. Upload zip to Supabase Storage bucket `offboard-exports` at path `{org_id}/{ISO_timestamp}.zip`
  3. Generate signed URL valid 30 days
  4. `UPDATE organisations SET offboarded_at=now(), offboarded_by=$platform_admin_id, offboard_export_url=<path>`
  5. `UPDATE users SET disabled=true WHERE organisation_id=$id` (preserves each user's prior `is_active` value untouched)
  6. Send email (Resend) to all tenant users with `role='admin'` + the platform admin → contains signed URL
  7. `INSERT INTO platform_audit_logs` action='tenant.offboard'
- ZIP building: use `jszip` (smaller dep than `archiver`, runs in Node serverless without binary deps). **Not currently in `web/package.json`** — Agent-Onboarding adds `"jszip": "^3.10.1"` to dependencies as part of its work.
- Storage bucket `offboard-exports` must be created in Supabase Storage with private access (signed URLs only)

**Reactivation**
- "Reactivate" button visible on offboarded tenant detail
- POST `/api/platform/tenants/[id]/reactivate`:
  1. `UPDATE organisations SET offboarded_at=NULL, offboarded_by=NULL`
  2. `UPDATE users SET disabled=false WHERE organisation_id=$id` (does NOT touch `is_active` — users who were manually inactive before offboarding stay inactive)
  3. Log action='tenant.reactivate'

### F5 — Billing & Subscriptions

**`/platform/tenants/[id]/billing` form** (inline in the Billing tab of tenant detail)
- Plan (radio): free / starter / pro / enterprise
- Billing status (radio): paid / failed / overdue
- MRR (number input, SAR; stored as cents internally; UI displays/edits SAR with 2-decimal formatting)
- Renews at (date picker, optional)
- Contract notes (textarea, optional)
- Stripe customer ID / subscription ID — read-only display: "Not connected" (reserved schema, no UI for editing this sprint)
- Save → POST `/api/platform/tenants/[id]/billing`
  - Compares before/after, logs `platform_audit_logs` action='tenant.plan_change' with full diff in `details`

**SAR formatter** (new helper `web/src/lib/currency.ts`):
```ts
export function formatSAR(cents: number): string {
  const sar = cents / 100
  return new Intl.NumberFormat('en', {
    style: 'currency', currency: 'SAR', minimumFractionDigits: 2,
  }).format(sar)
}
```

### F6 — Feature Flags (scaffolding only)

**`/platform/tenants/[id]/flags`** (inline in the Flags tab)
- 5 toggle switches for: `advanced_reporting`, `api_access`, `invoicing`, `multi_site`, `custom_branding`
- Save button → POST `/api/platform/tenants/[id]/flags`
  - For each toggled flag: log one `platform_audit_logs` entry action='flag.toggle' with `details: { flag, from, to }`
  - `UPDATE tenant_feature_flags SET <fields>, updated_at=now(), updated_by=$platform_admin_id`

**`useFeatureFlag()` helper** (`web/src/lib/featureFlags.ts`)
- Reads tenant's row from `tenant_feature_flags` (one query per session, cached in module-scope just like `auth-helper`)
- Returns `(key: keyof TenantFlags) => boolean`
- **Not consumed anywhere in this sprint.** Stub exists, but no `if (!flags.advanced_reporting) return null` gates added to existing pages — that's a follow-up sprint per the user's call to ship F6 as scaffolding only.

### F7 — Audit Log & System Health

**`/platform/audit` — unified feed**
- Server route fetches:
  - `platform_audit_logs` (last N entries with filters)
  - `audit_logs WHERE impersonated_by IS NOT NULL` (impersonation-attributed tenant actions)
  - Optional: full `audit_logs` cross-tenant when filter "include tenant activity" is on
- Merged client-side by `created_at DESC`, 50/page
- Filters: actor type (Platform Admin / Tenant User / Impersonated), action (multi-select), target org (autocomplete), date range, search
- Each row shows: timestamp, actor (with avatar/initials), action chip, target org, target user, expandable details JSON

**`/platform/health`**
- Card: **Supabase** — server route does `SELECT 1`; surfaces latency in ms + ok/down status
- Card: **Vercel** — server fetches `https://www.vercel-status.com/api/v2/status.json`; surfaces `status.indicator` (`none` = green, `minor` = yellow, `major`/`critical` = red)
- Card: **Email delivery (last 24h)** — `SELECT status, COUNT(*) FROM notification_log WHERE created_at > now()-24h GROUP BY status`
- Card: **Recent errors** — last 10 from `notification_log WHERE status='failed' ORDER BY created_at DESC`

---

## Implementation Phases

### Phase 1 (SEQUENTIAL — Agent-Foundation only)

Single agent lands the foundation; phases 2 cannot start until this merges.

- SQL migration file `docs/superpowers/sql/sprint-f-01-foundation.sql` containing every table, ALTER TABLE, view, and the bootstrap admin INSERT (placeholder for auth UID, to be filled by user)
- `web/src/middleware.ts` at app root
- `web/src/app/platform/layout.tsx` + `web/src/components/layout/PlatformSidebar.tsx`
- Updated `web/src/lib/auth-helper.ts` (impersonation cookie + `getScopedSupabaseClient`)
- New `web/src/lib/impersonation.ts` (cookie signing/verifying helpers)
- New `/api/impersonation/enter` and `/api/impersonation/exit` routes
- Updated `/login/employee` POST flow
- New `web/src/lib/platformAudit.ts` (shared helper for inserting into `platform_audit_logs`)
- New `web/src/lib/currency.ts` (SAR formatter)
- New `web/src/lib/featureFlags.ts` (useFeatureFlag stub)
- Impersonation banner component `web/src/components/PlatformImpersonationBanner.tsx`, rendered in `web/src/app/dashboard/layout.tsx`
- Update all existing `audit_logs.insert(...)` call sites in `web/src/app/dashboard/**` and `web/src/app/api/**` to populate `impersonated_by` field via `getOrgId()` result

Estimated: 1.5 days. User reviews this before phase 2 dispatches.

### Phase 2 (PARALLEL — six agents)

Each agent owns only its files. No agent edits anything in Phase 1's list above.

- **Agent-CommandCenter (F2):**
  - `/platform/dashboard/page.tsx`, KPI cards, 3 charts, footer table
  - `/api/platform/metrics/route.ts` (computes KPIs + reads `tenant_health` view)
  - `/api/platform/cron/mrr-snapshot/route.ts` + Vercel Cron config in `vercel.json`
  - `mrr_snapshots` reads/writes
- **Agent-TenantMgmt (F3):**
  - `/platform/tenants/page.tsx`, `/platform/tenants/[id]/page.tsx` with 5 tabs (Billing tab and Flags tab are containers that import F5/F6 components — coordinated via shared paths)
  - "Login as Admin" + offboard buttons + users tab + disable toggle
  - All read endpoints `/api/platform/tenants/...`
- **Agent-Onboarding (F4):**
  - `/platform/tenants/new/page.tsx` + POST handler
  - `/api/platform/tenants/[id]/offboard` and `/api/platform/tenants/[id]/reactivate` routes
  - `web/src/lib/offboardExport.ts` — zip-builder helper using `jszip`
  - Email template + send via existing Resend client
- **Agent-Billing (F5):**
  - `/platform/tenants/[id]/billing/page.tsx` (also exported as component for use in F3's Billing tab)
  - POST `/api/platform/tenants/[id]/billing` with diff-based audit logging
- **Agent-Flags (F6):**
  - `/platform/tenants/[id]/flags/page.tsx` (also exported for F3's Flags tab)
  - POST `/api/platform/tenants/[id]/flags`
- **Agent-Audit-Health (F7):**
  - `/platform/audit/page.tsx` + `/api/platform/audit/route.ts` (unified query)
  - `/platform/health/page.tsx` + `/api/platform/health/route.ts`

**Coordination contract** given to each phase-2 agent:
1. Read this spec first (`docs/superpowers/specs/2026-05-17-sprint-f-...`)
2. Do NOT touch: `web/src/lib/auth-helper.ts`, `web/src/lib/impersonation.ts`, `web/src/lib/platformAudit.ts`, `web/src/lib/currency.ts`, `web/src/middleware.ts`, `web/src/app/platform/layout.tsx`, `web/src/components/layout/PlatformSidebar.tsx`, `web/src/components/PlatformImpersonationBanner.tsx`
3. Use Lumina Tailwind tokens (see `web/src/lib/lumina-tokens.ts` and CONTEXT.md)
4. All mutations log via the `platformAudit` helper from Phase 1
5. New SQL → `docs/superpowers/sql/sprint-f-NN-<feature>.sql` (numbered after 01-foundation)
6. Return summary listing: files added/changed, SQL added, manual test steps for the area

### Phase 3 (SEQUENTIAL — coordinator, not an agent)

- Verify no two agents touched the same file (git diff per file)
- Run `npx tsc --noEmit` and `npm run build`
- Manual QA pass: bootstrap a platform admin → log in via `/login/employee` → land on `/platform/dashboard` → create test tenant → impersonate → mutate something → verify audit row → exit impersonation → toggle a flag → offboard the tenant → reactivate
- Document SQL execution order in CONTEXT.md "Manual DB steps required" section

---

## Open Questions Resolved

1. **Platform admin modelling:** Separate `platform_admins` table keyed by `auth.users.id`. ✅
2. **Impersonation mechanism:** Service-role + signed `impersonating_org_id` cookie. ✅
3. **Billing source of truth:** Hybrid — manual columns now, Stripe fields reserved (nullable, not wired). ✅
4. **Health-score formula:** Activity (60 pts) + billing (40 pts), exposed via `tenant_health` view. ✅
5. **Onboarding model:** Platform-admin creates tenants only; no public self-serve signup. ✅
6. **Offboarding policy:** Export zip to Storage + email signed URL + soft-delete (set `offboarded_at`, disable all users). Reactivatable. ✅
7. **Audit log scope:** New `platform_audit_logs` table for platform-admin actions + UI that merges with cross-tenant `audit_logs`. ✅
8. **F6 enforcement:** Scaffolding only this sprint — flag enforcement is a follow-up sprint. ✅
9. **F2 MRR-over-time chart:** Daily snapshot via Vercel Cron from day one (`mrr_snapshots` table). ✅
10. **Currency:** SAR everywhere. Stored as cents (integer) to avoid float drift. ✅

---

## Required Manual Steps (post-implementation)

1. Run `docs/superpowers/sql/sprint-f-01-foundation.sql` in Supabase SQL editor
2. Run each `docs/superpowers/sql/sprint-f-NN-*.sql` from phase-2 agents (none expected at this time, but reserved for any additive migrations)
3. Generate `IMPERSONATION_SIGNING_KEY` (e.g., `openssl rand -hex 32`) and set in Vercel env vars + local `.env.local`
4. Generate `CRON_SECRET` and set in Vercel env vars (Vercel Cron will pass this in `Authorization: Bearer ${CRON_SECRET}` to the MRR snapshot endpoint)
5. Create the first platform admin auth user in Supabase Auth dashboard (email + password, mark confirmed); copy the UUID
6. Run the bootstrap `INSERT INTO platform_admins` with that UUID
7. Create Supabase Storage bucket `offboard-exports` with **private** access (signed URLs only, default RLS disabled — service-role uploads)
8. Test login at `/login/employee` → should land on `/platform/dashboard`

---

## Out of Scope (deferred)

- Stripe webhook integration — schema is ready, but the wiring is a future sprint
- Feature-flag enforcement at usage points (F6 ships as scaffolding only)
- Multi-platform-admin role hierarchy (e.g., support vs billing-only admins)
- Platform-admin audit log retention policies / archive
- Public tenant-status page (analogous to status.vercel.com but for ServIQ-FM)
- Tenant data import/migration tooling
- Notifications for platform admins (e.g., "tenant X is now overdue")
