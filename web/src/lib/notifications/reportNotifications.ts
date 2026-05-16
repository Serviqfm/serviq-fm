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
