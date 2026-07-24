// web/src/lib/hijri.ts
// FM-30 — format a Gregorian date as Hijri via Intl (islamic-umalqura calendar).
// App-wide Hijri display is a follow-up (would touch many shared date components);
// this is the standalone helper, used first on the handover detail page.

/**
 * Format a date in the Hijri (Umm al-Qura) calendar.
 * @param date  a Date or ISO string
 * @param ar    true → Arabic-Indic numerals + Arabic month names; false → Latin
 */
export function formatHijri(date: Date | string, ar = false): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '—'
  const locale = ar ? 'ar-SA-u-ca-islamic-umalqura' : 'en-US-u-ca-islamic-umalqura'
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric', month: 'long', year: 'numeric',
  }).format(d)
}
