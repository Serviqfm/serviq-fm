// Help Center content: English is the source of truth (src/content/help/en.json);
// Arabic (ar.json) maps by index onto the English arrays. Any missing Arabic
// string falls back to English so a partial translation never breaks a page.
import en from '@/content/help/en.json'
import arRaw from '@/content/help/ar.json'

type Lang = 'en' | 'ar'
type ArModule = {
  short?: string; summary?: string
  steps?: string[][]; fields?: string[][]; perms?: string[]; faq?: string[][]
}
type ArUI = Partial<Record<string, string>> & {
  roles?: string[]; groups?: Record<string, [string, string]>; tags?: Record<string, string>; onboarding?: [string, string][]
}
const ar = arRaw as unknown as { ui: ArUI; modules: Record<string, ArModule> }

export const MODULES = en.modules
export type HelpModule = (typeof en.modules)[number]

const UI_EN = {
  hero_badge: 'INTERNAL · SIGNED-IN USERS ONLY',
  hero_title: 'Help Center',
  hero_body: 'Every ServiqFM module, what it does, and exactly how to use it. Start with the onboarding path, or jump to a module.',
  search_ph: 'Search all guides — “assign a work order”, “PM”, “export CSV”…',
  onboarding_title: 'Start here — first week on ServiqFM',
  onboarding_body: 'Six steps that take a brand-new account from empty to running maintenance. Do them in order.',
  sec_how: 'How to use it',
  sec_fields: 'Field reference',
  sec_fields_note: 'Every field on the create / edit form, in form order.',
  sec_perms: 'Who can do what',
  sec_perms_note: 'Permissions are enforced in the database, not just hidden in the UI.',
  sec_faq: 'Common problems',
  sec_screen: 'The screen',
  sec_related: 'Related modules',
  th_field: 'Field', th_req: 'Required', th_does: 'What it does',
  req: 'Required', opt: 'Optional',
  all_modules: 'All modules', next: 'Next', help_center: 'Help Center',
  cta: 'Open guide', open_in_app: 'Open in app',
  roles: ['Admin', 'Manager', 'Technician', 'Requester'],
}

export function helpUI(lang: Lang) {
  const isAr = lang === 'ar'
  const u = isAr ? { ...UI_EN, open_in_app: 'افتح في التطبيق', ...ar.ui, sec_screen: 'الشاشة' } : UI_EN
  return {
    ...u,
    roles: u.roles as string[],
    results: (n: number, q: string) => isAr ? `${n}${n === 1 ? ' دليل مطابق' : ' أدلة مطابقة'} «${q}»` : `${n} guide${n === 1 ? '' : 's'} match “${q}”`,
    count: (n: number) => isAr ? `${n} وحدات` : `${n} modules`,
    group: (g: string): [string, string] => {
      const local = isAr ? ar.ui.groups?.[g] : null
      return local ?? [g, en.groups.find(x => x.name === g)?.blurb ?? '']
    },
    tag: (t: string) => (isAr && ar.ui.tags?.[t]) || t,
    onboarding: en.onboarding.map((o, i) => {
      const a = isAr ? ar.ui.onboarding?.[i] : null
      return { key: o.key, title: a?.[0] ?? o.title, desc: a?.[1] ?? o.desc }
    }),
  }
}

/** A module with every string resolved to `lang` (English fallback per string). */
export function localizeModule(m: HelpModule, lang: Lang) {
  const a: ArModule | null = lang === 'ar' ? ar.modules[m.key] ?? null : null
  return {
    ...m,
    name: a ? m.ar : m.en,
    altName: a ? m.en : m.ar,
    short: a?.short || m.short,
    summary: a?.summary || m.summary,
    steps: m.steps.map((s, i) => {
      const x = a?.steps?.[i]
      return x ? { t: x[0], d: x[1], tip: x[2] ?? '' } : s
    }),
    fields: m.fields.map((f, i) => {
      const x = a?.fields?.[i]
      return x ? { ...f, name: x[0], desc: x[1] } : f
    }),
    perms: m.perms.map((p, i) => a?.perms?.[i] || p),
    faq: m.faq.map((f, i) => {
      const x = a?.faq?.[i]
      return x ? { q: x[0], a: x[1] } : f
    }),
  }
}

export const TAG_STYLE: Record<string, { bg: string; fg: string }> = {
  'Core':        { bg: 'rgba(40,152,200,0.1)',  fg: '#1A7FC1' },
  'Operations':  { bg: 'rgba(72,184,192,0.12)', fg: '#2E8A90' },
  'Admin only':  { bg: 'rgba(24,40,72,0.08)',   fg: '#182848' },
  'Admin + Mgr': { bg: 'rgba(200,50,76,0.08)',  fg: '#C8324C' },
}
