import { createClient } from '@supabase/supabase-js'
import { format } from 'date-fns'
import PublicRequestChat from './PublicRequestChat'

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
    <div className="min-h-[calc(100vh-56px)] flex items-center justify-center p-8">
      <div className="text-center max-w-[440px]">
        <div className="text-5xl mb-4">🔍</div>
        <h2 className="text-[22px] font-bold text-on-surface mb-3">Tracking Link Invalid</h2>
        <p className="text-on-surface-variant leading-relaxed">This tracking link is no longer valid.</p>
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
    <div className="px-6 py-8 max-w-[640px] mx-auto">
      <div className="mb-7">
        <p className="text-xs text-on-surface-variant mb-1 uppercase tracking-[0.06em]">
          {(request.site as { name: string } | null)?.name}
          {request.space ? ` · ${(request.space as { name: string; floor: string }).name} (${(request.space as { name: string; floor: string }).floor})` : ''}
        </p>
        <h1 className="text-2xl font-bold text-on-surface mb-1">{request.title}</h1>
        <p className="text-sm text-on-surface-variant">
          Submitted {format(new Date(request.created_at), 'dd MMM yyyy')} · {request.category}
        </p>
      </div>

      {request.description && (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm px-5 py-4 mb-6">
          <div className="text-[11px] font-bold text-on-surface-variant uppercase tracking-[0.06em] mb-2">Description</div>
          <p className="text-sm text-on-surface-variant leading-relaxed">{request.description}</p>
        </div>
      )}

      <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm px-6 py-5">
        <div className="text-[11px] font-bold text-on-surface-variant uppercase tracking-[0.06em] mb-5">Request Status</div>
        <div className="flex flex-col gap-0">
          {steps.map((step, i) => (
            <div key={step.key} className="flex gap-3.5 items-start">
              <div className="flex flex-col items-center shrink-0">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[13px] border-2 ${
                  step.failed
                    ? 'bg-error/10 border-error text-error'
                    : step.done
                    ? 'bg-primary/10 border-primary text-primary'
                    : 'bg-surface-container-low border-outline-variant text-on-surface-variant'
                }`}>
                  {step.failed ? '✗' : step.done ? '✓' : ''}
                </div>
                {i < steps.length - 1 && (
                  <div className={`w-0.5 h-7 my-0.5 ${step.done ? 'bg-primary' : 'bg-outline-variant'}`} />
                )}
              </div>
              <div className="pt-1">
                <span className={`text-sm ${
                  step.failed
                    ? 'font-semibold text-error'
                    : step.done
                    ? 'font-semibold text-on-surface'
                    : 'font-normal text-on-surface-variant'
                }`}>{step.label}</span>
                {step.key === 'outcome' && request.status === 'rejected' && request.rejection_reason && (
                  <p className="text-xs text-on-surface-variant mt-0.5">{request.rejection_reason}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <PublicRequestChat token={params.token} />
    </div>
  )
}
