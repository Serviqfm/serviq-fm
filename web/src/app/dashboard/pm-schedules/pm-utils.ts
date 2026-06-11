// Shared PM schedule helpers used by the list / detail / new / edit pages.
// The next_due_at roll logic mirrors /api/cron/pm-generate — keep both in sync.

export const FREQ_TO_DAYS: Record<string, number> = {
  daily: 1,
  weekly: 7,
  fortnightly: 14,
  monthly: 30,
  quarterly: 90,
  biannual: 180,
  annual: 365,
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d)
  out.setUTCDate(out.getUTCDate() + days)
  return out
}

// From `from`, advance day-by-day (max 8 iterations) to the next date whose
// UTC weekday is in daysOfWeek (0=Sun .. 6=Sat). Falls back to +7 days.
export function nextDueOnDaysOfWeek(from: Date, daysOfWeek: number[]): Date {
  let next = addDays(from, 1)
  for (let i = 0; i < 8; i++) {
    if (daysOfWeek.includes(next.getUTCDay())) return next
    next = addDays(next, 1)
  }
  return addDays(from, 7)
}

// Cron-style roll-forward: fixed day intervals per frequency, except weekly
// schedules with days_of_week set, which land on the next selected weekday.
export function rollNextDue(from: Date, frequency: string, daysOfWeek?: number[] | null): Date {
  if (frequency === 'weekly' && daysOfWeek && daysOfWeek.length > 0) {
    return nextDueOnDaysOfWeek(from, daysOfWeek)
  }
  return addDays(from, FREQ_TO_DAYS[frequency] ?? 30)
}

export function archiveConfirmMessage(lang: string, count = 1): string {
  if (lang === 'ar') {
    return count > 1
      ? `أرشفة ${count} جدول/جداول نهائياً؟ الأرشفة دائمة ولا يمكن التراجع عنها، ولن يتم إنشاء أوامر عمل من الجداول المؤرشفة. إذا كنت تريد إيقافاً مؤقتاً فقط، استخدم "إيقاف" بدلاً من ذلك.`
      : 'أرشفة هذا الجدول نهائياً؟ الأرشفة دائمة ولا يمكن التراجع عنها، ولن يتم إنشاء أوامر عمل من الجداول المؤرشفة. إذا كنت تريد إيقافاً مؤقتاً فقط، استخدم "إيقاف" بدلاً من ذلك.'
  }
  return count > 1
    ? `Archive ${count} schedule(s) permanently? Archiving cannot be undone and archived schedules stop generating work orders. If you only need a temporary stop, use Pause instead.`
    : 'Archive this schedule permanently? Archiving cannot be undone and archived schedules stop generating work orders. If you only need a temporary stop, use Pause instead.'
}
