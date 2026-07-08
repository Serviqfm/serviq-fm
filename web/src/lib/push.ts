// Fire-and-forget push send. Routes through the authenticated, same-origin /api/push
// route (the browser session cookie authorises the caller). /api/push reads the user's
// Expo token from users.push_token (written by the mobile app) and sends via Expo — the
// token store is unified end to end (DV-05).
//
// Callers are client components, so a relative URL resolves to the same origin and
// carries the auth cookie.
export async function sendPushNotification(payload: {
  user_id: string
  title: string
  body: string
  data?: Record<string, string>
}) {
  await fetch('/api/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: payload.user_id,
      title: payload.title,
      body: payload.body,
      data: payload.data,
    }),
  })
}
