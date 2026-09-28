// The QR requisition portal: scan the site's code, prove you hold an official
// mailbox, ask for what you need.
//
// Three steps — email, code, request. Everything the page trusts (the site, the
// stock it may offer, the requester's identity) comes back from the server
// against the QR token and the verified session; this component only draws it.
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Logo } from '@/components/brand/Logo'

type Item = {
  id: string; name: string | null; name_ar: string | null; sku: string | null
  unit: string | null; photo_url: string | null; available: number
}
type Need = { description: string; quantity: string }

const inputCls = 'w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none transition-all placeholder:text-on-surface-variant/40'
const labelCls = 'text-[11px] font-bold uppercase tracking-wider text-secondary'

export default function RequisitionPortalPage() {
  const { token } = useParams<{ token: string }>()

  const [step, setStep] = useState<'email' | 'code' | 'form' | 'done'>('email')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [siteName, setSiteName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reqNumber, setReqNumber] = useState<number | null>(null)

  const [title, setTitle] = useState('')
  const [justification, setJustification] = useState('')
  const [neededBy, setNeededBy] = useState('')
  const [needs, setNeeds] = useState<Need[]>([{ description: '', quantity: '1' }])
  const [items, setItems] = useState<Item[]>([])
  const [cart, setCart] = useState<Record<string, number>>({})
  const [tab, setTab] = useState<'needed' | 'stock'>('needed')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (step !== 'form' || !sessionId) return
    fetch(`/api/public/requisition-portal/items?token=${token}&session=${sessionId}`)
      .then(r => r.json())
      .then(b => setItems(b.items ?? []))
      .catch(() => {})
  }, [step, sessionId, token])

  async function post(path: string, body: unknown) {
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/public/requisition-portal/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...(body as object) }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(out.code === 'stock_short' && out.stock
          ? `${out.stock.item}: only ${out.stock.available} left, you asked for ${out.stock.requested}.`
          : out.error || 'Something went wrong.')
        return null
      }
      return out
    } finally {
      setBusy(false)
    }
  }

  async function sendCode() {
    const out = await post('start', { email })
    if (!out) return
    setSessionId(out.session_id)
    setSiteName(out.site?.name ?? '')
    setStep('code')
  }

  async function checkCode() {
    const out = await post('verify', { session_id: sessionId, code })
    if (out) setStep('form')
  }

  function setQty(item: Item, qty: number) {
    const capped = Math.max(0, Math.min(qty, item.available))
    setCart(prev => {
      const next = { ...prev }
      if (capped === 0) delete next[item.id]
      else next[item.id] = capped
      return next
    })
  }

  const validNeeds = needs.filter(n => n.description.trim() && Number(n.quantity) > 0)
  const cartLines = Object.entries(cart).map(([id, qty]) => ({ item: items.find(i => i.id === id)!, qty }))
    .filter(c => c.item)

  async function submitRequest() {
    if (!title.trim()) { setError('Say what you need in one line.'); return }
    if (validNeeds.length === 0 && cartLines.length === 0) {
      setError('Add at least one item — to order, or from the store.')
      return
    }
    const out = await post('submit', {
      session_id: sessionId,
      title: title.trim(),
      justification: justification || null,
      needed_by: neededBy || null,
      requester_name: name || null,
      lines: [
        ...validNeeds.map(n => ({ description: n.description.trim(), quantity: Number(n.quantity), line_type: 'purchase' })),
        ...cartLines.map(c => ({ item_id: c.item.id, description: c.item.name, quantity: c.qty, line_type: 'stock' })),
      ],
    })
    if (out) { setReqNumber(out.requisition_number ?? null); setStep('done') }
  }

  const filtered = items.filter(i => {
    const q = search.trim().toLowerCase()
    return !q || [i.name, i.name_ar, i.sku].some(v => (v ?? '').toLowerCase().includes(q))
  })

  return (
    <div className="min-h-screen bg-surface px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Logo />
          {siteName && <span className="text-sm text-on-surface-variant">{siteName}</span>}
        </div>

        {step !== 'done' && (
          <div>
            <h1 className="text-2xl font-bold text-on-surface">Request supplies</h1>
            <p className="text-sm text-on-surface-variant mt-1">
              {step === 'email' && 'Use your work email — we will send you a 6-digit code.'}
              {step === 'code' && `If ${email} is a work address, the code is in your inbox.`}
              {step === 'form' && 'Tell us what you need. It goes straight to approval.'}
            </p>
          </div>
        )}

        {error && (
          <div className="bg-error/10 border border-error/20 rounded-lg px-3 py-2 text-error text-sm">{error}</div>
        )}

        {step === 'email' && (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-6 space-y-4">
            <div>
              <label className={labelCls}>Work email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                className={`${inputCls} mt-1.5`} placeholder="you@company.com" autoComplete="email" />
            </div>
            <div>
              <label className={labelCls}>Your name</label>
              <input value={name} onChange={e => setName(e.target.value)}
                className={`${inputCls} mt-1.5`} placeholder="So the approver knows who asked" />
            </div>
            <button onClick={sendCode} disabled={busy || !email.trim()}
              className="w-full bg-primary text-on-primary py-3 rounded-xl font-semibold text-sm disabled:opacity-50">
              {busy ? 'Sending…' : 'Send me a code'}
            </button>
          </div>
        )}

        {step === 'code' && (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-6 space-y-4">
            <div>
              <label className={labelCls}>6-digit code</label>
              <input inputMode="numeric" maxLength={6} value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                className={`${inputCls} mt-1.5 text-center text-2xl tracking-[0.5em]`} placeholder="••••••" />
            </div>
            <button onClick={checkCode} disabled={busy || code.length !== 6}
              className="w-full bg-primary text-on-primary py-3 rounded-xl font-semibold text-sm disabled:opacity-50">
              {busy ? 'Checking…' : 'Continue'}
            </button>
            <button onClick={() => { setStep('email'); setCode('') }}
              className="w-full text-sm text-on-surface-variant hover:text-on-surface">
              Use a different email
            </button>
          </div>
        )}

        {step === 'form' && (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] overflow-hidden">
            <div className="p-6 space-y-4 border-b border-outline-variant/40">
              <div>
                <label className={labelCls}>What do you need? *</label>
                <input value={title} onChange={e => setTitle(e.target.value)}
                  className={`${inputCls} mt-1.5`} placeholder="e.g. Cleaning supplies for level 3" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Needed by</label>
                  <input type="date" value={neededBy} onChange={e => setNeededBy(e.target.value)} className={`${inputCls} mt-1.5`} />
                </div>
                <div>
                  <label className={labelCls}>Why (optional)</label>
                  <input value={justification} onChange={e => setJustification(e.target.value)} className={`${inputCls} mt-1.5`} />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 px-6 border-b border-outline-variant/40">
              {(['needed', 'stock'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-4 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                    tab === t ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant'
                  }`}>
                  {t === 'needed' ? 'Items needed' : 'Consumables in stock'}
                  {t === 'stock' && cartLines.length > 0 && (
                    <span className="ms-2 text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5">{cartLines.length}</span>
                  )}
                </button>
              ))}
            </div>

            {tab === 'needed' && (
              <div className="p-6 space-y-3">
                <p className="text-xs text-on-surface-variant">Anything not kept in the store — describe it and we will buy it.</p>
                {needs.map((n, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input value={n.description} placeholder="e.g. Floor squeegee, 55cm"
                      onChange={e => setNeeds(prev => prev.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))}
                      className={`${inputCls} flex-1`} />
                    <input type="number" min="1" value={n.quantity}
                      onChange={e => setNeeds(prev => prev.map((x, i) => i === idx ? { ...x, quantity: e.target.value } : x))}
                      className={`${inputCls} w-20 text-center`} />
                    <button onClick={() => setNeeds(prev => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx))}
                      disabled={needs.length === 1}
                      className="px-3 rounded-xl text-on-surface-variant hover:text-error disabled:opacity-30">
                      <span className="material-symbols-outlined text-lg">delete</span>
                    </button>
                  </div>
                ))}
                <button onClick={() => setNeeds(prev => [...prev, { description: '', quantity: '1' }])}
                  className="text-primary text-sm font-semibold hover:underline">+ Add another</button>
              </div>
            )}

            {tab === 'stock' && (
              <div className="p-6 space-y-4">
                <p className="text-xs text-on-surface-variant">Kept at this site. Held for you as soon as you send the request.</p>
                <input value={search} onChange={e => setSearch(e.target.value)} className={inputCls}
                  placeholder="Search the store…" />
                {filtered.length === 0 ? (
                  <p className="text-sm text-on-surface-variant text-center py-6">Nothing stocked here yet.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {filtered.map(i => {
                      const qty = cart[i.id] ?? 0
                      const out = i.available === 0
                      return (
                        <div key={i.id} className={`border rounded-xl overflow-hidden flex flex-col ${qty > 0 ? 'border-primary' : 'border-outline-variant'}`}>
                          <div className="aspect-[4/3] bg-surface-container-low flex items-center justify-center overflow-hidden">
                            {i.photo_url
                              // eslint-disable-next-line @next/next/no-img-element
                              ? <img src={i.photo_url} alt={i.name ?? ''} className="w-full h-full object-cover" />
                              : <span className="material-symbols-outlined text-3xl text-outline">inventory_2</span>}
                          </div>
                          <div className="p-3 flex-1 flex flex-col gap-2">
                            <div className="text-sm font-semibold text-on-surface truncate" title={i.name ?? ''}>{i.name}</div>
                            <div className={`text-xs font-semibold ${out ? 'text-error' : 'text-on-surface-variant'}`}>
                              {out ? 'None left' : `${i.available} ${i.unit ?? ''} available`}
                            </div>
                            {qty === 0 ? (
                              <button onClick={() => setQty(i, 1)} disabled={out}
                                className="mt-auto w-full border border-outline-variant rounded-lg py-1.5 text-xs font-semibold text-on-surface-variant disabled:opacity-40">
                                Add
                              </button>
                            ) : (
                              <div className="mt-auto flex items-center justify-between gap-1">
                                <button onClick={() => setQty(i, qty - 1)}
                                  className="w-8 h-8 rounded-lg border border-outline-variant text-on-surface-variant">−</button>
                                <span className="text-sm font-semibold">{qty}</span>
                                <button onClick={() => setQty(i, qty + 1)} disabled={qty >= i.available}
                                  className="w-8 h-8 rounded-lg border border-outline-variant text-on-surface-variant disabled:opacity-40">+</button>
                              </div>
                            )}
                            {qty >= i.available && i.available > 0 && (
                              <span className="text-[11px] text-on-surface-variant">That is all we have.</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="p-6 border-t border-outline-variant/40">
              <button onClick={submitRequest} disabled={busy}
                className="w-full bg-primary text-on-primary py-3 rounded-xl font-semibold text-sm disabled:opacity-50">
                {busy ? 'Sending…' : 'Send request'}
              </button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-8 text-center space-y-3">
            <span className="material-symbols-outlined text-5xl text-primary">check_circle</span>
            <h1 className="text-2xl font-bold text-on-surface">Request sent</h1>
            <p className="text-sm text-on-surface-variant">
              {reqNumber ? `It is REQ #${reqNumber}. ` : ''}
              The approver has been told. Anything you picked from the store is being held for you.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
