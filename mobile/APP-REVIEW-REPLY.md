# App Review: reply to Guideline 2.1 "Information Needed"

Apple paused the 1.0.0 (4) review on 14 Aug 2026 (submission `11f27f61-f557-4dd8-a3e9-373a11577781`).
This was **not a bug rejection**. They want context about the app. No new build is needed.

**What to do:**
1. Record the screen video (Part A) on a physical iPhone running the latest iOS.
2. In App Store Connect → **App Review** → the rejected submission → **Reply to App Review**: attach the video and paste Part B. Fill in the `[brackets]` first.
3. Also paste Part B into **Distribution → App Information → App Review Information → Notes**, and enter the demo login in the **Sign-in required** fields there. Apple asks for this on every future submission.
4. Click **Resubmit to App Review**.

> ⚠️ Never commit the demo password to this repo. Enter it only in App Store Connect.

---

## Part A: screen recording script (about 3–4 minutes)

Use a physical iPhone on the latest iOS. Start recording via Control Center → Screen Recording. Delete and reinstall the app first (TestFlight build 1.0.0 (4)) so the permission prompts appear.

1. **Launch** the app from the home screen; the recording must start here. Show the splash and the login screen.
2. **Login**: sign in with the **technician** demo account. Say or caption: *"Accounts are created by the organisation's administrator. There is no public sign-up."*
3. **Notification prompt** → tap **Allow**. Say or caption: *"Used to notify technicians of newly assigned work orders."*
4. **Home**: show today's tasks and assigned work orders.
5. **Work Orders** → open one → change status to *In Progress* → add a comment → log time.
6. **Photo**: tap add photo → **camera prompt** → **Allow** → take a photo of any object → attach it.
   Then attach from the library → **photo library prompt** → **Allow** → pick a photo.
7. Complete the work order: add completion notes and draw the sign-off signature.
8. **QR scanner**: open the scanner and scan an asset QR code (print one from the web dashboard or show it on another screen) → the asset detail opens.
9. **Assets** → open an asset → show its history. **Locations** → open a floor plan.
10. **Inspections**: run a short inspection checklist.
11. **Language**: Profile → switch to **العربية** → show one screen in Arabic (right-to-left) → switch back.
12. **Account deletion**: Profile → **Delete Account** → show the confirmation dialog. Use a separate throwaway account for this step if you don't want to delete the demo login, or tap Cancel and say so in the notes.
13. **Sign out**.

There are no purchases, subscriptions or public user-generated content, so there is nothing else to show.

---

## Part B: reply text (paste into "Reply to App Review" and into App Review Notes)

```
Hello App Review team,

Thank you for reviewing Serviq FM. Please find the requested information below. A screen recording captured on a physical device is attached.

1. SCREEN RECORDING
Attached. It starts at app launch and shows login, the notification/camera/photo-library permission prompts, the core work-order flow (status update, comments, photos, time logging, signature sign-off), QR asset scanning, assets, floor plans, inspections, Arabic/English switching, and the in-app account deletion flow (Profile > Delete Account).

2. DEVICES AND OS TESTED
[e.g. iPhone 15 Pro, iOS 26.x; iPhone 12, iOS 26.x; iPad (10th gen), iPadOS 26.x]

3. WHAT THE APP DOES AND WHO IT IS FOR
Serviq FM is a business-to-business facility maintenance app (Arabic + English) for organisations in Saudi Arabia and the GCC, such as schools, residential compounds, hotels and retail sites. It is the mobile companion to the Serviq FM web platform (https://www.serviqfm.com).
Target audience: maintenance technicians and facility managers employed by organisations that subscribe to Serviq FM.
Problem it solves: facility teams often track repairs on paper or in chat groups, so jobs get lost and there is no record of what was done. In the app, technicians receive assigned work orders, update their status, attach photo evidence, log time, run inspection checklists, scan QR codes on equipment to see an asset's history, and get a manager's sign-off. Managers see the same data live on the web dashboard.

4. HOW TO ACCESS THE APP
Login is required. There is no public self sign-up: user accounts are created by each organisation's administrator in the web dashboard. We have created a demo organisation with sample sites, assets, work orders, PM tasks and inspections for you:
- Technician account: [email] / [password]  (primary mobile role; please use this one)
- Manager account: [email] / [password]  (can also create and assign work orders)
To test QR scanning, scan this asset QR code: [link to a QR image or PDF from the web dashboard], or open any asset under the Assets tab.
Account deletion: Profile > Delete Account.

5. EXTERNAL SERVICES USED
- Supabase (supabase.com): authentication, database and file storage for work-order photos.
- Expo Push Notification Service (expo.dev), which delivers via Apple Push Notification service: work-order assignment notifications.
- Expo Updates (expo.dev): delivery of JavaScript bug-fix updates.
- Serviq FM web API (www.serviqfm.com): our own backend.
The app has no advertising, analytics/tracking SDKs, payment processing or AI services, and contains no in-app purchases.

6. REGIONAL DIFFERENCES
None. The app works the same in all regions. The user chooses English or Arabic in the app.

7. REGULATED INDUSTRY / THIRD-PARTY MATERIAL
Not applicable. Facility maintenance management is not a regulated industry, and the app contains no protected third-party content. Each organisation's data is private to that organisation.

Kind regards,
Maaz Junaidi, Serviq FM
```
