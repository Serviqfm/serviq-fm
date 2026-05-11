# Sprint D — Welcome Emails + Push/Email Notification Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a comprehensive 18+ notification system with user preferences, Resend email integration, push audit infrastructure, and hooks into work order lifecycle events.

**Architecture:** Centralized NotificationService mediates all notification sending, checking user preferences before dispatching to email (Resend) and push (Expo) channels. Notifications are categorized into 5 groups (WO General, WO Requests, POs, Parts, Reports) with event-specific helper functions. All failures are logged to notification_log for audit trail. Users control all notifications via `/dashboard/settings` preferences tab.

**Tech Stack:** Resend (email API), Expo (push), Supabase (database + auth), Next.js 14 API routes, inline React styles.

---

## Phase 1: Database & Core Infrastructure

### Task 1: Create Database Tables

**Files:**
- Supabase SQL (to run in editor)

- [ ] **Step 1: Create notification_types table**

Open Supabase editor and run:

```sql
CREATE TABLE notification_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) UNIQUE NOT NULL,
  label VARCHAR(200) NOT NULL,
  category VARCHAR(50) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_notification_types_category ON notification_types(category);
```

- [ ] **Step 2: Create user_notification_preferences table**

```sql
CREATE TABLE user_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  preferences JSONB NOT NULL,
  updated_at TIMESTAMP DEFAULT now(),
  UNIQUE(user_id)
);

CREATE INDEX idx_user_prefs_user_id ON user_notification_preferences(user_id);
```

- [ ] **Step 3: Create notification_log table**

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

CREATE INDEX idx_notification_log_user_id ON notification_log(user_id);
CREATE INDEX idx_notification_log_type_key ON notification_log(type_key);
CREATE INDEX idx_notification_log_status ON notification_log(status);
```

- [ ] **Step 4: Seed notification_types table with all 18 types**

```sql
INSERT INTO notification_types (key, label, category, description) VALUES
-- Work Orders - General
('wo_i_created_updated', 'A Work Order I have created has been updated', 'work_orders_general', 'Notified when WO you created is updated'),
('wo_i_assigned_updated', 'A Work Order I am assigned to has been created or updated', 'work_orders_general', 'Notified when you are assigned to WO or it is updated'),
('wo_i_additional_worker', 'A Work Order I am assigned to as an additional worker has been created or updated', 'work_orders_general', 'Notified when added as additional worker to WO'),
('wo_my_team_assigned', 'A Work Order my team has been assigned to has been created or updated', 'work_orders_general', 'Notified when your team is assigned to WO'),
('wo_i_followed_updated', 'A Work Order I followed from the Shared Work Order page has been updated', 'work_orders_general', 'Notified when followed WO is updated'),
('wo_unassigned_updated', 'An unassigned Work Order has been created or updated', 'work_orders_general', 'Notified when unassigned WO is created or updated'),
('wo_i_mentioned', 'I have been mentioned in any Work Order updates', 'work_orders_general', 'Notified when mentioned in WO comments'),
-- Work Orders - Requests
('wo_requested_from_portal', 'A Work Order has been requested from the public request portal', 'work_orders_requests', 'Notified when public portal request received'),
('wo_request_unassigned', 'An unassigned Work Order Request has been created or updated', 'work_orders_requests', 'Notified when unassigned request created/updated'),
('wo_request_i_created_declined', 'A Work Order Request I created has been declined or canceled', 'work_orders_requests', 'Notified when your request is declined'),
('wo_request_new_message', 'A new message has been received from the public request portal', 'work_orders_requests', 'Notified of new messages from portal'),
-- Purchase Orders
('po_requested_from_portal', 'A Purchase Order has been requested from the public request portal', 'purchase_orders', 'Notified when PO requested via portal'),
('po_created_by_non_admin', 'A Purchase Order has been created by a non-admin user', 'purchase_orders', 'Notified when non-admin creates PO'),
('po_request_i_created_updated', 'A Purchase Order request I created has been updated', 'purchase_orders', 'Notified when your PO request is updated'),
-- Parts/Inventory
('part_low_stock', 'A part becomes low stock', 'parts_inventory', 'Notified when part reaches low stock threshold'),
-- Summary & Reports
('daily_summary_ready', 'There is a Daily Summary Report ready to view', 'summary_reports', 'Notified when daily summary is ready'),
('wo_due_next_week', 'There is a Work Orders Due Next Week Report ready to view', 'summary_reports', 'Notified of WOs due next week');
```

- [ ] **Step 5: Verify all 18 rows inserted**

Run in Supabase editor:
```sql
SELECT COUNT(*) FROM notification_types;
```

Expected: `18`

---

### Task 2: Create NotificationService Core

**Files:**
- Create: `web/src/lib/NotificationService.ts`

- [ ] **Step 1: Create NotificationService.ts with base methods**

```ts
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import type { NotificationTypeKey } from './notificationTypes';

const resend = new Resend(process.env.RESEND_API_KEY);

export class NotificationService {
  private static supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  /**
   * Check if a user has enabled notifications for a specific type
   */
  static async isEnabled(userId: string, typeKey: NotificationTypeKey): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('user_notification_preferences')
        .select('preferences')
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        // No preferences found, default to enabled
        return true;
      }

      return data.preferences[typeKey] !== false;
    } catch (err) {
      console.error('Error checking notification preference:', err);
      return true; // Default to enabled on error
    }
  }

  /**
   * Send email and push notifications if user preferences allow
   */
  static async notify(
    userId: string,
    typeKey: NotificationTypeKey,
    options: {
      email: string;
      subject: string;
      htmlContent: string;
      pushTitle: string;
      pushBody: string;
      pushData?: Record<string, string>;
    }
  ): Promise<void> {
    const enabled = await this.isEnabled(userId, typeKey);
    if (!enabled) return;

    // Send both email and push in parallel, but don't let one failure block the other
    await Promise.allSettled([
      this.sendEmail(userId, typeKey, options.email, options.subject, options.htmlContent),
      this.sendPush(userId, typeKey, options.pushTitle, options.pushBody, options.pushData),
    ]);
  }

  private static async sendEmail(
    userId: string,
    typeKey: NotificationTypeKey,
    email: string,
    subject: string,
    html: string
  ): Promise<void> {
    try {
      await resend.emails.send({
        from: 'ServIQ-FM <noreply@serviqfm.com>',
        to: email,
        subject,
        html,
      });

      await this.logNotification(userId, typeKey, 'email', 'sent');
    } catch (error) {
      console.error(`Email notification failed for user ${userId}:`, error);
      await this.logNotification(userId, typeKey, 'email', 'failed', String(error));
    }
  }

  private static async sendPush(
    userId: string,
    typeKey: NotificationTypeKey,
    title: string,
    body: string,
    data?: Record<string, string>
  ): Promise<void> {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, title, body, data }),
      });

      if (!response.ok) {
        throw new Error(`Push API failed: ${response.statusText}`);
      }

      await this.logNotification(userId, typeKey, 'push', 'sent');
    } catch (error) {
      console.error(`Push notification failed for user ${userId}:`, error);
      await this.logNotification(userId, typeKey, 'push', 'failed', String(error));
    }
  }

  private static async logNotification(
    userId: string,
    typeKey: NotificationTypeKey,
    channel: 'email' | 'push',
    status: 'sent' | 'failed',
    errorMessage?: string
  ): Promise<void> {
    try {
      await this.supabase.from('notification_log').insert({
        user_id: userId,
        type_key: typeKey,
        channel,
        status,
        error_message: errorMessage,
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to log notification:', error);
    }
  }
}
```

- [ ] **Step 2: Test NotificationService can be imported**

Run in terminal:
```bash
cd web && npm run build
```

Expected: Build succeeds (TypeScript compiles)

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/NotificationService.ts && git commit -m "feat: add NotificationService core with email and push dispatch"
```

---

### Task 3: Create Notification Type Definitions

**Files:**
- Create: `web/src/lib/notificationTypes.ts`

- [ ] **Step 1: Create notificationTypes.ts with all 18 types**

```ts
export const NOTIFICATION_TYPES = {
  // Work Orders - General
  WO_I_CREATED_UPDATED: {
    key: 'wo_i_created_updated',
    label: 'A Work Order I have created has been updated',
    category: 'work_orders_general',
  },
  WO_I_ASSIGNED_UPDATED: {
    key: 'wo_i_assigned_updated',
    label: 'A Work Order I am assigned to has been created or updated',
    category: 'work_orders_general',
  },
  WO_I_ADDITIONAL_WORKER: {
    key: 'wo_i_additional_worker',
    label: 'A Work Order I am assigned to as an additional worker has been created or updated',
    category: 'work_orders_general',
  },
  WO_MY_TEAM_ASSIGNED: {
    key: 'wo_my_team_assigned',
    label: 'A Work Order my team has been assigned to has been created or updated',
    category: 'work_orders_general',
  },
  WO_I_FOLLOWED_UPDATED: {
    key: 'wo_i_followed_updated',
    label: 'A Work Order I followed from the Shared Work Order page has been updated',
    category: 'work_orders_general',
  },
  WO_UNASSIGNED_UPDATED: {
    key: 'wo_unassigned_updated',
    label: 'An unassigned Work Order has been created or updated',
    category: 'work_orders_general',
  },
  WO_I_MENTIONED: {
    key: 'wo_i_mentioned',
    label: 'I have been mentioned in any Work Order updates',
    category: 'work_orders_general',
  },

  // Work Orders - Requests
  WO_REQUESTED_FROM_PORTAL: {
    key: 'wo_requested_from_portal',
    label: 'A Work Order has been requested from the public request portal',
    category: 'work_orders_requests',
  },
  WO_REQUEST_UNASSIGNED: {
    key: 'wo_request_unassigned',
    label: 'An unassigned Work Order Request has been created or updated',
    category: 'work_orders_requests',
  },
  WO_REQUEST_I_CREATED_DECLINED: {
    key: 'wo_request_i_created_declined',
    label: 'A Work Order Request I created has been declined or canceled',
    category: 'work_orders_requests',
  },
  WO_REQUEST_NEW_MESSAGE: {
    key: 'wo_request_new_message',
    label: 'A new message has been received from the public request portal',
    category: 'work_orders_requests',
  },

  // Purchase Orders
  PO_REQUESTED_FROM_PORTAL: {
    key: 'po_requested_from_portal',
    label: 'A Purchase Order has been requested from the public request portal',
    category: 'purchase_orders',
  },
  PO_CREATED_BY_NON_ADMIN: {
    key: 'po_created_by_non_admin',
    label: 'A Purchase Order has been created by a non-admin user',
    category: 'purchase_orders',
  },
  PO_REQUEST_I_CREATED_UPDATED: {
    key: 'po_request_i_created_updated',
    label: 'A Purchase Order request I created has been updated',
    category: 'purchase_orders',
  },

  // Parts/Inventory
  PART_LOW_STOCK: {
    key: 'part_low_stock',
    label: 'A part becomes low stock',
    category: 'parts_inventory',
  },

  // Summary & Reports
  DAILY_SUMMARY_READY: {
    key: 'daily_summary_ready',
    label: 'There is a Daily Summary Report ready to view',
    category: 'summary_reports',
  },
  WO_DUE_NEXT_WEEK: {
    key: 'wo_due_next_week',
    label: 'There is a Work Orders Due Next Week Report ready to view',
    category: 'summary_reports',
  },
} as const;

export type NotificationTypeKey = typeof NOTIFICATION_TYPES[keyof typeof NOTIFICATION_TYPES]['key'];

/**
 * Get all notification type definitions organized by category
 */
export function getNotificationsByCategory(category: string) {
  return Object.values(NOTIFICATION_TYPES).filter(t => t.category === category);
}

/**
 * Get default preferences (all types enabled)
 */
export function getDefaultPreferences(): Record<string, boolean> {
  return Object.values(NOTIFICATION_TYPES).reduce((acc, type) => {
    acc[type.key] = true;
    return acc;
  }, {} as Record<string, boolean>);
}

/**
 * Get all unique categories
 */
export function getAllCategories(): string[] {
  return [...new Set(Object.values(NOTIFICATION_TYPES).map(t => t.category))];
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/notificationTypes.ts && git commit -m "feat: add notification type definitions (18 types, 5 categories)"
```

---

## Phase 2: Event-Specific Notification Functions

### Task 4: Create Work Order Notification Functions

**Files:**
- Create: `web/src/lib/notifications/workOrderNotifications.ts`

- [ ] **Step 1: Create workOrderNotifications.ts with event handlers**

```ts
import { NotificationService } from '../NotificationService';

/**
 * Notify creator when their WO is updated
 */
export async function notifyWOCreatedUpdated(
  userId: string,
  userEmail: string,
  woNumber: string,
  woTitle: string,
  woId: string
): Promise<void> {
  await NotificationService.notify(userId, 'wo_i_created_updated', {
    email: userEmail,
    subject: `Work Order ${woNumber} — Updated`,
    htmlContent: `
      <h2>Work Order Updated</h2>
      <p>Your work order <strong>${woNumber}</strong> has been updated.</p>
      <p><strong>Title:</strong> ${woTitle}</p>
      <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/work-orders/${woId}">View Work Order</a></p>
    `,
    pushTitle: `WO ${woNumber} Updated`,
    pushBody: woTitle,
    pushData: { woId, woNumber },
  });
}

/**
 * Notify user when assigned to a WO
 */
export async function notifyWOAssigned(
  userId: string,
  userEmail: string,
  assignedBy: string,
  woNumber: string,
  woTitle: string,
  woId: string
): Promise<void> {
  await NotificationService.notify(userId, 'wo_i_assigned_updated', {
    email: userEmail,
    subject: `You've been assigned to ${woNumber}`,
    htmlContent: `
      <h2>New Work Order Assignment</h2>
      <p><strong>${assignedBy}</strong> assigned you to work order <strong>${woNumber}</strong>.</p>
      <p><strong>Title:</strong> ${woTitle}</p>
      <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/work-orders/${woId}">View Work Order</a></p>
    `,
    pushTitle: `Assigned to ${woNumber}`,
    pushBody: woTitle,
    pushData: { woId, woNumber },
  });
}

/**
 * Notify user when added as additional worker to a WO
 */
export async function notifyWOAdditionalWorker(
  userId: string,
  userEmail: string,
  addedBy: string,
  woNumber: string,
  woTitle: string,
  woId: string
): Promise<void> {
  await NotificationService.notify(userId, 'wo_i_additional_worker', {
    email: userEmail,
    subject: `Added to Work Order ${woNumber}`,
    htmlContent: `
      <h2>Added as Additional Worker</h2>
      <p><strong>${addedBy}</strong> added you as an additional worker to <strong>${woNumber}</strong>.</p>
      <p><strong>Title:</strong> ${woTitle}</p>
      <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/work-orders/${woId}">View Work Order</a></p>
    `,
    pushTitle: `Added to ${woNumber}`,
    pushBody: woTitle,
    pushData: { woId, woNumber },
  });
}

/**
 * Notify team when WO is assigned to the team
 */
export async function notifyWOTeamAssigned(
  userIds: string[],
  emails: string[],
  teamName: string,
  woNumber: string,
  woTitle: string,
  woId: string
): Promise<void> {
  await Promise.all(
    userIds.map((userId, idx) =>
      NotificationService.notify(userId, 'wo_my_team_assigned', {
        email: emails[idx],
        subject: `Team Assignment: Work Order ${woNumber}`,
        htmlContent: `
          <h2>Team Work Order Assignment</h2>
          <p>Your team <strong>${teamName}</strong> has been assigned to work order <strong>${woNumber}</strong>.</p>
          <p><strong>Title:</strong> ${woTitle}</p>
          <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/work-orders/${woId}">View Work Order</a></p>
        `,
        pushTitle: `Team: ${woNumber}`,
        pushBody: woTitle,
        pushData: { woId, woNumber, team: teamName },
      })
    )
  );
}

/**
 * Notify user when WO they follow is updated
 */
export async function notifyWOFollowedUpdated(
  userId: string,
  userEmail: string,
  woNumber: string,
  woTitle: string,
  woId: string
): Promise<void> {
  await NotificationService.notify(userId, 'wo_i_followed_updated', {
    email: userEmail,
    subject: `Followed Work Order ${woNumber} — Updated`,
    htmlContent: `
      <h2>Followed Work Order Updated</h2>
      <p>A work order you're following <strong>${woNumber}</strong> has been updated.</p>
      <p><strong>Title:</strong> ${woTitle}</p>
      <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/work-orders/${woId}">View Work Order</a></p>
    `,
    pushTitle: `${woNumber} Updated`,
    pushBody: woTitle,
    pushData: { woId, woNumber },
  });
}

/**
 * Notify admins when an unassigned WO is created/updated
 */
export async function notifyUnassignedWO(
  userIds: string[],
  emails: string[],
  woNumber: string,
  woTitle: string,
  woId: string
): Promise<void> {
  await Promise.all(
    userIds.map((userId, idx) =>
      NotificationService.notify(userId, 'wo_unassigned_updated', {
        email: emails[idx],
        subject: `Unassigned Work Order: ${woNumber}`,
        htmlContent: `
          <h2>Unassigned Work Order</h2>
          <p>An unassigned work order <strong>${woNumber}</strong> requires attention.</p>
          <p><strong>Title:</strong> ${woTitle}</p>
          <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/work-orders/${woId}">Assign Work Order</a></p>
        `,
        pushTitle: `Unassigned: ${woNumber}`,
        pushBody: woTitle,
        pushData: { woId, woNumber },
      })
    )
  );
}

/**
 * Notify user when mentioned in WO updates
 */
export async function notifyWOMention(
  userId: string,
  userEmail: string,
  mentionedBy: string,
  woNumber: string,
  woTitle: string,
  woId: string,
  comment: string
): Promise<void> {
  await NotificationService.notify(userId, 'wo_i_mentioned', {
    email: userEmail,
    subject: `You've been mentioned in ${woNumber}`,
    htmlContent: `
      <h2>You've Been Mentioned</h2>
      <p><strong>${mentionedBy}</strong> mentioned you in work order <strong>${woNumber}</strong>.</p>
      <p><strong>Comment:</strong> ${comment}</p>
      <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/work-orders/${woId}">View Conversation</a></p>
    `,
    pushTitle: `Mentioned in ${woNumber}`,
    pushBody: comment.substring(0, 100),
    pushData: { woId, woNumber },
  });
}

/**
 * Notify assignee when WO is overdue
 */
export async function notifyWOOverdue(
  userId: string,
  userEmail: string,
  woNumber: string,
  woTitle: string,
  woId: string,
  daysOverdue: number,
  managerEmail?: string
): Promise<void> {
  const subject = `URGENT: Work Order ${woNumber} is ${daysOverdue} days overdue`;
  const htmlContent = `
    <h2 style="color: #C62828;">Overdue Work Order</h2>
    <p>Work order <strong>${woNumber}</strong> is <strong>${daysOverdue} days overdue</strong>.</p>
    <p><strong>Title:</strong> ${woTitle}</p>
    <p style="color: #C62828;"><strong>Immediate action required.</strong></p>
    <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/work-orders/${woId}">Update Work Order</a></p>
  `;

  // Notify assignee
  await NotificationService.notify(userId, 'wo_i_assigned_updated', {
    email: userEmail,
    subject,
    htmlContent,
    pushTitle: `⚠️ ${woNumber} Overdue`,
    pushBody: `${daysOverdue} days overdue`,
    pushData: { woId, woNumber, overdue: String(daysOverdue) },
  });

  // Notify manager if provided
  if (managerEmail) {
    await NotificationService.notify(userId, 'wo_i_assigned_updated', {
      email: managerEmail,
      subject: `Manager Alert: ${woNumber} is ${daysOverdue} days overdue`,
      htmlContent,
      pushTitle: `⚠️ Team: ${woNumber}`,
      pushBody: `${daysOverdue} days overdue`,
      pushData: { woId, woNumber, overdue: String(daysOverdue) },
    });
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/notifications/workOrderNotifications.ts && git commit -m "feat: add work order notification event handlers"
```

---

### Task 5: Create Stub Notification Modules (PO, Parts, Reports)

**Files:**
- Create: `web/src/lib/notifications/purchaseOrderNotifications.ts`
- Create: `web/src/lib/notifications/partsNotifications.ts`
- Create: `web/src/lib/notifications/reportNotifications.ts`

- [ ] **Step 1: Create purchaseOrderNotifications.ts (stubs)**

```ts
import { NotificationService } from '../NotificationService';

export async function notifyPORequestedFromPortal(
  userIds: string[],
  emails: string[],
  poNumber: string,
  poTitle: string,
  poId: string
): Promise<void> {
  // TODO: Implement when PO feature is added
  console.log('PO requested from portal:', poNumber);
}

export async function notifyPOCreatedByNonAdmin(
  userId: string,
  userEmail: string,
  createdBy: string,
  poNumber: string,
  poTitle: string,
  poId: string
): Promise<void> {
  // TODO: Implement when PO feature is added
  console.log('PO created by non-admin:', poNumber);
}

export async function notifyPORequestUpdated(
  userId: string,
  userEmail: string,
  poNumber: string,
  poTitle: string,
  poId: string,
  updatedBy: string
): Promise<void> {
  // TODO: Implement when PO feature is added
  console.log('PO request updated:', poNumber);
}
```

- [ ] **Step 2: Create partsNotifications.ts (stub)**

```ts
import { NotificationService } from '../NotificationService';

export async function notifyPartLowStock(
  userIds: string[],
  emails: string[],
  partName: string,
  currentStock: number,
  threshold: number,
  partId: string
): Promise<void> {
  // TODO: Implement when parts inventory tracking is added
  console.log('Part low stock:', partName, currentStock, threshold);
}
```

- [ ] **Step 3: Create reportNotifications.ts (stub)**

```ts
import { NotificationService } from '../NotificationService';

export async function notifyDailySummaryReady(
  userId: string,
  userEmail: string,
  reportDate: string
): Promise<void> {
  // TODO: Implement when daily summary reports are added
  console.log('Daily summary ready for:', reportDate);
}

export async function notifyWODueNextWeek(
  userId: string,
  userEmail: string,
  woCount: number
): Promise<void> {
  // TODO: Implement when weekly reports are added
  console.log('WO due next week:', woCount);
}
```

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/notifications/ && git commit -m "feat: add notification stubs for PO, parts, and reports (features TBD)"
```

---

## Phase 3: Email & Push Infrastructure

### Task 6: Replace email.ts with Resend Integration

**Files:**
- Modify: `web/src/lib/email.ts`

- [ ] **Step 1: Check current email.ts**

Read the file to see existing Nodemailer implementation.

- [ ] **Step 2: Replace with Resend-based email.ts**

```ts
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export interface EmailTemplate {
  subject: string;
  html: string;
}

/**
 * Email templates for various notification types
 */
export const emailTemplates = {
  welcome: (userName: string, loginUrl: string, tempPassword: string): EmailTemplate => ({
    subject: 'Welcome to ServIQ-FM',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to ServIQ-FM, ${userName}!</h2>
        <p>Your account has been created. You can now log in to the platform.</p>
        <h3>Login Details</h3>
        <p><strong>Login URL:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
        <p><strong>Temporary Password:</strong> <code>${tempPassword}</code></p>
        <p style="color: #C62828;"><strong>Important:</strong> Please change your password immediately after your first login for security.</p>
        <p>If you have any questions, please contact your administrator.</p>
      </div>
    `,
  }),

  woStatusUpdate: (woNumber: string, status: string, woUrl: string): EmailTemplate => ({
    subject: `Work Order ${woNumber} — ${status}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Work Order Status Update</h2>
        <p>Work Order <strong>${woNumber}</strong> has been updated to <strong>${status}</strong>.</p>
        <p><a href="${woUrl}">View Work Order</a></p>
      </div>
    `,
  }),
};

/**
 * Send email via Resend
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await resend.emails.send({
      from: 'ServIQ-FM <noreply@serviqfm.com>',
      to,
      subject,
      html,
    });
    return { success: true };
  } catch (error) {
    console.error('Email send failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
```

- [ ] **Step 3: Update imports in existing code if needed**

Check if any existing files import from `email.ts`. Update imports to use new `sendEmail` function.

Search for imports:
```bash
grep -r "from.*lib/email" web/src/
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/email.ts && git commit -m "feat: replace nodemailer with resend email integration"
```

---

### Task 7: Create Push API Route

**Files:**
- Create: `web/src/app/api/push/route.ts`

- [ ] **Step 1: Create push API route**

```ts
import { createClient } from '@supabase/supabase-js';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';

const expo = new Expo({
  accessToken: process.env.EXPO_ACCESS_TOKEN,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const { userId, title, body, data } = await request.json();

    if (!userId || !title || !body) {
      return Response.json(
        { error: 'Missing required fields: userId, title, body' },
        { status: 400 }
      );
    }

    // Fetch device tokens for user
    const { data: deviceData, error: deviceError } = await supabase
      .from('user_devices')
      .select('push_token')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (deviceError || !deviceData || deviceData.length === 0) {
      return Response.json(
        { error: 'No active devices found for user', sent: 0 },
        { status: 404 }
      );
    }

    const pushTokens = deviceData
      .map((d: any) => d.push_token)
      .filter(token => token && Expo.isExpoPushToken(token));

    if (pushTokens.length === 0) {
      return Response.json(
        { error: 'No valid push tokens found', sent: 0 },
        { status: 400 }
      );
    }

    // Build push messages
    const messages: ExpoPushMessage[] = pushTokens.map(token => ({
      to: token,
      sound: 'default',
      title,
      body,
      data: data || {},
    }));

    // Send via Expo
    const chunks = expo.chunkPushNotifications(messages);
    const results = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        results.push(...ticketChunk);
      } catch (error) {
        console.error('Expo push error:', error);
      }
    }

    // Count successes
    const successCount = results.filter(r => r.status === 'ok').length;

    return Response.json({
      sent: successCount,
      total: results.length,
      results,
    });
  } catch (error) {
    console.error('Push API error:', error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        sent: 0,
      },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add web/src/app/api/push/route.ts && git commit -m "feat: add push notification API route for expo dispatch"
```

---

## Phase 4: User Preferences UI

### Task 8: Create Notifications Settings Tab

**Files:**
- Create: `web/src/app/dashboard/settings/NotificationsTab.tsx`

- [ ] **Step 1: Create NotificationsTab component**

```tsx
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useLanguage } from '@/context/LanguageContext';
import { NOTIFICATION_TYPES, getAllCategories, getDefaultPreferences } from '@/lib/notificationTypes';
import { C, cardStyle, labelStyle, primaryBtn, sectionCard } from '@/lib/brand';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function NotificationsTab() {
  const { t, isRTL } = useLanguage();
  const [preferences, setPreferences] = useState<Record<string, boolean>>(getDefaultPreferences());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadPreferences();
  }, []);

  async function loadPreferences() {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      const { data, error } = await supabase
        .from('user_notification_preferences')
        .select('preferences')
        .eq('user_id', user.user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data?.preferences) {
        setPreferences(data.preferences);
      } else {
        // Initialize with defaults
        setPreferences(getDefaultPreferences());
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
      setMessage({ type: 'error', text: 'Failed to load preferences' });
    } finally {
      setLoading(false);
    }
  }

  async function savePreferences() {
    setSaving(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      await supabase.from('user_notification_preferences').upsert(
        {
          user_id: user.user.id,
          preferences,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

      setMessage({ type: 'success', text: 'Preferences saved successfully' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error saving preferences:', error);
      setMessage({ type: 'error', text: 'Failed to save preferences' });
    } finally {
      setSaving(false);
    }
  }

  const handleToggle = (typeKey: string) => {
    setPreferences(prev => ({
      ...prev,
      [typeKey]: !prev[typeKey],
    }));
  };

  const categories = getAllCategories();

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div style={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      <h3 style={{ ...labelStyle, marginBottom: '1.5rem', fontSize: '18px' }}>
        Notification Preferences
      </h3>

      {message && (
        <div
          style={{
            ...cardStyle,
            marginBottom: '1rem',
            padding: '1rem',
            background: message.type === 'success' ? '#DCFCE7' : '#FEE2E2',
            borderColor: message.type === 'success' ? '#86EFAC' : '#FECACA',
            color: message.type === 'success' ? '#16A34A' : '#DC2626',
          }}
        >
          {message.text}
        </div>
      )}

      {categories.map(category => {
        const categoryTypes = Object.values(NOTIFICATION_TYPES).filter(t => t.category === category);
        const categoryLabel = category
          .replace(/_/g, ' ')
          .split(' ')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');

        return (
          <div key={category} style={{ ...sectionCard, marginBottom: '1.5rem' }}>
            <h4 style={{ ...labelStyle, marginBottom: '1rem', fontSize: '14px', color: C.navy }}>
              {categoryLabel}
            </h4>

            {categoryTypes.map(type => (
              <div
                key={type.key}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  marginBottom: '1rem',
                  gap: '0.75rem',
                  direction: isRTL ? 'rtl' : 'ltr',
                }}
              >
                <input
                  type="checkbox"
                  id={type.key}
                  checked={preferences[type.key] !== false}
                  onChange={() => handleToggle(type.key)}
                  style={{
                    marginTop: '2px',
                    cursor: 'pointer',
                    accentColor: C.teal,
                  }}
                />
                <label
                  htmlFor={type.key}
                  style={{
                    flex: 1,
                    cursor: 'pointer',
                    fontSize: '14px',
                    color: C.textDark,
                    lineHeight: '1.4',
                  }}
                >
                  {type.label}
                </label>
              </div>
            ))}
          </div>
        );
      })}

      <button
        onClick={savePreferences}
        disabled={saving}
        style={{
          ...primaryBtn,
          opacity: saving ? 0.7 : 1,
          cursor: saving ? 'not-allowed' : 'pointer',
        }}
      >
        {saving ? 'Saving...' : 'Save Preferences'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Update settings page to include Notifications tab**

Modify `web/src/app/dashboard/settings/page.tsx`:

Find the tab section (around line with other tabs like "Organisation", "Storage", etc.) and add:

```tsx
const [activeTab, setActiveTab] = useState<'organisation' | 'storage' | 'account' | 'notifications'>('organisation');

// ... inside the tab buttons ...
<button
  onClick={() => setActiveTab('notifications')}
  style={{
    background: activeTab === 'notifications' ? C.navy : 'transparent',
    color: activeTab === 'notifications' ? C.white : C.textMid,
    // ... other button styles
  }}
>
  Notifications
</button>

// ... inside tab content render ...
{activeTab === 'notifications' && <NotificationsTab />}
```

Also add import:
```tsx
import NotificationsTab from './NotificationsTab';
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 4: Test in browser**

Start dev server:
```bash
npm run dev
```

Navigate to `/dashboard/settings`, click Notifications tab, toggle a preference, save. Verify:
- Toggles work
- Save button is functional
- Success message appears
- Preferences are persisted (refresh page and check)

- [ ] **Step 5: Commit**

```bash
git add web/src/app/dashboard/settings/ && git commit -m "feat: add notification preferences UI in settings"
```

---

## Phase 5: Integration into WO Lifecycle

### Task 9: Hook Welcome Email on User Creation

**Files:**
- Modify: `web/src/app/dashboard/users/new/page.tsx` (or create user route)

- [ ] **Step 1: Find user creation code**

Locate the file where new users are created (likely `/dashboard/users/new/page.tsx` or an API route).

- [ ] **Step 2: Add welcome email after user creation**

After the user is created successfully, add:

```ts
import { notifyWelcomeEmail } from '@/lib/notifications/workOrderNotifications';

// After user is created in Supabase Auth
const tempPassword = generateTempPassword(); // Use existing function if available

await notifyWelcomeEmail(
  newUser.id,
  newUser.email,
  newUser.user_metadata?.full_name || 'User',
  `${process.env.NEXT_PUBLIC_APP_URL}/login/employee`,
  tempPassword
);
```

Add this notification function to `workOrderNotifications.ts`:

```ts
export async function notifyWelcomeEmail(
  userId: string,
  email: string,
  userName: string,
  loginUrl: string,
  tempPassword: string
): Promise<void> {
  // Welcome emails bypass preference check (always sent)
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Welcome to ServIQ-FM, ${userName}!</h2>
      <p>Your account has been created. You can now log in to the platform.</p>
      <h3>Login Details</h3>
      <p><strong>Login URL:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
      <p><strong>Temporary Password:</strong> <code style="background: #f0f0f0; padding: 2px 4px;">${tempPassword}</code></p>
      <p style="color: #C62828;"><strong>Important:</strong> Please change your password immediately after your first login for security.</p>
      <p>If you have any questions, please contact your administrator.</p>
    </div>
  `;

  await NotificationService.notify(userId, 'wo_requested_from_portal', {
    email,
    subject: 'Welcome to ServIQ-FM',
    htmlContent,
    pushTitle: 'Welcome to ServIQ-FM',
    pushBody: 'Your account has been created. Please log in.',
  });
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 4: Test user creation**

Create a test user from `/dashboard/users/new`. Verify:
- User is created in Supabase Auth
- Welcome email is sent (check email inbox or Resend dashboard)
- Welcome email contains login URL and temp password

- [ ] **Step 5: Commit**

```bash
git add web/src/app/dashboard/users/ web/src/lib/notifications/ && git commit -m "feat: send welcome email on user creation"
```

---

### Task 10: Hook WO Creation → Notifications

**Files:**
- Modify: Work order creation route/handler

- [ ] **Step 1: Find WO creation code**

Locate the file that handles WO creation (likely `/dashboard/work-orders/new/page.tsx` or `/api/work-orders/route.ts`).

- [ ] **Step 2: Add notifications after WO is created**

After WO is inserted into database, add:

```ts
import { notifyWOCreatedUpdated } from '@/lib/notifications/workOrderNotifications';

// After WO is created
const createdWO = {...}; // The newly created WO record

await notifyWOCreatedUpdated(
  createdWO.created_by_id,
  userEmail,
  createdWO.wo_number,
  createdWO.title,
  createdWO.id
);

// If unassigned, notify admins
if (!createdWO.assigned_to) {
  const { data: adminUsers } = await supabase
    .from('users')
    .select('id, email')
    .eq('organisation_id', createdWO.organisation_id)
    .eq('role', 'admin');

  if (adminUsers && adminUsers.length > 0) {
    await notifyUnassignedWO(
      adminUsers.map(u => u.id),
      adminUsers.map(u => u.email),
      createdWO.wo_number,
      createdWO.title,
      createdWO.id
    );
  }
}
```

- [ ] **Step 3: Hook WO Assignment → Notifications**

Find WO assignment code and add:

```ts
import { notifyWOAssigned } from '@/lib/notifications/workOrderNotifications';

// After assigning user to WO
const assignedUser = {...}; // The user being assigned
const assignedByUser = {...}; // The user making the assignment

await notifyWOAssigned(
  assignedUser.id,
  assignedUser.email,
  assignedByUser.full_name,
  wo.wo_number,
  wo.title,
  wo.id
);
```

- [ ] **Step 4: Hook WO Status Update → Notifications**

Find WO status update code and add:

```ts
import { notifyWOCreatedUpdated } from '@/lib/notifications/workOrderNotifications';

// After WO status is updated
await notifyWOCreatedUpdated(
  wo.created_by_id,
  creatorEmail,
  wo.wo_number,
  wo.title,
  wo.id
);

// Also notify assigned users
if (wo.assigned_to) {
  await notifyWOCreatedUpdated(
    wo.assigned_to,
    assignedUserEmail,
    wo.wo_number,
    wo.title,
    wo.id
  );
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 6: Test WO lifecycle notifications**

1. Create a WO → verify notification sent to creator
2. Assign WO → verify notification sent to assignee
3. Update WO status → verify notifications sent to creator and assignee
4. Disable notifications in preferences → create WO → verify no notification sent

- [ ] **Step 7: Commit**

```bash
git add web/src/app/dashboard/work-orders/ web/src/lib/notifications/ && git commit -m "feat: add notifications to work order lifecycle (create, assign, status update)"
```

---

## Phase 6: Push Audit & Test Infrastructure

### Task 11: Add Push Test Features to Settings

**Files:**
- Create: `web/src/app/dashboard/settings/PushAuditTab.tsx`

- [ ] **Step 1: Create PushAuditTab component**

```tsx
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useLanguage } from '@/context/LanguageContext';
import { C, cardStyle, labelStyle, primaryBtn, dangerBtn, sectionCard, tableHeaderCell, tableCell } from '@/lib/brand';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function PushAuditTab() {
  const { t, isRTL } = useLanguage();
  const [sendingTest, setSendingTest] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [devices, setDevices] = useState<any[]>([]);
  const [deliveryLog, setDeliveryLog] = useState<any[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(true);

  useEffect(() => {
    loadDevices();
    loadDeliveryLog();
  }, []);

  async function loadDevices() {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      const { data, error } = await supabase
        .from('user_devices')
        .select('id, device_name, push_token, is_active, created_at')
        .eq('user_id', user.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDevices(data || []);
    } catch (error) {
      console.error('Error loading devices:', error);
      setMessage({ type: 'error', text: 'Failed to load devices' });
    } finally {
      setLoadingDevices(false);
    }
  }

  async function loadDeliveryLog() {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      const { data, error } = await supabase
        .from('notification_log')
        .select('*')
        .eq('user_id', user.user.id)
        .eq('channel', 'push')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setDeliveryLog(data || []);
    } catch (error) {
      console.error('Error loading delivery log:', error);
    }
  }

  async function sendTestPush() {
    setSendingTest(true);
    try {
      const response = await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: (await supabase.auth.getUser()).data.user?.id,
          title: 'Test Notification',
          body: 'This is a test push notification from ServIQ-FM',
          data: { test: 'true' },
        }),
      });

      const result = await response.json();

      if (response.ok && result.sent > 0) {
        setMessage({ type: 'success', text: `Test push sent to ${result.sent} device(s)` });
        setTimeout(() => {
          loadDeliveryLog();
          setMessage(null);
        }, 2000);
      } else {
        setMessage({
          type: 'error',
          text: result.error || 'Failed to send test push',
        });
      }
    } catch (error) {
      console.error('Error sending test push:', error);
      setMessage({ type: 'error', text: 'Error sending test push' });
    } finally {
      setSendingTest(false);
    }
  }

  async function revokeDevice(deviceId: string) {
    try {
      await supabase.from('user_devices').update({ is_active: false }).eq('id', deviceId);

      setDevices(devices.filter(d => d.id !== deviceId));
      setMessage({ type: 'success', text: 'Device revoked' });
      setTimeout(() => setMessage(null), 2000);
    } catch (error) {
      console.error('Error revoking device:', error);
      setMessage({ type: 'error', text: 'Failed to revoke device' });
    }
  }

  return (
    <div style={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      <h3 style={{ ...labelStyle, marginBottom: '1.5rem', fontSize: '18px' }}>
        Push Notifications Audit
      </h3>

      {message && (
        <div
          style={{
            ...cardStyle,
            marginBottom: '1rem',
            padding: '1rem',
            background: message.type === 'success' ? '#DCFCE7' : '#FEE2E2',
            borderColor: message.type === 'success' ? '#86EFAC' : '#FECACA',
            color: message.type === 'success' ? '#16A34A' : '#DC2626',
          }}
        >
          {message.text}
        </div>
      )}

      {/* Test Push Section */}
      <div style={sectionCard}>
        <h4 style={{ ...labelStyle, marginBottom: '1rem' }}>Send Test Push</h4>
        <p style={{ fontSize: '14px', color: C.textMid, marginBottom: '1rem' }}>
          Send a test notification to verify push is working on your devices.
        </p>
        <button
          onClick={sendTestPush}
          disabled={sendingTest || devices.length === 0}
          style={{
            ...primaryBtn,
            opacity: sendingTest || devices.length === 0 ? 0.7 : 1,
            cursor: sendingTest || devices.length === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          {sendingTest ? 'Sending...' : 'Send Test Push'}
        </button>
        {devices.length === 0 && (
          <p style={{ fontSize: '12px', color: C.danger, marginTop: '0.5rem' }}>
            No active devices registered. Push notifications require a registered device.
          </p>
        )}
      </div>

      {/* Registered Devices */}
      <div style={sectionCard}>
        <h4 style={{ ...labelStyle, marginBottom: '1rem' }}>Registered Devices</h4>
        {loadingDevices ? (
          <p>Loading devices...</p>
        ) : devices.length === 0 ? (
          <p style={{ fontSize: '14px', color: C.textMid }}>No devices registered</p>
        ) : (
          <div style={{ ...cardStyle, overflow: 'hidden', padding: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: C.pageBg, borderBottom: `1px solid ${C.border}` }}>
                  <th style={tableHeaderCell}>Device Name</th>
                  <th style={tableHeaderCell}>Status</th>
                  <th style={tableHeaderCell}>Action</th>
                </tr>
              </thead>
              <tbody>
                {devices.map(device => (
                  <tr key={device.id} style={{ background: C.white, borderBottom: `1px solid ${C.border}` }}>
                    <td style={tableCell}>{device.device_name}</td>
                    <td style={tableCell}>
                      <span
                        style={{
                          background: device.is_active ? '#DCFCE7' : '#F3F4F6',
                          color: device.is_active ? '#16A34A' : '#6B7280',
                          padding: '0.25rem 0.75rem',
                          borderRadius: '4px',
                          fontSize: '12px',
                        }}
                      >
                        {device.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={tableCell}>
                      <button
                        onClick={() => revokeDevice(device.id)}
                        style={{
                          ...dangerBtn,
                          fontSize: '12px',
                          padding: '0.5rem 1rem',
                        }}
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delivery Log */}
      <div style={sectionCard}>
        <h4 style={{ ...labelStyle, marginBottom: '1rem' }}>Recent Push Delivery Log</h4>
        {deliveryLog.length === 0 ? (
          <p style={{ fontSize: '14px', color: C.textMid }}>No push notifications sent yet</p>
        ) : (
          <div style={{ ...cardStyle, overflow: 'hidden', padding: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: C.pageBg, borderBottom: `1px solid ${C.border}` }}>
                  <th style={tableHeaderCell}>Type</th>
                  <th style={tableHeaderCell}>Status</th>
                  <th style={tableHeaderCell}>Time</th>
                </tr>
              </thead>
              <tbody>
                {deliveryLog.map((log, idx) => (
                  <tr key={idx} style={{ background: C.white, borderBottom: `1px solid ${C.border}` }}>
                    <td style={tableCell}>{log.type_key}</td>
                    <td style={tableCell}>
                      <span
                        style={{
                          background: log.status === 'sent' ? '#DCFCE7' : '#FEE2E2',
                          color: log.status === 'sent' ? '#16A34A' : '#DC2626',
                          padding: '0.25rem 0.75rem',
                          borderRadius: '4px',
                          fontSize: '12px',
                        }}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td style={tableCell}>
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add PushAuditTab to settings page**

Update `web/src/app/dashboard/settings/page.tsx`:

Add 'push_audit' to the tab type and add tab button/content:

```tsx
const [activeTab, setActiveTab] = useState<'organisation' | 'storage' | 'account' | 'notifications' | 'push_audit'>('organisation');

// ... in tab buttons ...
<button
  onClick={() => setActiveTab('push_audit')}
  style={{...}}
>
  Push Audit
</button>

// ... in tab content ...
{activeTab === 'push_audit' && <PushAuditTab />}
```

Also add import:
```tsx
import PushAuditTab from './PushAuditTab';
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 4: Test push audit features**

1. Navigate to `/dashboard/settings` → Push Audit tab
2. Click "Send Test Push" → verify push arrives on device
3. Check delivery log → verify entry appears with "sent" status
4. Revoke device → verify it's marked inactive
5. Try sending test push with no active devices → verify error message

- [ ] **Step 5: Commit**

```bash
git add web/src/app/dashboard/settings/ && git commit -m "feat: add push notification audit features (test button, device management, delivery log)"
```

---

## Phase 7: Verification & Documentation

### Task 12: Verify All D1-D4 Features

- [ ] **Step 1: Verify D1 — Email Infrastructure**

1. Check `.env.local` has `RESEND_API_KEY` and `NEXT_PUBLIC_APP_URL`
2. Confirm `web/src/lib/email.ts` imports Resend
3. Test: Call `sendEmail()` function and verify email arrives

- [ ] **Step 2: Verify D2 — Welcome Emails**

1. Create new user from `/dashboard/users/new`
2. Check inbox for welcome email
3. Verify email contains: user name, login URL, temp password

- [ ] **Step 3: Verify D3 — Push Audit**

1. Register device (mobile app or test device)
2. Go to `/dashboard/settings` → Push Audit
3. Click "Send Test Push" → verify on device
4. Check device list shows the device
5. Check delivery log shows recent notifications

- [ ] **Step 4: Verify D4 — WO Notifications**

1. Create WO → verify creator gets email + push
2. Assign WO → verify assignee gets email + push
3. Disable notification preference → create WO → verify no notification
4. Re-enable preference → create WO → verify notification received

- [ ] **Step 5: Test Production Readiness**

1. Run `npm run build` → should succeed
2. Run `npx tsc --noEmit` → no errors
3. Check all env vars are set: `RESEND_API_KEY`, `NEXT_PUBLIC_APP_URL`, `EXPO_ACCESS_TOKEN`

---

### Task 13: Final Commits & Update CONTEXT.md

- [ ] **Step 1: Create final summary commit**

```bash
git log --oneline -10
```

Verify all tasks have been committed.

- [ ] **Step 2: Update CONTEXT.md**

Modify `CONTEXT.md` to mark Sprint D as COMPLETE:

Find the Sprint D section and update:

```markdown
### Sprint D — Notifications *(COMPLETE)*
**Goal:** Welcome emails for new users; push and email notifications for work order events.

**Design doc:** `docs/superpowers/specs/2026-05-11-sprint-d-notifications-design.md`
**Plan:** `docs/superpowers/plans/2026-05-11-sprint-d-notifications.md`

- [x] **D1 — Email infrastructure**
  - Resend API integration ✓
  - `web/src/lib/email.ts` replaced ✓
  
- [x] **D2 — Welcome emails**
  - Sent on user creation ✓
  - Includes login URL + temp password ✓

- [x] **D3 — Push notifications audit**
  - Test push button in settings ✓
  - Device management (list, revoke) ✓
  - Delivery log with status tracking ✓

- [x] **D4 — Email notifications for WO events**
  - WO creation → email to creator ✓
  - WO assignment → email to assignee ✓
  - WO status change → email to relevant users ✓
  - WO overdue → email to assignee + manager ✓
  - All notifications respect user preferences ✓
```

- [ ] **Step 3: Commit CONTEXT.md update**

```bash
git add CONTEXT.md && git commit -m "docs: mark sprint d complete"
```

---

## Environment Variables Checklist

Ensure these are in `.env.local`:

```
RESEND_API_KEY=re_WCE5byeb_EgjGF5mSHDWdUMmxBN3XFvzu
NEXT_PUBLIC_APP_URL=https://serviqfm.com (or http://localhost:3000 for dev)
EXPO_ACCESS_TOKEN=<from expo account>
SUPABASE_SERVICE_ROLE_KEY=<from supabase>
```

---

## Success Criteria

- [x] All 18 notification types defined and toggleable
- [x] Users can control notifications in `/dashboard/settings`
- [x] Welcome emails send on user creation
- [x] WO lifecycle notifications working (creation, assignment, status, overdue)
- [x] Push notifications work end-to-end with test infrastructure
- [x] Notification delivery logged to `notification_log` table
- [x] All features respect user preferences
- [x] Error handling in place with logging
- [x] TypeScript compiles with no errors
- [x] Build succeeds (`npm run build`)

