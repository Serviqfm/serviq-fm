// Fire-and-forget push send. Routes through the authenticated, same-origin
// /api/push route (the browser session cookie authorises the caller) — this
// replaces the unauthenticated `send-push` Supabase edge function removed in DV-04,
// which let any caller send an arbitrary push to any user.
//
// KNOWN LIMITATION (tracked as DV-05, Batch 3): /api/push reads the `user_devices`
// table, which the mobile app does not yet populate (it writes `users.push_token`),
// so delivery stays blocked until DV-05 unifies the token store. DV-04's scope is to
// remove the unauthenticated edge function — not to restore delivery.
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
