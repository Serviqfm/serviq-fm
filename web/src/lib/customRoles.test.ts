import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { capabilityAllowed, capabilityDeniedForUser, verifyCustomRoleId } from './customRoles'

// Minimal chainable stand-in for the bits of the Supabase client these helpers
// use: from(t).select(...).eq(col, val)…maybeSingle(). eq() filters for real so
// the org-scoping assertions below mean something.
function fakeSupabase(rows: Record<string, Record<string, unknown>[]>): SupabaseClient {
  return {
    from(table: string) {
      const filters: [string, unknown][] = []
      const chain = {
        select: () => chain,
        eq: (col: string, val: unknown) => { filters.push([col, val]); return chain },
        maybeSingle: async () => ({
          data: (rows[table] ?? []).find(r => filters.every(([c, v]) => r[c] === v)) ?? null,
        }),
      }
      return chain
    },
  } as unknown as SupabaseClient
}

describe('capabilityAllowed', () => {
  it('only an explicit false denies', () => {
    expect(capabilityAllowed(null, 'can_manage_users')).toBe(true)
    expect(capabilityAllowed(undefined, 'can_manage_users')).toBe(true)
    expect(capabilityAllowed({}, 'can_manage_users')).toBe(true)
    expect(capabilityAllowed({ can_manage_users: true }, 'can_manage_users')).toBe(true)
    expect(capabilityAllowed({ can_manage_users: false }, 'can_manage_users')).toBe(false)
  })
  it('a denial on one capability does not touch the others', () => {
    expect(capabilityAllowed({ can_delete_assets: false }, 'can_manage_users')).toBe(true)
  })
})

describe('capabilityDeniedForUser', () => {
  const user = (custom_role_id: string | null) => ({ id: 'u1', custom_role_id })

  it('no custom role -> not denied (unchanged behavior)', async () => {
    const db = fakeSupabase({ users: [user(null)] })
    expect(await capabilityDeniedForUser(db, 'u1', 'can_manage_users')).toBe(false)
  })

  it('custom role with an explicit false -> denied', async () => {
    const db = fakeSupabase({
      users: [user('r1')],
      custom_roles: [{ id: 'r1', is_active: true, permissions: { can_manage_users: false } }],
    })
    expect(await capabilityDeniedForUser(db, 'u1', 'can_manage_users')).toBe(true)
  })

  it('capability absent from the map -> not denied', async () => {
    const db = fakeSupabase({
      users: [user('r1')],
      custom_roles: [{ id: 'r1', is_active: true, permissions: { can_delete_assets: false } }],
    })
    expect(await capabilityDeniedForUser(db, 'u1', 'can_manage_users')).toBe(false)
  })

  it('an inactive custom role denies nothing', async () => {
    const db = fakeSupabase({
      users: [user('r1')],
      custom_roles: [{ id: 'r1', is_active: false, permissions: { can_manage_users: false } }],
    })
    expect(await capabilityDeniedForUser(db, 'u1', 'can_manage_users')).toBe(false)
  })

  // THE security property: base_role never grants. An admin-base custom role on a
  // technician yields no capability — the helper reports denials only, and the
  // caller's users.role is the sole thing that authorizes.
  it('base_role is never read and can never grant', async () => {
    const db = fakeSupabase({
      users: [user('r1')],
      custom_roles: [{ id: 'r1', base_role: 'admin', is_active: true, permissions: {} }],
    })
    expect(await capabilityDeniedForUser(db, 'u1', 'can_manage_users')).toBe(false)
  })

  it('fails open when the table/column is missing (pre-migration)', async () => {
    const db = fakeSupabase({})
    expect(await capabilityDeniedForUser(db, 'u1', 'can_manage_users')).toBe(false)
  })
})

describe('verifyCustomRoleId', () => {
  const db = fakeSupabase({ custom_roles: [{ id: 'r1', organisation_id: 'orgA' }] })

  it('accepts an own-org role id', async () => {
    expect(await verifyCustomRoleId(db, 'orgA', 'r1')).toEqual({ ok: true, value: 'r1' })
  })
  it('rejects another org’s role id', async () => {
    expect(await verifyCustomRoleId(db, 'orgB', 'r1')).toEqual({ ok: false })
  })
  it('rejects an unknown id and non-strings', async () => {
    expect(await verifyCustomRoleId(db, 'orgA', 'nope')).toEqual({ ok: false })
    expect(await verifyCustomRoleId(db, 'orgA', 42)).toEqual({ ok: false })
  })
  it('treats null / empty string as clearing the overlay', async () => {
    expect(await verifyCustomRoleId(db, 'orgA', null)).toEqual({ ok: true, value: null })
    expect(await verifyCustomRoleId(db, 'orgA', '')).toEqual({ ok: true, value: null })
  })
})
