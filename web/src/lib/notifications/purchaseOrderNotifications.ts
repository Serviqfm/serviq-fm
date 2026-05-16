export async function notifyPORequestedFromPortal(
  userIds: string[],
  emails: string[],
  poNumber: string,
  _poTitle: string,
  _poId: string
): Promise<void> {
  // TODO: Implement when PO feature is added
  console.log('PO requested from portal:', poNumber);
}

export async function notifyPOCreatedByNonAdmin(
  userId: string,
  userEmail: string,
  createdBy: string,
  poNumber: string,
  _poTitle: string,
  _poId: string
): Promise<void> {
  // TODO: Implement when PO feature is added
  console.log('PO created by non-admin:', poNumber);
}

export async function notifyPORequestUpdated(
  userId: string,
  userEmail: string,
  poNumber: string,
  _poTitle: string,
  _poId: string,
  _updatedBy: string
): Promise<void> {
  // TODO: Implement when PO feature is added
  console.log('PO request updated:', poNumber);
}
