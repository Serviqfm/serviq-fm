# ServIQ-FM Mobile — Store Submission Runbook

Step-by-step to ship **Serviq FM** to the Apple App Store and Google Play.

- **iOS strategy:** TestFlight beta → App Store review
- **Android strategy:** Internal testing track → Production
- **Bundle ID / package:** `com.serviqfm.mobile` (both platforms)
- **EAS project:** `@serviqfm/serviqfm-mobile` (`1f2cdd5a-b7b2-4a26-bd36-70f00779e7aa`)
- **Privacy policy:** https://www.serviqfm.com/privacy-policy ✅ live
- **Terms:** https://www.serviqfm.com/terms-of-service ✅ live

Legend: ⬜ todo · ✅ done · 🔵 Claude can do · 🟠 you must do (console/account)

---

## Phase 0 — Pre-flight (mostly done)

- ✅ 🔵 App icons flattened — `icon.png` is 1024×1024 RGB **no alpha** (Apple ITMS-90717 safe)
- ✅ 🔵 `app.json` has name, slug, bundleIdentifier, package, projectId, owner
- ✅ 🔵 EAS project created and linked
- ✅ 🔵 Android preview build verified on a real device (tab-bar + push fixes)
- ⬜ 🟠 Tell Claude your **iPhone model** (determines App Store screenshot resolution)
- ⬜ 🟠 Decide final **store display name**: currently "Serviq FM"

---

## Phase 1 — Production builds (EAS cloud)

> Production builds differ from preview: Android = **AAB** (not APK), iOS = store-signed,
> build numbers auto-increment (`appVersionSource: remote` + `autoIncrement: true`).

### 1a. Android production (AAB)

```bash
cd mobile
npx eas-cli build --profile production --platform android
```

- Reuses the existing Android keystore (already generated).
- Output: an **.aab** file (Android App Bundle) — the format Play Console requires.

### 1b. iOS production

```bash
npx eas-cli build --profile production --platform ios
```

First iOS build prompts for Apple credentials:
- **"Log in to your Apple account"** → your Apple Developer email + password (+ 2FA).
- EAS will offer to **register the bundle ID** `com.serviqfm.mobile` → **Yes**.
- EAS will **create a Distribution certificate + provisioning profile** → **Yes** (let EAS manage).
- Output: a **.ipa** signed for the App Store.

> EAS remembers these credentials for future builds.

---

## Phase 2 — Android: Play Console internal testing

### 2a. Create the app (one-time) 🟠

1. Go to https://play.google.com/console
2. **Create app** →
   - App name: **Serviq FM**
   - Default language: English (US) — add Arabic later if desired
   - App or game: **App**
   - Free or paid: **Free**
   - Accept declarations → **Create app**

### 2b. First-time setup tasks 🟠

Play Console shows a "Set up your app" checklist. Complete:
- **App access** — "All functionality is available without restrictions"? No — login required.
  Provide test credentials: a demo email + password so Google reviewers can sign in.
- **Ads** — Does the app contain ads? **No**
- **Content rating** — fill the questionnaire (utility/business app → likely "Everyone")
- **Target audience** — 18+ (business tool)
- **Data safety** — declare what you collect (email, name; data encrypted in transit;
  used for app functionality). Privacy policy URL: `https://www.serviqfm.com/privacy-policy`
- **Government apps** — No
- **Financial features** — No (unless invoicing counts; it doesn't process payments)

### 2c. Upload the AAB to Internal testing 🟠

1. Left nav → **Testing → Internal testing** → **Create new release**
2. **Upload** the `.aab` from Phase 1a (download from the EAS build page)
3. Release name: `1.0.0 (1)` · Release notes: "Initial internal build."
4. **Save → Review release → Start rollout to Internal testing**
5. **Testers** tab → create an email list → add your own Google account
6. Copy the **opt-in URL**, open it on your Android phone, become a tester, install via Play Store

> Alternative once iOS+Android creds are set: `npx eas-cli submit --profile production --platform android`
> auto-uploads to the internal track (eas.json already targets `internal`).

### 2d. Verify 🟠
- Install from the internal-testing link, sign in, smoke-test the app.

---

## Phase 3 — iOS: TestFlight

### 3a. Create the App Store Connect record (one-time) 🟠

1. Go to https://appstoreconnect.apple.com → **Apps → +** → **New App**
2. Platform: **iOS**
   - Name: **Serviq FM**
   - Primary language: **English (U.S.)**
   - Bundle ID: select **com.serviqfm.mobile** (appears after the Phase 1b build registers it)
   - SKU: `serviqfm-mobile-001` (any unique string)
   - User access: Full
3. **Create**

### 3b. Submit the build to TestFlight 🟠/🔵

```bash
cd mobile
npx eas-cli submit --profile production --platform ios
```

Prompts (first time):
- Apple ID, app-specific password OR App Store Connect API key
- Selects the latest iOS build automatically
- Uploads the `.ipa` to App Store Connect

After upload, Apple "processes" the build (~5–30 min). Then in App Store Connect:
- **TestFlight** tab → the build appears → answer **Export Compliance**:
  - "Does your app use encryption?" → **Yes** (HTTPS) → "Only standard/exempt encryption" → **Yes** (exempt)
- Add yourself as an **Internal Tester** (TestFlight tab → Internal Testing → add your Apple ID)
- Install **TestFlight** app on your iPhone → accept invite → install **Serviq FM**

### 3c. Verify on iPhone 🟠
- Launch, sign in, smoke-test. Capture screenshots here (Phase 4b).

---

## Phase 4 — Store listings (metadata + screenshots)

### 4a. Text content (both stores) 🔵 draft / 🟠 paste

Claude will draft these; you review + paste:
- **Subtitle / short description** (Apple 30 chars / Google 80 chars)
- **Full description** (Apple 4000 / Google 4000)
- **Keywords** (Apple, 100 chars comma-separated)
- **Promotional text** (Apple, 170 chars, optional)
- **Category:** Business (primary) / Productivity (secondary)
- **Support URL:** https://www.serviqfm.com
- **Marketing URL:** https://www.serviqfm.com

### 4b. Screenshots

**Android (Google Play):** 🟠
- Min 2, max 8 phone screenshots. PNG/JPEG, 16:9 or 9:16, 320–3840px.
- Capture on your Android phone (Home, Work Orders, WO detail, Assets, QR scanner).

**iOS (App Store):** 🟠
- Required: **6.7"/6.9" display** screenshots = **1290 × 2796** portrait.
  (Confirm your iPhone model — if it's smaller than 6.7", we resize/pad to 1290×2796.)
- Min 1, recommended 4–6. Capture on iPhone via TestFlight build.
- Feature graphic (Google only): **1024 × 500** — Claude can generate from brand assets. 🔵

### 4c. App icon in stores
- Google Play: **512 × 512** 32-bit PNG. Claude can produce from brand icon. 🔵
- Apple: pulled automatically from the build's 1024 icon (already compliant). ✅

---

## Phase 5 — Submit for review

### Android 🟠
1. Promote the internal release → **Production** (Release → Production → Create release →
   reuse the same AAB → roll out).
2. Google review: hours to a few days for new apps.

### iOS 🟠
1. App Store Connect → your app → **App Store** tab → fill all metadata + screenshots
2. Attach the TestFlight-verified build
3. **Add for Review → Submit**
4. Apple review: ~24–48h typical.

---

## Phase 6 — Release

- **Android:** auto-publishes on approval (or set Managed publishing for manual control).
- **iOS:** choose "Automatically release" or "Manually release" after approval.

---

## Known caveats / gotchas

- **iOS encryption question** — always asked. Standard HTTPS = exempt. Answer Yes → exempt.
- **Apple demo account** — App Review needs working login credentials in the
  "App Review Information" notes, or they reject for "can't access content."
- **Google demo account** — same, under App access.
- **AAB vs APK** — Play Store production requires AAB (production profile already builds AAB).
  The APK you sideloaded is fine for testing but cannot go to the store.
- **Version bumps** — `eas build --profile production` auto-increments build number via EAS.
  Marketing version (`1.0.0`) is set in app.json; bump it manually for feature releases.
- **First-submission scrutiny** — both stores review first releases more strictly. The
  TestFlight + Internal-testing detour exists precisely to catch issues pre-review.
