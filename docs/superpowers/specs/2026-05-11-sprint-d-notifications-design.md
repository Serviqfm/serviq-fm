# Sprint D — Welcome Emails + Push/Email Notification Audit

**Date:** 2026-05-11  
**Scope:** Full implementation of 18+ notification types across 5 categories (Work Orders, Purchase Orders, Parts/Inventory, Reports)  
**Estimated effort:** 2–3 days  
**Email provider:** Resend (replaces Nodemailer)  

---

## Overview

Sprint D implements a comprehensive notification system with 18+ user-configurable notification types, covering:
- Welcome emails for new users
- Work Order lifecycle notifications (creation, assignment, status changes, overdue alerts)
- Request portal notifications (WO + PO requests from public portal)
- Parts/Inventory alerts (low stock)
- Summary & Reports (daily digests, upcoming work)

All users can toggle each notification type on/off globally (affecting both email and push channels simultaneously). Notifications deliver instantly when triggered. Failed notifications are logged for debugging.

---

## Database Schema

### 1. `notification_types` Table
Metadata catalog of all 18+ notification types. Created once, never modified per-user.

```sql
CREATE TABLE notification_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) UNIQUE NOT NULL,
  label VARCHAR(200) NOT NULL,
  category VARCHAR(50) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT now()
);
```

**Categories:**
- `work_orders_general` — 7 types (WO I created, WO I'm assigned to, team assignments, follows, unassigned, mentions)
- `work_orders_requests` — 4 types (public request portal, unassigned requests, declined requests, messages)
- `purchase_orders` — 3 types (requested, created by non-admin, request updates)
- `parts_inventory` — 1 type (low stock alert)
- `summary_reports` — 2 types (daily summary, due next week report)

### 2. `user_notification_preferences` Table
Per-user toggles for each notification type.

```sql
CREATE TABLE user_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  preferences JSONB NOT NULL,
  updated_at TIMESTAMP DEFAULT now(),
  UNIQUE(user_id)
);
```

**`preferences` structure:**
```json
{
  "wo_i_created_updated": true,
  "wo_i_assigned_updated": true,
  "wo_i_additional_worker": false,
  "wo_my_team_assigned": true,
  "wo_i_followed_updated": true,
  "wo_unassigned_updated": true,
  "wo_i_mentioned": true,
  "wo_requested_from_portal": true,
  "wo_request_unassigned": true,
  "wo_request_i_created_declined": true,
  "wo_request_new_message": true,
  "po_requested_from_portal": true,
  "po_created_by_non_admin": false,
  "po_request_i_created_updated": true,
  "part_low_stock": true,
  "daily_summary_ready": true,
  "wo_due_next_week": true
}
```

All types default to `true` (enabled). Users can toggle any to `false`.

### 3. `notification_log` Table (Optional, for Audit)
Audit trail of sent notifications. Used for debugging, analytics, and user-facing delivery history.

```sql
CREATE TABLE notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type_key VARCHAR(100) NOT NULL,
  channel VARCHAR(20) NOT NULL,
  sent_at TIMESTAMP DEFAULT now(),
  status VARCHAR(50),
  error_message TEXT,
  created_at TIMESTAMP DEFAULT now()
);
```

**Status values:** `sent`, `failed`, `bounced`  
**Channel values:** `email`, `push`

---

## Notification Types (18+)

### Work Orders — General (7 types)
1. `wo_i_created_updated` — "A Work Order I have created has been updated"
2. `wo_i_assigned_updated` — "A Work Order I am assigned to has been created or updated"
3. `wo_i_additional_worker` — "A Work Order I am assigned to as an additional worker has been created or updated"
4. `wo_my_team_assigned` — "A Work Order my team has been assigned to has been created or updated"
5. `wo_i_followed_updated` — "A Work Order I followed from the Shared Work Order page has been updated"
6. `wo_unassigned_updated` — "An unassigned Work Order has been created or updated"
7. `wo_i_mentioned` — "I have been mentioned in any Work Order updates"

### Work Orders — Requests (4 types)
8. `wo_requested_from_portal` — "A Work Order has been requested from the public request portal"
9. `wo_request_unassigned` — "An unassigned Work Order Request has been created or updated"
10. `wo_request_i_created_declined` — "A Work Order Request I created has been declined or canceled"
11. `wo_request_new_message` — "A new message has been received from the public request portal"

### Purchase Orders (3 types)
12. `po_requested_from_portal` — "A Purchase Order has been requested from the public request portal"
13. `po_created_by_non_admin` — "A Purchase Order has been created by a non-admin user"
14. `po_request_i_created_updated` — "A Purchase Order request I created has been updated"

### Parts/Inventory (1 type)
15. `part_low_stock` — "A part becomes low stock"

### Summary & Reports (2 types)
16. `daily_summary_ready` — "There is a Daily Summary Report ready to view"
17. `wo_due_next_week` — "There is a Work Orders Due Next Week Report ready to view"

---

## Architecture

### NotificationService (Core Hub)

**File:** `web/src/lib/NotificationService.ts`

Centralized service that:
1. Checks user preferences before sending
2. Dispatches email via Resend
3. Dispatches push via Expo
4. Logs all attempts to `notification_log`

**Key methods:**
```ts
static async isEnabled(userId: string, typeKey: NotificationTypeKey): Promise<boolean>
static async notify(userId: string, typeKey: NotificationTypeKey, options): Promise<void>
```

**Error handling:** If either email or push fails, the failure is logged but does not block the other channel.

### Event-Specific Notification Functions

**Files:** `web/src/lib/notifications/workOrderNotifications.ts`, `purchaseOrderNotifications.ts`, etc.

Each module exports helper functions like:
- `notifyWOCreated(userId, email, woNumber, woTitle)`
- `notifyWOAssigned(userId, email, assignedBy, woNumber)`
- `notifyWOStatusUpdated(userId, email, woNumber, status, updatedBy)`
- `notifyWOOverdue(userId, email, woNumber, daysOverdue)`

These are called from controllers/API routes where events occur.

### Email Integration (Resend)

**File:** `web/src/lib/email.ts` (replaced)

Uses `Resend` client instead of Nodemailer:
```ts
const resend = new Resend(process.env.RESEND_API_KEY);
await resend.emails.send({
  from: 'ServIQ-FM <noreply@serviqfm.com>',
  to: userEmail,
  subject: '...',
  html: '...',
});
```

**From address:** `noreply@serviqfm.com` (must be verified in Resend dashboard first)

### Push Notifications & Audit

**File:** `web/src/app/api/push/route.ts` (new)

Handles push dispatch:
1. Receives `{ userId, title, body, data }` from `NotificationService`
2. Fetches device tokens for the user (from Supabase `user_devices` or `push_tokens` table)
3. Sends via Expo Push Service
4. Logs success/failure to `notification_log`

**Test infrastructure (in `/dashboard/settings`):**
- **Test Push Button:** Authenticated users can send themselves a test notification
- **Device Management:** View registered devices + ability to revoke tokens
- **Delivery Log:** Recent push notifications with status (sent/failed)

---

## User Preferences UI

**Location:** `/dashboard/settings` → new "Notifications" tab

**Structure:**
- Group toggles by category (collapsible sections)
- Each notification type: toggle + label
- "Save Preferences" button at bottom
- Success/error toast on save

**Implementation notes:**
- On first visit, create default `user_notification_preferences` row with all types enabled
- Read preferences on page load, display toggles, save on button click
- If user has no preferences row, treat as all-enabled (default)

---

## D1 — Email Infrastructure

**Tasks:**
1. Add `RESEND_API_KEY` to `.env.local` (already done)
2. Add `NEXT_PUBLIC_APP_URL` env var (used in email links)
3. Replace `web/src/lib/email.ts` with Resend client
4. Define email templates (welcome, WO updates, etc.)
5. Test sending a sample email via Resend API

**Verification:** Send a test email to admin account and confirm receipt.

---

## D2 — Welcome Emails

**Trigger:** Admin creates a new user via `/dashboard/users/new`

**Email content:**
- User's name
- Login URL (from `NEXT_PUBLIC_APP_URL`)
- Temporary password (generated by auth system)
- Instructions to change password on first login

**Implementation:**
- After user is created in Supabase auth, call `notifyWelcomeEmail(userId, email, tempPassword)`
- `NotificationService.notify()` respects preferences (though welcome emails may need to be mandatory — discuss if needed)

**Verification:** Create a test user and confirm welcome email arrives.

---

## D3 — Push Notifications Audit

**Goal:** Verify existing push system works end-to-end on production.

**Tasks:**
1. Review existing `web/src/lib/push.ts` (from Sprint B)
2. Create `/api/push` route to dispatch notifications
3. Implement logging to `notification_log` table
4. Add "Send Test Push" button in `/dashboard/settings`
5. Add device token management view (show/revoke tokens)
6. Add delivery log view (recent push notifications + status)

**Success criteria:**
- Test push sent from settings → arrives on registered device
- Delivery log shows success/failure
- Device tokens can be listed and revoked

**Verification:** Register a test device, send test push, confirm delivery log shows success.

---

## D4 — Email Notifications for WO Events

**Hooks to add:**

### WO Created
- **Trigger:** New WO created
- **Recipients:** Creator
- **Type key:** `wo_i_created_updated`
- **Email subject:** "Work Order WO-0123 Created"
- **Email body:** WO number, title, description, link to detail page

### WO Assigned
- **Trigger:** User assigned to WO
- **Recipients:** Assigned user
- **Type key:** `wo_i_assigned_updated`
- **Email subject:** "You've been assigned to WO-0123"
- **Email body:** Assigner name, WO number, title, link to detail page

### WO Status Changed
- **Trigger:** WO status updated (e.g., `in_progress` → `completed`)
- **Recipients:** Creator, all assignees
- **Type key:** `wo_i_created_updated` (for creator) or relevant type (for assignees)
- **Email subject:** "WO-0123 is now [Status]"
- **Email body:** New status, updated by, timestamp, link

### WO Overdue
- **Trigger:** Scheduled job checks for overdue WOs (daily or on-demand)
- **Recipients:** Assigned user, manager/team lead
- **Type key:** `wo_i_assigned_updated`
- **Email subject:** "Work Order WO-0123 is Overdue"
- **Email body:** Days overdue, priority, link to detail page

**Implementation:**
- Add calls to notification functions in WO creation, update, and status-change routes
- For overdue alerts, add a scheduled job (Supabase Edge Function or cron task)
- All calls check `NotificationService.isEnabled()` before sending

**Verification:** Create/update a WO and confirm emails arrive based on preferences. Test overdue alert.

---

## Environment Variables Required

```
RESEND_API_KEY=re_WCE5byeb_EgjGF5mSHDWdUMmxBN3XFvzu
NEXT_PUBLIC_APP_URL=https://serviqfm.com (or http://localhost:3000 for dev)
```

---

## Testing Plan

| Task | Test | Verify |
|------|------|--------|
| D1 (Email infra) | Send test email via Resend | Email received in inbox |
| D2 (Welcome email) | Create user via dashboard | Welcome email arrives with correct details |
| D3 (Push audit) | Send test push from settings | Arrives on device; log shows success |
| D4 (WO notifications) | Create/update WO, check preferences | Emails arrive based on user's toggles |

---

## Edge Cases & Decisions

1. **Welcome emails:** Are these mandatory (always sent) or respectable of user preferences? Recommend: Mandatory for admins/managers, optional for technicians.
2. **Overdue alerts:** Frequency? Recommend: Once per day, in morning (or on-demand by manager).
3. **Purchase Orders & Parts:** These features don't yet exist in the app. D4 hooks should be added in anticipation of their future implementation.
4. **Summary & Reports:** Daily summaries and weekly reports require a scheduled job. Recommend deferring to post-D4 if time-constrained.

---

## Files to Create/Modify

**Create:**
- `web/src/lib/NotificationService.ts`
- `web/src/lib/notificationTypes.ts`
- `web/src/lib/notifications/workOrderNotifications.ts`
- `web/src/lib/notifications/purchaseOrderNotifications.ts` (stubs)
- `web/src/lib/notifications/partsNotifications.ts` (stubs)
- `web/src/lib/notifications/reportNotifications.ts` (stubs)
- `web/src/app/api/push/route.ts`
- `web/src/app/dashboard/settings/NotificationsTab.tsx`

**Modify:**
- `web/src/lib/email.ts` (replace Nodemailer with Resend)
- `web/src/app/dashboard/settings/page.tsx` (add Notifications tab)
- `web/src/app/dashboard/users/new/page.tsx` (add welcome email call)
- Any WO creation/update routes (add notification calls)
- `.env.local` (add RESEND_API_KEY, NEXT_PUBLIC_APP_URL)

**SQL:**
- Create `notification_types`, `user_notification_preferences`, `notification_log` tables
- Insert 18+ rows into `notification_types`

---

## Success Criteria

- [x] All 18+ notification types are defined and toggleable
- [x] Users can enable/disable each type individually in settings
- [x] Welcome emails send on user creation
- [x] WO lifecycle emails send (created, assigned, status changed, overdue)
- [x] Push notifications work end-to-end on production
- [x] Delivery log tracks all email/push attempts
- [x] All notifications respect user preferences before sending
- [x] Error handling logs failures without blocking other channels
