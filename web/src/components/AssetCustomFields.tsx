// web/src/components/AssetCustomFields.tsx
// AL-02: renders org-defined custom fields on the asset create/edit forms.
// The parent owns the value map (def.key -> string) and passes it back into the
// assets.custom_fields JSONB on submit. Non-def keys in the map are preserved
// untouched (the asset detail Custom Fields tab can add free-form keys).
// Mirrors WorkOrderCustomFields.tsx, restyled with the asset forms' inline styles.
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import { AssetFieldDef, assetFieldLabel } from '@/lib/assetFields'

const fieldStyle = { width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const, background: 'white' }
const labelStyle = { display: 'block' as const, marginBottom: 6, fontSize: 13, fontWeight: 500 as const, color: '#444' }

export default function AssetCustomFields({
  values,
  onChange,
}: {
  values: Record<string, string>
  onChange: (next: Record<string, string>) => void
}) {
  const { lang } = useLanguage()
  const supabase = createClient()
  const [defs, setDefs] = useState<AssetFieldDef[]>([])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
      if (!profile) return
      // RLS scopes to the caller's org. Only active defs render on forms. Table may
      // not exist pre-migration → data null → nothing rendered.
      const { data } = await supabase
        .from('asset_field_defs')
        .select('*')
        .eq('organisation_id', profile.organisation_id)
        .eq('is_active', true)
        .order('sort_order')
      if (alive && data) setDefs(data as AssetFieldDef[])
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (defs.length === 0) return null

  function set(key: string, value: string) {
    onChange({ ...values, [key]: value })
  }

  return (
    <div style={{ border: '1px solid #eee', borderRadius: 8, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <p style={{ margin: 0, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: '#888' }}>
        {lang === 'ar' ? 'حقول مخصصة' : 'Custom Fields'}
      </p>
      {defs.map(def => {
        const val = values[def.key] ?? ''
        const label = assetFieldLabel(def, lang)
        return (
          <div key={def.id}>
            <label style={labelStyle} htmlFor={`acf_${def.key}`}>{label}</label>
            {def.type === 'textarea' ? (
              <textarea id={`acf_${def.key}`} value={val} onChange={e => set(def.key, e.target.value)}
                rows={3} style={{ ...fieldStyle, resize: 'vertical' }} />
            ) : def.type === 'dropdown' ? (
              <select id={`acf_${def.key}`} value={val} onChange={e => set(def.key, e.target.value)} style={fieldStyle}>
                <option value=''>{lang === 'ar' ? 'اختر' : 'Select'}</option>
                {def.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            ) : (
              <input id={`acf_${def.key}`}
                type={def.type === 'number' ? 'number' : def.type === 'date' ? 'date' : 'text'}
                value={val} onChange={e => set(def.key, e.target.value)} style={fieldStyle} />
            )}
          </div>
        )
      })}
    </div>
  )
}
