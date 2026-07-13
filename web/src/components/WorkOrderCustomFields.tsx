// web/src/components/WorkOrderCustomFields.tsx
// WO-26: renders org-defined custom fields on the WO create/edit forms.
// The parent owns the value map (definition.key -> string) and passes it back
// into the work_orders.custom_fields JSONB on submit.
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import { CustomFieldDefinition, fieldLabel } from '@/lib/customFields'

const inputCls = 'w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-on-surface-variant/40'
const labelCls = 'block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5'

export default function WorkOrderCustomFields({
  values,
  onChange,
}: {
  values: Record<string, string>
  onChange: (next: Record<string, string>) => void
}) {
  const { lang } = useLanguage()
  const supabase = createClient()
  const [defs, setDefs] = useState<CustomFieldDefinition[]>([])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
      if (!profile) return
      // RLS scopes to the caller's org. Only active definitions are rendered on forms.
      const { data } = await supabase
        .from('custom_field_definitions')
        .select('*')
        .eq('organisation_id', profile.organisation_id)
        .eq('entity', 'work_order')
        .eq('is_active', true)
        .order('sort_order')
      if (alive && data) setDefs(data as CustomFieldDefinition[])
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (defs.length === 0) return null

  function set(key: string, value: string) {
    onChange({ ...values, [key]: value })
  }

  return (
    <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-4 space-y-4">
      <p className="text-[11px] font-bold uppercase tracking-wider text-secondary">
        {lang === 'ar' ? 'حقول مخصصة' : 'Custom Fields'}
      </p>
      {defs.map(def => {
        const val = values[def.key] ?? ''
        const label = fieldLabel(def, lang)
        return (
          <div key={def.id}>
            <label className={labelCls} htmlFor={`cf_${def.key}`}>{label}</label>
            {def.type === 'textarea' ? (
              <textarea id={`cf_${def.key}`} value={val} onChange={e => set(def.key, e.target.value)}
                rows={3} className={inputCls + ' resize-vertical'} />
            ) : def.type === 'dropdown' ? (
              <select id={`cf_${def.key}`} value={val} onChange={e => set(def.key, e.target.value)} className={inputCls}>
                <option value="">{lang === 'ar' ? 'اختر' : 'Select'}</option>
                {def.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            ) : (
              <input id={`cf_${def.key}`}
                type={def.type === 'number' ? 'number' : def.type === 'date' ? 'date' : 'text'}
                value={val} onChange={e => set(def.key, e.target.value)} className={inputCls} />
            )}
          </div>
        )
      })}
    </div>
  )
}
