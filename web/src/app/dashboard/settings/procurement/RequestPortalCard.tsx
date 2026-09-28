// P9: the QR request portal's settings — who may use it, and the codes to print.
//
// Both writes go through /api/procurement/portal (admin only). A manager sees
// the codes and can print them; only an admin changes the allowlist or rotates a
// token, because rotating invalidates every sign already on a wall.
'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { createClient } from '@/lib/supabase'
import { parseDomainList } from '@/lib/requisitionPortal'

type Site = { id: string; name: string | null; requisition_token: string }

export function RequestPortalCard({ orgId, role, isAr }: { orgId: string; role: string; isAr: boolean }) {
  const supabase = createClient()
  const isAdmin = role === 'admin'

  const [sites, setSites] = useState<Site[]>([])
  const [domains, setDomains] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [qr, setQr] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (orgId) load() }, [orgId])

  async function load() {
    const [sRes, oRes] = await Promise.all([
      supabase.from('sites').select('id, name, requisition_token')
        .eq('organisation_id', orgId).order('name'),
      supabase.from('organisations').select('requisition_email_domains').eq('id', orgId).maybeSingle(),
    ])
    if (sRes.error) { setError(sRes.error.message); return }
    const rows = (sRes.data ?? []) as Site[]
    setSites(rows)
    const list = (oRes.data?.requisition_email_domains ?? []) as string[]
    setDomains(list)
    setDraft(list.join(', '))
    await drawAll(rows)
  }

  async function drawAll(rows: Site[]) {
    const out: Record<string, string> = {}
    for (const s of rows) {
      if (!s.requisition_token) continue
      out[s.id] = await QRCode.toDataURL(portalUrl(s.requisition_token), { width: 320, margin: 1 })
    }
    setQr(out)
  }

  function portalUrl(token: string): string {
    const base = typeof window !== 'undefined' ? window.location.origin : ''
    return `${base}/request/requisition/${token}`
  }

  async function saveDomains() {
    setBusy('domains'); setError(''); setSaved(false)
    const list = parseDomainList(draft)
    const res = await fetch('/api/procurement/portal', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domains: list }),
    })
    setBusy('')
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { setError(body.error || 'Could not save.'); return }
    setDomains(body.domains ?? list)
    setDraft((body.domains ?? list).join(', '))
    setSaved(true)
  }

  async function rotate(site: Site) {
    const msg = isAr
      ? `سيتوقف رمز QR المطبوع لموقع ${site.name} عن العمل. متابعة؟`
      : `The printed QR for ${site.name} will stop working. Continue?`
    if (!confirm(msg)) return
    setBusy(site.id); setError('')
    const res = await fetch('/api/procurement/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site_id: site.id }),
    })
    setBusy('')
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { setError(body.error || 'Could not rotate the code.'); return }
    await load()
  }

  function printQr(site: Site) {
    const w = window.open('', '_blank', 'width=600,height=700')
    if (!w) return
    w.document.write(`<!doctype html><title>${site.name ?? 'Site'} — request QR</title>
      <body style="font-family:Arial,sans-serif;text-align:center;padding:40px">
        <h2 style="margin:0 0 4px">${site.name ?? 'Site'}</h2>
        <p style="color:#666;margin:0 0 24px">Scan to request supplies</p>
        <img src="${qr[site.id] ?? ''}" style="width:320px;height:320px" />
        <p style="color:#999;font-size:12px;margin-top:24px">Use your work email</p>
        <script>window.onload = () => window.print()<\/script>
      </body>`)
    w.document.close()
  }

  const cardCls = 'bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6 space-y-4'

  return (
    <div className={cardCls}>
      <div>
        <h2 className="text-sm font-semibold text-on-surface">
          {isAr ? 'بوابة الطلبات عبر QR' : 'QR request portal'}
        </h2>
        <p className="text-xs text-on-surface-variant mt-1">
          {isAr
            ? 'يمسح الموظف رمز الموقع، ويؤكد بريده الرسمي برمز مكوّن من ٦ أرقام، ثم يرسل طلبه إلى سلسلة الموافقات.'
            : 'Staff scan a site code, confirm an official email with a 6-digit code, and their request enters the normal approval chain.'}
        </p>
      </div>

      {error && <div className="bg-error/10 border border-error/20 rounded-lg px-3 py-2 text-error text-sm">{error}</div>}

      <div className="border-t border-outline-variant/40 pt-4">
        <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
          {isAr ? 'نطاقات البريد المسموح بها' : 'Allowed email domains'}
        </label>
        <input value={draft} onChange={e => { setDraft(e.target.value); setSaved(false) }} disabled={!isAdmin}
          placeholder="acme.com, acme.sa"
          className="w-full bg-surface-container-low border border-outline-variant rounded-xl px-3 py-2 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-60" />
        <p className="text-xs text-on-surface-variant mt-1.5">
          {domains.length === 0
            ? (isAr ? 'لا توجد نطاقات — البوابة مغلقة حتى تُضاف نطاقات.' : 'No domains yet — the portal refuses everyone until you add one.')
            : (isAr ? 'مطابقة تامة: النطاقات الفرعية تُضاف بنفسها.' : 'Exact match — add subdomains separately if you use them.')}
        </p>
        {isAdmin && (
          <button onClick={saveDomains} disabled={busy === 'domains'}
            className="mt-3 bg-primary text-on-primary px-4 py-2 rounded-xl font-semibold text-sm disabled:opacity-50">
            {busy === 'domains' ? '…' : saved ? (isAr ? 'تم الحفظ' : 'Saved') : (isAr ? 'حفظ' : 'Save')}
          </button>
        )}
      </div>

      <div className="border-t border-outline-variant/40 pt-4">
        <div className="text-xs font-semibold text-on-surface-variant mb-3">
          {isAr ? 'رمز لكل موقع' : 'One code per site'}
        </div>
        {sites.length === 0 ? (
          <p className="text-sm text-on-surface-variant">{isAr ? 'لا توجد مواقع بعد.' : 'No sites yet.'}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {sites.map(s => (
              <div key={s.id} className="border border-outline-variant rounded-xl p-4 flex gap-4">
                {qr[s.id]
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={qr[s.id]} alt="" className="w-24 h-24 flex-shrink-0" />
                  : <div className="w-24 h-24 bg-surface-container-low rounded flex-shrink-0" />}
                <div className="min-w-0 flex-1 flex flex-col gap-1">
                  <div className="text-sm font-semibold text-on-surface truncate">{s.name}</div>
                  <div className="flex flex-wrap gap-2 mt-auto text-xs font-semibold">
                    <a href={qr[s.id]} download={`${(s.name ?? 'site').replace(/[^\w-]+/g, '-')}-request-qr.png`}
                      className="text-primary hover:underline">{isAr ? 'تنزيل' : 'Download'}</a>
                    <button onClick={() => printQr(s)} className="text-primary hover:underline">
                      {isAr ? 'طباعة' : 'Print'}
                    </button>
                    {isAdmin && (
                      <button onClick={() => rotate(s)} disabled={busy === s.id}
                        className="text-error hover:underline disabled:opacity-50">
                        {busy === s.id ? '…' : (isAr ? 'تجديد الرمز' : 'New code')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
