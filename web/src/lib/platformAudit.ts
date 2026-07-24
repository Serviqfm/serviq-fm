// web/src/lib/platformAudit.ts

import { createClient } from '@supabase/supabase-js'

export type PlatformAuditAction =
  | 'tenant.create'
  | 'tenant.offboard'
  | 'tenant.reactivate'
  | 'tenant.plan_change'
  | 'tenant.invoice.created'
  | 'announcement.publish'
  | 'flag.toggle'
  | 'impersonation.start'
  | 'impersonation.end'
  | 'user.disable'
  | 'user.enable'

export async function logPlatformAction(args: {
  platform_admin_id: string
  action: PlatformAuditAction
  target_organisation_id?: string | null
  target_user_id?: string | null
  details?: Record<string, unknown>
}): Promise<void> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { error } = await supabase.from('platform_audit_logs').insert({
    platform_admin_id: args.platform_admin_id,
    action: args.action,
    target_organisation_id: args.target_organisation_id ?? null,
    target_user_id: args.target_user_id ?? null,
    details: args.details ?? {},
  })
  if (error) {
    console.error('[platformAudit] insert failed:', error.message)
    // Do NOT throw — audit logging shouldn't break the action it's auditing
  }
}
