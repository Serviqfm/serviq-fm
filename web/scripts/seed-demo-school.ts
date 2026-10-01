// @ts-nocheck — one-off seed script; kept out of the strict build typecheck on purpose
// web/scripts/seed-demo-school.ts
// Demo tenant: "Riyadh Future Academy" — a procurement-only school workspace with
// sample data in every procurement module (requisitions, POs, receipts, invoices,
// vendors, inventory, budgets, approval chains, QR portal).
//
// Usage (from web/):
//   npx tsx --env-file=.env.local scripts/seed-demo-school.ts            # create
//   npx tsx --env-file=.env.local scripts/seed-demo-school.ts --reset    # delete tenant + logins
//
// Env: SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY (public key; also NEXT_PUBLIC_SUPABASE_URL
// if not the default project). Login passwords are written to .env.demo-school.local (gitignored).
//
// The workflow is driven through the REAL RPCs (submit_requisition, decide_requisition,
// receive_purchase_order*) signed in as the demo users, so reservations, budget charges,
// stock ledger rows and approval chains are exactly what the app produces. No emails or
// in-app notifications are sent (those live in the API routes, which we bypass).
// ponytail: not idempotent — refuses to run if the tenant exists; use --reset first.

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { writeFileSync } from 'fs'
import { threeWayMatch } from '../src/lib/threeWayMatch'

const ORG_NAME = 'Riyadh Future Academy'
const MAIL = (tag: string) => `sharing.maaz+${tag}@gmail.com`
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cnpsplprnnabhrjjeqwp.supabase.co'
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON = process.env.SUPABASE_ANON_KEY
if (!SERVICE || !ANON) throw new Error('Set SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY')

const opts = { auth: { autoRefreshToken: false, persistSession: false } }
const admin = createClient(URL, SERVICE, opts)

// ponytail: untyped on purpose — a seed script, tsx does not typecheck it
function ok(res: { data?: any; error: { message: string } | null }, ctx: string): any {
  if (res.error) throw new Error(`${ctx}: ${res.error.message}`)
  return res.data
}
const day = 86_400_000
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * day).toISOString()

// ── people ────────────────────────────────────────────────────────────────────
const PEOPLE = [
  { key: 'admin',       tag: 'admin',       name: 'School Admin',        ar: 'مدير النظام',        role: 'admin',     job: 'Operations Director' },
  { key: 'principal',   tag: 'principal',   name: 'Dr. Khalid Al-Otaibi', ar: 'د. خالد العتيبي',   role: 'manager',   job: 'Principal' },
  { key: 'finance',     tag: 'finance',     name: 'Noura Al-Qahtani',    ar: 'نورة القحطاني',      role: 'manager',   job: 'Finance Manager' },
  { key: 'procurement', tag: 'procurement', name: 'Faisal Al-Harbi',     ar: 'فيصل الحربي',        role: 'manager',   job: 'Procurement Officer' },
  { key: 'store',       tag: 'storekeeper', name: 'Saleh Al-Dosari',     ar: 'صالح الدوسري',       role: 'technician', job: 'Storekeeper' },
  { key: 'teacher',     tag: 'teacher',     name: 'Reem Al-Shehri',      ar: 'ريم الشهري',         role: 'requester', job: 'Grade 4 Teacher' },
  { key: 'labs',        tag: 'labs',        name: 'Omar Bakr',           ar: 'عمر بكر',            role: 'requester', job: 'Science Lab Coordinator' },
] as const
type PKey = (typeof PEOPLE)[number]['key']

async function reset() {
  const { data: org } = await admin.from('organisations').select('id').eq('name', ORG_NAME).maybeSingle()
  const { data: users } = await admin.from('users').select('id').in('email', PEOPLE.map(p => MAIL(p.tag)))
  // Child tables hang off organisations with ON DELETE CASCADE; auth users go first
  // so users rows (FK to auth.users) cannot block the org delete.
  for (const u of users ?? []) await admin.auth.admin.deleteUser(u.id)
  if (org) ok(await admin.from('organisations').delete().eq('id', org.id), 'delete org')
  console.log(org ? 'Demo tenant removed.' : 'Nothing to remove.')
}

async function main() {
  if (process.argv.includes('--reset')) return reset()

  const { data: existing } = await admin.from('organisations').select('id').eq('name', ORG_NAME).maybeSingle()
  if (existing) throw new Error(`${ORG_NAME} already exists — run with --reset first`)

  // ── organisation (procurement-only) ─────────────────────────────────────────
  const org = ok(await admin.from('organisations').insert({
    name: ORG_NAME, plan_tier: 'small', plan: 'enterprise', billing_status: 'paid', mrr_cents: 0,
    country: 'SA', timezone: 'Asia/Riyadh', language: 'en', media_retention_months: 6,
    vat_number: '300000000000003', cr_number: '1010000000',
    has_cafm: false, has_procurement: true, purchasing_enabled: true,
    // QR portal: requesters must verify an official e-mail on one of these domains.
    // gmail.com is here so the portal can be demoed with a personal inbox — remove for a real tenant.
    requisition_email_domains: ['riyadhfutureacademy.sa', 'gmail.com'],
  }).select().single(), 'org')
  const orgId: string = org.id
  ok(await admin.from('tenant_feature_flags').insert({ organisation_id: orgId, invoicing: true, multi_site: true, advanced_reporting: true }), 'flags')

  // ── users + logins ──────────────────────────────────────────────────────────
  const uid = {} as Record<PKey, string>
  const pass = {} as Record<PKey, string>
  for (const p of PEOPLE) {
    pass[p.key] = randomBytes(9).toString('base64url') + '#9'
    const au = ok(await admin.auth.admin.createUser({ email: MAIL(p.tag), password: pass[p.key], email_confirm: true }), `auth ${p.tag}`)
    uid[p.key] = au.user!.id
    ok(await admin.from('users').insert({
      id: uid[p.key], organisation_id: orgId, email: MAIL(p.tag), full_name: p.name, full_name_ar: p.ar,
      role: p.role, job_title: p.job, is_active: true, disabled: false, must_change_password: false,
      invited_at: new Date().toISOString(),
    }), `user ${p.tag}`)
  }
  const sess = {} as Record<PKey, SupabaseClient>
  for (const p of PEOPLE) {
    const c = createClient(URL, ANON, opts)
    ok(await c.auth.signInWithPassword({ email: MAIL(p.tag), password: pass[p.key] }), `login ${p.tag}`)
    sess[p.key] = c
  }

  // ── sites ───────────────────────────────────────────────────────────────────
  const sites = ok(await admin.from('sites').insert([
    { organisation_id: orgId, name: 'Main Campus', name_ar: 'الحرم الرئيسي', address: 'King Fahd Road, Al Olaya', city: 'Riyadh', is_active: true },
    { organisation_id: orgId, name: 'Science & Arts Building', name_ar: 'مبنى العلوم والفنون', address: 'Prince Turki Street, Al Malqa', city: 'Riyadh', is_active: true },
  ]).select(), 'sites')
  const main = sites[0], annex = sites[1]

  // ── cost centers + FY2026 budgets ───────────────────────────────────────────
  const ccDefs = [
    { code: 'ACD', name: 'Academic Supplies',    ar: 'المستلزمات الأكاديمية', budget: 60_000 },
    { code: 'LAB', name: 'Science Labs',         ar: 'المختبرات العلمية',      budget: 25_000 },
    { code: 'ICT', name: 'IT & Digital Learning', ar: 'تقنية المعلومات',        budget: 32_000 },
    { code: 'FAC', name: 'Facilities & Cleaning', ar: 'المرافق والنظافة',       budget: 30_000 },
    { code: 'SPT', name: 'Sports & Activities',  ar: 'الرياضة والأنشطة',       budget: 20_000 },
  ]
  const ccRows = ok(await admin.from('cost_centers').insert(ccDefs.map(c => ({
    organisation_id: orgId, name: c.name, name_ar: c.ar, code: c.code, annual_budget: c.budget,
  }))).select(), 'cost centers')
  const cc = Object.fromEntries(ccRows.map(r => [r.code, r.id])) as Record<string, string>
  ok(await admin.from('budget_periods').insert(ccRows.map(r => ({
    organisation_id: orgId, cost_center_id: r.id, period: 'annual',
    starts_on: '2026-01-01', ends_on: '2026-12-31', amount: r.annual_budget,
  }))), 'budgets')

  // ── approval chains (by order total, SAR) ───────────────────────────────────
  const bands = [
    { min: 0,      max: 2000,  steps: [['procurement', 'Procurement Officer']] },
    { min: 2000,   max: 10000, steps: [['procurement', 'Procurement Officer'], ['finance', 'Finance Manager']] },
    { min: 10000,  max: null,  steps: [['procurement', 'Procurement Officer'], ['finance', 'Finance Manager'], ['principal', 'Principal']] },
  ] as const
  for (const b of bands) {
    const rule = ok(await admin.from('procurement_approval_rules')
      .insert({ organisation_id: orgId, min_amount: b.min, max_amount: b.max, is_active: true }).select().single(), 'rule')
    ok(await admin.from('procurement_approval_rule_steps').insert(b.steps.map(([k, label], i) => ({
      organisation_id: orgId, rule_id: rule.id, step_order: i + 1, approver_user_id: uid[k as PKey], label,
    }))), 'rule steps')
  }

  // ── vendors ─────────────────────────────────────────────────────────────────
  const vDefs = [
    { key: 'edu',   en: 'Al Fahad Educational Supplies', ar: 'الفهد للمستلزمات التعليمية', spec: 'Books & classroom supplies', terms: 'Net 30', iban: 'SA0380000000608010167519' },
    { key: 'stat',  en: 'Najd Stationery Trading',       ar: 'نجد للقرطاسية',              spec: 'Stationery & paper',          terms: 'Net 30', iban: 'SA4420000001234567891234' },
    { key: 'lab',   en: 'Riyadh Lab Equipment Co.',      ar: 'الرياض لمعدات المختبرات',    spec: 'Laboratory equipment',        terms: 'Net 45', iban: 'SA5610000012345678900012' },
    { key: 'it',    en: 'TechBridge IT Solutions',       ar: 'تك بريدج لحلول التقنية',     spec: 'IT hardware & AV',            terms: 'Net 30', iban: 'SA7180000000987654321012' },
    { key: 'clean', en: 'Green Oasis Cleaning Supplies', ar: 'الواحة الخضراء لمواد النظافة', spec: 'Cleaning & hygiene',        terms: 'Net 15', iban: 'SA2915000000112233445566' },
    { key: 'sport', en: 'Sports Pro Arabia',             ar: 'سبورتس برو العربية',         spec: 'Sports equipment',            terms: 'Net 30', iban: 'SA1145000000556677889900' },
  ]
  const vRows = ok(await admin.from('vendors').insert(vDefs.map((v, i) => ({
    organisation_id: orgId, company_name: v.en, company_name_ar: v.ar, contact_name: ['Abdullah', 'Mansour', 'Hind', 'Yazeed', 'Lama', 'Turki'][i] + ' (Sales)',
    phone: `+96655000${1000 + i}`, email: `sales+${v.key}@example.com`, specialisation: v.spec, is_active: true,
    vat_number: `3000000000${10000 + i}3`.slice(0, 15), cr_number: `10100${10000 + i}`, average_rating: [4.6, 4.2, 4.8, 4.0, 4.4, 4.5][i],
    payment_terms: v.terms, bank_name: 'Al Rajhi Bank', bank_iban: v.iban, contract_start: '2026-01-01', contract_end: '2026-12-31',
  }))).select(), 'vendors')
  const vendor = Object.fromEntries(vDefs.map((v, i) => [v.key, vRows[i]])) as Record<string, any>

  // ── inventory (4 items deliberately under their minimum → low-stock alerts) ──
  const invDefs: [string, string, string, string, string, number, number, number, string][] = [
    // sku, name, ar, category, unit, stock, min, cost, shelf
    ['STA-001', 'A4 Copy Paper 80gsm', 'ورق تصوير A4', 'Stationery', 'ream', 120, 40, 18.5, 'Shelf A1'],
    ['STA-002', 'Whiteboard Markers (box of 12)', 'أقلام سبورة (علبة 12)', 'Stationery', 'box', 14, 20, 32, 'Shelf A2'],
    ['STA-003', 'Exercise Notebook 80 sheets', 'دفتر 80 ورقة', 'Stationery', 'pcs', 600, 200, 3.2, 'Shelf A3'],
    ['STA-004', 'Printer Toner 85A', 'حبر طابعة 85A', 'Stationery', 'pcs', 3, 5, 245, 'Shelf A4'],
    ['LAB-001', 'Safety Goggles', 'نظارات واقية', 'Laboratory', 'pcs', 60, 30, 14, 'Lab Store B1'],
    ['LAB-002', 'Nitrile Gloves (box of 100)', 'قفازات نتريل (علبة 100)', 'Laboratory', 'box', 18, 15, 38, 'Lab Store B1'],
    ['LAB-003', 'Glass Beaker 250 ml', 'كأس زجاجي 250 مل', 'Laboratory', 'pcs', 45, 20, 9.5, 'Lab Store B2'],
    ['LAB-004', 'Microscope Slides (pack of 72)', 'شرائح مجهر (72)', 'Laboratory', 'pack', 25, 10, 21, 'Lab Store B2'],
    ['ICT-001', 'HDMI Cable 3 m', 'كابل HDMI 3 م', 'IT', 'pcs', 22, 10, 19, 'IT Store C1'],
    ['ICT-002', 'Wireless Mouse', 'فأرة لاسلكية', 'IT', 'pcs', 30, 10, 45, 'IT Store C1'],
    ['ICT-003', 'Projector Lamp', 'مصباح بروجكتر', 'IT', 'pcs', 2, 3, 680, 'IT Store C2'],
    ['FAC-001', 'Hand Sanitiser 5 L', 'معقم أيدي 5 لتر', 'Cleaning', 'can', 26, 12, 55, 'Store D1'],
    ['FAC-002', 'Floor Cleaner 20 L', 'منظف أرضيات 20 لتر', 'Cleaning', 'can', 9, 8, 85, 'Store D1'],
    ['FAC-003', 'Paper Towel Rolls (carton)', 'رولات مناديل (كرتون)', 'Cleaning', 'carton', 40, 15, 62, 'Store D2'],
    ['SPT-001', 'Football Size 5', 'كرة قدم مقاس 5', 'Sports', 'pcs', 24, 10, 70, 'Sports Store E1'],
    ['SPT-002', 'Training Cones (set of 20)', 'قمع تدريب (20)', 'Sports', 'set', 11, 5, 35, 'Sports Store E1'],
    ['SPT-003', 'First-Aid Refill Kit', 'عبوة إسعافات أولية', 'Sports', 'kit', 3, 4, 120, 'Sports Store E2'],
  ]
  const itemRows = ok(await admin.from('inventory_items').insert(invDefs.map(d => ({
    organisation_id: orgId, site_id: main.id, sku: d[0], name: d[1], name_ar: d[2], category: d[3], unit: d[4],
    stock_quantity: d[5], minimum_stock_level: d[6], unit_cost: d[7], location_in_store: d[8], is_active: true,
  }))).select(), 'inventory')
  const item = Object.fromEntries(itemRows.map(r => [r.sku, r])) as Record<string, any>

  // ── requisition helpers ─────────────────────────────────────────────────────
  type Line = { sku?: string; desc?: string; qty: number; cost?: number; stock?: boolean }
  async function makeReq(by: PKey, title: string, why: string, ccCode: string, siteRow: any, lines: Line[], neededInDays = 21): Promise<string> {
    const r = ok(await admin.from('requisitions').insert({
      organisation_id: orgId, title, justification: why, site_id: siteRow.id, cost_center_id: cc[ccCode],
      needed_by: new Date(Date.now() + neededInDays * day).toISOString().slice(0, 10), created_by: uid[by], status: 'draft',
    }).select().single(), `req ${title}`)
    ok(await admin.from('requisition_items').insert(lines.map(l => ({
      organisation_id: orgId, requisition_id: r.id, item_id: l.sku ? item[l.sku].id : null,
      description: l.desc ?? (l.sku ? item[l.sku].name : null), quantity: l.qty,
      unit_cost: l.cost ?? (l.sku ? item[l.sku].unit_cost : 0), line_type: l.stock ? 'stock' : 'purchase',
    }))), `lines ${title}`)
    return r.id
  }
  const submit = async (by: PKey, id: string) => ok(await sess[by].rpc('submit_requisition', { p_id: id }), 'submit')
  const decide = async (by: PKey, id: string, yes: boolean, comment?: string) =>
    ok(await sess[by].rpc('decide_requisition', { p_id: id, p_approve: yes, p_comment: comment ?? null }), 'decide')
  const approveAll = async (id: string, chain: PKey[]) => { for (const k of chain) await decide(k, id, true, 'Approved.') }
  const cancel = async (id: string) =>
    ok(await admin.from('requisitions').update({ status: 'cancelled', decided_at: new Date().toISOString() }).eq('id', id), 'cancel')

  // Same shape as /api/procurement/requisitions/[id]/convert.
  async function convert(reqId: string, v: any, opts2: { send?: boolean } = {}): Promise<string> {
    const req = ok(await admin.from('requisitions').select('site_id, justification, created_by').eq('id', reqId).single(), 'conv req')
    const lines = ok(await admin.from('requisition_items').select('item_id, description, quantity, unit_cost').eq('requisition_id', reqId).eq('line_type', 'purchase'), 'conv lines')
    const po = ok(await admin.from('purchase_orders').insert({
      organisation_id: orgId, created_by: uid.procurement, vendor_id: v.id, site_id: req.site_id, status: 'draft',
      notes: req.justification, expected_at: new Date(Date.now() + 14 * day).toISOString().slice(0, 10), requisition_id: reqId,
    }).select().single(), 'po')
    ok(await admin.from('purchase_order_items').insert(lines.map(l => ({ ...l, organisation_id: orgId, purchase_order_id: po.id }))), 'po items')
    ok(await admin.from('requisitions').update({ status: 'converted', purchase_order_id: po.id }).eq('id', reqId), 'req converted')
    if (opts2.send) await sendPo(po.id, v)
    return po.id
  }
  const sendPo = async (poId: string, v: any, status = 'sent') =>
    ok(await admin.from('purchase_orders').update({
      status, sent_at: new Date().toISOString(), vendor_email_snapshot: v.email, delivery_address: 'Riyadh Future Academy, King Fahd Road, Al Olaya, Riyadh',
    }).eq('id', poId), 'send po')

  // ── requisitions in every state ─────────────────────────────────────────────
  const R: Record<string, string> = {}
  R.draft = await makeReq('teacher', 'Grade 4 reading corner supplies', 'New reading corner for the Grade 4 classrooms.', 'ACD', main, [
    { desc: 'Storage bins (set of 6)', qty: 4, cost: 65 }, { desc: 'Floor cushions', qty: 12, cost: 38 }, { desc: 'Book display shelf', qty: 2, cost: 190 },
  ])

  R.pendingFirst = await makeReq('labs', 'Chemistry lab consumables — Term 2', 'Consumables for Grade 10–12 practicals; current stock covers ~2 weeks.', 'LAB', annex, [
    { sku: 'LAB-001', qty: 40 }, { sku: 'LAB-002', qty: 30 }, { sku: 'LAB-003', qty: 60 }, { sku: 'LAB-004', qty: 20 },
  ])
  await submit('labs', R.pendingFirst)

  R.pendingFinance = await makeReq('teacher', 'Interactive display parts & accessories', 'Two smartboards have faulty touch frames; cables and mice for the new computer room.', 'ICT', main, [
    { desc: 'Interactive display touch frame', qty: 2, cost: 2400 }, { sku: 'ICT-001', qty: 15 }, { sku: 'ICT-002', qty: 20 },
  ])
  await submit('teacher', R.pendingFinance); await decide('procurement', R.pendingFinance, true, 'Specs verified with IT.')

  R.approved = await makeReq('teacher', 'Replacement projectors — Grades 7–9', 'Eight classroom projectors are past end of life (lamp hours exceeded).', 'ICT', main, [
    { desc: 'Short-throw projector 4000 lumens', qty: 8, cost: 3100 },
  ], 30)
  await submit('teacher', R.approved); await approveAll(R.approved, ['procurement', 'finance', 'principal'])

  R.sent = await makeReq('teacher', 'Term 2 textbooks & library books', 'Curriculum textbooks plus 120 library titles for the new reading programme.', 'ACD', main, [
    { desc: 'Grade 4 Arabic textbook set', qty: 90, cost: 38 }, { desc: 'Grade 4 Math textbook set', qty: 90, cost: 44 }, { desc: 'Library fiction titles (assorted)', qty: 120, cost: 12 },
  ])
  await submit('teacher', R.sent); await approveAll(R.sent, ['procurement', 'finance'])
  const poSent = await convert(R.sent, vendor.edu, { send: true })

  R.received = await makeReq('procurement', 'Annual cleaning supplies restock', 'Restock before the new term; sanitiser and floor cleaner below planned levels.', 'FAC', main, [
    { sku: 'FAC-001', qty: 40 }, { sku: 'FAC-002', qty: 20 }, { sku: 'FAC-003', qty: 30 },
  ])
  await submit('procurement', R.received); await approveAll(R.received, ['procurement', 'finance'])
  const poReceived = await convert(R.received, vendor.clean, { send: true })
  ok(await sess.store.rpc('receive_purchase_order', { p_po_id: poReceived }), 'receive full')

  R.partial = await makeReq('teacher', 'Sports day & science fair equipment', 'Equipment for the annual sports day and tables for the science fair.', 'SPT', main, [
    { sku: 'SPT-001', qty: 30 }, { sku: 'SPT-002', qty: 15 }, { desc: 'Folding tables 180 cm', qty: 6, cost: 340 },
  ])
  await submit('teacher', R.partial); await approveAll(R.partial, ['procurement', 'finance'])
  const poPartial = await convert(R.partial, vendor.sport, { send: true })
  const partLines = ok(await admin.from('purchase_order_items').select('id, item_id, description').eq('purchase_order_id', poPartial), 'po lines')
  const qtyFor = (l: any) => (l.item_id === item['SPT-001'].id ? 30 : l.item_id === item['SPT-002'].id ? 10 : 0)
  ok(await sess.store.rpc('receive_purchase_order_lines', {
    p_po_id: poPartial,
    p_lines: partLines.filter(l => qtyFor(l) > 0).map(l => ({ purchase_order_item_id: l.id, qty_received: qtyFor(l), condition: 'ok', bin_location: 'Sports Store E1', note: 'Cones: 5 sets on backorder' })),
  }), 'receive partial')

  R.rejected = await makeReq('teacher', 'Executive leather chairs — admin office', 'Replace six chairs in the administration office.', 'ACD', main, [
    { desc: 'Executive leather chair', qty: 6, cost: 1450 },
  ])
  await submit('teacher', R.rejected); await decide('procurement', R.rejected, true, 'Request is clear.')
  await decide('finance', R.rejected, false, 'Outside approved FY2026 furniture allocation — please re-quote standard ergonomic chairs.')

  R.cancelled = await makeReq('labs', 'Microscope slides (duplicate request)', 'Raised twice by mistake.', 'LAB', annex, [{ sku: 'LAB-004', qty: 40 }])
  await submit('labs', R.cancelled); await cancel(R.cancelled)

  // stock requisitions: issued, pending (reserved), and issued-then-cancelled (returned)
  R.stockIssued = await makeReq('teacher', 'Grade 5 classroom markers & paper', 'Term start restock for Grade 5 classrooms.', 'ACD', main, [
    { sku: 'STA-002', qty: 6, stock: true }, { sku: 'STA-001', qty: 10, stock: true },
  ], 3)
  await submit('teacher', R.stockIssued); await decide('procurement', R.stockIssued, true, 'Issued from store.')

  R.stockPending = await makeReq('labs', 'Grade 10 practical — gloves & goggles', 'Practical session next week.', 'LAB', annex, [
    { sku: 'LAB-002', qty: 6, stock: true }, { sku: 'LAB-001', qty: 20, stock: true },
  ], 7)
  await submit('labs', R.stockPending)

  R.stockReturned = await makeReq('teacher', 'Sports day cones', 'Sports day marking cones.', 'SPT', main, [{ sku: 'SPT-002', qty: 4, stock: true }], 5)
  await submit('teacher', R.stockReturned); await decide('procurement', R.stockReturned, true, 'OK.')
  // ponytail: NOT cancelled here. Cancel-after-issue needs procurement-10-stock-returns.sql, which prod lacked on 2026-10-01;
  // without it the stock is not returned. Once it is applied: await cancel(R.stockReturned) to demo the stock return.

  // QR-portal requisition: no login, verified email, created_by NULL
  const portal = ok(await admin.from('requisitions').insert({
    organisation_id: orgId, title: 'Art room supplies', justification: 'Submitted via the campus QR requisition portal.',
    site_id: annex.id, cost_center_id: cc.ACD, created_by: null, status: 'draft',
    requester_name: 'Hessa Al-Mutairi', requester_email: 'hessa.almutairi@riyadhfutureacademy.sa',
    needed_by: new Date(Date.now() + 10 * day).toISOString().slice(0, 10),
  }).select().single(), 'portal req')
  ok(await admin.from('requisition_items').insert([
    { organisation_id: orgId, requisition_id: portal.id, description: 'Acrylic paint set (24 colours)', quantity: 10, unit_cost: 48, line_type: 'purchase' },
    { organisation_id: orgId, requisition_id: portal.id, description: 'Canvas boards 30×40 cm (pack of 10)', quantity: 6, unit_cost: 55, line_type: 'purchase' },
  ]), 'portal lines')
  ok(await admin.rpc('submit_portal_requisition', { p_id: portal.id }), 'portal submit')
  R.portal = portal.id

  // ── direct purchase orders (no requisition) ─────────────────────────────────
  async function directPo(v: any, status: string, lines: { sku?: string; desc?: string; qty: number; cost?: number }[], note: string) {
    const po = ok(await admin.from('purchase_orders').insert({
      organisation_id: orgId, created_by: uid.procurement, vendor_id: v.id, site_id: main.id, status: 'draft', notes: note,
      expected_at: new Date(Date.now() + 10 * day).toISOString().slice(0, 10),
    }).select().single(), 'direct po')
    ok(await admin.from('purchase_order_items').insert(lines.map(l => ({
      organisation_id: orgId, purchase_order_id: po.id, item_id: l.sku ? item[l.sku].id : null,
      description: l.desc ?? item[l.sku!].name, quantity: l.qty, unit_cost: l.cost ?? item[l.sku!].unit_cost,
    }))), 'direct po lines')
    if (status !== 'draft') await sendPo(po.id, v, status)
    return po.id
  }
  const poDraft = await directPo(vendor.stat, 'draft', [{ sku: 'STA-001', qty: 100 }, { sku: 'STA-003', qty: 400 }], 'Quarterly paper & notebook order')
  const poTransit = await directPo(vendor.lab, 'in_transit', [{ sku: 'LAB-003', qty: 100 }, { sku: 'LAB-004', qty: 30 }], 'Lab glassware top-up')
  await directPo(vendor.it, 'acknowledged', [{ sku: 'ICT-003', qty: 4 }, { sku: 'STA-004', qty: 6 }], 'Projector lamps & toner (low-stock replenishment)')

  // ── vendor invoices (+ real 3-way match) ────────────────────────────────────
  async function invoice(poId: string, v: any, num: string, status: string, daysAgo: number, billed: 'asOrdered' | 'full', lines?: { poItemId: string; desc: string; qty: number; price: number }[]) {
    const poi = ok(await admin.from('purchase_order_items').select('id, description, quantity, unit_cost, item:item_id(name)').eq('purchase_order_id', poId), 'inv po items')
    const ls = lines ?? poi.map((l: any) => ({ poItemId: l.id, desc: l.item?.name ?? l.description, qty: Number(l.quantity), price: Number(l.unit_cost) }))
    const sub = ls.reduce((s, l) => s + l.qty * l.price, 0)
    const inv = ok(await admin.from('vendor_invoices').insert({
      organisation_id: orgId, vendor_id: v.id, purchase_order_id: poId, invoice_number: num, amount: sub, vat_amount: Math.round(sub * 15) / 100,
      invoice_date: iso(daysAgo).slice(0, 10), status,
    }).select().single(), 'invoice')
    ok(await admin.from('vendor_invoice_lines').insert(ls.map(l => ({
      organisation_id: orgId, vendor_invoice_id: inv.id, purchase_order_item_id: l.poItemId, description: l.desc, quantity: l.qty, unit_price: l.price,
    }))), 'invoice lines')
    const grs = ok(await admin.from('goods_receipts').select('lines:goods_receipt_lines(purchase_order_item_id, qty_received, condition)').eq('purchase_order_id', poId), 'grs')
    const received: Record<string, number> = {}
    for (const g of grs) for (const l of (g.lines ?? []) as any[]) if (l.condition === 'ok') received[l.purchase_order_item_id] = (received[l.purchase_order_item_id] ?? 0) + Number(l.qty_received)
    const result = {
      ...threeWayMatch({
        poLines: poi.map((l: any) => ({ id: l.id, description: l.item?.name ?? l.description, quantity: Number(l.quantity), unit_cost: Number(l.unit_cost) })),
        receivedByPoLine: received,
        invoiceLines: ls.map(l => ({ purchase_order_item_id: l.poItemId, description: l.desc, quantity: l.qty, unit_price: l.price })),
        invoiceTotal: sub,
      }),
      matchedAt: new Date().toISOString(),
    }
    ok(await admin.from('vendor_invoices').update({ match_status: result.status, match_detail: result }).eq('id', inv.id), 'store match')
    return inv.id
  }
  await invoice(poReceived, vendor.clean, 'GOC-2026-0388', 'paid', 12, 'asOrdered')   // clean match
  await invoice(poPartial, vendor.sport, 'SPA-INV-7741', 'pending', 5, 'full')           // billed full qty, only part received → mismatch
  await invoice(poSent, vendor.edu, 'AFES-2026-0412', 'pending', 2, 'asOrdered')         // goods not received yet → mismatch
  await invoice(poTransit, vendor.lab, 'RLE-2026-0097', 'pending', 1, 'asOrdered')

  // ── spread dates so the reports have a trend (shifts whole records together) ─
  const shifts: [string, number][] = [
    [R.received, 38], [R.partial, 21], [R.sent, 12], [R.rejected, 17], [R.cancelled, 15],
    [R.stockIssued, 9], [R.stockReturned, 6], [R.approved, 4], [R.pendingFinance, 3], [R.pendingFirst, 1],
  ]
  for (const [id, d] of shifts) {
    const r = ok(await admin.from('requisitions').select('purchase_order_id, created_at, submitted_at, decided_at').eq('id', id).single(), 'shift get')
    const back = (t: string | null) => (t ? new Date(new Date(t).getTime() - d * day).toISOString() : null)
    ok(await admin.from('requisitions').update({ created_at: back(r.created_at), submitted_at: back(r.submitted_at), decided_at: back(r.decided_at) }).eq('id', id), 'shift req')
    const aps = ok(await admin.from('requisition_approvals').select('id, created_at, acted_at').eq('requisition_id', id), 'shift aps')
    for (const a of aps) ok(await admin.from('requisition_approvals').update({ created_at: back(a.created_at), acted_at: back(a.acted_at) }).eq('id', a.id), 'shift ap')
    if (r.purchase_order_id) {
      const po = ok(await admin.from('purchase_orders').select('created_at, sent_at, received_at').eq('id', r.purchase_order_id).single(), 'shift po get')
      // PO is raised ~2 days after the requisition decision, receipt ~6 days after sending
      ok(await admin.from('purchase_orders').update({ created_at: back(po.created_at), sent_at: back(po.sent_at), received_at: back(po.received_at) }).eq('id', r.purchase_order_id), 'shift po')
      const grs = ok(await admin.from('goods_receipts').select('id, received_at, created_at').eq('purchase_order_id', r.purchase_order_id), 'shift grs')
      for (const g of grs) ok(await admin.from('goods_receipts').update({ received_at: back(g.received_at), created_at: back(g.created_at) }).eq('id', g.id), 'shift gr')
    }
  }
  void poDraft

  // ── credentials ─────────────────────────────────────────────────────────────
  const out = ['# Riyadh Future Academy demo logins — https://serviqfm.com/login/client', ...PEOPLE.map(p => `${p.job.padEnd(26)} ${MAIL(p.tag)}  ${pass[p.key]}`)]
  writeFileSync('.env.demo-school.local', out.join('\n') + '\n')
  console.log(`Seeded ${ORG_NAME} (${orgId}). Logins written to web/.env.demo-school.local`)
  console.log('Portal URLs:', sites.map(s => `${s.name}: /request/requisition/${s.requisition_token}`).join(' | '))
}

main().catch(e => { console.error('SEED FAILED:', e.message); process.exit(1) })
