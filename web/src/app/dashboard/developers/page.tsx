'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'

const SCOPES = ['work-orders:read', 'assets:read'] as const
const EVENTS = ['wo.created', 'wo.status_changed', 'request.submitted'] as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any

export default function DevelopersPage() {
  const { lang } = useLanguage()
  const supabase = createClient()
  const ar = lang === 'ar'

  const [loading, setLoading] = useState(true)
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [keys, setKeys] = useState<Row[]>([])
  const [hooks, setHooks] = useState<Row[]>([])

  // create-key form
  const [keyName, setKeyName] = useState('')
  const [keyScopes, setKeyScopes] = useState<string[]>(['work-orders:read'])
  const [newPlaintext, setNewPlaintext] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // create-webhook form
  const [hookUrl, setHookUrl] = useState('')
  const [hookEvent, setHookEvent] = useState<string>(EVENTS[0])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { init() }, [])

  async function init() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { if (typeof window !== 'undefined') window.location.href = '/login'; return }
    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (!profile || profile.role !== 'admin') { setAllowed(false); setLoading(false); return }
    setAllowed(true)
    await Promise.all([loadKeys(), loadHooks()])
    setLoading(false)
  }

  async function loadKeys() {
    const res = await fetch('/api/developers/keys')
    if (res.ok) setKeys((await res.json()).data ?? [])
  }
  async function loadHooks() {
    const res = await fetch('/api/developers/webhooks')
    if (res.ok) setHooks((await res.json()).data ?? [])
  }

  function toggleScope(s: string) {
    setKeyScopes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  async function createKey() {
    if (!keyName.trim() || keyScopes.length === 0) return
    setBusy(true); setNewPlaintext(null)
    const res = await fetch('/api/developers/keys', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: keyName.trim(), scopes: keyScopes }),
    })
    setBusy(false)
    if (!res.ok) { alert((await res.json()).error ?? 'Failed'); return }
    const { data } = await res.json()
    setNewPlaintext(data.plaintext)
    setKeyName('')
    loadKeys()
  }

  async function revokeKey(id: string) {
    if (!confirm(ar ? 'إبطال هذا المفتاح؟ لا يمكن التراجع.' : 'Revoke this key? This cannot be undone.')) return
    const res = await fetch(`/api/developers/keys?id=${id}`, { method: 'DELETE' })
    if (res.ok) loadKeys()
  }

  async function createHook() {
    if (!hookUrl.trim()) return
    setBusy(true)
    const res = await fetch('/api/developers/webhooks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: hookUrl.trim(), event: hookEvent }),
    })
    setBusy(false)
    if (!res.ok) { alert((await res.json()).error ?? 'Failed'); return }
    setHookUrl('')
    loadHooks()
  }

  async function deleteHook(id: string) {
    if (!confirm(ar ? 'حذف هذا الـ webhook؟' : 'Delete this webhook?')) return
    const res = await fetch(`/api/developers/webhooks?id=${id}`, { method: 'DELETE' })
    if (res.ok) loadHooks()
  }

  if (loading) return <div className="p-8 text-on-surface-variant">{ar ? 'جارٍ التحميل…' : 'Loading…'}</div>
  if (allowed === false) return (
    <div className="p-8 text-on-surface-variant">
      {ar ? 'ليس لديك صلاحية الوصول إلى هذه الصفحة.' : 'You do not have permission to access this page.'}
    </div>
  )

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-outline-variant/50 bg-surface-container-lowest text-sm text-on-surface'
  const cardCls = 'bg-surface-container-lowest border border-outline-variant rounded-[12px] p-5 shadow-sm space-y-4'

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[1100px] mx-auto space-y-6">

        <div>
          <h1 className="text-3xl font-bold text-on-surface">{ar ? 'المطوّرون' : 'Developers'}</h1>
          <p className="text-on-surface-variant mt-1 text-sm">
            {ar ? 'مفاتيح واجهة برمجة التطبيقات و webhooks لمؤسستك.' : 'API keys and webhooks for your organisation.'}
          </p>
        </div>

        {/* API usage hint */}
        <div className="bg-surface-container border border-outline-variant/40 rounded-[12px] p-4 text-xs text-on-surface-variant font-mono overflow-x-auto">
          curl -H &quot;Authorization: Bearer &lt;key&gt;&quot; {typeof window !== 'undefined' ? window.location.origin : ''}/api/v1/work-orders
        </div>

        {/* ── Create key ─────────────────────────────────────────── */}
        <div className={cardCls}>
          <h2 className="text-lg font-semibold text-on-surface">{ar ? 'إنشاء مفتاح API' : 'Create API key'}</h2>
          <input className={inputCls} placeholder={ar ? 'اسم المفتاح' : 'Key name'} value={keyName} onChange={e => setKeyName(e.target.value)} />
          <div className="flex flex-wrap gap-3">
            {SCOPES.map(s => (
              <label key={s} className="flex items-center gap-2 text-sm text-on-surface-variant">
                <input type="checkbox" checked={keyScopes.includes(s)} onChange={() => toggleScope(s)} />
                <code>{s}</code>
              </label>
            ))}
          </div>
          <button disabled={busy} onClick={createKey}
            className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50">
            {ar ? 'إنشاء' : 'Create key'}
          </button>

          {newPlaintext && (
            <div className="bg-primary/5 border border-primary/30 rounded-lg p-4 space-y-2">
              <p className="text-xs font-semibold text-on-surface">
                {ar ? 'انسخ هذا المفتاح الآن — لن يُعرض مرة أخرى.' : 'Copy this key now — it will not be shown again.'}
              </p>
              <code className="block text-sm font-mono break-all text-on-surface bg-surface-container-lowest p-2 rounded">{newPlaintext}</code>
            </div>
          )}
        </div>

        {/* ── Keys list ──────────────────────────────────────────── */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface-container border-b border-outline-variant/30">
                  {[ar ? 'الاسم' : 'Name', ar ? 'البادئة' : 'Prefix', ar ? 'الصلاحيات' : 'Scopes', ar ? 'آخر استخدام' : 'Last used', ar ? 'الحالة' : 'Status', ''].map((h, i) => (
                    <th key={i} className="p-3 text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {keys.length === 0 && (
                  <tr><td colSpan={6} className="p-6 text-sm text-on-surface-variant text-center">{ar ? 'لا توجد مفاتيح بعد.' : 'No keys yet.'}</td></tr>
                )}
                {keys.map(k => (
                  <tr key={k.id} className="hover:bg-surface-container-low transition-colors">
                    <td className="p-3 text-sm font-semibold text-on-surface">{k.name}</td>
                    <td className="p-3 text-sm font-mono text-on-surface-variant">{k.key_prefix}…</td>
                    <td className="p-3 text-xs text-on-surface-variant">{(k.scopes ?? []).join(', ')}</td>
                    <td className="p-3 text-xs text-on-surface-variant">{k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : '—'}</td>
                    <td className="p-3">
                      {k.revoked_at
                        ? <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-error/10 text-error">{ar ? 'مُبطَل' : 'Revoked'}</span>
                        : <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary">{ar ? 'نشط' : 'Active'}</span>}
                    </td>
                    <td className="p-3">
                      {!k.revoked_at && (
                        <button onClick={() => revokeKey(k.id)}
                          className="px-3 py-1 rounded-lg border border-error/30 text-xs font-semibold text-error hover:bg-error/5 transition-colors">
                          {ar ? 'إبطال' : 'Revoke'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Create webhook ─────────────────────────────────────── */}
        <div className={cardCls}>
          <h2 className="text-lg font-semibold text-on-surface">{ar ? 'تسجيل webhook' : 'Register webhook'}</h2>
          <input className={inputCls} placeholder="https://example.com/webhook" value={hookUrl} onChange={e => setHookUrl(e.target.value)} />
          <select className={inputCls} value={hookEvent} onChange={e => setHookEvent(e.target.value)}>
            {EVENTS.map(ev => <option key={ev} value={ev}>{ev}</option>)}
          </select>
          <button disabled={busy} onClick={createHook}
            className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50">
            {ar ? 'تسجيل' : 'Register'}
          </button>
        </div>

        {/* ── Webhooks list ──────────────────────────────────────── */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface-container border-b border-outline-variant/30">
                  {[ar ? 'الرابط' : 'URL', ar ? 'الحدث' : 'Event', ar ? 'السر' : 'Secret', ''].map((h, i) => (
                    <th key={i} className="p-3 text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {hooks.length === 0 && (
                  <tr><td colSpan={4} className="p-6 text-sm text-on-surface-variant text-center">{ar ? 'لا توجد webhooks بعد.' : 'No webhooks yet.'}</td></tr>
                )}
                {hooks.map(h => (
                  <tr key={h.id} className="hover:bg-surface-container-low transition-colors">
                    <td className="p-3 text-sm text-on-surface break-all">{h.url}</td>
                    <td className="p-3 text-xs font-mono text-on-surface-variant">{h.event}</td>
                    <td className="p-3 text-xs font-mono text-on-surface-variant break-all">{h.secret}</td>
                    <td className="p-3">
                      <button onClick={() => deleteHook(h.id)}
                        className="px-3 py-1 rounded-lg border border-error/30 text-xs font-semibold text-error hover:bg-error/5 transition-colors">
                        {ar ? 'حذف' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}
