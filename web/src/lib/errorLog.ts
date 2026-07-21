import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

// DV-16 — central capture of unexpected server errors. Writes an error_logs row
// (SQL Files/b2-01-error-logs.sql) and, for cron failures, emails
// platform admins so PM generation / escalations can't fail silently.
//
// Server-only: uses SUPABASE_SERVICE_ROLE_KEY. Never import from client code.
// Best-effort: capture() never throws — a broken logger must not mask or
// escalate the original error.

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/** Record an unexpected server error to error_logs. Best-effort, never throws. */
export async function captureError(
  err: unknown,
  ctx: { route?: string; orgId?: string | null } = {}
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err)
  const stack = err instanceof Error ? (err.stack ?? null) : null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin().from('error_logs') as any).insert({
      org_id: ctx.orgId ?? null,
      route: ctx.route ?? null,
      message,
      stack,
    })
  } catch (e) {
    console.error('[errorLog] failed to write error_logs row:', e)
  }
}

/** Email every platform admin. Best-effort, never throws. */
async function emailPlatformAdmins(subject: string, html: string): Promise<void> {
  try {
    const { data } = await admin().from('platform_admins').select('email')
    const emails = ((data as { email: string }[] | null) ?? [])
      .map((r) => r.email)
      .filter(Boolean)
    if (emails.length === 0) return

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      console.error('[errorLog] RESEND_API_KEY not set; cannot alert platform admins')
      return
    }
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@serviqfm.com'
    const fromName = process.env.RESEND_FROM_NAME || 'ServIQ-FM'
    await new Resend(apiKey).emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: emails,
      subject,
      html,
    })
  } catch (e) {
    console.error('[errorLog] failed to alert platform admins:', e)
  }
}

/**
 * Log an error AND alert platform admins. Use for cron failures where silent
 * failure means no one knows PM generation / escalations stopped running.
 */
export async function captureAndAlert(
  err: unknown,
  ctx: { route: string; orgId?: string | null } = { route: 'unknown' }
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err)
  await captureError(err, ctx)
  const html = `<p>A scheduled job failed.</p>
<p><strong>Route:</strong> ${escapeHtml(ctx.route)}</p>
<p><strong>Error:</strong> ${escapeHtml(message)}</p>
<p>See the <code>error_logs</code> table for the stack trace.</p>`
  await emailPlatformAdmins(`[ServIQ-FM] Cron failure: ${ctx.route}`, html)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
