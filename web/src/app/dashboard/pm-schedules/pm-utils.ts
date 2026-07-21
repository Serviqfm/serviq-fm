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

// 1C-10 recurrence config: arbitrary interval N + unit, with optional
// day-of-month anchoring. When set it overrides the FREQ_TO_DAYS preset model
// and uses true calendar math (month/year add via setUTCMonth — no 30d/365d drift).
export type Recurrence = {
  interval_count?: number | null
  interval_unit?: string | null   // 'day' | 'week' | 'month' | 'year'
  anchor_day?: number | null      // day-of-month 1-31 (month/year units only)
}

// Add N calendar months to d, clamping the day to the last valid day of the
// target month (e.g. Jan 31 + 1 month = Feb 28/29, not Mar 3).
export function addMonths(d: Date, months: number): Date {
  const out = new Date(d)
  const day = out.getUTCDate()
  out.setUTCDate(1)
  out.setUTCMonth(out.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate()
  out.setUTCDate(Math.min(day, lastDay))
  return out
}

// Advance `from` by one interval using explicit interval_count + interval_unit.
// anchor_day (if set, month/year only) forces the day-of-month, clamped to the
// month length. Returns null when the recurrence isn't fully specified.
export function rollByInterval(from: Date, rec: Recurrence): Date | null {
  const n = rec.interval_count
  const unit = rec.interval_unit
  if (!n || n <= 0 || !unit) return null
  let next: Date
  switch (unit) {
    case 'day': next = addDays(from, n); break
    case 'week': next = addDays(from, n * 7); break
    case 'month': next = addMonths(from, n); break
    case 'year': next = addMonths(from, n * 12); break
    default: return null
  }
  if ((unit === 'month' || unit === 'year') && rec.anchor_day && rec.anchor_day >= 1 && rec.anchor_day <= 31) {
    const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate()
    next.setUTCDate(Math.min(rec.anchor_day, lastDay))
  }
  return next
}

// Cron-style roll-forward. Precedence: explicit interval config (1C-10) →
// weekly days_of_week → fixed FREQ_TO_DAYS preset.
export function rollNextDue(from: Date, frequency: string, daysOfWeek?: number[] | null, rec?: Recurrence | null): Date {
  if (rec) {
    const byInterval = rollByInterval(from, rec)
    if (byInterval) return byInterval
  }
  if (frequency === 'weekly' && daysOfWeek && daysOfWeek.length > 0) {
    return nextDueOnDaysOfWeek(from, daysOfWeek)
  }
  return addDays(from, FREQ_TO_DAYS[frequency] ?? 30)
}

// --- Seasonal / inactive-window helpers (1C-04) ---
// Months are 1-12. A window may wrap the year end, e.g. Oct(10)–Apr(4) is active
// Oct, Nov, Dec, Jan, Feb, Mar, Apr.
export function isMonthInSeasonalWindow(month: number, startMonth: number, endMonth: number): boolean {
  if (startMonth <= endMonth) return month >= startMonth && month <= endMonth
  return month >= startMonth || month <= endMonth
}

// The next date at day-1 00:00 of startMonth on/after `from` — used to resume a
// seasonal schedule at the start of its next active window when a due date falls in
// the inactive period.
export function nextSeasonStart(from: Date, startMonth: number): Date {
  const out = new Date(from)
  out.setUTCDate(1)
  out.setUTCHours(0, 0, 0, 0)
  out.setUTCMonth(startMonth - 1)
  if (out <= from) out.setUTCFullYear(out.getUTCFullYear() + 1)
  return out
}

// If `date` falls outside the seasonal window, return the next in-window resume date;
// otherwise return `date` unchanged. No-op when the schedule isn't seasonal.
export function applySeasonalWindow(
  date: Date,
  isSeasonal: boolean | null | undefined,
  startMonth: number | null | undefined,
  endMonth: number | null | undefined,
): Date {
  if (!isSeasonal || !startMonth || !endMonth) return date
  const month = date.getUTCMonth() + 1
  if (isMonthInSeasonalWindow(month, startMonth, endMonth)) return date
  return nextSeasonStart(date, startMonth)
}

// --- 1C-16 / 1C-17 — schedule-lifecycle side effects on generated work orders ---
// Pausing or deleting a schedule must not strand its already-generated OPEN work
// orders. The app has no "cancel" WO status and CORE-20 blocks a browser
// new->closed transition, so the only way to retire a never-actioned auto WO is to
// DELETE it (DELETE is not gated by the BEFORE UPDATE lifecycle trigger). Filtering
// on both pm_schedule_id AND source='pm_schedule' never touches a hand-made WO, and
// completed/closed WOs are always left for history (schedule delete SET NULLs their
// pm_schedule_id — see sprint-j-01).
export const PAUSE_CLEARABLE_STATUSES = ['new', 'assigned']              // never started
export const DELETE_CLEARABLE_STATUSES = ['new', 'assigned', 'in_progress']

// Delete this schedule's open auto-generated WOs in the given states. Accepts one id
// or many (bulk delete). Must run BEFORE the schedule row is removed, since deleting
// it SET NULLs pm_schedule_id and the WOs become unfindable by schedule.
export async function clearOpenGeneratedWorkOrders(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  scheduleIds: string | string[],
  statuses: string[],
): Promise<void> {
  const ids = (Array.isArray(scheduleIds) ? scheduleIds : [scheduleIds]).filter(Boolean)
  if (ids.length === 0) return
  await db.from('work_orders').delete()
    .in('pm_schedule_id', ids)
    .eq('source', 'pm_schedule')
    .in('status', statuses)
}

// Toggle is_active with the 1C-16 side effects: pausing cancels never-started auto
// WOs so a paused schedule stops cluttering the queue; resuming rebaselines
// next_due_at forward from now (past any seasonal inactive window) so a stale
// backlog does not fire on the next cron tick.
export async function setPmScheduleActive(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schedule: any,
  active: boolean,
): Promise<void> {
  if (active) {
    const next = applySeasonalWindow(
      rollNextDue(new Date(), schedule.frequency, schedule.days_of_week, schedule),
      schedule.is_seasonal, schedule.seasonal_start_month, schedule.seasonal_end_month,
    ).toISOString()
    await db.from('pm_schedules').update({ is_active: true, next_due_at: next }).eq('id', schedule.id)
  } else {
    await clearOpenGeneratedWorkOrders(db, schedule.id, PAUSE_CLEARABLE_STATUSES)
    await db.from('pm_schedules').update({ is_active: false }).eq('id', schedule.id)
  }
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
