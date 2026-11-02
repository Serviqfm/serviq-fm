# Serviq FM — Go-Live Checklist (owner actions)

Everything here needs **your** accounts (Apple, Google, Vercel, Supabase, Stripe).
Claude can't log in to those, so each step says exactly where to click.
Tick items off as you go. Last updated: 2 Nov 2026.

Legend: ⬜ todo · ✅ done · ⚠️ important

---

## 1. App stores

Full runbook: [`mobile/STORE-SUBMISSION.md`](../mobile/STORE-SUBMISSION.md).
Store copy (EN + AR): [`mobile/store-listing.md`](../mobile/store-listing.md).
Ready-made assets: `mobile/store-assets/` (Play icon 512×512, feature graphic 1024×500).

### 1a. Apple App Store: check the review result
The iOS build was **submitted for review in August** (App ID `6782810104`, account `maaz.junaidi@gmail.com`).

- ⬜ Open https://appstoreconnect.apple.com → **Apps → Serviq FM → App Store** tab and read the status:
  - **Ready for Distribution** → live. Copy the App Store link for the website (tell Claude, and the welcome page can show an App Store badge).
  - **Pending Developer Release** → approved but waiting on you. Click **Release This Version**.
  - **Rejected** → open **App Review** → **Resolution Center**, copy the message to Claude, and we fix and resubmit.
  - **Waiting for Review / In Review** for more than 2 weeks → contact App Review from the same page.
- ⬜ Check that the **App Review Information** section has a working demo login. Rejections for "can't access content" are the most common.

### 1b. Google Play: first release (never uploaded)
Google requires the **first** release of a new app to be uploaded by hand. After that, `eas submit` can do it.

1. ⬜ **Build the Android bundle**:
   ```bash
   cd mobile && npx eas-cli build --profile production --platform android
   ```
   Download the `.aab` from the EAS build page when it finishes.
2. ⬜ **Create the app**: https://play.google.com/console → **Create app** → name `Serviq FM`, English (US), App, Free.
3. ⬜ **"Set up your app" checklist** (left menu → Dashboard):
   - **App access**: login required. Add a demo email and password (use a demo tenant, not real data).
   - **Ads**: No.
   - **Content rating**: questionnaire → Business/utility → "Everyone".
   - **Target audience**: 18+.
   - **Data safety**: collects name, email, photos (work-order evidence) for app functionality; encrypted in transit; users can request deletion. Privacy policy: `https://www.serviqfm.com/privacy-policy`.
   - **Government apps**: No. **Financial features**: No.
4. ⬜ **Store listing**: paste the copy from `mobile/store-listing.md`, upload `play-store-icon-512.png` and `feature-graphic-1024x500.png`, plus 2–8 phone screenshots (shot list: `mobile/store-assets/screenshot-shotlist.md`).
5. ⬜ **Internal testing** → Create release → upload the `.aab` → roll out → add yourself as a tester → install from the opt-in link and smoke-test.
6. ⬜ **Production** → Create release → reuse the same bundle → **Send for review**.
   ⚠️ Personal developer accounts created after Nov 2023 must run a **closed test with at least 12 testers for 14 days** before Production unlocks. If Play Console shows that requirement, run the closed test first. Organisation accounts are exempt.
7. ⬜ **Automatic uploads from now on**: Play Console → **Setup → API access** → create a Google Cloud service account with "Release manager" permission → download its JSON key → `cd mobile && npx eas-cli credentials` → Android → upload the key. After that: `npx eas-cli submit --profile production --platform android`.

---

## 2. Vercel environment variables

Vercel → project → **Settings → Environment Variables** (set for **Production**, and Preview where noted). Redeploy after changing.

| Variable | Status | What to do |
|---|---|---|
| `SERVIQ_VAT_NUMBER` | ⚠️ ⬜ | **Your real 15-digit ZATCA VAT number.** If it's unset, tenant invoices print the placeholder `300000000000003`, which isn't a valid tax invoice. |
| `CRON_SECRET` | ⬜ check | Must be set, or every scheduled job (PM generation, reports, escalations…) refuses to run. Any long random string. |
| `IMPERSONATION_SIGNING_KEY` | ⬜ optional | Random 32+ characters. Without it, the key is derived from the service-role key; setting it lets you rotate it on its own. |
| `MEDIA_RETENTION_MONTHS` | ⬜ optional | How long photos on **closed** work orders are kept before the purge job deletes them. Default `6`. Pick per your PDPL policy. |
| `ERP_ENCRYPTION_KEY` | ⬜ when using ERP | Encrypts ERP credentials at rest. Generate with `openssl rand -base64 32`. **Don't lose or change it**, or saved ERP credentials can't be decrypted. |
| `STRIPE_*` | ⬜ | See section 3. |

Already set (from earlier sessions; re-check if something misbehaves): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `EXPO_ACCESS_TOKEN`, `PUSH_INTERNAL_SECRET`.

---

## 3. Stripe (self-serve plan payments)

The code is done: checkout, a signature-verified webhook, and plan/billing-status sync onto the organisation. It switches on when these variables exist.

1. ⬜ https://dashboard.stripe.com → finish **account activation** (business details, bank account). Note: check that Stripe supports your Saudi entity. If not, a Stripe Atlas or UAE entity is the usual route, or keep using bank-transfer invoices (already built).
2. ⬜ **Products** → create **Starter** and **Pro**, each with a **monthly recurring price in SAR** → copy each `price_…` ID.
3. ⬜ **Developers → API keys** → copy the **Secret key** (`sk_live_…`).
4. ⬜ **Developers → Webhooks → Add endpoint** → URL `https://www.serviqfm.com/api/webhooks/stripe` → events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed` (the only events the webhook handles) → copy the **Signing secret** (`whsec_…`).
5. ⬜ Add to Vercel: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO` → redeploy.
6. ⬜ Test with Stripe **test mode** keys on a Preview deployment first: buy a plan from **Dashboard → Billing** with card `4242 4242 4242 4242` and confirm the tenant's plan changes.

---

## 4. Vercel firewall (rate limiting) ⚠️ security

The login pages, public request portal and push endpoint have **no rate limit in the app**. This was deliberately left to Vercel's firewall, but there's no record the rules were ever added.

Vercel → project → **Firewall → Configure → New rule**, one per row, action **Rate limit**, keyed by IP:

| Path (starts with) | Limit |
|---|---|
| `/api/requests/submit` | 10 requests / 60 s |
| `/api/upload` | 30 / 60 s |
| `/api/push` | 30 / 60 s |
| `/login` | 20 / 60 s |
| `/api/public/` | 60 / 60 s |
| `/api/procurement/portal` (QR requisition portal) | 20 / 60 s |

Then: ⬜ submit the public request form 11 times quickly and confirm the 11th is blocked (429).

---

## 5. Database disaster-recovery baseline (Supabase)

Right now the database schema exists only in the live project plus loose SQL files. If the project were lost, it couldn't be rebuilt reliably. One-time fix:

```bash
npm i -g supabase
```
```bash
supabase login
```
```bash
supabase link --project-ref cnpsplprnnabhrjjeqwp
```
```bash
supabase db pull
```

- ⬜ Commit the generated `supabase/migrations/*.sql` file (or send it to Claude to commit).
- ⬜ Also turn on **Point-in-Time Recovery** or check daily backups: Supabase → **Database → Backups** (needs the Pro plan).

---

## 6. Scheduled jobs to review and switch on

| Job | Status | Action |
|---|---|---|
| Tenant invoice auto-draft (`0 3 1 * *`, 1st of month) | Already in `vercel.json`, **runs today** | ⬜ Set `SERVIQ_VAT_NUMBER` first (section 2). Drafts aren't sent automatically; you review them in Platform → Tenants → Invoices. |
| Media purge (deletes photos of old closed WOs) | **Off**: destructive, not scheduled | ⬜ Preview first: `curl -H "Authorization: Bearer $CRON_SECRET" "https://www.serviqfm.com/api/cron/media-purge?dry_run=1"`. If the list looks right, ask Claude to add `{ "path": "/api/cron/media-purge", "schedule": "0 3 * * 0" }` to `web/vercel.json`. |

---

## 7. SQL files to run (Supabase → SQL editor)

Run in this order. Each file is safe to run twice.

- ⬜ `SQL Files/w7-01-pm-inactive-periods.sql`: multiple inactive periods per PM schedule.
- ⬜ `SQL Files/w7-02-erp-connectors.sql`: ERP connector credentials and sync references. ⚠️ Run it **right after this PR deploys**, not before: it removes the old page's direct database writes, so the ERP settings page can only save through the new server route. Set `ERP_ENCRYPTION_KEY` in Vercel first.

(Until you run them the rest of the app works normally. PM periods can't be saved, and ERP connectors can't store credentials.)

---

## 8. ERP connectors: test against a sandbox before real use

Oracle Fusion, Dynamics 365 Business Central and Odoo connectors are built, but they've only been tested against simulated responses. Before switching one on for a customer:

- ⬜ Get a **sandbox/trial** of that ERP (Odoo has a free trial; Business Central has a sandbox environment; Oracle needs a test pod from the customer).
- ⬜ Settings → **ERP Integration** → pick the provider → enter the details → **Test connection**.
- ⬜ Create a vendor, send a PO and approve an invoice in Serviq. Check each appears in the ERP and shows **success** in the sync log. Send Claude any **failed** messages; field names may need adjusting for that ERP's setup.
