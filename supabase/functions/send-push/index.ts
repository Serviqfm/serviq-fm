import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

interface PushPayload {
  user_id: string
  title: string
  body: string
  data?: Record<string, string>
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const payload: PushPayload = await req.json()
  const { user_id, title, body, data } = payload

  const { data: user, error } = await supabase
    .from('users')
    .select('push_token')
    .eq('id', user_id)
    .single()

  if (error || !user?.push_token) {
    return new Response(JSON.stringify({ error: 'No push token for user' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const message = {
    to: user.push_token,
    sound: 'default',
    title,
    body,
    data: data ?? {},
    badge: 1,
  }

  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    },
    body: JSON.stringify(message),
  })

  const result = await response.json()
  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  })
})
