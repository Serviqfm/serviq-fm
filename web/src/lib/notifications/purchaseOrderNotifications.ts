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
