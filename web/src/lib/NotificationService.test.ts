import { describe, it, expect, beforeEach } from 'vitest'
import { NotificationService } from './NotificationService'

// DV-22: batched fan-out. We inject a stub for the private static supabase client so
// no env vars / network are touched, and assert the built rows: recipient dedupe,
// per-recipient language selection (W5.6), shared dedupe_key, and the newly-written
// count returned from the ignore-duplicates upsert's .select().

type Row = { user_id: string; title: string; body: string | null; dedupe_key: string | null }

function stub(users: { id: string; notification_language?: string | null }[]) {
  const captured: { rows?: Row[]; onConflict?: string; ignoreDuplicates?: boolean } = {}
  const client = {
    from(table: string) {
      if (table === 'users') {
        return {
          select: () => ({
            in: (_col: string, ids: string[]) =>
              Promise.resolve({ data: users.filter((u) => ids.includes(u.id)), error: null }),
          }),
        }
      }
      // user_notifications
      return {
        upsert: (rows: Row[], opts: { onConflict?: string; ignoreDuplicates?: boolean }) => {
          captured.rows = rows
          captured.onConflict = opts.onConflict
          captured.ignoreDuplicates = opts.ignoreDuplicates
          // ignore-duplicates upsert + .select() returns only inserted rows.
          return { select: () => Promise.resolve({ data: rows.map((r) => ({ user_id: r.user_id })), error: null }) }
        },
      }
    },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(NotificationService as any)._supabase = client
  return captured
}

beforeEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(NotificationService as any)._supabase = null
})

describe('NotificationService.insertInAppMany', () => {
  it('dedupes recipients, drops falsy ids, returns written count', async () => {
    const cap = stub([])
    const n = await NotificationService.insertInAppMany(['u1', 'u1', '', 'u2'], 'org1', 'wo_i_assigned_updated', {
      title: 'Hello', dedupeKey: 'k1',
    })
    expect(n).toBe(2)
    expect(cap.rows?.map((r) => r.user_id)).toEqual(['u1', 'u2'])
    expect(cap.rows?.every((r) => r.dedupe_key === 'k1')).toBe(true)
    expect(cap.onConflict).toBe('user_id,dedupe_key')
    expect(cap.ignoreDuplicates).toBe(true)
  })

  it('picks per-recipient language, falling back to en', async () => {
    const cap = stub([
      { id: 'ar1', notification_language: 'ar' },
      { id: 'en1', notification_language: null },
    ])
    await NotificationService.insertInAppMany(['ar1', 'en1'], 'org1', 'wo_i_assigned_updated', {
      title: 'EN title',
      localized: { en: { title: 'EN title' }, ar: { title: 'AR title' } },
    })
    const byId = Object.fromEntries((cap.rows ?? []).map((r) => [r.user_id, r.title]))
    expect(byId.ar1).toBe('AR title')
    expect(byId.en1).toBe('EN title')
  })

  it('no recipients → no write, returns 0', async () => {
    const cap = stub([])
    const n = await NotificationService.insertInAppMany([], 'org1', 'wo_i_assigned_updated', { title: 'x' })
    expect(n).toBe(0)
    expect(cap.rows).toBeUndefined()
  })
})
