import { createClient } from '@supabase/supabase-js'
import { C, F } from '@/lib/brand'
import { format } from 'date-fns'

export const dynamic = 'force-dynamic'

export default async function TrackRequestPage({ params }: { params: { token: string } }) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: request } = await supabase
    .from('requests')
    .select('*, site:site_id(name), space:space_id(name, floor), work_order:work_order_id(wo_number, status, id)')
    .eq('tracking_token', params.token)
    .single()

  if (!request) return (
    <div style={{ minHeight: 'calc(100vh - 56px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <div style={{ textAlign: 'center', maxWidth: 440 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: C.navy, fontFamily: F.en, margin: '0 0 12px' }}>Tracking Link Invalid</h2>
        <p style={{ color: C.textLight, fontFamily: F.en, lineHeight: 1.6 }}>This tracking link is no longer valid.</p>
      </div>
    </div>
  )

  const woNum = request.work_order?.wo_number
    ? `WO-${String(request.work_order.wo_number).padStart(4, '0')}`
    : null

  type Step = { key: string; label: string; done: boolean; failed?: boolean }
  const steps: Step[] = [
    { key: 'submitted', label: 'Submitted', done: true },
    { key: 'review', label: 'Under Review', done: request.status !== 'pending' },
    {
      key: 'outcome',
      label: request.status === 'rejected' ? 'Rejected' : `Approved${woNum ? ` — ${woNum}` : ''}`,
      done: request.status === 'approved' || request.status === 'rejected',
      failed: request.status === 'rejected',
    },
  ]

  if (request.status === 'approved' && request.work_order) {
    const woStatus: string = request.work_order.status
    steps.push(
      { key: 'assigned', label: 'Technician Assigned', done: ['in_progress','on_hold','completed','finished'].includes(woStatus) },
      { key: 'in_progress', label: 'In Progress', done: ['on_hold','completed','finished'].includes(woStatus) },
      { key: 'completed', label: 'Completed', done: ['finished'].includes(woStatus) },
      { key: 'finished', label: 'Closed', done: woStatus === 'finished' },
    )
  }

  return (
    <div style={{ padding: '32px 24px', maxWidth: 640, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <p style={{ fontSize: 12, color: C.textLight, fontFamily: F.en, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {(request.site as { name: string } | null)?.name}
          {request.space ? ` · ${(request.space as { name: string; floor: string }).name} (${(request.space as { name: string; floor: string }).floor})` : ''}
        </p>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: C.navy, fontFamily: F.en, margin: '0 0 4px' }}>{request.title}</h1>
        <p style={{ fontSize: 13, color: C.textLight, fontFamily: F.en, margin: 0 }}>
          Submitted {format(new Date(request.created_at), 'dd MMM yyyy')} · {request.category}
        </p>
      </div>

      {request.description && (
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 20px', marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textLight, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontFamily: F.en }}>Description</div>
          <p style={{ fontSize: 14, color: C.textMid, lineHeight: 1.6, margin: 0, fontFamily: F.en }}>{request.description}</p>
        </div>
      )}

      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 24px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.textLight, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 20, fontFamily: F.en }}>Request Status</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {steps.map((step, i) => (
            <div key={step.key} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: step.failed ? '#FEE2E2' : step.done ? '#DCFCE7' : C.pageBg,
                  border: `2px solid ${step.failed ? C.danger : step.done ? C.success : C.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, color: step.failed ? C.danger : C.success,
                }}>
                  {step.failed ? '✗' : step.done ? '✓' : ''}
                </div>
                {i < steps.length - 1 && (
                  <div style={{ width: 2, height: 28, background: step.done ? C.success : C.border, margin: '2px 0' }} />
                )}
              </div>
              <div style={{ paddingTop: 4 }}>
                <span style={{
                  fontSize: 14, fontWeight: step.done ? 600 : 400,
                  color: step.failed ? C.danger : step.done ? C.navy : C.textLight,
                  fontFamily: F.en,
                }}>{step.label}</span>
                {step.key === 'outcome' && request.status === 'rejected' && request.rejection_reason && (
                  <p style={{ fontSize: 12, color: C.textLight, margin: '2px 0 0', fontFamily: F.en }}>{request.rejection_reason}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
