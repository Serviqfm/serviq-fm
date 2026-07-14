'use client'

import RequestChat, { type RequestMessage } from '@/components/RequestChat'

// Portal-side wiring for the request thread: transport is the token-scoped
// service-role API route. The requester's bubbles align right.
export default function PublicRequestChat({ token }: { token: string }) {
  async function load(): Promise<RequestMessage[]> {
    const res = await fetch(`/api/public/request-messages/${token}`)
    if (!res.ok) throw new Error('load failed')
    const { messages } = await res.json()
    return messages
  }

  async function send(body: string): Promise<RequestMessage> {
    const res = await fetch(`/api/public/request-messages/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    })
    if (!res.ok) throw new Error('send failed')
    const { message } = await res.json()
    return message
  }

  return (
    <div className="mt-6">
      <RequestChat mySide="requester" load={load} send={send} />
    </div>
  )
}
