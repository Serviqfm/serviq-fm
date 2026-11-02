'use client'

// 1C-27 — add/remove multiple inactive periods (label + start month/day + end
// month/day) on the PM create/edit forms. Each period recurs every year, both ends
// inclusive; end before start wraps the year end (e.g. Dec 20 -> Jan 5).
import type { CSSProperties } from 'react'
import type { InactivePeriod } from './pm-utils'

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

export function emptyInactivePeriod(): InactivePeriod {
  return { label: '', start_month: 1, start_day: 1, end_month: 1, end_day: 31 }
}

export default function InactivePeriodsEditor({
  lang, periods, onChange, fieldStyle, labelStyle,
}: {
  lang: string
  periods: InactivePeriod[]
  onChange: (next: InactivePeriod[]) => void
  fieldStyle: CSSProperties
  labelStyle: CSSProperties
}) {
  const isAr = lang === 'ar'
  const months = isAr ? MONTHS_AR : MONTHS_EN

  function update(i: number, patch: Partial<InactivePeriod>) {
    onChange(periods.map((p, idx) => {
      if (idx !== i) return p
      const next = { ...p, ...patch }
      // Keep the day valid for the chosen month.
      next.start_day = Math.min(next.start_day, MONTH_DAYS[next.start_month - 1])
      next.end_day = Math.min(next.end_day, MONTH_DAYS[next.end_month - 1])
      return next
    }))
  }

  function monthDaySelects(i: number, which: 'start' | 'end') {
    const p = periods[i]
    const month = which === 'start' ? p.start_month : p.end_month
    const day = which === 'start' ? p.start_day : p.end_day
    const days = Array.from({ length: MONTH_DAYS[month - 1] }, (_, k) => k + 1)
    return (
      <div style={{ display: 'flex', gap: 6 }}>
        <select
          aria-label={which === 'start' ? (isAr ? 'شهر البداية' : 'Start month') : (isAr ? 'شهر النهاية' : 'End month')}
          value={month}
          onChange={e => update(i, which === 'start' ? { start_month: Number(e.target.value) } : { end_month: Number(e.target.value) })}
          style={{ ...fieldStyle, flex: 2 }}
        >
          {months.map((m, k) => <option key={k + 1} value={k + 1}>{m}</option>)}
        </select>
        <select
          aria-label={which === 'start' ? (isAr ? 'يوم البداية' : 'Start day') : (isAr ? 'يوم النهاية' : 'End day')}
          value={day}
          onChange={e => update(i, which === 'start' ? { start_day: Number(e.target.value) } : { end_day: Number(e.target.value) })}
          style={{ ...fieldStyle, flex: 1 }}
        >
          {days.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
    )
  }

  return (
    <div style={{ background: '#f9f9f9', border: '1px solid #eee', borderRadius: 8, padding: '1rem' }}>
      <label style={labelStyle}>{isAr ? 'فترات التوقف' : 'Inactive periods'}</label>
      <p style={{ fontSize: 12, color: '#666', margin: '0 0 10px' }}>
        {isAr
          ? 'لا تُنشأ أوامر عمل خلال هذه الفترات (تتكرر سنوياً، شاملة للبداية والنهاية). إذا كانت النهاية قبل البداية فإن الفترة تمتد عبر نهاية السنة. يُستأنف الجدول في اليوم التالي لنهاية الفترة.'
          : 'No work orders are generated during these periods (repeats every year, both dates inclusive). An end before the start wraps the year end. The schedule resumes the day after a period ends.'}
      </p>
      {periods.length === 0 && (
        <p style={{ fontSize: 12, color: '#999', margin: '0 0 10px' }}>
          {isAr ? 'لا توجد فترات توقف.' : 'No inactive periods.'}
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {periods.map((p, i) => (
          <div key={i} style={{ background: 'white', border: '1px solid #eee', borderRadius: 8, padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                value={p.label ?? ''}
                onChange={e => update(i, { label: e.target.value })}
                placeholder={isAr ? 'التسمية (مثال: رمضان، إغلاق صيفي)' : 'Label (e.g. Ramadan, Summer shutdown)'}
                style={{ ...fieldStyle, flex: 1 }}
              />
              <button
                type='button'
                onClick={() => onChange(periods.filter((_, idx) => idx !== i))}
                style={{ background: 'white', color: '#c0392b', border: '1px solid #f0c4c0', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}
              >
                {isAr ? 'إزالة' : 'Remove'}
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ ...labelStyle, fontSize: 12 }}>{isAr ? 'من' : 'From'}</label>
                {monthDaySelects(i, 'start')}
              </div>
              <div>
                <label style={{ ...labelStyle, fontSize: 12 }}>{isAr ? 'إلى (شامل)' : 'To (inclusive)'}</label>
                {monthDaySelects(i, 'end')}
              </div>
            </div>
          </div>
        ))}
      </div>
      <button
        type='button'
        onClick={() => onChange([...periods, emptyInactivePeriod()])}
        style={{ marginTop: 10, background: 'white', color: '#006b54', border: '1px solid #006b54', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
      >
        {isAr ? '+ إضافة فترة توقف' : '+ Add inactive period'}
      </button>
    </div>
  )
}
