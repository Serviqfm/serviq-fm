/**
 * Work Order Notification Hooks
 *
 * This file contains the integration points where notifications should be triggered
 * during WO lifecycle events. Import these functions in your WO creation/update handlers.
 */

import {
  notifyWOCreatedUpdated,
  notifyWOAssigned,
  notifyWOOverdue,
} from './workOrderNotifications';

/**
 * Call when a new WO is created
 * Integration point: `/dashboard/work-orders/new` form submission or `/api/work-orders` POST
 */
export async function onWOCreated(options: {
  creatorId: string;
  creatorEmail: string;
  woNumber: string;
  woTitle: string;
  woId: string;
  assignedToId?: string;
  assignedToEmail?: string;
  organisationId: string;
}) {
  // Notify creator
  await notifyWOCreatedUpdated(
    options.creatorId,
    options.creatorEmail,
    options.woNumber,
    options.woTitle,
    options.woId
  );

  // If assigned immediately, notify assignee
  if (options.assignedToId && options.assignedToEmail) {
    await notifyWOAssigned(
      options.assignedToId,
      options.assignedToEmail,
      'System', // or actual creator name
      options.woNumber,
      options.woTitle,
      options.woId
    );
  }

  // If unassigned, notify admins
  if (!options.assignedToId) {
    // TODO: Fetch admin users for organisation and call notifyUnassignedWO
  }
}

/**
 * Call when a WO is assigned to a user
 * Integration point: WO detail page assignment or `/api/work-orders/[id]/assign` PUT
 */
export async function onWOAssigned(options: {
  userId: string;
  userEmail: string;
  assignedByName: string;
  woNumber: string;
  woTitle: string;
  woId: string;
}) {
  await notifyWOAssigned(
    options.userId,
    options.userEmail,
    options.assignedByName,
    options.woNumber,
    options.woTitle,
    options.woId
  );
}

/**
 * Call when a WO status changes
 * Integration point: WO detail page status update or `/api/work-orders/[id]/status` PUT
 */
export async function onWOStatusChanged(options: {
  woId: string;
  woNumber: string;
  woTitle: string;
  newStatus: string;
  creatorId: string;
  creatorEmail: string;
  assignedToId?: string;
  assignedToEmail?: string;
  updatedByName: string;
}) {
  // Notify creator of status change
  await notifyWOCreatedUpdated(
    options.creatorId,
    options.creatorEmail,
    options.woNumber,
    options.woTitle,
    options.woId
  );

  // Notify assignee if applicable
  if (options.assignedToId && options.assignedToEmail) {
    await notifyWOCreatedUpdated(
      options.assignedToId,
      options.assignedToEmail,
      options.woNumber,
      options.woTitle,
      options.woId
    );
  }
}

/**
 * Call when a WO becomes overdue (scheduled job)
 * Integration point: Cron job or scheduled task
 */
export async function onWOOverdue(options: {
  assigneeId: string;
  assigneeEmail: string;
  woNumber: string;
  woTitle: string;
  woId: string;
  daysOverdue: number;
  managerId?: string;
  managerEmail?: string;
}) {
  await notifyWOOverdue(
    options.assigneeId,
    options.assigneeEmail,
    options.woNumber,
    options.woTitle,
    options.woId,
    options.daysOverdue,
    options.managerEmail
  );
}

/**
 * Integration Instructions:
 *
 * 1. WO Creation Route:
 *    - After inserting WO to database, call onWOCreated()
 *    - Example: const newWO = await db.insert(...); await onWOCreated({...});
 *
 * 2. WO Assignment:
 *    - After updating WO with assigned_to user, call onWOAssigned()
 *    - Example: await db.update(...); await onWOAssigned({...});
 *
 * 3. WO Status Update:
 *    - After updating WO status, call onWOStatusChanged()
 *    - Example: await db.update({status: newStatus}); await onWOStatusChanged({...});
 *
 * 4. Overdue Alerts:
 *    - Create a scheduled job (Supabase Edge Function or cron) that:
 *      a) Queries WOs past due_date
 *      b) Calls onWOOverdue() for each overdue WO
 *    - Run this daily or on-demand
 */
