'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useLanguage } from '@/context/LanguageContext'
import { MODULES, TAG_STYLE, helpUI, localizeModule } from '@/lib/help'

const GROUP_ORDER = ['Every day', 'Planned work', 'Setup', 'People', 'Money', 'Governance']

export default function HelpCenterPage() {
  const { lang } = useLanguage()
  const isAr = lang === 'ar'
  const ui = helpUI(lang)
  const [q, setQ] = useState('')
  const mods = MODULES.map(m => localizeModule(m, lang))
  const term = q.trim().toLowerCase()
  const fwd = isAr ? 'arrow_back' : 'arrow_forward'

  const results = term ? mods.flatMap(m => {
    const hay = [m.en, m.ar, m.short, m.summary, m.path,
      ...m.steps.map(s => s.t + ' ' + s.d), ...m.fields.map(f => f.name + ' ' + f.desc), ...m.faq.map(f => f.q + ' ' + f.a)]
    const hit = hay.find(h => h.toLowerCase().includes(term))
    return hit ? [{ m, hit: hit.length > 150 ? hit.slice(0, 150) + '…' : hit }] : []
  }) : []

  return (
    <div style={{ fontFamily: isAr ? 'Readex Pro, sans-serif' : 'DM Sans, sans-serif', color: '#1E2D4E', background: '#F8FBFD', minHeight: '100%' }}>
      {/* Hero */}
      <div style={{ background: '#1E2D4E', position: 'relative', overflow: 'hidden', padding: '56px 40px 52px' }}>
        <div style={{ position: 'absolute', top: -160, right: -160, width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle, rgba(109,207,176,0.14) 0%, transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -140, left: -100, width: 440, height: 440, borderRadius: '50%', background: 'radial-gradient(circle, rgba(26,127,193,0.14) 0%, transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 1140, margin: '0 auto', position: 'relative' }}>
          <div style={{ display: 'inline-flex', background: 'rgba(109,207,176,0.12)', border: '1px solid rgba(109,207,176,0.28)', color: '#6DCFB0', fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', padding: '6px 16px', borderRadius: 999, marginBottom: 22 }}>{ui.hero_badge}</div>
          <h1 style={{ fontSize: 38, fontWeight: 700, color: '#fff', margin: '0 0 10px', letterSpacing: '-0.02em', lineHeight: 1.2 }}>{ui.hero_title}</h1>
          <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.6)', margin: '0 0 30px', maxWidth: 640, lineHeight: 1.6 }}>{ui.hero_body}</p>
          <div style={{ position: 'relative', maxWidth: 560 }}>
            <span className="material-symbols-outlined" style={{ position: 'absolute', insetInlineStart: 16, top: 13, color: 'rgba(255,255,255,0.45)', fontSize: 20 }}>search</span>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={ui.search_ph} aria-label={ui.search_ph}
              className="placeholder:text-white/40"
              style={{ width: '100%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.18)', color: '#fff', fontSize: 15, padding: '13px 16px', paddingInlineStart: 46, borderRadius: 10, outline: 'none', fontFamily: 'inherit' }} />
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1140, margin: '0 auto', padding: '36px 40px 72px' }}>
        {term ? (
          <div style={{ marginBottom: 40 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6A7488', marginBottom: 14 }}>{ui.results(results.length, q.trim())}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 14 }}>
              {results.map(({ m, hit }) => (
                <Link key={m.key} href={`/dashboard/help/${m.key}`} className="block bg-white border border-[#E8ECF0] rounded-xl hover:border-[#A0D0E0] hover:shadow-[0_4px_24px_rgba(30,45,78,0.10)] transition-all" style={{ padding: '16px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#2898C8' }}>{m.icon}</span>
                    <span style={{ fontSize: 15, fontWeight: 600, color: '#182848' }}>{m.name}</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#4A5568', lineHeight: 1.55 }}>{hit}</div>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Onboarding */}
            <div style={{ background: '#fff', border: '1px solid #E8ECF0', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(24,40,72,0.08),0 2px 4px -2px rgba(24,40,72,0.04)', marginBottom: 44 }}>
              <div style={{ height: 4, background: 'linear-gradient(90deg,#6DCFB0 0%,#3AAECC 50%,#1A7FC1 100%)' }} />
              <div style={{ padding: '26px 28px 28px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#3AAECC', fontVariationSettings: "'FILL' 1" }}>rocket_launch</span>
                  <h2 style={{ fontSize: 20, fontWeight: 700, color: '#182848', margin: 0 }}>{ui.onboarding_title}</h2>
                </div>
                <p style={{ fontSize: 14, color: '#4A5568', margin: '0 0 22px' }}>{ui.onboarding_body}</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 2, background: '#E8ECF0', border: '1px solid #E8ECF0', borderRadius: 12, overflow: 'hidden' }}>
                  {ui.onboarding.map((s, i) => (
                    <Link key={s.key} href={`/dashboard/help/${s.key}`} className="block bg-white hover:bg-[#F8FBFD]" style={{ padding: 18 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <span style={{ width: 24, height: 24, borderRadius: 999, background: '#182848', color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#182848' }}>{s.title}</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: '#4A5568', lineHeight: 1.55 }}>{s.desc}</div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {/* Module groups */}
            {GROUP_ORDER.map(g => {
              const items = mods.filter(m => m.group === g)
              if (!items.length) return null
              const [name, blurb] = ui.group(g)
              return (
                <div key={g} style={{ marginBottom: 36 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
                    <h3 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#182848', margin: 0 }}>{name}</h3>
                    <span style={{ flex: 1, height: 1, background: '#E8ECF0' }} />
                    <span style={{ fontSize: 12, color: '#A0B0BF' }}>{ui.count(items.length)}</span>
                  </div>
                  <p style={{ fontSize: 13, color: '#6A7488', margin: '0 0 16px' }}>{blurb}</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(258px,1fr))', gap: 14 }}>
                    {items.map(m => {
                      const tag = TAG_STYLE[m.tag] ?? TAG_STYLE.Core
                      return (
                        <Link key={m.key} href={`/dashboard/help/${m.key}`}
                          className="flex flex-col bg-white border border-[#E8ECF0] rounded-xl transition-all hover:border-[#A0D0E0] hover:-translate-y-0.5 hover:shadow-[0_4px_24px_rgba(30,45,78,0.10)]"
                          style={{ padding: 18, boxShadow: '0 1px 2px 0 rgba(24,40,72,0.05)' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
                            <span style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(40,152,200,0.1)', color: '#2898C8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 21 }}>{m.icon}</span>
                            </span>
                            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: tag.fg, background: tag.bg, padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>{ui.tag(m.tag)}</span>
                          </div>
                          <div style={{ fontSize: 15, fontWeight: 600, color: '#182848', marginBottom: 2 }}>{m.name}</div>
                          {!isAr && <div dir="rtl" style={{ fontFamily: 'Readex Pro, sans-serif', fontSize: 12, color: '#A0B0BF', marginBottom: 8, alignSelf: 'flex-start' }}>{m.ar}</div>}
                          <div style={{ fontSize: 13, color: '#4A5568', lineHeight: 1.55, flex: 1 }}>{m.short}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 14, fontSize: 12.5, fontWeight: 600, color: '#2898C8' }}>
                            {ui.cta}
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{fwd}</span>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
