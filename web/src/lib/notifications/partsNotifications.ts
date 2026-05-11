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
