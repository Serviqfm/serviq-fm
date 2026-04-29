export async function sendPushNotification(payload: {
  user_id: string
  title: string
  body: string
  data?: Record<string, string>
}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  await fetch(`${supabaseUrl}/functions/v1/send-push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}
