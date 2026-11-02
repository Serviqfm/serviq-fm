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

// --- 1C-27 — multiple inactive periods per schedule ---
// Rows of pm_schedule_inactive_periods (SQL Files/w7-01-pm-inactive-periods.sql).
// Each period recurs every year, both ends inclusive, and may wrap the year end
// (e.g. Dec 20 -> Jan 5). They combine with the legacy single seasonal ACTIVE window:
// a schedule is inactive on a date if the date is outside the seasonal window OR
// inside any period.
export type InactivePeriod = {
  id?: string
  pm_schedule_id?: string
  label?: string | null
  start_month: number
  start_day: number
  end_month: number
  end_day: number
}

export type SeasonalFields = {
  is_seasonal?: boolean | null
  seasonal_start_month?: number | null
  seasonal_end_month?: number | null
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

// 00:00 UTC of month/day in `year`, clamping the day to the month length (so a
// Feb 29 bound becomes Feb 28 in a non-leap year).
function utcMonthDay(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, Math.min(day, daysInMonth(year, month))))
}

function isValidPeriod(p: InactivePeriod): boolean {
  return [p.start_month, p.end_month].every(m => Number.isInteger(m) && m >= 1 && m <= 12)
    && [p.start_day, p.end_day].every(d => Number.isInteger(d) && d >= 1 && d <= 31)
}

// The occurrence of period `p` that contains `date` (UTC calendar day), as
// [start 00:00, end 00:00] inclusive, or null when `date` is not inside `p`.
function containingOccurrence(date: Date, p: InactivePeriod): { start: Date; end: Date } | null {
  if (!isValidPeriod(p)) return null
  const y = date.getUTCFullYear()
  const day = new Date(Date.UTC(y, date.getUTCMonth(), date.getUTCDate()))
  // Try occurrences starting last year and this year (a wrap-around one starting
  // last year can still cover early-year dates).
  for (const sy of [y - 1, y]) {
    const start = utcMonthDay(sy, p.start_month, p.start_day)
    let end = utcMonthDay(sy, p.end_month, p.end_day)
    if (end < start) end = utcMonthDay(sy + 1, p.end_month, p.end_day)
    if (day >= start && day <= end) return { start, end }
  }
  return null
}

export function isDateInInactivePeriod(date: Date, p: InactivePeriod): boolean {
  return containingOccurrence(date, p) !== null
}

// True when the schedule must not generate on `date`: outside the legacy seasonal
// active window, or inside any inactive period.
export function isScheduleInactiveOn(
  date: Date,
  seasonal: SeasonalFields | null | undefined,
  periods: InactivePeriod[] | null | undefined,
): boolean {
  if (seasonal?.is_seasonal && seasonal.seasonal_start_month && seasonal.seasonal_end_month
      && !isMonthInSeasonalWindow(date.getUTCMonth() + 1, seasonal.seasonal_start_month, seasonal.seasonal_end_month)) {
    return true
  }
  return (periods ?? []).some(p => isDateInInactivePeriod(date, p))
}

// Max jumps / horizon for nextActiveDate. Each jump lands strictly after the
// blocking window, so a schedule that is inactive all year exhausts the horizon
// and returns null instead of looping forever.
const MAX_ACTIVE_JUMPS = 200
const ACTIVE_HORIZON_DAYS = 366 * 5

// Returns `date` unchanged if the schedule is active on it; otherwise the first
// active moment after it (00:00 UTC of the day the blocking window ends + 1, or the
// next seasonal start). Rolls through back-to-back, overlapping and wrap-around
// periods. Returns null when no active date exists within ~5 years (e.g. a period
// covering the whole year) — the caller should then generate nothing.
export function nextActiveDate(
  date: Date,
  seasonal: SeasonalFields | null | undefined,
  periods: InactivePeriod[] | null | undefined,
): Date | null {
  const horizon = addDays(date, ACTIVE_HORIZON_DAYS)
  let cur = new Date(date)
  for (let i = 0; i < MAX_ACTIVE_JUMPS; i++) {
    if (cur > horizon) return null
    if (seasonal?.is_seasonal && seasonal.seasonal_start_month && seasonal.seasonal_end_month
        && !isMonthInSeasonalWindow(cur.getUTCMonth() + 1, seasonal.seasonal_start_month, seasonal.seasonal_end_month)) {
      cur = nextSeasonStart(cur, seasonal.seasonal_start_month)
      continue
    }
    let latestEnd: Date | null = null
    for (const p of periods ?? []) {
      const occ = containingOccurrence(cur, p)
      if (occ && (!latestEnd || occ.end > latestEnd)) latestEnd = occ.end
    }
    if (!latestEnd) return cur
    cur = addDays(latestEnd, 1)
  }
  return null
}

// Batched load of inactive periods for many schedules (one query, no N+1). Tolerates
// the table not existing yet (w7-01 not run) or any read error: returns an empty map,
// i.e. "no periods", so callers keep working.
export async function loadInactivePeriods(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  scheduleIds: string[],
): Promise<Map<string, InactivePeriod[]>> {
  const out = new Map<string, InactivePeriod[]>()
  const ids = Array.from(new Set(scheduleIds.filter(Boolean)))
  if (ids.length === 0) return out
  try {
    const { data, error } = await db
      .from('pm_schedule_inactive_periods')
      .select('id, pm_schedule_id, label, start_month, start_day, end_month, end_day')
      .in('pm_schedule_id', ids)
    if (error || !Array.isArray(data)) return out
    for (const row of data as InactivePeriod[]) {
      if (!row.pm_schedule_id) continue
      const list = out.get(row.pm_schedule_id) ?? []
      list.push(row)
      out.set(row.pm_schedule_id, list)
    }
  } catch {
    // Treat as no periods.
  }
  return out
}

// Missing-relation errors from Postgres (42P01) or PostgREST's schema cache (PGRST205).
function isMissingTableError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  return err.code === '42P01' || err.code === 'PGRST205'
    || (/pm_schedule_inactive_periods/.test(err.message ?? '') && /(does not exist|could not find)/i.test(err.message ?? ''))
}

// Replace the inactive periods of one or more schedules (multi-asset create inserts
// N schedules sharing one set of periods). Rows are org-scoped. Returns an error
// message or null. If the w7-01 table doesn't exist and there is nothing to save
// this is a silent no-op; if there IS something to save the caller gets a clear error.
export async function saveInactivePeriods(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  organisationId: string,
  scheduleIds: string[],
  periods: InactivePeriod[],
  lang: string = 'en',
): Promise<string | null> {
  const ids = scheduleIds.filter(Boolean)
  if (ids.length === 0) return null
  const clean = periods.filter(isValidPeriod)
  const { error: delErr } = await db.from('pm_schedule_inactive_periods').delete().in('pm_schedule_id', ids)
  if (delErr) {
    if (isMissingTableError(delErr)) {
      if (clean.length === 0) return null
      return lang === 'ar'
        ? 'لم يتم حفظ فترات التوقف: يجب تشغيل ملف قاعدة البيانات w7-01-pm-inactive-periods.sql أولاً.'
        : 'Inactive periods were not saved: the database migration w7-01-pm-inactive-periods.sql has not been run yet.'
    }
    return delErr.message ?? String(delErr)
  }
  if (clean.length === 0) return null
  const rows = ids.flatMap(sid => clean.map(p => ({
    organisation_id: organisationId,
    pm_schedule_id: sid,
    label: p.label?.trim() || null,
    start_month: p.start_month,
    start_day: p.start_day,
    end_month: p.end_month,
    end_day: p.end_day,
  })))
  const { error: insErr } = await db.from('pm_schedule_inactive_periods').insert(rows)
  return insErr ? (insErr.message ?? String(insErr)) : null
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
export const DELETE_CLEARABLE_STATUSES = ['new', 'assigned', 'in_progress', 'on_hold'] // all open base states

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
// next_due_at forward from now (past any seasonal window / inactive period) so a stale
// backlog does not fire on the next cron tick.
export async function setPmScheduleActive(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schedule: any,
  active: boolean,
): Promise<void> {
  if (active) {
    // 1C-27: also roll past any inactive periods (empty when w7-01 isn't run).
    const periods = (await loadInactivePeriods(db, [schedule.id])).get(schedule.id) ?? []
    const rolled = rollNextDue(new Date(), schedule.frequency, schedule.days_of_week, schedule)
    const next = (nextActiveDate(rolled, schedule, periods)
      ?? applySeasonalWindow(rolled, schedule.is_seasonal, schedule.seasonal_start_month, schedule.seasonal_end_month)
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
