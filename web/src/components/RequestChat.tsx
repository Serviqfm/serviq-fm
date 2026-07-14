'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { format } from 'date-fns'

export type RequestMessage = {
  id: string
  sender_type: 'staff' | 'requester'
  sender_name: string | null
  body: string
  created_at: string
}

// Shared two-way message thread for a request. Transport is injected: the public
// tracking page passes fetch-based callbacks (service-role API route), the
// internal request detail passes Supabase RLS-client callbacks. `mySide` decides
// which bubbles align right ('staff' internally, 'requester' on the portal).
export default function RequestChat({
  mySide,
  load,
  send,
}: {
  mySide: 'staff' | 'requester'
  load: () => Promise<RequestMessage[]>
  send: (body: string) => Promise<RequestMessage>
}) {
  const [messages, setMessages] = useState<RequestMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    load().then(setMessages).catch(() => setError('Could not load messages.'))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length])

  async function handleSend(e: FormEvent) {
    e.preventDefault()
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    setError('')
    try {
      const msg = await send(body)
      setMessages(m => [...m, msg])
      setDraft('')
    } catch {
      setError('Could not send. Please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-5">
      <div className="text-[11px] font-bold text-on-surface-variant uppercase tracking-[0.06em] mb-4">Messages</div>

      <div className="flex flex-col gap-3 max-h-[360px] overflow-y-auto mb-4">
        {messages.length === 0 && (
          <p className="text-sm text-on-surface-variant text-center py-4">No messages yet. Start the conversation below.</p>
        )}
        {messages.map(m => {
          const mine = m.sender_type === mySide
          return (
            <div key={m.id} className={`flex flex-col max-w-[80%] ${mine ? 'self-end items-end' : 'self-start items-start'}`}>
              <div className={`text-[11px] text-on-surface-variant mb-0.5 ${mine ? 'text-right' : ''}`}>
                {m.sender_name || (m.sender_type === 'staff' ? 'Facility Team' : 'Requester')} · {format(new Date(m.created_at), 'dd MMM HH:mm')}
              </div>
              <div className={`text-sm leading-relaxed px-3.5 py-2.5 rounded-2xl whitespace-pre-wrap break-words ${
                mine
                  ? 'bg-primary text-on-primary rounded-br-sm'
                  : 'bg-surface-container-low text-on-surface border border-outline-variant/40 rounded-bl-sm'
              }`}>{m.body}</div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      {error && <p className="text-error text-sm mb-2">{error}</p>}

      <form onSubmit={handleSend} className="flex gap-2 items-end">
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { handleSend(e) } }}
          placeholder="Type a message..."
          rows={1}
          className="flex-1 bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-2.5 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all resize-y min-h-[42px] max-h-[140px]"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          {sending ? '...' : 'Send'}
        </button>
      </form>
    </div>
  )
}
