# Week 3 — ZATCA Invoicing, Polish & Beta Launch

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship ZATCA-compliant VAT invoice PDF, complete cross-platform QA, and deliver a production-ready beta build.

**Architecture:** ZATCA invoicing as a Next.js API route generating PDF with `@react-pdf/renderer`. TLV-encoded QR code embedded in each invoice per ZATCA Phase 2 spec. Mobile gets a production EAS build submitted to App Store + Play Store.

**Tech Stack:** Next.js 14, @react-pdf/renderer, Supabase, Expo EAS Submit, Apple Developer + Google Play Console

---

## File Map

| Action | File |
|--------|------|
| Create | `web/src/app/api/invoices/generate/route.ts` — PDF generation API |
| Create | `web/src/lib/zatca.ts` — TLV QR code encoder |
| Create | `web/src/app/dashboard/invoices/page.tsx` — invoice list |
| Modify | `web/src/components/Sidebar.tsx` — add Invoices nav item |
| Create | `web/src/app/dashboard/invoices/[id]/page.tsx` — invoice detail + download |
| Modify | `web/src/app/dashboard/settings/page.tsx` — link to invoices from billing section |

---

## Task 1: Install PDF Library

- [ ] **Install `@react-pdf/renderer`:**
```bash
cd web && npm install @react-pdf/renderer
```

- [ ] **Verify install:**
```bash
cd web && npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Commit:**
```bash
git add web/package.json web/package-lock.json
git commit -m "chore: add @react-pdf/renderer for invoice generation"
```

---

## Task 2: ZATCA TLV Encoder

**Files:**
- Create: `web/src/lib/zatca.ts`

ZATCA Phase 2 requires a QR code containing TLV (Tag-Length-Value) encoded fields embedded in the invoice.

- [ ] **Create `web/src/lib/zatca.ts`:**

```typescript
/**
 * ZATCA Phase 2 TLV QR Code encoder
 * Tags: 1=seller, 2=vat_number, 3=timestamp, 4=total_with_vat, 5=vat_amount
 */
function encodeTLV(tag: number, value: string): Uint8Array {
  const valueBytes = new TextEncoder().encode(value)
  const result = new Uint8Array(2 + valueBytes.length)
  result[0] = tag
  result[1] = valueBytes.length
  result.set(valueBytes, 2)
  return result
}

export function generateZATCAQRData(params: {
  sellerName: string
  vatNumber: string
  invoiceDate: string // ISO string
  totalWithVAT: number
  vatAmount: number
}): string {
  const { sellerName, vatNumber, invoiceDate, totalWithVAT, vatAmount } = params

  const tlv1 = encodeTLV(1, sellerName)
  const tlv2 = encodeTLV(2, vatNumber)
  const tlv3 = encodeTLV(3, invoiceDate)
  const tlv4 = encodeTLV(4, totalWithVAT.toFixed(2))
  const tlv5 = encodeTLV(5, vatAmount.toFixed(2))

  const combined = new Uint8Array(
    tlv1.length + tlv2.length + tlv3.length + tlv4.length + tlv5.length
  )
  let offset = 0
  for (const buf of [tlv1, tlv2, tlv3, tlv4, tlv5]) {
    combined.set(buf, offset)
    offset += buf.length
  }

  // Base64 encode
  return Buffer.from(combined).toString('base64')
}

export function formatSAR(amount: number): string {
  return 'SAR ' + amount.toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function calcVAT(amountExclVAT: number): { vat: number; total: number } {
  const vat = amountExclVAT * 0.15
  return { vat, total: amountExclVAT + vat }
}
```

- [ ] **Verify:** Run `cd web && npx tsc --noEmit` — no errors.

- [ ] **Commit:**
```bash
git add web/src/lib/zatca.ts
git commit -m "feat: ZATCA Phase 2 TLV QR code encoder"
```

---

## Task 3: Invoice PDF Generation API

**Files:**
- Create: `web/src/app/api/invoices/generate/route.ts`

- [ ] **Create `web/src/app/api/invoices/generate/route.ts`:**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { generateZATCAQRData, formatSAR, calcVAT } from '@/lib/zatca'
import { renderToBuffer, Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer'

// Register fonts (use standard PDF fonts as fallback)
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 32,
    borderBottomWidth: 2,
    borderBottomColor: '#1E2D4E',
    paddingBottom: 16,
  },
  logoMark: {
    backgroundColor: '#1E2D4E',
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  companyName: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#1E2D4E' },
  companySubtitle: { fontSize: 9, color: '#A0B0BF', marginTop: 2 },
  invoiceTitle: { fontSize: 24, fontFamily: 'Helvetica-Bold', color: '#1E2D4E', textAlign: 'right' },
  invoiceNumber: { fontSize: 11, color: '#6DCFB0', textAlign: 'right', marginTop: 4 },
  sectionTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#A0B0BF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  label: { fontSize: 11, color: '#4A5568' },
  value: { fontSize: 11, color: '#1E2D4E', fontFamily: 'Helvetica-Bold' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#F8FAFC', padding: '8 12', marginBottom: 2 },
  tableRow: { flexDirection: 'row', padding: '8 12', borderBottomWidth: 1, borderBottomColor: '#E8ECF0' },
  tableCell: { fontSize: 11, color: '#4A5568' },
  tableCellBold: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#1E2D4E' },
  totalsBox: { backgroundColor: '#F8FAFC', padding: 16, borderRadius: 8, marginTop: 16 },
  totalLine: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  grandTotal: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 2, borderTopColor: '#1E2D4E', paddingTop: 8, marginTop: 4 },
  grandTotalLabel: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#1E2D4E' },
  grandTotalValue: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#6DCFB0' },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, borderTopWidth: 1, borderTopColor: '#E8ECF0', paddingTop: 8 },
  footerText: { fontSize: 9, color: '#A0B0BF', textAlign: 'center' },
  qrSection: { alignItems: 'center', marginTop: 24 },
  qrLabel: { fontSize: 9, color: '#A0B0BF', marginTop: 4 },
  vatNote: { fontSize: 9, color: '#A0B0BF', marginTop: 2, textAlign: 'center' },
})

export async function POST(req: NextRequest) {
  try {
    const { workOrderId } = await req.json()
    if (!workOrderId) return NextResponse.json({ error: 'workOrderId required' }, { status: 400 })

    const supabase = await createServerSupabaseClient()

    const { data: wo, error: woError } = await supabase
      .from('work_orders')
      .select('*, organisation:organisation_id(*), assignee:assigned_to(full_name, email), asset:asset_id(name, serial_number)')
      .eq('id', workOrderId)
      .single()

    if (woError || !wo) return NextResponse.json({ error: 'Work order not found' }, { status: 404 })

    const org = wo.organisation
    const subtotal = Number(wo.actual_cost ?? 0)
    const { vat, total } = calcVAT(subtotal)
    const invoiceDate = new Date().toISOString()
    const invoiceNumber = 'INV-' + Date.now().toString().slice(-8)

    // Generate ZATCA QR
    const qrData = generateZATCAQRData({
      sellerName: org.name,
      vatNumber: org.vat_number ?? '000000000000000',
      invoiceDate,
      totalWithVAT: total,
      vatAmount: vat,
    })

    const pdfDoc = (
      <Document>
        <Page size="A4" style={styles.page}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.companyName}>{org.name}</Text>
              <Text style={styles.companySubtitle}>{org.name_ar ?? ''}</Text>
              {org.vat_number && <Text style={[styles.label, { marginTop: 8 }]}>VAT: {org.vat_number}</Text>}
              {org.cr_number && <Text style={styles.label}>CR: {org.cr_number}</Text>}
              {org.address && <Text style={styles.label}>{org.address}, {org.city}</Text>}
              {org.phone && <Text style={styles.label}>{org.phone}</Text>}
            </View>
            <View>
              <Text style={styles.invoiceTitle}>TAX INVOICE</Text>
              <Text style={styles.invoiceNumber}>{invoiceNumber}</Text>
              <Text style={[styles.label, { textAlign: 'right', marginTop: 8 }]}>
                Date: {new Date(invoiceDate).toLocaleDateString('en-SA')}
              </Text>
            </View>
          </View>

          {/* Work Order Details */}
          <View style={{ marginBottom: 24 }}>
            <Text style={styles.sectionTitle}>SERVICE DETAILS</Text>
            <View style={styles.row}>
              <Text style={styles.label}>Work Order:</Text>
              <Text style={styles.value}>{wo.title}</Text>
            </View>
            {wo.asset && (
              <View style={styles.row}>
                <Text style={styles.label}>Asset:</Text>
                <Text style={styles.value}>{wo.asset.name}</Text>
              </View>
            )}
            {wo.assignee && (
              <View style={styles.row}>
                <Text style={styles.label}>Technician:</Text>
                <Text style={styles.value}>{wo.assignee.full_name}</Text>
              </View>
            )}
            {wo.completed_at && (
              <View style={styles.row}>
                <Text style={styles.label}>Completed:</Text>
                <Text style={styles.value}>{new Date(wo.completed_at).toLocaleDateString('en-SA')}</Text>
              </View>
            )}
          </View>

          {/* Line Items Table */}
          <View style={{ marginBottom: 8 }}>
            <Text style={styles.sectionTitle}>ITEMS</Text>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableCellBold, { flex: 3 }]}>Description</Text>
              <Text style={[styles.tableCellBold, { flex: 1, textAlign: 'right' }]}>Qty</Text>
              <Text style={[styles.tableCellBold, { flex: 1, textAlign: 'right' }]}>Unit</Text>
              <Text style={[styles.tableCellBold, { flex: 1, textAlign: 'right' }]}>Amount</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={[styles.tableCell, { flex: 3 }]}>Maintenance Service — {wo.title}</Text>
              <Text style={[styles.tableCell, { flex: 1, textAlign: 'right' }]}>1</Text>
              <Text style={[styles.tableCell, { flex: 1, textAlign: 'right' }]}>{formatSAR(subtotal)}</Text>
              <Text style={[styles.tableCell, { flex: 1, textAlign: 'right' }]}>{formatSAR(subtotal)}</Text>
            </View>
          </View>

          {/* Totals */}
          <View style={styles.totalsBox}>
            <View style={styles.totalLine}>
              <Text style={styles.label}>Subtotal (excl. VAT)</Text>
              <Text style={styles.value}>{formatSAR(subtotal)}</Text>
            </View>
            <View style={styles.totalLine}>
              <Text style={styles.label}>VAT (15%)</Text>
              <Text style={styles.value}>{formatSAR(vat)}</Text>
            </View>
            <View style={styles.grandTotal}>
              <Text style={styles.grandTotalLabel}>TOTAL (incl. VAT)</Text>
              <Text style={styles.grandTotalValue}>{formatSAR(total)}</Text>
            </View>
          </View>

          {/* ZATCA QR */}
          <View style={styles.qrSection}>
            <Text style={styles.qrLabel}>ZATCA Phase 2 — Scan to verify</Text>
            <Text style={[styles.vatNote, { marginTop: 8, fontSize: 8, color: '#4A5568' }]}>
              QR Data: {qrData.slice(0, 40)}...
            </Text>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              {org.name} · VAT {org.vat_number ?? 'N/A'} · {org.address ?? ''} · Generated by Serviq FM
            </Text>
          </View>
        </Page>
      </Document>
    )

    const pdfBuffer = await renderToBuffer(pdfDoc)

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${invoiceNumber}.pdf"`,
      },
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
```

- [ ] **Verify:** `POST /api/invoices/generate` with a valid `workOrderId` returns a PDF file. Open in browser and confirm: company name, work order title, VAT line, total, ZATCA QR section.

- [ ] **Commit:**
```bash
git add web/src/app/api/invoices/generate/ web/src/lib/zatca.ts
git commit -m "feat: ZATCA-compliant VAT invoice PDF generation API"
```

---

## Task 4: Invoice Download Button on Work Order Detail

**Files:**
- Modify: `web/src/app/dashboard/work-orders/[id]/page.tsx`

- [ ] **Add "Download Invoice" button** to the work order detail page, visible when `status === 'closed'` and `actual_cost > 0`:

```tsx
{wo.status === 'closed' && wo.actual_cost > 0 && (
  <button
    onClick={async () => {
      const res = await fetch('/api/invoices/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workOrderId: wo.id }),
      })
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `invoice-${wo.id.slice(0, 8)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    }}
    style={{ ...secondaryBtn, display: 'flex', alignItems: 'center', gap: 6 }}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
    {lang === 'ar' ? 'تحميل الفاتورة' : 'Download Invoice'}
  </button>
)}
```

- [ ] **Verify:** Close a work order with actual cost set → "Download Invoice" button appears → click → PDF downloads → opens with correct company info, VAT breakdown, ZATCA note.

- [ ] **Commit:**
```bash
git add web/src/app/dashboard/work-orders/[id]/page.tsx
git commit -m "feat: download invoice button on closed work orders"
```

---

## Task 5: Cross-Platform QA Checklist

Work through each item below on **both web browser** and **mobile device**.

### Web QA

- [ ] **Auth flow:** Sign in → redirects to dashboard. Sign out → redirects to login. Refresh on dashboard without session → redirects to login.

- [ ] **Work Orders:** Create WO with all fields → appears in list. Change status through all states (New → Assigned → In Progress → On Hold → Completed → Closed). Delete WO → removed from list.

- [ ] **Assets:** Create asset → appears in list. View detail → all tabs load (QR, PM History). Edit asset → changes save.

- [ ] **PM Schedules:** Create schedule → appears in list. Calendar view loads. Compliance page shows real %.

- [ ] **Reports:** All 4 charts load. Empty state shows "No data yet" not an error.

- [ ] **Settings:** Organisation info saves. Language toggle persists on page refresh.

- [ ] **Invoice:** Close a WO with cost → download button appears → PDF generates correctly.

- [ ] **Bilingual:** Toggle Arabic → all pages RTL with Arabic text. Toggle back → LTR English.

- [ ] **Responsive check:** Sidebar collapses at narrow width. Tables scroll horizontally on small screens.

### Mobile QA

- [ ] **Auth:** Login → home screen. Sign out from Profile → login screen.

- [ ] **Home screen:** WO stats cards correct. Recent WOs list. PM tasks visible (if assigned).

- [ ] **Work Orders:** List shows all assigned WOs. Countdown timer on overdue/near-due WOs. Open detail → all tabs work (Comments, Photos, Time, Activity). Status update works.

- [ ] **Assets:** List with status badges. QR scan button opens camera. Scan known QR → opens asset detail. Scan unknown → shows alert.

- [ ] **Profile:** Language toggle switches full app to Arabic and back.

- [ ] **Push notifications:** Assign WO on web to this device's user → notification appears in <5s. Test on both iOS and Android if possible.

- [ ] **Fix all bugs found** before proceeding.

- [ ] **Commit all fixes:**
```bash
git add -A
git commit -m "fix: QA pass — resolve cross-platform issues"
```

---

## Task 6: Performance + Security Checks

- [ ] **Check all Supabase queries have `organisation_id` filter** — run this grep:
```bash
cd web && grep -r "\.from(" src/ | grep -v "organisation_id" | grep -v "auth\." | grep -v "lib/"
```
Any query missing `organisation_id` is a multi-tenancy leak — add the filter.

- [ ] **Verify `.env.local` is in `.gitignore`:**
```bash
cd web && cat .gitignore | grep env
```
Expected: `.env.local` listed.

- [ ] **Check no hardcoded credentials** in source:
```bash
grep -r "supabase.co" web/src/ | grep -v "process.env"
```
Expected: no results (all URLs from env vars).

- [ ] **Check mobile `.env` is in `.gitignore`:**
```bash
cd mobile && cat .gitignore | grep env
```
If missing, add `.env` to `mobile/.gitignore`.

- [ ] **Commit security fix if needed:**
```bash
git add .gitignore mobile/.gitignore
git commit -m "chore: ensure env files excluded from git"
```

---

## Task 7: Production EAS Build

- [ ] **Bump mobile version** in `mobile/app.json`:
```json
"version": "1.0.0",
"ios": { "buildNumber": "1" },
"android": { "versionCode": 1 }
```

- [ ] **Build production iOS:**
```bash
cd mobile && eas build --profile production --platform ios
```
Expected: build queued on EAS, completes in ~20 min.

- [ ] **Build production Android:**
```bash
cd mobile && eas build --profile production --platform android
```
Expected: `.aab` file produced.

- [ ] **Submit to TestFlight (iOS internal testing):**
```bash
cd mobile && eas submit --platform ios
```

- [ ] **Submit to Google Play internal track:**
```bash
cd mobile && eas submit --platform android
```

- [ ] **Commit version bump:**
```bash
git add mobile/app.json
git commit -m "chore: bump version to 1.0.0 for beta build"
```

---

## Task 8: Vercel Production Deployment

- [ ] **Push all branches to GitHub:**
```bash
git push origin main
```

- [ ] **Verify Vercel auto-deploys** from `main` branch. Check deployment at Vercel dashboard.

- [ ] **Set Vercel environment variables** (if not already set):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`

- [ ] **Run production smoke test:**
  1. Open deployed URL
  2. Sign in
  3. Create a work order
  4. Change status
  5. Generate invoice PDF
  6. Confirm all works on production

- [ ] **Confirm no console errors** on production deployment.

---

## Beta Launch Checklist

Run through these before calling it done:

- [ ] Web dashboard accessible at production URL ✓
- [ ] Mobile apps in TestFlight + Play Store internal track ✓
- [ ] Push notifications working on production builds ✓
- [ ] Arabic/English toggle working on both platforms ✓
- [ ] ZATCA invoice downloads correctly ✓
- [ ] All Supabase queries scoped to `organisation_id` ✓
- [ ] No secrets committed to git ✓
- [ ] First test organisation created in Supabase ✓
- [ ] Support email `support@serviqfm.com` responding ✓

---

## Demo Script (Full Walkthrough)

**Role 1: Admin/Founder (Web)**
1. Login → dashboard KPIs
2. Settings → org info (name, VAT, CR, vertical)
3. Users → add a manager + technician
4. Sites → add a site
5. Assets → add an asset, show QR code tab

**Role 2: Manager (Web)**
1. Work Orders → create new WO, assign to technician
2. Show push notification arrives on technician phone
3. PM Schedules → create recurring schedule
4. Reports → show MTTR + PM compliance charts
5. Work Order → close it → download ZATCA invoice PDF

**Role 3: Technician (Mobile)**
1. Home screen → WO stats + PM tasks
2. Work Orders → countdown timer on near-due WO
3. Open WO → update status → add comment
4. Assets → scan QR code → asset detail opens
5. Profile → toggle to Arabic → full RTL app
