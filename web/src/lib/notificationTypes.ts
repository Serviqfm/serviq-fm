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

export function getNotificationsByCategory(category: string) {
  return Object.values(NOTIFICATION_TYPES).filter(t => t.category === category);
}

export function getDefaultPreferences(): Record<string, boolean> {
  return Object.values(NOTIFICATION_TYPES).reduce((acc, type) => {
    acc[type.key] = true;
    return acc;
  }, {} as Record<string, boolean>);
}

export function getAllCategories(): string[] {
  const categories = new Set(Object.values(NOTIFICATION_TYPES).map(t => t.category));
  return Array.from(categories);
}
