# Sprint F — Employee Super-Admin Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a separate platform super-admin portal at `/platform/*` for ServIQ-FM staff to manage every tenant: command center metrics, tenant CRUD with impersonation, onboarding/offboarding with data export, billing records, feature-flag scaffolding, and unified audit log.

**Architecture:** A new `platform_admins` table holds platform-staff identity, distinct from tenant `users`. A root `middleware.ts` gates `/platform/*` (returns 404 for non-admins to mask portal existence). Impersonation uses a signed HMAC cookie set by `/api/impersonation/enter`; `auth-helper.ts` swaps to a service-role Supabase client when the cookie is present, so impersonated traffic bypasses RLS in a controlled way. All platform-admin actions write to a new `platform_audit_logs` table.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Supabase (Postgres + RLS + service-role), Tailwind (Lumina tokens), Recharts (already in deps), Resend (already in deps), `jszip` (new dep, added by Agent-Onboarding), Vercel Cron (new `vercel.json`). No test runner — verification is `npx tsc --noEmit` + `npm run build` + manual QA.

**Spec:** [docs/superpowers/specs/2026-05-17-sprint-f-employee-super-admin-portal-design.md](../specs/2026-05-17-sprint-f-employee-super-admin-portal-design.md)

---

## File Structure

### Phase 1 — Foundation (new files)

| File | Responsibility |
|------|----------------|
| `docs/superpowers/sql/sprint-f-01-foundation.sql` | All schema: `platform_admins`, `tenant_feature_flags`, `platform_audit_logs`, `mrr_snapshots`, ALTER TABLEs, `tenant_health` view, bootstrap |
| `web/src/middleware.ts` | Edge middleware gating `/platform/*` and `/dashboard/*` |
| `web/src/lib/impersonation.ts` | Cookie signing/verifying HMAC helpers |
| `web/src/lib/platformAudit.ts` | `logPlatformAction()` helper that inserts into `platform_audit_logs` |
| `web/src/lib/currency.ts` | SAR formatter |
| `web/src/lib/featureFlags.ts` | `useFeatureFlag()` stub (scaffolding only) |
| `web/src/app/platform/layout.tsx` | Layout wrapper for `/platform/*` |
| `web/src/components/layout/PlatformSidebar.tsx` | Sidebar nav for platform portal |
| `web/src/components/PlatformImpersonationBanner.tsx` | Red banner shown in tenant `/dashboard/*` when impersonating |
| `web/src/app/api/impersonation/enter/route.ts` | POST: sets impersonation cookie |
| `web/src/app/api/impersonation/exit/route.ts` | POST: clears cookie |

### Phase 1 — Modified files

| File | Change |
|------|--------|
| `web/src/lib/auth-helper.ts` | Add impersonation cookie reading + `getScopedSupabaseClient()` |
| `web/src/app/login/employee/page.tsx` (or its server action / API) | New logic: check `platform_admins` first → `/platform/dashboard`; fallback to `users` → `/dashboard`; reject disabled/offboarded |
| `web/src/app/dashboard/layout.tsx` | Render `PlatformImpersonationBanner` |
| All existing `audit_logs.insert(...)` call sites | Add `impersonated_by` field from `getOrgId()` result |

### Phase 2 — Per-feature files (six parallel agents)

Documented in each agent's section below.

---

# Phase 1 — Foundation

> **Single agent (Agent-Foundation), sequential. Must complete + merge + manual QA before Phase 2 dispatches.**

## Task 1: SQL migration

**Files:**
- Create: `docs/superpowers/sql/sprint-f-01-foundation.sql`

- [ ] **Step 1: Write the SQL**

```sql
-- Sprint F — Foundation: platform admin portal schema
-- Run in Supabase SQL editor.

-- 1. Platform admin identity
CREATE TABLE IF NOT EXISTS platform_admins (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT now(),
  last_sign_in_at TIMESTAMP
);

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_admins_self_read ON platform_admins;
CREATE POLICY platform_admins_self_read ON platform_admins
  FOR SELECT USING (id = auth.uid());

-- 2. Per-tenant feature flags (scaffolding only)
CREATE TABLE IF NOT EXISTS tenant_feature_flags (
  organisation_id UUID PRIMARY KEY REFERENCES organisations(id) ON DELETE CASCADE,
  advanced_reporting BOOLEAN DEFAULT false,
  api_access BOOLEAN DEFAULT false,
  invoicing BOOLEAN DEFAULT true,
  multi_site BOOLEAN DEFAULT true,
  custom_branding BOOLEAN DEFAULT false,
  updated_at TIMESTAMP DEFAULT now(),
  updated_by UUID REFERENCES platform_admins(id)
);

-- 3. Platform audit log
CREATE TABLE IF NOT EXISTS platform_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_admin_id UUID REFERENCES platform_admins(id),
  action VARCHAR(100) NOT NULL,
  target_organisation_id UUID REFERENCES organisations(id),
  target_user_id UUID,
  details JSONB,
  created_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_audit_logs_org ON platform_audit_logs(target_organisation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_audit_logs_admin ON platform_audit_logs(platform_admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_audit_logs_action ON platform_audit_logs(action, created_at DESC);

-- 4. MRR snapshots
CREATE TABLE IF NOT EXISTS mrr_snapshots (
  snapshot_date DATE PRIMARY KEY,
  mrr_cents BIGINT NOT NULL,
  arr_cents BIGINT NOT NULL,
  active_tenants INTEGER NOT NULL,
  paying_tenants INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

-- 5. Extensions to organisations
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS plan VARCHAR(20) DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS billing_status VARCHAR(20) DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS mrr_cents INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS renews_at DATE,
  ADD COLUMN IF NOT EXISTS contract_notes TEXT,
  ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS offboarded_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS offboarded_by UUID REFERENCES platform_admins(id),
  ADD COLUMN IF NOT EXISTS offboard_export_url TEXT;

-- Constraints
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organisations_plan_check') THEN
    ALTER TABLE organisations ADD CONSTRAINT organisations_plan_check
      CHECK (plan IN ('free', 'starter', 'pro', 'enterprise'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organisations_billing_status_check') THEN
    ALTER TABLE organisations ADD CONSTRAINT organisations_billing_status_check
      CHECK (billing_status IN ('paid', 'failed', 'overdue'));
  END IF;
END $$;

-- 6. Users table: platform-level disabled flag (distinct from is_active)
ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled BOOLEAN DEFAULT false;

-- 7. Cross-tenant audit log impersonation attribution
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS impersonated_by UUID REFERENCES platform_admins(id);

-- 8. Backfill: every existing org needs a feature flag row
INSERT INTO tenant_feature_flags (organisation_id)
SELECT id FROM organisations
ON CONFLICT (organisation_id) DO NOTHING;

-- 9. Health score view
DROP VIEW IF EXISTS tenant_health;
CREATE VIEW tenant_health AS
SELECT
  o.id,
  o.name,
  o.plan,
  o.billing_status,
  o.mrr_cents,
  o.offboarded_at,
  COALESCE(
    LEAST(24, GREATEST(0,
      24 - EXTRACT(EPOCH FROM (now() - MAX(au.last_sign_in_at))) / 86400
    ))
  , 0)::INTEGER AS recency_pts,
  LEAST(18, COALESCE(
    (SELECT COUNT(*) FROM users WHERE organisation_id = o.id AND disabled = false), 0
  ) * 3)::INTEGER AS users_pts,
  LEAST(18, COALESCE(
    (SELECT COUNT(*) FROM work_orders
      WHERE organisation_id = o.id
      AND created_at > now() - INTERVAL '30 days'), 0
  ))::INTEGER AS wo_pts,
  (CASE o.billing_status
    WHEN 'paid' THEN 40
    WHEN 'overdue' THEN 20
    WHEN 'failed' THEN 0
   END)::INTEGER AS billing_pts,
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

-- Bootstrap admin INSERT — to be run AFTER creating the auth user in Supabase Auth dashboard
-- INSERT INTO platform_admins (id, email, full_name)
-- VALUES ('<auth_uid_from_supabase_auth_dashboard>', 'sharing.maaz@gmail.com', 'Maaz');
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/sql/sprint-f-01-foundation.sql
git commit -m "feat(sprint-f): add foundation SQL migration"
```

> **Manual step (human):** Paste into Supabase SQL editor and execute. Verify with `SELECT * FROM platform_admins LIMIT 1;` (empty, no error). Then create your auth user in Supabase Auth dashboard, copy the UUID, and run the bootstrap line at the bottom of the file with that UUID.

---

## Task 2: Impersonation cookie helpers

**Files:**
- Create: `web/src/lib/impersonation.ts`

- [ ] **Step 1: Write the cookie helpers**

```ts
// web/src/lib/impersonation.ts

import crypto from 'crypto'

export type ImpersonationPayload = {
  platform_admin_id: string
  org_id: string
  issued_at: number  // epoch ms
}

const TTL_MS = 4 * 60 * 60 * 1000  // 4 hours
const COOKIE_NAME = 'impersonating_org_id'

function getSigningKey(): Buffer {
  const key = process.env.IMPERSONATION_SIGNING_KEY
  if (!key) throw new Error('IMPERSONATION_SIGNING_KEY env var not set')
  return Buffer.from(key, 'hex')
}

export function signImpersonationCookie(payload: ImpersonationPayload): string {
  const body = JSON.stringify(payload)
  const bodyB64 = Buffer.from(body, 'utf-8').toString('base64url')
  const signature = crypto.createHmac('sha256', getSigningKey()).update(bodyB64).digest('base64url')
  return `${bodyB64}.${signature}`
}

export function verifyImpersonationCookie(token: string | undefined | null): {
  valid: true; platformAdminId: string; orgId: string
} | { valid: false } {
  if (!token || typeof token !== 'string') return { valid: false }
  const parts = token.split('.')
  if (parts.length !== 2) return { valid: false }
  const [bodyB64, signature] = parts
  const expected = crypto.createHmac('sha256', getSigningKey()).update(bodyB64).digest('base64url')
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return { valid: false }
  }
  let payload: ImpersonationPayload
  try {
    payload = JSON.parse(Buffer.from(bodyB64, 'base64url').toString('utf-8'))
  } catch {
    return { valid: false }
  }
  if (Date.now() - payload.issued_at > TTL_MS) return { valid: false }
  return { valid: true, platformAdminId: payload.platform_admin_id, orgId: payload.org_id }
}

export const IMPERSONATION_COOKIE_NAME = COOKIE_NAME
export const IMPERSONATION_TTL_MS = TTL_MS
```

- [ ] **Step 2: Verify with tsc**

Run: `cd web && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/impersonation.ts
git commit -m "feat(sprint-f): add impersonation cookie signing helpers"
```

> **Manual step (human):** Generate `IMPERSONATION_SIGNING_KEY` once with `openssl rand -hex 32` and add to `.env.local` + Vercel env vars.

---

## Task 3: Platform audit log helper

**Files:**
- Create: `web/src/lib/platformAudit.ts`

- [ ] **Step 1: Write the helper**

```ts
// web/src/lib/platformAudit.ts

import { createClient } from '@supabase/supabase-js'

export type PlatformAuditAction =
  | 'tenant.create'
  | 'tenant.offboard'
  | 'tenant.reactivate'
  | 'tenant.plan_change'
  | 'flag.toggle'
  | 'impersonation.start'
  | 'impersonation.end'
  | 'user.disable'
  | 'user.enable'

export async function logPlatformAction(args: {
  platform_admin_id: string
  action: PlatformAuditAction
  target_organisation_id?: string | null
  target_user_id?: string | null
  details?: Record<string, unknown>
}): Promise<void> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { error } = await supabase.from('platform_audit_logs').insert({
    platform_admin_id: args.platform_admin_id,
    action: args.action,
    target_organisation_id: args.target_organisation_id ?? null,
    target_user_id: args.target_user_id ?? null,
    details: args.details ?? {},
  })
  if (error) {
    console.error('[platformAudit] insert failed:', error.message)
    // Do NOT throw — audit logging shouldn't break the action it's auditing
  }
}
```

- [ ] **Step 2: Verify with tsc**

Run: `cd web && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/platformAudit.ts
git commit -m "feat(sprint-f): add platform audit log helper"
```

---

## Task 4: SAR currency helper

**Files:**
- Create: `web/src/lib/currency.ts`

- [ ] **Step 1: Write the helper**

```ts
// web/src/lib/currency.ts

export function formatSAR(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return 'SAR 0.00'
  const sar = cents / 100
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency: 'SAR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(sar)
}

export function parseSARToCents(input: string): number {
  const cleaned = input.replace(/[^0-9.]/g, '')
  const parsed = parseFloat(cleaned)
  if (Number.isNaN(parsed)) return 0
  return Math.round(parsed * 100)
}
```

- [ ] **Step 2: Verify with tsc + commit**

```bash
cd web && npx tsc --noEmit
git add web/src/lib/currency.ts
git commit -m "feat(sprint-f): add SAR formatter helpers"
```

---

## Task 5: Feature-flag hook (scaffolding only)

**Files:**
- Create: `web/src/lib/featureFlags.ts`

- [ ] **Step 1: Write the hook**

```ts
// web/src/lib/featureFlags.ts
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export type TenantFlags = {
  advanced_reporting: boolean
  api_access: boolean
  invoicing: boolean
  multi_site: boolean
  custom_branding: boolean
}

const DEFAULT_FLAGS: TenantFlags = {
  advanced_reporting: false,
  api_access: false,
  invoicing: true,
  multi_site: true,
  custom_branding: false,
}

let _cached: { orgId: string; flags: TenantFlags; ts: number } | null = null
const TTL_MS = 5 * 60 * 1000

export function useFeatureFlag(): {
  flags: TenantFlags
  loading: boolean
  isEnabled: (key: keyof TenantFlags) => boolean
} {
  const [flags, setFlags] = useState<TenantFlags | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { if (!cancelled) setFlags(DEFAULT_FLAGS); return }
      const { data: profile } = await supabase
        .from('users')
        .select('organisation_id')
        .eq('id', user.id)
        .single()
      if (!profile?.organisation_id) { if (!cancelled) setFlags(DEFAULT_FLAGS); return }
      const orgId = profile.organisation_id
      if (_cached && _cached.orgId === orgId && Date.now() - _cached.ts < TTL_MS) {
        if (!cancelled) setFlags(_cached.flags)
        return
      }
      const { data: row } = await supabase
        .from('tenant_feature_flags')
        .select('advanced_reporting, api_access, invoicing, multi_site, custom_branding')
        .eq('organisation_id', orgId)
        .single()
      const flagsResolved = (row as TenantFlags | null) ?? DEFAULT_FLAGS
      _cached = { orgId, flags: flagsResolved, ts: Date.now() }
      if (!cancelled) setFlags(flagsResolved)
    })()
    return () => { cancelled = true }
  }, [])

  return {
    flags: flags ?? DEFAULT_FLAGS,
    loading: flags === null,
    isEnabled: (key) => (flags ?? DEFAULT_FLAGS)[key],
  }
}
```

- [ ] **Step 2: Verify + commit**

```bash
cd web && npx tsc --noEmit
git add web/src/lib/featureFlags.ts
git commit -m "feat(sprint-f): add useFeatureFlag hook (scaffolding)"
```

---

## Task 6: Update auth-helper for impersonation

**Files:**
- Modify: `web/src/lib/auth-helper.ts`

- [ ] **Step 1: Read the existing file**

Confirm the current shape:

```ts
// existing — for reference
export async function getOrgId(): Promise<{ orgId: string | null; userId: string | null }> { ... }
export function clearOrgCache() { ... }
```

- [ ] **Step 2: Replace with the impersonation-aware version**

```ts
// web/src/lib/auth-helper.ts

import { createClient } from '@/lib/supabase'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { verifyImpersonationCookie, IMPERSONATION_COOKIE_NAME } from './impersonation'

let cachedOrgId: string | null = null
let cachedUserId: string | null = null
let cacheTime: number = 0
const CACHE_TTL = 5 * 60 * 1000

export type OrgIdResult = {
  orgId: string | null
  userId: string | null
  impersonating: boolean
  actorPlatformAdminId?: string
}

export async function getOrgId(): Promise<OrgIdResult> {
  // 1. Check impersonation cookie first (only available in server context)
  if (typeof window === 'undefined') {
    try {
      const cookieStore = cookies()
      const impersonation = cookieStore.get(IMPERSONATION_COOKIE_NAME)
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
    } catch {
      // cookies() throws in non-request contexts (e.g., during static analysis) — ignore
    }
  }

  // 2. Cached normal flow
  const now = Date.now()
  if (cachedOrgId && cachedUserId && (now - cacheTime) < CACHE_TTL) {
    return { orgId: cachedOrgId, userId: cachedUserId, impersonating: false }
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { orgId: null, userId: null, impersonating: false }

  const { data: profile } = await supabase
    .from('users')
    .select('organisation_id')
    .eq('id', user.id)
    .single()

  if (!profile) return { orgId: null, userId: null, impersonating: false }

  cachedOrgId = profile.organisation_id
  cachedUserId = user.id
  cacheTime = now

  return { orgId: profile.organisation_id, userId: user.id, impersonating: false }
}

export function clearOrgCache() {
  cachedOrgId = null
  cachedUserId = null
  cacheTime = 0
}

/**
 * Returns either the user's RLS-bound Supabase client OR a service-role client
 * if the current request is an impersonation session. Always pair with getOrgId().
 */
export function getScopedSupabaseClient(impersonating: boolean) {
  if (impersonating) {
    return createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
  }
  return createClient()
}
```

- [ ] **Step 3: Verify with tsc**

Run: `cd web && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/auth-helper.ts
git commit -m "feat(sprint-f): add impersonation support to auth-helper"
```

---

## Task 7: Impersonation enter/exit API routes

**Files:**
- Create: `web/src/app/api/impersonation/enter/route.ts`
- Create: `web/src/app/api/impersonation/exit/route.ts`

- [ ] **Step 1: Write the enter route**

```ts
// web/src/app/api/impersonation/enter/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import {
  signImpersonationCookie,
  IMPERSONATION_COOKIE_NAME,
  IMPERSONATION_TTL_MS,
} from '@/lib/impersonation'
import { logPlatformAction } from '@/lib/platformAudit'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify caller is a platform admin
  const { data: pa } = await supabase
    .from('platform_admins')
    .select('id')
    .eq('id', user.id)
    .single()
  if (!pa) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { org_id } = (await req.json()) as { org_id?: string }
  if (!org_id) return NextResponse.json({ error: 'Missing org_id' }, { status: 400 })

  // Verify the org exists and is not offboarded
  const { data: org } = await supabase
    .from('organisations')
    .select('id, name, offboarded_at')
    .eq('id', org_id)
    .single()
  if (!org) return NextResponse.json({ error: 'Org not found' }, { status: 404 })
  if (org.offboarded_at) {
    return NextResponse.json({ error: 'Cannot impersonate offboarded org' }, { status: 400 })
  }

  const token = signImpersonationCookie({
    platform_admin_id: user.id,
    org_id,
    issued_at: Date.now(),
  })

  await logPlatformAction({
    platform_admin_id: user.id,
    action: 'impersonation.start',
    target_organisation_id: org_id,
    details: { org_name: org.name, ttl_minutes: IMPERSONATION_TTL_MS / 60000 },
  })

  const res = NextResponse.json({ success: true })
  res.cookies.set(IMPERSONATION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: IMPERSONATION_TTL_MS / 1000,
    path: '/',
  })
  return res
}
```

- [ ] **Step 2: Write the exit route**

```ts
// web/src/app/api/impersonation/exit/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { cookies } from 'next/headers'
import {
  verifyImpersonationCookie,
  IMPERSONATION_COOKIE_NAME,
} from '@/lib/impersonation'
import { logPlatformAction } from '@/lib/platformAudit'

export async function POST(_req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cookieStore = cookies()
  const tokenCookie = cookieStore.get(IMPERSONATION_COOKIE_NAME)
  const verified = verifyImpersonationCookie(tokenCookie?.value)
  if (!verified.valid) {
    return NextResponse.json({ error: 'No active impersonation' }, { status: 400 })
  }
  if (verified.platformAdminId !== user.id) {
    return NextResponse.json({ error: 'Mismatched session' }, { status: 403 })
  }

  // Parse issued_at from raw cookie to compute duration
  let durationSeconds: number | null = null
  try {
    const [bodyB64] = (tokenCookie!.value).split('.')
    const payload = JSON.parse(Buffer.from(bodyB64, 'base64url').toString('utf-8'))
    durationSeconds = Math.floor((Date.now() - payload.issued_at) / 1000)
  } catch {
    /* ignore */
  }

  await logPlatformAction({
    platform_admin_id: user.id,
    action: 'impersonation.end',
    target_organisation_id: verified.orgId,
    details: { duration_seconds: durationSeconds },
  })

  const res = NextResponse.json({ success: true })
  res.cookies.delete(IMPERSONATION_COOKIE_NAME)
  return res
}
```

- [ ] **Step 3: Verify with tsc + commit**

```bash
cd web && npx tsc --noEmit
git add web/src/app/api/impersonation
git commit -m "feat(sprint-f): add impersonation enter/exit API routes"
```

---

## Task 8: Root middleware

**Files:**
- Create: `web/src/middleware.ts`

- [ ] **Step 1: Write middleware**

```ts
// web/src/middleware.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { verifyImpersonationCookie, IMPERSONATION_COOKIE_NAME } from './lib/impersonation'

export const config = {
  matcher: ['/platform/:path*', '/dashboard/:path*'],
}

async function getSessionUser(req: NextRequest) {
  const accessToken = req.cookies.get('sb-access-token')?.value
    ?? req.cookies.get(`sb-${process.env.NEXT_PUBLIC_SUPABASE_REF}-auth-token`)?.value
  if (!accessToken) return null
  const supabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  try {
    // accessToken may be a JSON-encoded array — handle both formats
    let token = accessToken
    if (accessToken.startsWith('[')) {
      const parsed = JSON.parse(accessToken)
      token = parsed[0] ?? accessToken
    }
    const { data } = await supabase.auth.getUser(token)
    return data.user
  } catch {
    return null
  }
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname

  // /platform/* gate
  if (path.startsWith('/platform/')) {
    const user = await getSessionUser(req)
    if (!user) {
      return NextResponse.redirect(new URL('/login/employee', req.url))
    }
    const supabase = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { count } = await supabase
      .from('platform_admins')
      .select('id', { count: 'exact', head: true })
      .eq('id', user.id)
    if (count === 0) {
      // Mask portal existence — return 404
      return NextResponse.rewrite(new URL('/404', req.url))
    }
    return NextResponse.next()
  }

  // /dashboard/* gate
  if (path.startsWith('/dashboard/')) {
    const user = await getSessionUser(req)
    if (!user) {
      return NextResponse.redirect(new URL('/login/client', req.url))
    }

    const impersonationCookie = req.cookies.get(IMPERSONATION_COOKIE_NAME)
    if (impersonationCookie) {
      const verified = verifyImpersonationCookie(impersonationCookie.value)
      if (verified.valid) {
        return NextResponse.next()
      }
      // Stale/invalid cookie — clear it and continue with normal flow
      const res = NextResponse.next()
      res.cookies.delete(IMPERSONATION_COOKIE_NAME)
      return res
    }

    const supabase = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: profile } = await supabase
      .from('users')
      .select('is_active, disabled, organisations(offboarded_at)')
      .eq('id', user.id)
      .single() as { data: { is_active: boolean; disabled: boolean; organisations: { offboarded_at: string | null } | null } | null }

    if (!profile) {
      return NextResponse.redirect(new URL('/login/client?reason=no_profile', req.url))
    }
    if (profile.is_active === false || profile.disabled === true || profile.organisations?.offboarded_at) {
      return NextResponse.redirect(new URL('/login/client?reason=disabled', req.url))
    }

    return NextResponse.next()
  }

  return NextResponse.next()
}
```

> **Note on cookie reading:** Supabase's cookie names vary by storage version. The `sb-access-token` fallback covers older SSR; the `sb-<ref>-auth-token` covers `@supabase/ssr`. If neither works in your environment, log `req.cookies.getAll()` once in dev to see the actual cookie names and adjust.

- [ ] **Step 2: Verify with tsc + build**

```bash
cd web && npx tsc --noEmit && npm run build
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add web/src/middleware.ts
git commit -m "feat(sprint-f): add root middleware for /platform/* and /dashboard/* gates"
```

---

## Task 9: Update /login/employee flow

**Files:**
- Modify: `web/src/components/auth/EmployeeLoginForm.tsx` (or wherever the submit handler lives)
- Modify: `web/src/app/login/employee/page.tsx`

- [ ] **Step 1: Read the existing form**

The current employee login likely calls `supabase.auth.signInWithPassword` then redirects to `/dashboard`. Find the success handler.

- [ ] **Step 2: Add platform-admin first check + disabled gate after sign-in**

Replace the post-`signInWithPassword` success block with:

```ts
const { data: sessionData, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
if (signInError) {
  setError(signInError.message)
  return
}
const userId = sessionData.user?.id
if (!userId) { setError('Unexpected: no user id'); return }

// Step A: is the user a platform admin?
const { data: pa } = await supabase
  .from('platform_admins')
  .select('id')
  .eq('id', userId)
  .single()
if (pa) {
  // Update last_sign_in_at, then route to /platform/dashboard
  await fetch('/api/platform/me/sign-in-touch', { method: 'POST' }).catch(() => {})
  router.push('/platform/dashboard')
  return
}

// Step B: tenant user — check is_active, disabled, and org.offboarded_at
const { data: profile } = await supabase
  .from('users')
  .select('is_active, disabled, organisations(offboarded_at)')
  .eq('id', userId)
  .single() as { data: { is_active: boolean; disabled: boolean; organisations: { offboarded_at: string | null } | null } | null }

if (!profile) {
  await supabase.auth.signOut()
  setError('No tenant or platform account found for this email.')
  return
}
if (profile.is_active === false || profile.disabled === true || profile.organisations?.offboarded_at) {
  await supabase.auth.signOut()
  setError('Account is disabled or your organisation has been offboarded.')
  return
}

router.push('/dashboard')
```

- [ ] **Step 3: Create the trivial sign-in-touch endpoint**

`web/src/app/api/platform/me/sign-in-touch/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function POST(_req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  await admin.from('platform_admins')
    .update({ last_sign_in_at: new Date().toISOString() })
    .eq('id', user.id)
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 4: Verify tsc + build + commit**

```bash
cd web && npx tsc --noEmit && npm run build
git add web/src/components/auth/EmployeeLoginForm.tsx web/src/app/login/employee web/src/app/api/platform/me
git commit -m "feat(sprint-f): route platform admins to /platform/dashboard from login"
```

---

## Task 10: Platform sidebar component

**Files:**
- Create: `web/src/components/layout/PlatformSidebar.tsx`

- [ ] **Step 1: Write the component**

Follow the existing Lumina pattern. Look at `web/src/components/Sidebar.tsx` for the structural reference.

```tsx
// web/src/components/layout/PlatformSidebar.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/platform/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '/platform/tenants',   label: 'Tenants',   icon: 'apartment' },
  { href: '/platform/audit',     label: 'Audit Log', icon: 'history' },
  { href: '/platform/health',    label: 'Health',    icon: 'monitor_heart' },
]

export default function PlatformSidebar() {
  const pathname = usePathname()
  return (
    <aside className="hidden md:flex w-64 flex-col bg-surface-container-lowest border-r border-outline-variant sticky top-0 h-screen z-50">
      <div className="px-6 py-5 border-b border-outline-variant">
        <div className="text-xs font-bold uppercase tracking-wider text-error mb-1">Platform Admin</div>
        <div className="text-base font-semibold text-on-surface">ServIQ-FM</div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(item => {
          const isActive = pathname?.startsWith(item.href)
          return (
            <Link key={item.href} href={item.href}
              className={isActive
                ? 'flex items-center gap-3 px-3 py-2.5 rounded-xl bg-primary/10 text-primary font-semibold text-sm'
                : 'flex items-center gap-3 px-3 py-2.5 rounded-xl text-on-surface-variant text-sm hover:bg-surface-container-low transition-colors'}>
              <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd web && npx tsc --noEmit
git add web/src/components/layout/PlatformSidebar.tsx
git commit -m "feat(sprint-f): add PlatformSidebar component"
```

---

## Task 11: Platform layout

**Files:**
- Create: `web/src/app/platform/layout.tsx`

- [ ] **Step 1: Write the layout**

```tsx
// web/src/app/platform/layout.tsx

import PlatformSidebar from '@/components/layout/PlatformSidebar'

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-surface">
      <PlatformSidebar />
      <main className="flex-1 min-w-0">
        <div className="h-1 w-full bg-error"></div>
        {children}
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Create a placeholder /platform/dashboard page**

`web/src/app/platform/dashboard/page.tsx`:

```tsx
export default function PlatformDashboardPage() {
  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <h1 className="text-2xl font-bold text-on-surface mb-2">Platform Dashboard</h1>
      <p className="text-sm text-on-surface-variant">Command center coming in phase 2.</p>
    </div>
  )
}
```

- [ ] **Step 3: Verify tsc + build + manual QA**

```bash
cd web && npx tsc --noEmit && npm run build
```

Manual QA: after bootstrap (running the SQL bootstrap line in Supabase), log in at `/login/employee` with the seeded admin → should land at `/platform/dashboard` and see "Command center coming in phase 2." Confirm the platform sidebar is visible with the red top-bar strip.

- [ ] **Step 4: Commit**

```bash
git add web/src/app/platform
git commit -m "feat(sprint-f): add platform layout + dashboard placeholder"
```

---

## Task 12: Impersonation banner component

**Files:**
- Create: `web/src/components/PlatformImpersonationBanner.tsx`
- Modify: `web/src/app/dashboard/layout.tsx`

- [ ] **Step 1: Write the banner**

```tsx
// web/src/components/PlatformImpersonationBanner.tsx
'use client'

import { useEffect, useState } from 'react'

export default function PlatformImpersonationBanner() {
  const [info, setInfo] = useState<{ org_id: string; org_name: string } | null>(null)
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    // The cookie itself is HttpOnly, so we ask the server for human-readable context
    fetch('/api/impersonation/status')
      .then(r => r.json())
      .then(d => { if (d.impersonating) setInfo({ org_id: d.org_id, org_name: d.org_name }) })
      .catch(() => {})
  }, [])

  async function exit() {
    setExiting(true)
    await fetch('/api/impersonation/exit', { method: 'POST' })
    if (typeof window !== 'undefined') {
      window.location.href = info?.org_id ? `/platform/tenants/${info.org_id}` : '/platform/tenants'
    }
  }

  if (!info) return null

  return (
    <div className="sticky top-0 z-[60] bg-error/10 border-b border-error/20 text-error text-sm py-2 px-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-[18px]">visibility</span>
        <span>Impersonating: <strong>{info.org_name}</strong></span>
      </div>
      <button onClick={exit} disabled={exiting}
        className="px-3 py-1 rounded-lg bg-error text-white text-xs font-semibold disabled:opacity-50">
        {exiting ? 'Exiting…' : 'Exit impersonation'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Write the status endpoint**

`web/src/app/api/impersonation/status/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyImpersonationCookie, IMPERSONATION_COOKIE_NAME } from '@/lib/impersonation'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function GET(_req: NextRequest) {
  const c = cookies().get(IMPERSONATION_COOKIE_NAME)
  const verified = verifyImpersonationCookie(c?.value)
  if (!verified.valid) return NextResponse.json({ impersonating: false })

  const supabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: org } = await supabase
    .from('organisations')
    .select('id, name')
    .eq('id', verified.orgId)
    .single()
  return NextResponse.json({
    impersonating: true,
    org_id: verified.orgId,
    org_name: org?.name ?? 'Unknown',
  })
}
```

- [ ] **Step 3: Render in dashboard layout**

In `web/src/app/dashboard/layout.tsx`, add the import and render the banner at the top of the layout, before any other content:

```tsx
import PlatformImpersonationBanner from '@/components/PlatformImpersonationBanner'
// ...
return (
  <>
    <PlatformImpersonationBanner />
    {/* existing layout contents */}
  </>
)
```

(Adjust to fit the actual existing structure — the banner should be sticky at the top of the viewport, above other sticky elements like the top bar.)

- [ ] **Step 4: Verify tsc + build + commit**

```bash
cd web && npx tsc --noEmit && npm run build
git add web/src/components/PlatformImpersonationBanner.tsx web/src/app/api/impersonation/status web/src/app/dashboard/layout.tsx
git commit -m "feat(sprint-f): add impersonation banner + status endpoint"
```

---

## Task 13: Add impersonated_by to existing audit_logs writes

**Files:**
- Modify: every file with `audit_logs.insert(...)` — found at:
  - `web/src/app/dashboard/work-orders/[id]/page.tsx:127` (and possibly elsewhere)

- [ ] **Step 1: Find every insert call**

Run: Grep for `audit_logs').insert(` across `web/src` to list all writes. Note the file:line pairs.

- [ ] **Step 2: Update each to include impersonated_by**

For each call, change the insert object to include `impersonated_by`. Pattern:

```ts
// BEFORE
await supabase.from('audit_logs').insert({
  organisation_id: orgId,
  user_id: userId,
  action: 'something',
  entity_type: 'work_order',
  details: { ... },
})

// AFTER
const { impersonating, actorPlatformAdminId } = await getOrgId()  // already called earlier in scope, reuse the result
await supabase.from('audit_logs').insert({
  organisation_id: orgId,
  user_id: userId,
  action: 'something',
  entity_type: 'work_order',
  details: { ... },
  impersonated_by: impersonating ? actorPlatformAdminId : null,
})
```

If the file doesn't already call `getOrgId()`, add it. If the file uses a different helper, find equivalent context — the goal is to record the actor's platform-admin id when impersonating.

- [ ] **Step 3: Verify tsc + build**

```bash
cd web && npx tsc --noEmit && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add web/src
git commit -m "feat(sprint-f): wire impersonated_by into all audit_logs writes"
```

---

## Phase 1 Completion Gate

Coordinator (or user) verifies before dispatching Phase 2:

- [ ] SQL migration ran in Supabase; tables exist; bootstrap platform admin inserted
- [ ] `IMPERSONATION_SIGNING_KEY` set in `.env.local` and Vercel
- [ ] `tsc --noEmit && npm run build` clean
- [ ] Logging in at `/login/employee` with the bootstrapped platform admin email → lands on `/platform/dashboard` placeholder
- [ ] Logging in with a regular tenant admin → lands on `/dashboard` (unchanged)
- [ ] Browsing to `/platform/dashboard` without being a platform admin → 404
- [ ] Manually inserting a fake impersonation cookie (or running the impersonation enter route via curl with a platform admin session) sets the banner correctly in `/dashboard`

---

# Phase 2 — Six Parallel Agents

> Dispatch all six agents in the same message. Each reads this section + the spec, then implements its slice. Each agent's tasks are self-contained — no shared files among phase-2 agents.

## Coordination contract for every Phase-2 agent

1. Read `docs/superpowers/specs/2026-05-17-sprint-f-employee-super-admin-portal-design.md` and this plan first.
2. Do NOT touch these Phase 1 files: `web/src/lib/auth-helper.ts`, `web/src/lib/impersonation.ts`, `web/src/lib/platformAudit.ts`, `web/src/lib/currency.ts`, `web/src/lib/featureFlags.ts`, `web/src/middleware.ts`, `web/src/app/platform/layout.tsx`, `web/src/components/layout/PlatformSidebar.tsx`, `web/src/components/PlatformImpersonationBanner.tsx`, `web/src/app/api/impersonation/**`.
3. Use Lumina Tailwind tokens (see CONTEXT.md and `web/src/lib/lumina-tokens.ts`).
4. Every mutation logs via `logPlatformAction()` from Phase 1.
5. Verify with `npx tsc --noEmit && npm run build` before declaring done.
6. Return a summary listing: files added/changed, manual test steps for your slice.

---

## Agent-CommandCenter (F2)

**Goal:** Build `/platform/dashboard` with KPIs, charts, snapshot cron, and metrics API.

**Files:**
- Replace: `web/src/app/platform/dashboard/page.tsx` (currently a placeholder from Task 11)
- Create: `web/src/app/api/platform/metrics/route.ts`
- Create: `web/src/app/api/platform/cron/mrr-snapshot/route.ts`
- Create: `web/vercel.json` (Vercel Cron config)

### Task F2.1: Metrics API

- [ ] **Step 1: Write the route**

```ts
// web/src/app/api/platform/metrics/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function GET(_req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: pa } = await admin.from('platform_admins').select('id').eq('id', user.id).single()
  if (!pa) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // MRR / ARR / Active tenants / Paying tenants
  const { data: orgs } = await admin
    .from('organisations')
    .select('id, plan, billing_status, mrr_cents, offboarded_at, created_at')
  const active = (orgs ?? []).filter(o => !o.offboarded_at)
  const paying = active.filter(o => o.billing_status === 'paid')
  const mrrCents = paying.reduce((sum, o) => sum + (o.mrr_cents ?? 0), 0)
  const arrCents = mrrCents * 12

  // Churn 30d: offboarded in last 30d / active 30d ago
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString()
  const churnedRecent = (orgs ?? []).filter(o => o.offboarded_at && o.offboarded_at > thirtyDaysAgo).length
  const active30dAgo = (orgs ?? []).filter(o =>
    (!o.offboarded_at || o.offboarded_at > thirtyDaysAgo)
    && o.created_at < thirtyDaysAgo
  ).length
  const churnRate = active30dAgo > 0 ? (churnedRecent / active30dAgo) * 100 : 0

  // DAU / MAU — tenant users only (inner join)
  const oneDayAgo = new Date(Date.now() - 86400_000).toISOString()
  const { count: dauCount } = await admin
    .from('users')
    .select('id', { count: 'exact', head: true })
    // Note: we can't join auth.users directly via PostgREST. The simpler approach:
    // a SQL view or function. For phase-2 simplicity, count from a SQL function:
  // … fall back to a custom SQL function if direct join not available

  // Plan distribution
  const planCounts: Record<string, number> = {}
  for (const o of active) planCounts[o.plan ?? 'free'] = (planCounts[o.plan ?? 'free'] ?? 0) + 1

  // WO by tenant (top 10, last 30d)
  const { data: woRows } = await admin
    .from('work_orders')
    .select('organisation_id')
    .gte('created_at', thirtyDaysAgo)
  const wosByOrg = new Map<string, number>()
  for (const r of woRows ?? []) {
    wosByOrg.set(r.organisation_id, (wosByOrg.get(r.organisation_id) ?? 0) + 1)
  }
  const top10 = Array.from(wosByOrg.entries())
    .map(([orgId, count]) => ({
      orgId,
      orgName: (orgs ?? []).find(o => o.id === orgId)?.name ?? orgId,
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  // MRR snapshots (last 6 months)
  const sixMonthsAgo = new Date(Date.now() - 180 * 86400_000).toISOString().slice(0, 10)
  const { data: snapshots } = await admin
    .from('mrr_snapshots')
    .select('snapshot_date, mrr_cents')
    .gte('snapshot_date', sixMonthsAgo)
    .order('snapshot_date', { ascending: true })

  // Tenants needing attention
  const { data: healthRows } = await admin
    .from('tenant_health')
    .select('id, name, plan, billing_status, mrr_cents, offboarded_at, total_score')
  const needsAttention = (healthRows ?? []).filter(t =>
    !t.offboarded_at && (t.total_score < 50 || t.billing_status !== 'paid')
  ).slice(0, 20)

  return NextResponse.json({
    mrrCents,
    arrCents,
    activeTenants: active.length,
    payingTenants: paying.length,
    churnRate30d: Math.round(churnRate * 100) / 100,
    dau: 0,  // TODO replace with SQL function call once added
    mau: 0,
    planCounts,
    top10ByWO: top10,
    mrrSnapshots: snapshots ?? [],
    needsAttention: needsAttention ?? [],
  })
}
```

> **Note:** The DAU/MAU values are placeholders until you add a SQL function `get_dau_mau()` that queries `auth.users.last_sign_in_at`. Add it in a Phase-2 SQL file `docs/superpowers/sql/sprint-f-02-metrics.sql`:
> ```sql
> CREATE OR REPLACE FUNCTION get_dau_mau() RETURNS TABLE(dau INT, mau INT) AS $$
>   SELECT
>     (SELECT COUNT(DISTINCT au.id) FROM auth.users au JOIN users u ON u.id = au.id
>       WHERE au.last_sign_in_at > now() - INTERVAL '1 day')::INT,
>     (SELECT COUNT(DISTINCT au.id) FROM auth.users au JOIN users u ON u.id = au.id
>       WHERE au.last_sign_in_at > now() - INTERVAL '30 days')::INT
> $$ LANGUAGE sql SECURITY DEFINER;
> ```
> Then in the route: `const { data: dauMau } = await admin.rpc('get_dau_mau').single(); ...`

- [ ] **Step 2: Add the SQL function**

Create `docs/superpowers/sql/sprint-f-02-metrics.sql` with the `get_dau_mau()` function above.

- [ ] **Step 3: Wire DAU/MAU into the route**

Replace the `dau: 0, mau: 0` with:

```ts
const { data: dauMau } = await admin.rpc('get_dau_mau').single() as { data: { dau: number; mau: number } | null }
const dau = dauMau?.dau ?? 0
const mau = dauMau?.mau ?? 0
```

- [ ] **Step 4: Verify tsc + commit**

```bash
cd web && npx tsc --noEmit
git add web/src/app/api/platform/metrics docs/superpowers/sql/sprint-f-02-metrics.sql
git commit -m "feat(sprint-f): add platform metrics API"
```

### Task F2.2: MRR snapshot cron

- [ ] **Step 1: Write the cron route**

```ts
// web/src/app/api/platform/cron/mrr-snapshot/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  // Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`
  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: orgs } = await admin
    .from('organisations')
    .select('id, billing_status, mrr_cents, offboarded_at')
  const active = (orgs ?? []).filter(o => !o.offboarded_at)
  const paying = active.filter(o => o.billing_status === 'paid')
  const mrr = paying.reduce((s, o) => s + (o.mrr_cents ?? 0), 0)
  const arr = mrr * 12
  const today = new Date().toISOString().slice(0, 10)

  await admin.from('mrr_snapshots').upsert({
    snapshot_date: today,
    mrr_cents: mrr,
    arr_cents: arr,
    active_tenants: active.length,
    paying_tenants: paying.length,
  }, { onConflict: 'snapshot_date' })

  return NextResponse.json({ success: true, snapshot_date: today, mrr_cents: mrr, arr_cents: arr })
}
```

- [ ] **Step 2: Write vercel.json**

```json
{
  "crons": [
    {
      "path": "/api/platform/cron/mrr-snapshot",
      "schedule": "0 0 * * *"
    }
  ]
}
```

- [ ] **Step 3: Verify tsc + commit**

```bash
cd web && npx tsc --noEmit
git add web/src/app/api/platform/cron web/vercel.json
git commit -m "feat(sprint-f): add MRR snapshot cron + vercel.json"
```

> **Manual step (human):** Set `CRON_SECRET` in Vercel env vars (and `.env.local` for local testing).

### Task F2.3: Dashboard page

- [ ] **Step 1: Replace the placeholder dashboard**

`web/src/app/platform/dashboard/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { formatSAR } from '@/lib/currency'

type Metrics = {
  mrrCents: number
  arrCents: number
  activeTenants: number
  payingTenants: number
  churnRate30d: number
  dau: number
  mau: number
  planCounts: Record<string, number>
  top10ByWO: { orgId: string; orgName: string; count: number }[]
  mrrSnapshots: { snapshot_date: string; mrr_cents: number }[]
  needsAttention: { id: string; name: string; plan: string; billing_status: string; mrr_cents: number; total_score: number }[]
}

const PLAN_COLORS: Record<string, string> = {
  free: '#9ca3af', starter: '#60a5fa', pro: '#10b981', enterprise: '#f59e0b',
}

export default function PlatformDashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  useEffect(() => {
    fetch('/api/platform/metrics').then(r => r.json()).then(setMetrics)
  }, [])
  if (!metrics) return <div className="p-8 text-on-surface-variant">Loading…</div>

  const planData = Object.entries(metrics.planCounts).map(([plan, count]) => ({ plan, count }))

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <h1 className="text-2xl font-bold text-on-surface mb-2">Platform Dashboard</h1>
      <p className="text-sm text-on-surface-variant mb-8">Real-time platform metrics across all tenants.</p>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Kpi label="MRR" value={formatSAR(metrics.mrrCents)} />
        <Kpi label="ARR" value={formatSAR(metrics.arrCents)} />
        <Kpi label="Active tenants" value={String(metrics.activeTenants)} />
        <Kpi label="Churn (30d)" value={`${metrics.churnRate30d}%`} />
      </div>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <Kpi label="DAU" value={String(metrics.dau)} />
        <Kpi label="MAU" value={String(metrics.mau)} />
      </div>

      {/* MRR line chart */}
      <Section title="MRR over time (last 6 months)">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={metrics.mrrSnapshots.map(s => ({ date: s.snapshot_date, mrr: s.mrr_cents / 100 }))}>
            <XAxis dataKey="date" stroke="#888" fontSize={12} />
            <YAxis stroke="#888" fontSize={12} />
            <Tooltip formatter={(v: number) => formatSAR(v * 100)} />
            <Line type="monotone" dataKey="mrr" stroke="#006b54" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Section>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <Section title="Top 10 tenants by WO (last 30d)">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={metrics.top10ByWO} layout="vertical">
              <XAxis type="number" stroke="#888" fontSize={12} />
              <YAxis dataKey="orgName" type="category" stroke="#888" fontSize={12} width={120} />
              <Tooltip />
              <Bar dataKey="count" fill="#006b54" />
            </BarChart>
          </ResponsiveContainer>
        </Section>
        <Section title="Tenants by plan">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={planData} dataKey="count" nameKey="plan" cx="50%" cy="50%" outerRadius={80} label>
                {planData.map(d => (
                  <Cell key={d.plan} fill={PLAN_COLORS[d.plan] ?? '#888'} />
                ))}
              </Pie>
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Section>
      </div>

      <Section title="Tenants needing attention">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-secondary border-b border-outline-variant">
              <th className="py-2">Name</th><th>Plan</th><th>Billing</th><th>MRR</th><th>Score</th>
            </tr>
          </thead>
          <tbody>
            {metrics.needsAttention.map(t => (
              <tr key={t.id} className="border-b border-outline-variant/40">
                <td className="py-2 text-on-surface">{t.name}</td>
                <td className="text-on-surface-variant">{t.plan}</td>
                <td className={t.billing_status === 'paid' ? 'text-primary' : 'text-error'}>{t.billing_status}</td>
                <td className="text-on-surface-variant">{formatSAR(t.mrr_cents)}</td>
                <td className={t.total_score < 50 ? 'text-error font-semibold' : 'text-on-surface-variant'}>{t.total_score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-5">
      <div className="text-[11px] font-bold uppercase tracking-wider text-secondary mb-1">{label}</div>
      <div className="text-2xl font-bold text-on-surface">{value}</div>
    </div>
  )
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-5 mb-6">
      <h3 className="text-base font-semibold text-on-surface mb-4">{title}</h3>
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Verify tsc + build, manual QA, commit**

```bash
cd web && npx tsc --noEmit && npm run build
git add web/src/app/platform/dashboard
git commit -m "feat(sprint-f): build platform Command Center dashboard"
```

Manual QA: log in as platform admin, navigate to `/platform/dashboard`, verify all sections render. Manually create a couple of orgs in SQL editor with non-zero `mrr_cents` to see numbers.

---

## Agent-TenantMgmt (F3)

**Goal:** Build `/platform/tenants` list + detail with 5 tabs + Login as Admin button.

**Files:**
- Create: `web/src/app/platform/tenants/page.tsx`
- Create: `web/src/app/platform/tenants/[id]/page.tsx`
- Create: `web/src/app/api/platform/tenants/route.ts` (GET list, POST handled by Onboarding agent)
- Create: `web/src/app/api/platform/tenants/[id]/route.ts` (GET detail)
- Create: `web/src/app/api/platform/tenants/[id]/users/[userId]/disable/route.ts` (POST)

### Task F3.1: Tenants list API + page

- [ ] **Step 1: Write the list API**

```ts
// web/src/app/api/platform/tenants/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: pa } = await admin.from('platform_admins').select('id').eq('id', user.id).single()
  if (!pa) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const search = req.nextUrl.searchParams.get('q') ?? ''
  const planFilter = req.nextUrl.searchParams.getAll('plan')
  const billingFilter = req.nextUrl.searchParams.getAll('billing')
  const includeOffboarded = req.nextUrl.searchParams.get('include_offboarded') === '1'

  let q = admin.from('tenant_health').select('*')
  if (search) q = q.ilike('name', `%${search}%`)
  if (planFilter.length > 0) q = q.in('plan', planFilter)
  if (billingFilter.length > 0) q = q.in('billing_status', billingFilter)
  if (!includeOffboarded) q = q.is('offboarded_at', null)
  const { data } = await q.order('name')

  return NextResponse.json({ tenants: data ?? [] })
}
```

- [ ] **Step 2: Write the list page**

```tsx
// web/src/app/platform/tenants/page.tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatSAR } from '@/lib/currency'

type TenantRow = {
  id: string; name: string; plan: string; billing_status: string;
  mrr_cents: number; offboarded_at: string | null; total_score: number;
}

function healthBucket(score: number): { label: string; cls: string } {
  if (score >= 80) return { label: 'Healthy', cls: 'bg-primary/10 text-primary border-primary/20' }
  if (score >= 50) return { label: 'At Risk', cls: 'bg-[#f57f17]/10 text-[#f57f17] border-[#f57f17]/20' }
  return { label: 'Churning', cls: 'bg-error/10 text-error border-error/20' }
}

export default function TenantsListPage() {
  const [tenants, setTenants] = useState<TenantRow[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    fetch(`/api/platform/tenants?${params}`)
      .then(r => r.json())
      .then(d => { setTenants(d.tenants ?? []); setLoading(false) })
  }, [search])

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-on-surface">Tenants</h1>
        <Link href="/platform/tenants/new"
          className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 shadow-sm">
          + Create tenant
        </Link>
      </div>

      <div className="mb-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name…"
          className="w-full max-w-md bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm"
        />
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-container-low">
            <tr className="text-left text-[11px] uppercase tracking-wider text-secondary">
              <th className="px-4 py-3">Name</th>
              <th>Plan</th><th>Health</th><th>MRR</th><th>Billing</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-6 text-on-surface-variant">Loading…</td></tr>
            ) : tenants.map(t => {
              const bucket = healthBucket(t.total_score)
              return (
                <tr key={t.id} className="border-t border-outline-variant/40 hover:bg-surface-container-low/40">
                  <td className="px-4 py-3 text-on-surface font-medium">{t.name}</td>
                  <td className="text-on-surface-variant">{t.plan}</td>
                  <td><span className={`inline-block px-2 py-0.5 rounded-full border text-xs font-semibold ${bucket.cls}`}>{bucket.label} ({t.total_score})</span></td>
                  <td className="text-on-surface-variant">{formatSAR(t.mrr_cents)}</td>
                  <td className="text-on-surface-variant">{t.billing_status}</td>
                  <td className="text-end px-4">
                    <Link href={`/platform/tenants/${t.id}`} className="text-primary font-semibold">Open →</Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify tsc + commit**

```bash
cd web && npx tsc --noEmit
git add web/src/app/platform/tenants/page.tsx web/src/app/api/platform/tenants/route.ts
git commit -m "feat(sprint-f): add tenants list page + API"
```

### Task F3.2: Tenant detail page with tabs

- [ ] **Step 1: Write the detail page**

`web/src/app/platform/tenants/[id]/page.tsx`. This page has 5 tabs:
- Overview
- Users (with disable toggle)
- Billing (renders billing form imported from F5 agent's component)
- Flags (renders flags form imported from F6 agent's component)
- Audit (org-scoped feed merging platform_audit_logs + audit_logs for this org)

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatSAR } from '@/lib/currency'

type TenantDetail = {
  id: string; name: string; plan: string; billing_status: string;
  mrr_cents: number; renews_at: string | null; contract_notes: string | null;
  offboarded_at: string | null; offboarded_by: string | null;
  health: { recency_pts: number; users_pts: number; wo_pts: number; billing_pts: number; total_score: number };
  users: { id: string; full_name: string; email: string; role: string; is_active: boolean; disabled: boolean; last_sign_in_at: string | null }[];
  recent_activity: { id: string; action: string; created_at: string; details: Record<string, unknown> }[];
}

type Tab = 'overview' | 'users' | 'billing' | 'flags' | 'audit'

export default function TenantDetailPage() {
  const { id } = useParams() as { id: string }
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('overview')
  const [detail, setDetail] = useState<TenantDetail | null>(null)

  useEffect(() => {
    fetch(`/api/platform/tenants/${id}`).then(r => r.json()).then(d => setDetail(d.tenant))
  }, [id])

  async function impersonate() {
    const res = await fetch('/api/impersonation/enter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_id: id }),
    })
    if (res.ok) window.location.href = '/dashboard'
    else alert('Failed: ' + (await res.json()).error)
  }

  if (!detail) return <div className="p-8 text-on-surface-variant">Loading…</div>

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'users',    label: 'Users' },
    { key: 'billing',  label: 'Billing' },
    { key: 'flags',    label: 'Feature Flags' },
    { key: 'audit',    label: 'Audit' },
  ]

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/platform/tenants" className="text-sm text-on-surface-variant">← All tenants</Link>
          <h1 className="text-2xl font-bold text-on-surface mt-1">{detail.name}</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={impersonate} disabled={!!detail.offboarded_at}
            className="bg-primary text-on-primary px-4 py-2 rounded-xl font-semibold text-sm disabled:opacity-50">
            Login as Admin
          </button>
          {!detail.offboarded_at && (
            <button onClick={() => router.push(`/platform/tenants/${id}/offboard`)}
              className="bg-error/10 text-error border border-error/20 px-4 py-2 rounded-xl font-semibold text-sm">
              Offboard
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-0 mb-6 border-b border-outline-variant">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={tab === t.key
              ? 'px-4 py-2.5 text-sm font-semibold border-b-2 border-primary text-primary'
              : 'px-4 py-2.5 text-sm text-on-surface-variant border-b-2 border-transparent hover:text-on-surface'}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab detail={detail} />}
      {tab === 'users' && <UsersTab tenantId={id} users={detail.users} onChange={() => fetch(`/api/platform/tenants/${id}`).then(r => r.json()).then(d => setDetail(d.tenant))} />}
      {tab === 'billing' && <BillingPlaceholder tenantId={id} />}
      {tab === 'flags' && <FlagsPlaceholder tenantId={id} />}
      {tab === 'audit' && <AuditTab tenantId={id} />}
    </div>
  )
}

function OverviewTab({ detail }: { detail: TenantDetail }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-5">
        <h3 className="text-base font-semibold mb-3">Identity</h3>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-on-surface-variant">Plan</dt><dd>{detail.plan}</dd></div>
          <div className="flex justify-between"><dt className="text-on-surface-variant">Billing</dt><dd>{detail.billing_status}</dd></div>
          <div className="flex justify-between"><dt className="text-on-surface-variant">MRR</dt><dd>{formatSAR(detail.mrr_cents)}</dd></div>
          <div className="flex justify-between"><dt className="text-on-surface-variant">Renews</dt><dd>{detail.renews_at ?? '—'}</dd></div>
        </dl>
      </div>
      <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-5">
        <h3 className="text-base font-semibold mb-3">Health breakdown</h3>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-on-surface-variant">Recency</dt><dd>{detail.health.recency_pts} / 24</dd></div>
          <div className="flex justify-between"><dt className="text-on-surface-variant">Users</dt><dd>{detail.health.users_pts} / 18</dd></div>
          <div className="flex justify-between"><dt className="text-on-surface-variant">WOs (30d)</dt><dd>{detail.health.wo_pts} / 18</dd></div>
          <div className="flex justify-between"><dt className="text-on-surface-variant">Billing</dt><dd>{detail.health.billing_pts} / 40</dd></div>
          <div className="flex justify-between font-semibold border-t pt-2 mt-2"><dt>Total</dt><dd>{detail.health.total_score} / 100</dd></div>
        </dl>
      </div>
      <div className="col-span-2 bg-surface-container-lowest border border-outline-variant rounded-[12px] p-5">
        <h3 className="text-base font-semibold mb-3">Recent activity</h3>
        <ul className="space-y-2 text-sm">
          {detail.recent_activity.map(a => (
            <li key={a.id} className="flex justify-between text-on-surface-variant">
              <span>{a.action}</span>
              <span className="text-xs">{new Date(a.created_at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function UsersTab({ tenantId, users, onChange }: { tenantId: string; users: TenantDetail['users']; onChange: () => void }) {
  async function toggleDisabled(userId: string, currentlyDisabled: boolean) {
    const res = await fetch(`/api/platform/tenants/${tenantId}/users/${userId}/disable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disabled: !currentlyDisabled }),
    })
    if (res.ok) onChange()
  }
  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-surface-container-low text-[11px] uppercase tracking-wider text-secondary">
          <tr><th className="px-4 py-3 text-left">Name</th><th>Email</th><th>Role</th><th>Last login</th><th>Disabled</th></tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id} className="border-t border-outline-variant/40">
              <td className="px-4 py-2">{u.full_name}</td>
              <td className="text-on-surface-variant">{u.email}</td>
              <td className="text-on-surface-variant">{u.role}</td>
              <td className="text-on-surface-variant text-xs">{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : '—'}</td>
              <td>
                <button onClick={() => toggleDisabled(u.id, u.disabled)}
                  className={u.disabled ? 'bg-error text-white px-3 py-1 rounded-full text-xs' : 'bg-surface-container-low text-on-surface-variant px-3 py-1 rounded-full text-xs'}>
                  {u.disabled ? 'Disabled' : 'Enabled'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BillingPlaceholder({ tenantId }: { tenantId: string }) {
  // Agent-Billing replaces this with the actual form component
  return <div className="text-on-surface-variant">Billing form — implemented by Agent-Billing (see /api/platform/tenants/{tenantId}/billing)</div>
}

function FlagsPlaceholder({ tenantId }: { tenantId: string }) {
  // Agent-Flags replaces this with the actual form component
  return <div className="text-on-surface-variant">Flags form — implemented by Agent-Flags (see /api/platform/tenants/{tenantId}/flags)</div>
}

function AuditTab({ tenantId }: { tenantId: string }) {
  const [rows, setRows] = useState<{ id: string; action: string; created_at: string; source: 'platform' | 'tenant' }[] | null>(null)
  useEffect(() => {
    fetch(`/api/platform/tenants/${tenantId}/audit`).then(r => r.json()).then(d => setRows(d.entries))
  }, [tenantId])
  if (!rows) return <div className="text-on-surface-variant">Loading…</div>
  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-5">
      <ul className="space-y-2 text-sm">
        {rows.map(r => (
          <li key={r.id} className="flex justify-between border-b border-outline-variant/40 py-2">
            <span><span className="text-[10px] uppercase font-bold mr-2 text-secondary">{r.source}</span> {r.action}</span>
            <span className="text-xs text-on-surface-variant">{new Date(r.created_at).toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: Write the detail API**

`web/src/app/api/platform/tenants/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: pa } = await admin.from('platform_admins').select('id').eq('id', user.id).single()
  if (!pa) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [org, health, users, activity] = await Promise.all([
    admin.from('organisations').select('*').eq('id', params.id).single(),
    admin.from('tenant_health').select('*').eq('id', params.id).single(),
    admin.from('users').select('id, full_name, email, role, is_active, disabled').eq('organisation_id', params.id),
    admin.from('audit_logs').select('id, action, created_at, details').eq('organisation_id', params.id).order('created_at', { ascending: false }).limit(5),
  ])

  // last_sign_in_at requires a join on auth.users. Use rpc or skip for now; placeholder null.
  const usersWithLogin = (users.data ?? []).map(u => ({ ...u, last_sign_in_at: null }))

  return NextResponse.json({
    tenant: {
      ...org.data,
      health: health.data,
      users: usersWithLogin,
      recent_activity: activity.data ?? [],
    }
  })
}
```

> **Note:** `auth.users.last_sign_in_at` isn't exposed via PostgREST by default. To populate it, add a SQL function in `docs/superpowers/sql/sprint-f-02-metrics.sql`:
> ```sql
> CREATE OR REPLACE FUNCTION get_users_with_login(org_id UUID) RETURNS TABLE(
>   id UUID, full_name TEXT, email TEXT, role TEXT, is_active BOOL, disabled BOOL, last_sign_in_at TIMESTAMP
> ) AS $$
>   SELECT u.id, u.full_name, u.email, u.role, u.is_active, u.disabled, au.last_sign_in_at
>   FROM users u JOIN auth.users au ON au.id = u.id
>   WHERE u.organisation_id = org_id
> $$ LANGUAGE sql SECURITY DEFINER;
> ```
> Then in the route use `admin.rpc('get_users_with_login', { org_id: params.id })`.

- [ ] **Step 3: Write the audit endpoint for this tenant**

`web/src/app/api/platform/tenants/[id]/audit/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: pa } = await admin.from('platform_admins').select('id').eq('id', user.id).single()
  if (!pa) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [platform, tenant] = await Promise.all([
    admin.from('platform_audit_logs').select('id, action, created_at, details').eq('target_organisation_id', params.id).order('created_at', { ascending: false }).limit(50),
    admin.from('audit_logs').select('id, action, created_at, details').eq('organisation_id', params.id).order('created_at', { ascending: false }).limit(50),
  ])
  const merged = [
    ...(platform.data ?? []).map(r => ({ ...r, source: 'platform' as const })),
    ...(tenant.data ?? []).map(r => ({ ...r, source: 'tenant' as const })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 50)
  return NextResponse.json({ entries: merged })
}
```

- [ ] **Step 4: Write the user disable endpoint**

`web/src/app/api/platform/tenants/[id]/users/[userId]/disable/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { logPlatformAction } from '@/lib/platformAudit'

export async function POST(req: NextRequest, { params }: { params: { id: string; userId: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: pa } = await admin.from('platform_admins').select('id').eq('id', user.id).single()
  if (!pa) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { disabled } = (await req.json()) as { disabled: boolean }
  const { error } = await admin
    .from('users')
    .update({ disabled })
    .eq('id', params.userId)
    .eq('organisation_id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logPlatformAction({
    platform_admin_id: user.id,
    action: disabled ? 'user.disable' : 'user.enable',
    target_organisation_id: params.id,
    target_user_id: params.userId,
    details: {},
  })
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 5: Verify tsc + build, manual QA, commit**

```bash
cd web && npx tsc --noEmit && npm run build
git add web/src/app/platform/tenants web/src/app/api/platform/tenants
git commit -m "feat(sprint-f): build tenant detail page with tabs + impersonation + user disable"
```

Manual QA: open `/platform/tenants` → list visible. Click a row → detail page with 5 tabs. Click "Login as Admin" → cookie set, banner appears in `/dashboard`. Click "Exit impersonation" → back to tenants. Disable a user via Users tab → tenant user can no longer log in.

---

## Agent-Onboarding (F4)

**Goal:** Build tenant create form + offboard flow with data export + reactivate.

**Files:**
- Create: `web/src/app/platform/tenants/new/page.tsx`
- Create: `web/src/app/api/platform/tenants` POST handler (extends Tenant-Mgmt's GET) — coordinate by writing the POST in a separate file if needed; Next.js allows POST/GET in the same `route.ts`. **Both agents should agree the file is shared:** Agent-TenantMgmt writes GET first, Agent-Onboarding adds POST. To avoid conflict, Agent-Onboarding adds POST as a separate export to the same file via Edit, not a fresh Write.
- Create: `web/src/app/platform/tenants/[id]/offboard/page.tsx`
- Create: `web/src/app/api/platform/tenants/[id]/offboard/route.ts`
- Create: `web/src/app/api/platform/tenants/[id]/reactivate/route.ts`
- Create: `web/src/lib/offboardExport.ts`
- Modify: `web/package.json` — add `jszip` dep

### Task F4.1: Add jszip dep

- [ ] **Step 1:**

```bash
cd web && npm install jszip
```

- [ ] **Step 2: Commit**

```bash
git add web/package.json web/package-lock.json
git commit -m "feat(sprint-f): add jszip dep for offboard export"
```

### Task F4.2: Tenant create form + POST

- [ ] **Step 1: Write create page**

`web/src/app/platform/tenants/new/page.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewTenantPage() {
  const router = useRouter()
  const [form, setForm] = useState({ org_name: '', plan: 'free', admin_email: '', admin_full_name: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const res = await fetch('/api/platform/tenants', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form)
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error ?? 'Failed'); return }
    router.push(`/platform/tenants/${data.org_id}`)
  }

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <h1 className="text-2xl font-bold text-on-surface mb-6">Create Tenant</h1>
      <form onSubmit={submit} className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-6 max-w-xl space-y-4">
        <Field label="Organisation name" value={form.org_name} onChange={v => setForm(f => ({ ...f, org_name: v }))} required />
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Plan</label>
          <select value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}
            className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm">
            {['free', 'starter', 'pro', 'enterprise'].map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
        <Field label="First admin email" value={form.admin_email} onChange={v => setForm(f => ({ ...f, admin_email: v }))} required type="email" />
        <Field label="First admin full name" value={form.admin_full_name} onChange={v => setForm(f => ({ ...f, admin_full_name: v }))} required />
        {error && <div className="bg-error/10 text-error border border-error/20 rounded-lg px-3 py-2 text-sm">{error}</div>}
        <button type="submit" disabled={loading}
          className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50">
          {loading ? 'Creating…' : 'Create tenant'}
        </button>
      </form>
    </div>
  )
}
function Field({ label, value, onChange, required, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; required?: boolean; type?: string }) {
  return (
    <div>
      <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">{label}{required && <span className="text-error"> *</span>}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} required={required}
        className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm" />
    </div>
  )
}
```

- [ ] **Step 2: Add POST handler to `/api/platform/tenants/route.ts`**

Use Edit (not Write) to append a `POST` function to the existing file from Agent-TenantMgmt:

```ts
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: pa } = await admin.from('platform_admins').select('id').eq('id', user.id).single()
  if (!pa) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json() as { org_name: string; plan: string; admin_email: string; admin_full_name: string }
  if (!['free', 'starter', 'pro', 'enterprise'].includes(body.plan)) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
  }

  // 1. Org
  const { data: org, error: orgErr } = await admin.from('organisations').insert({
    name: body.org_name,
    plan: body.plan,
    mrr_cents: 0,
    billing_status: 'paid',
  }).select().single()
  if (orgErr || !org) return NextResponse.json({ error: orgErr?.message ?? 'Org insert failed' }, { status: 500 })

  // 2. Feature flag row
  await admin.from('tenant_feature_flags').insert({ organisation_id: org.id })

  // 3. Auth user with temp password
  const tempPassword = 'Serviq' + Math.random().toString(36).slice(2, 10) + '!1'
  const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
    email: body.admin_email, password: tempPassword, email_confirm: true,
  })
  if (authErr || !authUser.user) {
    await admin.from('organisations').delete().eq('id', org.id)
    return NextResponse.json({ error: authErr?.message ?? 'Auth user create failed' }, { status: 500 })
  }

  // 4. User profile
  const { error: profErr } = await admin.from('users').insert({
    id: authUser.user.id,
    email: body.admin_email,
    full_name: body.admin_full_name,
    role: 'admin',
    organisation_id: org.id,
    is_active: true,
    disabled: false,
    invited_at: new Date().toISOString(),
  })
  if (profErr) {
    await admin.auth.admin.deleteUser(authUser.user.id)
    await admin.from('organisations').delete().eq('id', org.id)
    return NextResponse.json({ error: profErr.message }, { status: 500 })
  }

  // 5. (Sprint E coordination) Seed field_configs if helper available
  try {
    const { seedFieldConfigsForOrg } = await import('@/lib/fieldEnforcement')
    await seedFieldConfigsForOrg(org.id)
  } catch {
    // Sprint E may not have shipped — safe to skip
  }

  // 6. Welcome email
  try {
    const { notifyWelcomeEmail } = await import('@/lib/notifications/workOrderNotifications')
    await notifyWelcomeEmail(
      authUser.user.id,
      body.admin_email,
      body.admin_full_name,
      `${process.env.NEXT_PUBLIC_APP_URL}/login/client`,
      tempPassword,
    )
  } catch (e) {
    console.error('Welcome email failed:', e)
  }

  // 7. Audit
  const { logPlatformAction } = await import('@/lib/platformAudit')
  await logPlatformAction({
    platform_admin_id: user.id,
    action: 'tenant.create',
    target_organisation_id: org.id,
    details: { org_id: org.id, org_name: body.org_name, plan: body.plan, first_admin_email: body.admin_email },
  })

  return NextResponse.json({ org_id: org.id })
}
```

- [ ] **Step 3: Verify + commit**

```bash
cd web && npx tsc --noEmit && npm run build
git add web/src/app/platform/tenants/new web/src/app/api/platform/tenants/route.ts
git commit -m "feat(sprint-f): add tenant onboarding form + POST handler"
```

### Task F4.3: Export helper

- [ ] **Step 1: Write `web/src/lib/offboardExport.ts`**

```ts
import JSZip from 'jszip'
import { createClient } from '@supabase/supabase-js'

const TENANT_TABLES = [
  'organisations', 'users', 'sites', 'spaces', 'assets',
  'work_orders', 'pm_schedules', 'invoices', 'audit_logs',
  'requests', 'inspection_results', 'notification_log', 'tenant_feature_flags',
]

function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return ''
    const s = typeof v === 'string' ? v : JSON.stringify(v)
    return `"${s.replace(/"/g, '""')}"`
  }
  return [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n')
}

export async function buildOffboardZip(orgId: string): Promise<{ buffer: Buffer; filename: string }> {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const zip = new JSZip()
  for (const table of TENANT_TABLES) {
    const column = table === 'organisations' ? 'id' : 'organisation_id'
    const { data, error } = await admin.from(table).select('*').eq(column, orgId)
    if (error) {
      zip.file(`${table}.error.txt`, error.message)
      continue
    }
    zip.file(`${table}.csv`, toCSV((data as Record<string, unknown>[]) ?? []))
  }
  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  const filename = `${orgId}/${new Date().toISOString().replace(/[:.]/g, '-')}.zip`
  return { buffer, filename }
}

export async function uploadOffboardZip(filename: string, buffer: Buffer): Promise<string> {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { error } = await admin.storage.from('offboard-exports').upload(filename, buffer, {
    contentType: 'application/zip',
    upsert: false,
  })
  if (error) throw new Error('Upload failed: ' + error.message)
  const { data: signed } = await admin.storage.from('offboard-exports').createSignedUrl(filename, 30 * 86400) // 30 days
  return signed?.signedUrl ?? ''
}
```

- [ ] **Step 2: Verify + commit**

```bash
cd web && npx tsc --noEmit
git add web/src/lib/offboardExport.ts
git commit -m "feat(sprint-f): add offboard zip export helper"
```

> **Manual step (human):** Create Supabase Storage bucket `offboard-exports` with private access.

### Task F4.4: Offboard route + page

- [ ] **Step 1: Write `web/src/app/api/platform/tenants/[id]/offboard/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { buildOffboardZip, uploadOffboardZip } from '@/lib/offboardExport'
import { logPlatformAction } from '@/lib/platformAudit'
import { Resend } from 'resend'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: pa } = await admin.from('platform_admins').select('id, email').eq('id', user.id).single()
  if (!pa) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: org } = await admin.from('organisations').select('id, name, offboarded_at').eq('id', params.id).single()
  if (!org) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (org.offboarded_at) return NextResponse.json({ error: 'Already offboarded' }, { status: 400 })

  // 1. Build + upload zip
  const { buffer, filename } = await buildOffboardZip(params.id)
  const signedUrl = await uploadOffboardZip(filename, buffer)

  // 2. Update organisation
  await admin.from('organisations').update({
    offboarded_at: new Date().toISOString(),
    offboarded_by: user.id,
    offboard_export_url: filename,
  }).eq('id', params.id)

  // 3. Disable all tenant users
  const { count: disabledCount } = await admin
    .from('users')
    .update({ disabled: true })
    .eq('organisation_id', params.id)
    .select('id', { count: 'exact', head: true })

  // 4. Email signed URL to all tenant admins + platform admin
  const { data: admins } = await admin.from('users').select('email').eq('organisation_id', params.id).eq('role', 'admin')
  const recipients = Array.from(new Set([...(admins ?? []).map(a => a.email), pa.email]))
  if (process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? 'noreply@serviqfm.com',
      to: recipients,
      subject: `Offboarding export for ${org.name}`,
      html: `<p>Your organisation has been offboarded from ServIQ-FM.</p>
             <p>Download your data export (valid 30 days): <a href="${signedUrl}">${signedUrl}</a></p>`,
    })
  }

  // 5. Audit
  await logPlatformAction({
    platform_admin_id: user.id,
    action: 'tenant.offboard',
    target_organisation_id: params.id,
    details: { org_id: params.id, org_name: org.name, export_url: filename, users_disabled_count: disabledCount ?? 0 },
  })

  return NextResponse.json({ success: true, signed_url: signedUrl })
}
```

- [ ] **Step 2: Write the offboard confirm page**

`web/src/app/platform/tenants/[id]/offboard/page.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function OffboardPage() {
  const { id } = useParams() as { id: string }
  const router = useRouter()
  const [confirmText, setConfirmText] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function confirm() {
    setLoading(true); setError('')
    const res = await fetch(`/api/platform/tenants/${id}/offboard`, { method: 'POST' })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error); return }
    setResult(data.signed_url)
  }

  if (result) {
    return (
      <div className="p-8 max-w-xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Offboarded</h1>
        <p className="text-sm text-on-surface-variant mb-2">Tenant offboarded. Export URL (also emailed):</p>
        <a href={result} className="text-primary break-all">{result}</a>
        <div className="mt-6">
          <button onClick={() => router.push(`/platform/tenants/${id}`)} className="bg-primary text-on-primary px-4 py-2 rounded-xl text-sm font-semibold">Back to tenant</button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4 text-error">Offboard Tenant</h1>
      <ul className="text-sm text-on-surface-variant mb-6 list-disc pl-6 space-y-1">
        <li>All tenant data will be exported to a zip and uploaded to private storage</li>
        <li>Signed download URL emailed to tenant admins + you (valid 30 days)</li>
        <li>All tenant users will be set to disabled (cannot log in)</li>
        <li>Organisation marked as offboarded; data retained until reactivation</li>
      </ul>
      <div className="mb-4">
        <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Type OFFBOARD to confirm</label>
        <input value={confirmText} onChange={e => setConfirmText(e.target.value)}
          className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm" />
      </div>
      {error && <div className="bg-error/10 text-error border border-error/20 rounded-lg px-3 py-2 text-sm mb-4">{error}</div>}
      <button onClick={confirm} disabled={confirmText !== 'OFFBOARD' || loading}
        className="bg-error text-white px-5 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50">
        {loading ? 'Offboarding…' : 'Offboard'}
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Write the reactivate route**

`web/src/app/api/platform/tenants/[id]/reactivate/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { logPlatformAction } from '@/lib/platformAudit'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: pa } = await admin.from('platform_admins').select('id').eq('id', user.id).single()
  if (!pa) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await admin.from('organisations').update({
    offboarded_at: null, offboarded_by: null,
  }).eq('id', params.id)

  // Note: we do NOT touch is_active. Only restore `disabled = false` for users disabled by offboarding.
  await admin.from('users').update({ disabled: false }).eq('organisation_id', params.id)

  const { data: org } = await admin.from('organisations').select('name').eq('id', params.id).single()
  await logPlatformAction({
    platform_admin_id: user.id,
    action: 'tenant.reactivate',
    target_organisation_id: params.id,
    details: { org_id: params.id, org_name: org?.name },
  })
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 4: Verify tsc + build + manual QA + commit**

```bash
cd web && npx tsc --noEmit && npm run build
git add web/src/app/platform/tenants/[id]/offboard web/src/app/api/platform/tenants/[id]/offboard web/src/app/api/platform/tenants/[id]/reactivate
git commit -m "feat(sprint-f): build offboard + reactivate flows with data export"
```

Manual QA: pick a test tenant → /offboard → type OFFBOARD → confirm → verify zip uploaded to bucket; check email; verify tenant users can no longer log in (redirected back to login). Then click "Reactivate" → users can log in again.

---

## Agent-Billing (F5)

**Goal:** Build per-tenant billing form (inline on tenant detail's Billing tab) + POST handler with diff-based audit logging.

**Files:**
- Create: `web/src/app/platform/tenants/[id]/billing/BillingForm.tsx` (exported so Tenant-Mgmt's detail page can import in the Billing tab)
- Create: `web/src/app/api/platform/tenants/[id]/billing/route.ts`
- Modify: `web/src/app/platform/tenants/[id]/page.tsx` — replace `BillingPlaceholder` with `<BillingForm tenantId={id} />` (coordinate with Tenant-Mgmt: do this as a follow-up edit after both agents complete; or accept that the placeholder remains and Phase 3 wires it)

### Task F5.1: Billing form component

- [ ] **Step 1: Write `web/src/app/platform/tenants/[id]/billing/BillingForm.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { formatSAR, parseSARToCents } from '@/lib/currency'

export default function BillingForm({ tenantId }: { tenantId: string }) {
  const [data, setData] = useState<{
    plan: string; billing_status: string; mrr_cents: number;
    renews_at: string | null; contract_notes: string | null;
    stripe_customer_id: string | null; stripe_subscription_id: string | null;
  } | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/platform/tenants/${tenantId}/billing`).then(r => r.json()).then(d => setData(d.billing))
  }, [tenantId])

  if (!data) return <div className="text-on-surface-variant">Loading…</div>

  async function save() {
    setSaving(true); setError('')
    const res = await fetch(`/api/platform/tenants/${tenantId}/billing`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    })
    setSaving(false)
    if (!res.ok) { const j = await res.json(); setError(j.error); return }
    setSaved(true); setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-6 max-w-2xl space-y-4">
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Plan</label>
        <select value={data.plan} onChange={e => setData(d => d && { ...d, plan: e.target.value })}
          className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm">
          {['free', 'starter', 'pro', 'enterprise'].map(p => <option key={p}>{p}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Billing status</label>
        <select value={data.billing_status} onChange={e => setData(d => d && { ...d, billing_status: e.target.value })}
          className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm">
          {['paid', 'failed', 'overdue'].map(p => <option key={p}>{p}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">MRR (SAR)</label>
        <input value={(data.mrr_cents / 100).toFixed(2)}
          onChange={e => setData(d => d && { ...d, mrr_cents: parseSARToCents(e.target.value) })}
          type="text"
          className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm" />
        <div className="text-[11px] text-on-surface-variant mt-1">Stored: {data.mrr_cents} cents · Display: {formatSAR(data.mrr_cents)}</div>
      </div>
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Renews on</label>
        <input type="date" value={data.renews_at ?? ''} onChange={e => setData(d => d && { ...d, renews_at: e.target.value || null })}
          className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm" />
      </div>
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Contract notes</label>
        <textarea value={data.contract_notes ?? ''} onChange={e => setData(d => d && { ...d, contract_notes: e.target.value || null })}
          rows={4}
          className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm" />
      </div>
      <div className="text-[11px] text-on-surface-variant border-t border-outline-variant pt-3">
        Stripe Customer ID: <span className="font-mono">{data.stripe_customer_id ?? 'Not connected'}</span><br />
        Stripe Subscription ID: <span className="font-mono">{data.stripe_subscription_id ?? 'Not connected'}</span>
      </div>
      {error && <div className="bg-error/10 text-error border border-error/20 rounded-lg px-3 py-2 text-sm">{error}</div>}
      <div className="flex gap-3 items-center">
        <button onClick={save} disabled={saving}
          className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="text-primary text-sm font-semibold">Saved</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write the API route**

`web/src/app/api/platform/tenants/[id]/billing/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { logPlatformAction } from '@/lib/platformAudit'

const FIELDS = ['plan', 'billing_status', 'mrr_cents', 'renews_at', 'contract_notes'] as const

async function checkPlatformAdmin(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: pa } = await admin.from('platform_admins').select('id').eq('id', user.id).single()
  if (!pa) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { user, admin }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await checkPlatformAdmin(req)
  if ('error' in auth) return auth.error
  const { data } = await auth.admin.from('organisations').select(FIELDS.join(', ') + ', stripe_customer_id, stripe_subscription_id').eq('id', params.id).single()
  return NextResponse.json({ billing: data })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await checkPlatformAdmin(req)
  if ('error' in auth) return auth.error

  const incoming = await req.json() as Record<string, unknown>
  const { data: before } = await auth.admin.from('organisations').select(FIELDS.join(', ')).eq('id', params.id).single() as { data: Record<string, unknown> | null }

  const update: Record<string, unknown> = {}
  for (const k of FIELDS) {
    if (k in incoming) update[k] = incoming[k]
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ success: true, noop: true })

  const { error } = await auth.admin.from('organisations').update(update).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Diff for audit
  const diff: Record<string, { from: unknown; to: unknown }> = {}
  for (const k of FIELDS) {
    if (before?.[k] !== update[k] && k in update) {
      diff[k] = { from: before?.[k], to: update[k] }
    }
  }
  await logPlatformAction({
    platform_admin_id: auth.user.id,
    action: 'tenant.plan_change',
    target_organisation_id: params.id,
    details: { org_id: params.id, diff },
  })

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Verify tsc + build + commit**

```bash
cd web && npx tsc --noEmit && npm run build
git add web/src/app/platform/tenants/[id]/billing web/src/app/api/platform/tenants/[id]/billing
git commit -m "feat(sprint-f): build billing form + API with diff-based audit"
```

Manual QA: open tenant detail → Billing tab placeholder (will be replaced in Phase 3 integration); for now, navigate directly to `/platform/tenants/<id>/billing` page if reachable, or test the API via fetch.

---

## Agent-Flags (F6)

**Goal:** Build per-tenant feature flag toggles (scaffolding only — no enforcement).

**Files:**
- Create: `web/src/app/platform/tenants/[id]/flags/FlagsForm.tsx`
- Create: `web/src/app/api/platform/tenants/[id]/flags/route.ts`

### Task F6.1: Flags form

- [ ] **Step 1: Write `web/src/app/platform/tenants/[id]/flags/FlagsForm.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { TenantFlags } from '@/lib/featureFlags'

const FLAG_KEYS: (keyof TenantFlags)[] = ['advanced_reporting', 'api_access', 'invoicing', 'multi_site', 'custom_branding']
const FLAG_LABELS: Record<keyof TenantFlags, string> = {
  advanced_reporting: 'Advanced reporting',
  api_access: 'API access',
  invoicing: 'Invoicing',
  multi_site: 'Multi-site',
  custom_branding: 'Custom branding',
}

export default function FlagsForm({ tenantId }: { tenantId: string }) {
  const [flags, setFlags] = useState<TenantFlags | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/platform/tenants/${tenantId}/flags`).then(r => r.json()).then(d => setFlags(d.flags))
  }, [tenantId])

  if (!flags) return <div className="text-on-surface-variant">Loading…</div>

  async function save() {
    setSaving(true); setError('')
    const res = await fetch(`/api/platform/tenants/${tenantId}/flags`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(flags),
    })
    setSaving(false)
    if (!res.ok) { const j = await res.json(); setError(j.error); return }
    setSaved(true); setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-6 max-w-xl space-y-3">
      {FLAG_KEYS.map(k => (
        <div key={k} className="flex items-center justify-between py-2 border-b border-outline-variant/40 last:border-0">
          <span className="text-sm text-on-surface">{FLAG_LABELS[k]}</span>
          <button onClick={() => setFlags(f => f && { ...f, [k]: !f[k] })}
            className={flags[k]
              ? 'px-4 py-1.5 rounded-full bg-primary text-on-primary text-xs font-semibold'
              : 'px-4 py-1.5 rounded-full bg-surface-container-low text-on-surface-variant text-xs font-semibold border border-outline-variant'}>
            {flags[k] ? 'On' : 'Off'}
          </button>
        </div>
      ))}
      {error && <div className="bg-error/10 text-error border border-error/20 rounded-lg px-3 py-2 text-sm">{error}</div>}
      <div className="flex gap-3 items-center pt-2">
        <button onClick={save} disabled={saving}
          className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="text-primary text-sm font-semibold">Saved</span>}
      </div>
      <p className="text-[11px] text-on-surface-variant pt-2">
        Note: feature-flag enforcement is not yet wired in this release. These toggles are stored and audited but do not gate any feature.
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Write the API route**

`web/src/app/api/platform/tenants/[id]/flags/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { logPlatformAction } from '@/lib/platformAudit'

const FLAG_FIELDS = ['advanced_reporting', 'api_access', 'invoicing', 'multi_site', 'custom_branding'] as const

async function platformAdmin(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: pa } = await admin.from('platform_admins').select('id').eq('id', user.id).single()
  return pa ? { user, admin } : null
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await platformAdmin(req)
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data } = await ctx.admin
    .from('tenant_feature_flags')
    .select(FLAG_FIELDS.join(', '))
    .eq('organisation_id', params.id)
    .single()
  return NextResponse.json({ flags: data })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await platformAdmin(req)
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json() as Record<string, boolean>

  const { data: before } = await ctx.admin
    .from('tenant_feature_flags')
    .select(FLAG_FIELDS.join(', '))
    .eq('organisation_id', params.id)
    .single() as { data: Record<string, boolean> | null }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: ctx.user.id }
  for (const k of FLAG_FIELDS) {
    if (k in body) update[k] = body[k]
  }

  const { error } = await ctx.admin.from('tenant_feature_flags').update(update).eq('organisation_id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  for (const k of FLAG_FIELDS) {
    if (k in body && before?.[k] !== body[k]) {
      await logPlatformAction({
        platform_admin_id: ctx.user.id,
        action: 'flag.toggle',
        target_organisation_id: params.id,
        details: { flag: k, from: before?.[k], to: body[k] },
      })
    }
  }
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Verify + commit**

```bash
cd web && npx tsc --noEmit && npm run build
git add web/src/app/platform/tenants/[id]/flags web/src/app/api/platform/tenants/[id]/flags
git commit -m "feat(sprint-f): build feature-flag toggles UI + API (scaffolding only)"
```

---

## Agent-Audit-Health (F7)

**Goal:** Build `/platform/audit` unified feed + `/platform/health` page.

**Files:**
- Create: `web/src/app/platform/audit/page.tsx`
- Create: `web/src/app/api/platform/audit/route.ts`
- Create: `web/src/app/platform/health/page.tsx`
- Create: `web/src/app/api/platform/health/route.ts`

### Task F7.1: Audit page + API

- [ ] **Step 1: Write the audit API**

```ts
// web/src/app/api/platform/audit/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: pa } = await admin.from('platform_admins').select('id').eq('id', user.id).single()
  if (!pa) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const filterAction = req.nextUrl.searchParams.get('action')
  const filterOrg = req.nextUrl.searchParams.get('org_id')
  const includeAllTenant = req.nextUrl.searchParams.get('include_all_tenant') === '1'

  let platformQ = admin.from('platform_audit_logs')
    .select('id, platform_admin_id, action, target_organisation_id, target_user_id, details, created_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (filterAction) platformQ = platformQ.eq('action', filterAction)
  if (filterOrg) platformQ = platformQ.eq('target_organisation_id', filterOrg)

  let tenantQ = admin.from('audit_logs')
    .select('id, organisation_id, user_id, action, entity_type, details, created_at, impersonated_by')
    .order('created_at', { ascending: false })
    .limit(100)
  if (!includeAllTenant) {
    tenantQ = tenantQ.not('impersonated_by', 'is', null)
  }
  if (filterOrg) tenantQ = tenantQ.eq('organisation_id', filterOrg)

  const [platform, tenant] = await Promise.all([platformQ, tenantQ])
  const merged = [
    ...(platform.data ?? []).map(r => ({
      id: r.id, source: 'platform' as const, action: r.action,
      org_id: r.target_organisation_id, actor: r.platform_admin_id,
      created_at: r.created_at, details: r.details,
    })),
    ...(tenant.data ?? []).map(r => ({
      id: r.id, source: r.impersonated_by ? 'impersonated' as const : 'tenant' as const, action: r.action,
      org_id: r.organisation_id, actor: r.impersonated_by ?? r.user_id,
      created_at: r.created_at, details: r.details,
    })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 50)

  return NextResponse.json({ entries: merged })
}
```

- [ ] **Step 2: Write the audit page**

`web/src/app/platform/audit/page.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'

type Row = {
  id: string; source: 'platform' | 'impersonated' | 'tenant';
  action: string; org_id: string | null; actor: string | null;
  created_at: string; details: Record<string, unknown>;
}

const SOURCE_BADGE: Record<Row['source'], string> = {
  platform: 'bg-primary/10 text-primary border-primary/20',
  impersonated: 'bg-error/10 text-error border-error/20',
  tenant: 'bg-surface-container-low text-on-surface-variant border-outline-variant',
}

export default function AuditPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [includeAll, setIncludeAll] = useState(false)
  const [actionFilter, setActionFilter] = useState('')

  useEffect(() => {
    const params = new URLSearchParams()
    if (includeAll) params.set('include_all_tenant', '1')
    if (actionFilter) params.set('action', actionFilter)
    fetch(`/api/platform/audit?${params}`).then(r => r.json()).then(d => setRows(d.entries ?? []))
  }, [includeAll, actionFilter])

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <h1 className="text-2xl font-bold text-on-surface mb-6">Audit Log</h1>
      <div className="flex items-center gap-4 mb-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={includeAll} onChange={e => setIncludeAll(e.target.checked)} />
          Include all tenant activity
        </label>
        <input value={actionFilter} onChange={e => setActionFilter(e.target.value)} placeholder="Filter action…"
          className="bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-2 text-sm max-w-xs" />
      </div>
      <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-container-low text-[11px] uppercase tracking-wider text-secondary">
            <tr><th className="px-4 py-3 text-left">When</th><th>Source</th><th>Action</th><th>Org</th><th>Actor</th></tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.source + ':' + r.id} className="border-t border-outline-variant/40">
                <td className="px-4 py-2 text-on-surface-variant text-xs">{new Date(r.created_at).toLocaleString()}</td>
                <td><span className={`inline-block px-2 py-0.5 rounded-full border text-xs font-semibold ${SOURCE_BADGE[r.source]}`}>{r.source}</span></td>
                <td className="text-on-surface">{r.action}</td>
                <td className="text-on-surface-variant text-xs font-mono">{r.org_id?.slice(0, 8) ?? '—'}</td>
                <td className="text-on-surface-variant text-xs font-mono">{r.actor?.slice(0, 8) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify + commit**

```bash
cd web && npx tsc --noEmit
git add web/src/app/platform/audit web/src/app/api/platform/audit
git commit -m "feat(sprint-f): build unified audit feed page + API"
```

### Task F7.2: Health page + API

- [ ] **Step 1: Write the health API**

```ts
// web/src/app/api/platform/health/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function GET(_req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: pa } = await admin.from('platform_admins').select('id').eq('id', user.id).single()
  if (!pa) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // 1. Supabase latency
  const t0 = Date.now()
  let supabaseStatus: 'ok' | 'error' = 'ok'
  try {
    await admin.from('organisations').select('id', { head: true, count: 'exact' }).limit(1)
  } catch {
    supabaseStatus = 'error'
  }
  const supabaseLatencyMs = Date.now() - t0

  // 2. Vercel status (public endpoint)
  let vercelIndicator: string = 'unknown'
  try {
    const r = await fetch('https://www.vercel-status.com/api/v2/status.json', { cache: 'no-store' })
    if (r.ok) {
      const j = await r.json() as { status: { indicator: string; description: string } }
      vercelIndicator = j.status.indicator
    }
  } catch { /* keep unknown */ }

  // 3. Email log summary (last 24h)
  const since = new Date(Date.now() - 86400_000).toISOString()
  const { data: emails } = await admin
    .from('notification_log')
    .select('status')
    .gte('created_at', since)
  const emailCounts: Record<string, number> = {}
  for (const e of emails ?? []) emailCounts[e.status as string] = (emailCounts[e.status as string] ?? 0) + 1

  // 4. Recent errors
  const { data: recentErrors } = await admin
    .from('notification_log')
    .select('id, status, error_message, created_at, type_key')
    .eq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(10)

  return NextResponse.json({
    supabase: { status: supabaseStatus, latency_ms: supabaseLatencyMs },
    vercel: { indicator: vercelIndicator },
    email_24h: emailCounts,
    recent_errors: recentErrors ?? [],
  })
}
```

- [ ] **Step 2: Write the health page**

`web/src/app/platform/health/page.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'

type Health = {
  supabase: { status: 'ok' | 'error'; latency_ms: number }
  vercel: { indicator: string }
  email_24h: Record<string, number>
  recent_errors: { id: string; status: string; error_message: string | null; created_at: string; type_key: string }[]
}

const VERCEL_COLOR: Record<string, string> = {
  none: 'text-primary', minor: 'text-[#f57f17]', major: 'text-error', critical: 'text-error', unknown: 'text-on-surface-variant',
}

export default function HealthPage() {
  const [h, setH] = useState<Health | null>(null)
  useEffect(() => { fetch('/api/platform/health').then(r => r.json()).then(setH) }, [])
  if (!h) return <div className="p-8 text-on-surface-variant">Loading…</div>

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <h1 className="text-2xl font-bold text-on-surface mb-6">System Health</h1>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card title="Supabase">
          <div className={h.supabase.status === 'ok' ? 'text-primary text-2xl font-bold' : 'text-error text-2xl font-bold'}>
            {h.supabase.status === 'ok' ? 'OK' : 'Down'}
          </div>
          <div className="text-xs text-on-surface-variant mt-1">{h.supabase.latency_ms} ms</div>
        </Card>
        <Card title="Vercel">
          <div className={`text-2xl font-bold ${VERCEL_COLOR[h.vercel.indicator]}`}>{h.vercel.indicator}</div>
        </Card>
        <Card title="Email delivery (24h)">
          {Object.keys(h.email_24h).length === 0 ? <div className="text-on-surface-variant text-sm">No traffic</div> : (
            <ul className="text-sm space-y-1">
              {Object.entries(h.email_24h).map(([s, c]) => <li key={s} className="flex justify-between"><span>{s}</span><span className="font-semibold">{c}</span></li>)}
            </ul>
          )}
        </Card>
        <Card title="Recent failures">
          <ul className="text-xs space-y-2 max-h-48 overflow-y-auto">
            {h.recent_errors.map(e => (
              <li key={e.id}>
                <div className="text-error">{e.type_key}</div>
                <div className="text-on-surface-variant">{e.error_message}</div>
                <div className="text-on-surface-variant/60 text-[10px]">{new Date(e.created_at).toLocaleString()}</div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-5">
      <div className="text-[11px] font-bold uppercase tracking-wider text-secondary mb-2">{title}</div>
      {children}
    </div>
  )
}
```

- [ ] **Step 3: Verify + commit**

```bash
cd web && npx tsc --noEmit && npm run build
git add web/src/app/platform/health web/src/app/api/platform/health
git commit -m "feat(sprint-f): build system health page + API"
```

---

# Phase 3 — Integration

Coordinator runs these tasks.

- [ ] **Step 1: Wire Billing + Flags forms into the tenant detail tabs**

In `web/src/app/platform/tenants/[id]/page.tsx`, replace `BillingPlaceholder` and `FlagsPlaceholder` with the real components:

```tsx
import BillingForm from './billing/BillingForm'
import FlagsForm from './flags/FlagsForm'
// ...
{tab === 'billing' && <BillingForm tenantId={id} />}
{tab === 'flags' && <FlagsForm tenantId={id} />}
```

- [ ] **Step 2: Verify no file conflicts**

```bash
git log --since='phase 2 start' --pretty=format: --name-only | sort | uniq -c | sort -rn | head -20
```

Expected: each file appears once (except `tenants/[id]/page.tsx` which appears in Phase 2 and Phase 3).

- [ ] **Step 3: Final tsc + build**

```bash
cd web && npx tsc --noEmit && npm run build
```

- [ ] **Step 4: End-to-end QA pass**

1. Log in as platform admin → `/platform/dashboard` renders all sections
2. `/platform/tenants` → list visible
3. Click "Create tenant" → fill form → submit → new tenant appears
4. Click new tenant → all 5 tabs functional
5. Click "Login as Admin" → banner appears in `/dashboard`; create a work order; verify `audit_logs.impersonated_by` is set
6. "Exit impersonation" → back to tenant detail
7. Toggle a feature flag → verify `platform_audit_logs` row
8. Edit billing → save → verify `platform_audit_logs` action='tenant.plan_change' with diff
9. Offboard a test tenant → verify zip exists in Storage, email sent (or logged), tenant users can't log in
10. Reactivate → tenant users can log in again
11. `/platform/audit` → events visible across all the above
12. `/platform/health` → all 4 cards render

- [ ] **Step 5: Update CONTEXT.md**

Mark Sprint F as complete with the required manual steps + new env vars (`IMPERSONATION_SIGNING_KEY`, `CRON_SECRET`) + new Storage bucket (`offboard-exports`).

```bash
git add CONTEXT.md
git commit -m "docs: mark Sprint F complete in CONTEXT.md"
```

---

# Required Manual Steps (post-implementation)

1. Run `docs/superpowers/sql/sprint-f-01-foundation.sql` in Supabase SQL editor
2. Run `docs/superpowers/sql/sprint-f-02-metrics.sql` (DAU/MAU + user-with-login functions)
3. Generate `IMPERSONATION_SIGNING_KEY` with `openssl rand -hex 32`; set in Vercel + `.env.local`
4. Generate `CRON_SECRET`; set in Vercel + `.env.local`
5. Create the first platform admin auth user in Supabase Auth dashboard; copy UUID
6. Run the bootstrap INSERT into `platform_admins` with that UUID
7. Create Supabase Storage bucket `offboard-exports` with private access
8. Verify Vercel Cron is enabled and the `mrr-snapshot` job runs at next midnight UTC
9. Test login at `/login/employee` → lands on `/platform/dashboard`

---

# Out of Scope (deferred)

- Stripe webhook integration (schema ready; not wired)
- Feature-flag enforcement at usage points
- Multi-platform-admin role hierarchy
- Public tenant-status page
- Tenant data import/migration
- Platform-admin notifications
