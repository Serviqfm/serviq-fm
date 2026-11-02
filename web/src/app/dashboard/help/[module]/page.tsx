'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { notFound, useParams } from 'next/navigation'
import { useLanguage } from '@/context/LanguageContext'
import { MODULES, TAG_STYLE, helpUI, localizeModule } from '@/lib/help'

const ROLE_ICONS = [
  { icon: 'admin_panel_settings', color: '#182848' },
  { icon: 'supervisor_account', color: '#2898C8' },
  { icon: 'engineering', color: '#48B8C0' },
  { icon: 'person', color: '#A0B0BF' },
]

function Section({ icon, title, note, children }: { icon: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 38 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: note ? 6 : 16 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 19, color: '#2898C8' }}>{icon}</span>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#182848', margin: 0 }}>{title}</h2>
      </div>
      {note && <p style={{ fontSize: 14, color: '#6A7488', margin: '0 0 16px' }}>{note}</p>}
      {children}
    </section>
  )
}

// Screenshot dropped at public/help/screens/<key>.png. The panel hides itself
// when the file is missing, so guides work before every screen is uploaded.
function Screen({ moduleKey, path, title }: { moduleKey: string; path: string; title: string }) {
  const img = useRef<HTMLImageElement>(null)
  const [missing, setMissing] = useState(false)
  // onError can fire before hydration and be lost; re-check once mounted.
  useEffect(() => { const i = img.current; if (i?.complete && !i.naturalWidth) setMissing(true) }, [moduleKey])
  if (missing) return null
  return (
    <Section icon="desktop_windows" title={title}>
      <div dir="ltr" style={{ background: '#fff', border: '1px solid #E8ECF0', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 2px 0 rgba(24,40,72,0.05)' }}>
        <div style={{ height: 36, display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px', background: '#F0F6FA', borderBottom: '1px solid #E8ECF0' }}>
          {['#E8A2A2', '#E8D2A2', '#A2D8B8'].map(c => <span key={c} style={{ width: 10, height: 10, borderRadius: 999, background: c }} />)}
          <span style={{ marginInlineStart: 12, fontSize: 12, color: '#6A7488', fontFamily: "'JetBrains Mono', Menlo, monospace" }}>{path}</span>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={img} src={`/help/screens/${moduleKey}.png`} alt={title} onError={() => setMissing(true)} style={{ display: 'block', width: '100%', height: 'auto' }} />
      </div>
    </Section>
  )
}

const stack = { display: 'flex', flexDirection: 'column', gap: 2, background: '#E8ECF0', border: '1px solid #E8ECF0', borderRadius: 12, overflow: 'hidden' } as const

export default function HelpGuidePage() {
  const { module: key } = useParams<{ module: string }>()
  const { lang } = useLanguage()
  const isAr = lang === 'ar'
  const idx = MODULES.findIndex(m => m.key === key)
  useEffect(() => { window.scrollTo(0, 0) }, [key])
  if (idx < 0) notFound()

  const ui = helpUI(lang)
  const mod = localizeModule(MODULES[idx], lang)
  const next = MODULES[idx + 1]
  const tag = TAG_STYLE[mod.tag] ?? TAG_STYLE.Core
  const chevron = isAr ? 'chevron_left' : 'chevron_right'
  const fwd = isAr ? 'arrow_back' : 'arrow_forward'
  const back = isAr ? 'arrow_forward' : 'arrow_back'

  return (
    <div style={{ fontFamily: isAr ? 'Readex Pro, sans-serif' : 'DM Sans, sans-serif', color: '#1E2D4E', background: '#F8FBFD', minHeight: '100%' }}>
      <div style={{ maxWidth: 1140, margin: '0 auto', padding: '28px 40px 80px' }}>

        <nav style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#6A7488', marginBottom: 20 }}>
          <Link href="/dashboard/help" style={{ color: '#2898C8', fontWeight: 500 }}>{ui.help_center}</Link>
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#C8D0DC' }}>{chevron}</span>
          <span>{ui.group(mod.group)[0]}</span>
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#C8D0DC' }}>{chevron}</span>
          <span style={{ color: '#182848', fontWeight: 600 }}>{mod.name}</span>
        </nav>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap', marginBottom: 8 }}>
          <span style={{ width: 52, height: 52, borderRadius: 13, background: '#182848', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 28 }}>{mod.icon}</span>
          </span>
          <div style={{ flex: 1, minWidth: 240 }}>
            <h1 style={{ fontSize: 31, fontWeight: 700, color: '#182848', margin: 0, letterSpacing: '-0.02em', lineHeight: 1.25 }}>{mod.name}</h1>
            {!isAr && <div dir="rtl" style={{ fontFamily: 'Readex Pro, sans-serif', fontSize: 15, color: '#A0B0BF', marginTop: 2, width: 'fit-content' }}>{mod.ar}</div>}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', paddingTop: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: tag.fg, background: tag.bg, padding: '5px 11px', borderRadius: 999 }}>{ui.tag(mod.tag)}</span>
            <span dir="ltr" style={{ fontSize: 11, fontWeight: 600, color: '#4A5568', background: '#F0F6FA', border: '1px solid #E8ECF0', padding: '5px 11px', borderRadius: 999, fontFamily: "'JetBrains Mono', Menlo, monospace" }}>{mod.path}</span>
            <Link href={mod.path} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, fontWeight: 600, color: '#2898C8' }}>
              {ui.open_in_app}
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{fwd}</span>
            </Link>
          </div>
        </div>

        <p style={{ fontSize: 17, color: '#4A5568', lineHeight: 1.65, maxWidth: 760, margin: '14px 0 0' }}>{mod.summary}</p>
        <div style={{ height: 1, background: '#E8ECF0', margin: '30px 0 0' }} />

        <Screen key={mod.key} moduleKey={mod.key} path={mod.path} title={ui.sec_screen} />

        <Section icon="footprint" title={ui.sec_how}>
          <div style={stack}>
            {mod.steps.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 16, background: '#fff', padding: '18px 20px' }}>
                <span style={{ width: 26, height: 26, borderRadius: 999, background: 'rgba(40,152,200,0.1)', color: '#2898C8', fontSize: 12.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#182848', marginBottom: 3 }}>{s.t}</div>
                  <div style={{ fontSize: 14, color: '#4A5568', lineHeight: 1.6 }}>{s.d}</div>
                  {s.tip && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, background: '#F0F6FA', borderInlineStart: '3px solid #48B8C0', borderRadius: isAr ? '8px 0 0 8px' : '0 8px 8px 0', padding: '9px 12px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#48B8C0', flexShrink: 0, marginTop: 2 }}>lightbulb</span>
                      <span style={{ fontSize: 13, color: '#303A4E', lineHeight: 1.55 }}>{s.tip}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {mod.fields.length > 0 && (
          <Section icon="table_rows" title={ui.sec_fields} note={ui.sec_fields_note}>
            <div style={{ background: '#fff', border: '1px solid #E8ECF0', borderRadius: 12, overflowX: 'auto', boxShadow: '0 1px 2px 0 rgba(24,40,72,0.05)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                <thead>
                  <tr style={{ background: '#F0F6FA', borderBottom: '1px solid #E8ECF0' }}>
                    {[ui.th_field, ui.th_req, ui.th_does].map(h => (
                      <th key={h} style={{ padding: '12px 16px', textAlign: 'start', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#303A4E', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mod.fields.map((f, i) => (
                    <tr key={i} style={{ borderTop: '1px solid rgba(200,208,220,0.25)' }}>
                      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#182848', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{f.name}</td>
                      <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
                        <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap', background: f.req ? 'rgba(200,50,76,0.1)' : '#F0F6FA', color: f.req ? '#C8324C' : '#6A7488' }}>{f.req ? ui.req : ui.opt}</span>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13.5, color: '#4A5568', lineHeight: 1.55 }}>{f.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        <Section icon="shield_person" title={ui.sec_perms} note={ui.sec_perms_note}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 12 }}>
            {mod.perms.map((can, i) => (
              <div key={i} style={{ background: '#fff', border: '1px solid #E8ECF0', borderRadius: 12, padding: '16px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: ROLE_ICONS[i].color }}>{ROLE_ICONS[i].icon}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#182848' }}>{ui.roles[i]}</span>
                </div>
                <div style={{ fontSize: 13, color: '#4A5568', lineHeight: 1.6 }}>{can}</div>
              </div>
            ))}
          </div>
        </Section>

        {mod.faq.length > 0 && (
          <Section icon="help" title={ui.sec_faq}>
            <div style={stack}>
              {mod.faq.map((f, i) => (
                <div key={i} style={{ background: '#fff', padding: '16px 20px' }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: '#182848', marginBottom: 4 }}>{f.q}</div>
                  <div style={{ fontSize: 14, color: '#4A5568', lineHeight: 1.6 }}>{f.a}</div>
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section icon="link" title={ui.sec_related}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {mod.related.map(k => MODULES.find(m => m.key === k)).filter(r => !!r).map(r => (
              <Link key={r.key} href={`/dashboard/help/${r.key}`}
                className="flex items-center gap-[9px] bg-white border border-[#E8ECF0] rounded-full hover:border-[#A0D0E0] hover:bg-[#F8FBFD]"
                style={{ padding: '9px 16px', paddingInlineStart: 12, fontSize: 13.5, fontWeight: 600, color: '#182848' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#2898C8' }}>{r.icon}</span>
                {isAr ? r.ar : r.en}
              </Link>
            ))}
          </div>
        </Section>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 44, paddingTop: 22, borderTop: '1px solid #E8ECF0', flexWrap: 'wrap' }}>
          <Link href="/dashboard/help" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: '#2898C8' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{back}</span>
            {ui.all_modules}
          </Link>
          {next && (
            <Link href={`/dashboard/help/${next.key}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: '#2898C8' }}>
              {ui.next}: {isAr ? next.ar : next.en}
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{fwd}</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
