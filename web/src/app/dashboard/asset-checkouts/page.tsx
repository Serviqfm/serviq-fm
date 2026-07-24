'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'

// AL-06 — Asset check-in / check-out. Standalone page; does NOT touch the MEP
// asset detail/list pages. Cascading (child assets follow parent) is out of
// MVP scope — each asset is checked out independently.

interface Asset { id: string; name: string; category: string | null }
interface UserRow { id: string; full_name: string | null }
interface Checkout {
  id: string
  asset_id: string
  checked_out_to: string
  checked_out_by: string | null
  checked_out_at: string
  expected_return_at: string | null
  checked_in_at: string | null
  checked_in_by: string | null
  notes: string | null
}

function fmt(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function AssetCheckoutsPage() {
  const supabase = createClient()
  const { t } = useLanguage()

  const [orgId, setOrgId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [assets, setAssets] = useState<Asset[]>([])
  const [users, setUsers] = useState<UserRow[]>([])
  const [checkouts, setCheckouts] = useState<Checkout[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check-out form
  const [assetId, setAssetId] = useState('')
  const [toUser, setToUser] = useState('')
  const [expected, setExpected] = useState('')
  const [notes, setNotes] = useState('')

  const loadCheckouts = useCallback(async (org: string) => {
    const { data } = await supabase.from('asset_checkouts').select('*')
      .eq('organisation_id', org).order('checked_out_at', { ascending: false })
    setCheckouts((data as Checkout[]) ?? [])
  }, [supabase])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { if (typeof window !== 'undefined') window.location.href = '/login'; return }
      setUserId(user.id)
      const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
      if (!profile) { setLoading(false); return }
      setOrgId(profile.organisation_id)
      const [{ data: a }, { data: u }] = await Promise.all([
        supabase.from('assets').select('id, name, category').eq('organisation_id', profile.organisation_id).order('name'),
        supabase.from('users').select('id, full_name').eq('organisation_id', profile.organisation_id).order('full_name'),
      ])
      setAssets((a as Asset[]) ?? [])
      setUsers((u as UserRow[]) ?? [])
      await loadCheckouts(profile.organisation_id)
      setLoading(false)
    })
  }, [supabase, loadCheckouts])

  const assetName = (id: string) => assets.find(a => a.id === id)?.name ?? '—'
  const userName = (id: string | null) => (id && users.find(u => u.id === id)?.full_name) || '—'

  const open = checkouts.filter(c => !c.checked_in_at)
  const history = checkouts.filter(c => c.checked_in_at)
  const openAssetIds = new Set(open.map(c => c.asset_id))
  const availableAssets = assets.filter(a => !openAssetIds.has(a.id))
  const isOverdue = (c: Checkout) => c.expected_return_at != null && new Date(c.expected_return_at) < new Date()

  async function checkOut() {
    if (!orgId || !assetId || !toUser) return
    setBusy(true); setError(null)
    const { error } = await supabase.from('asset_checkouts').insert({
      organisation_id: orgId,
      asset_id: assetId,
      checked_out_to: toUser,
      checked_out_by: userId,
      expected_return_at: expected ? new Date(expected).toISOString() : null,
      notes: notes.trim() || null,
    })
    if (error) { setError(error.message); setBusy(false); return }
    setAssetId(''); setToUser(''); setExpected(''); setNotes('')
    await loadCheckouts(orgId)
    setBusy(false)
  }

  async function checkIn(id: string) {
    if (!orgId) return
    setBusy(true); setError(null)
    const { error } = await supabase.from('asset_checkouts')
      .update({ checked_in_at: new Date().toISOString(), checked_in_by: userId })
      .eq('id', id)
    if (error) { setError(error.message); setBusy(false); return }
    await loadCheckouts(orgId)
    setBusy(false)
  }

  const inputCls = 'w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all'

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[1440px] mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-on-surface">{t('checkout.title')}</h1>
          <p className="text-on-surface-variant mt-1 text-sm">{t('checkout.subtitle')}</p>
        </div>

        {error && (
          <div className="bg-error/5 border border-error/20 rounded-xl p-3 text-sm text-error">{error}</div>
        )}

        {/* Check-out form */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-5 space-y-4">
          <p className="text-sm font-bold text-on-surface">{t('checkout.new')}</p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">{t('checkout.asset')}</label>
              <select value={assetId} onChange={e => setAssetId(e.target.value)} className={inputCls}>
                <option value="">{t('checkout.select_asset')}</option>
                {availableAssets.map(a => <option key={a.id} value={a.id}>{a.name}{a.category ? ` · ${a.category}` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">{t('checkout.to')}</label>
              <select value={toUser} onChange={e => setToUser(e.target.value)} className={inputCls}>
                <option value="">{t('checkout.select_user')}</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name ?? u.id}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">{t('checkout.expected')}</label>
              <input type="date" value={expected} onChange={e => setExpected(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">{t('checkout.notes')}</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('checkout.notes_ph')} className={inputCls} />
            </div>
          </div>
          <button onClick={checkOut} disabled={busy || !assetId || !toUser}
            className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-50">
            <span className="material-symbols-outlined text-lg">logout</span>{t('checkout.check_out')}
          </button>
        </div>

        {loading ? (
          <div className="text-center py-16 text-on-surface-variant">{t('common.loading')}</div>
        ) : (
          <>
            {/* Currently checked out */}
            <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] overflow-hidden shadow-sm">
              <div className="px-5 py-3 border-b border-outline-variant/30 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-lg">inventory_2</span>
                <p className="text-sm font-bold text-on-surface">{t('checkout.open')} ({open.length})</p>
              </div>
              {open.length === 0 ? (
                <div className="text-center py-10 text-on-surface-variant text-sm">{t('checkout.none_open')}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="bg-surface-container-low border-b border-outline-variant/30">
                        {[t('checkout.asset'), t('checkout.to'), t('checkout.out_at'), t('checkout.expected'), t('common.status'), t('common.actions')].map(h => (
                          <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/20">
                      {open.map(c => (
                        <tr key={c.id} className="hover:bg-surface-container-low transition-colors">
                          <td className="px-4 py-3 text-sm font-semibold text-on-surface">{assetName(c.asset_id)}</td>
                          <td className="px-4 py-3 text-sm text-on-surface-variant">{userName(c.checked_out_to)}</td>
                          <td className="px-4 py-3 text-sm text-on-surface-variant whitespace-nowrap">{fmt(c.checked_out_at)}</td>
                          <td className="px-4 py-3 text-sm text-on-surface-variant whitespace-nowrap">{fmt(c.expected_return_at)}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${isOverdue(c) ? 'bg-error/10 text-error border border-error/20' : 'bg-primary/10 text-primary border border-primary/20'}`}>
                              {isOverdue(c) ? t('checkout.overdue') : t('checkout.status_out')}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button onClick={() => checkIn(c.id)} disabled={busy}
                              className="px-3 py-1.5 rounded-lg bg-secondary/10 text-secondary text-xs font-semibold hover:bg-secondary/20 transition-colors disabled:opacity-50 flex items-center gap-1">
                              <span className="material-symbols-outlined text-sm">login</span>{t('checkout.check_in')}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* History */}
            <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] overflow-hidden shadow-sm">
              <div className="px-5 py-3 border-b border-outline-variant/30 flex items-center gap-2">
                <span className="material-symbols-outlined text-on-surface-variant text-lg">history</span>
                <p className="text-sm font-bold text-on-surface">{t('checkout.history')} ({history.length})</p>
              </div>
              {history.length === 0 ? (
                <div className="text-center py-10 text-on-surface-variant text-sm">{t('checkout.none_history')}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="bg-surface-container-low border-b border-outline-variant/30">
                        {[t('checkout.asset'), t('checkout.to'), t('checkout.out_at'), t('checkout.in_at'), t('checkout.notes')].map(h => (
                          <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/20">
                      {history.map(c => (
                        <tr key={c.id} className="hover:bg-surface-container-low transition-colors">
                          <td className="px-4 py-3 text-sm font-semibold text-on-surface">{assetName(c.asset_id)}</td>
                          <td className="px-4 py-3 text-sm text-on-surface-variant">{userName(c.checked_out_to)}</td>
                          <td className="px-4 py-3 text-sm text-on-surface-variant whitespace-nowrap">{fmt(c.checked_out_at)}</td>
                          <td className="px-4 py-3 text-sm text-on-surface-variant whitespace-nowrap">{fmt(c.checked_in_at)}</td>
                          <td className="px-4 py-3 text-sm text-on-surface-variant">{c.notes ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
