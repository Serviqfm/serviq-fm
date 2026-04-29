'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format } from 'date-fns'
import { useParams } from 'next/navigation'
import Link from 'next/link'

export default function InspectionDetailPage() {
  const { id } = useParams()
  const supabase = createClient()
  const [inspection, setInspection] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchInspection() }, [id])

  async function fetchInspection() {
    const { data } = await supabase
      .from('inspection_results')
      .select('*, template:template_id(name, vertical, items), conductor:conducted_by(full_name), site:site_id(name), asset:asset_id(name)')
      .eq('id', id)
      .single()
    if (data) setInspection(data)
    setLoading(false)
  }

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>
  if (!inspection) return <div style={{ padding: '2rem' }}>Inspection not found.</div>

  const responses: any[] = inspection.responses ?? []
  const failedItems = responses.filter(r => r.value === 'fail')

  const resultConfig: Record<string, { bg: string; color: string; label: string }> = {
    pass:    { bg: '#e8f5e9', color: '#2e7d32', label: 'Overall Pass' },
    fail:    { bg: '#fce4ec', color: '#b71c1c', label: 'Overall Fail' },
    partial: { bg: '#fff8e1', color: '#f57f17', label: 'Partial Pass' },
  }

  const rCfg = inspection.overall_result ? resultConfig[inspection.overall_result] : null

  return (
    <div style={{ padding: '2rem', maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <a href='/dashboard/inspections' style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>Back to Inspections</a>
        <button onClick={() => window.print()} style={{ padding: '6px 16px', borderRadius: 7, border: 'none', background: '#1a1a2e', color: 'white', cursor: 'pointer', fontSize: 13 }}>Export PDF</button>
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>{inspection.template?.name}</h1>
          {rCfg && <span style={{ background: rCfg.bg, color: rCfg.color, padding: '3px 14px', borderRadius: 12, fontSize: 13, fontWeight: 600 }}>{rCfg.label}</span>}
        </div>
        <p style={{ color: '#999', fontSize: 13, marginTop: 6 }}>
          Conducted by {inspection.conductor?.full_name ?? '—'} · {format(new Date(inspection.created_at), 'dd MMM yyyy, HH:mm')}
          {inspection.site?.name && ' · ' + inspection.site.name}
          {inspection.asset?.name && ' · ' + inspection.asset.name}
        </p>
      </div>

      {failedItems.length > 0 && (
        <div style={{ background: '#fce4ec', border: '1px solid #ef9a9a', borderRadius: 10, padding: '1rem', marginBottom: '1.5rem' }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#b71c1c', margin: '0 0 8px' }}>
            {failedItems.length} failed item{failedItems.length > 1 ? 's' : ''} — work orders created automatically
          </p>
          {failedItems.map((r, i) => (
            <p key={i} style={{ fontSize: 13, color: '#c62828', margin: '0 0 4px' }}>• {r.label}</p>
          ))}
        </div>
      )}

      <div style={{ border: '1px solid #eee', borderRadius: 12, overflow: 'hidden' }}>
        {responses.map((r, i) => {
          const isFail = r.value === 'fail'
          const isPass = r.value === 'pass'
          return (
            <div key={i} style={{ padding: '14px 16px', borderBottom: '1px solid #f5f5f5', background: isFail ? '#fff8f8' : 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 500, margin: 0 }}>{i + 1}. {r.label}</p>
                <p style={{ fontSize: 11, color: '#bbb', margin: '2px 0 0' }}>{r.type.replace('_', '/')}</p>
              </div>
              <div>
                {r.value !== null && r.value !== undefined && r.value !== '' ? (
                  <span style={{
                    padding: '3px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                    background: isFail ? '#fce4ec' : isPass ? '#e8f5e9' : '#e8eaf6',
                    color: isFail ? '#b71c1c' : isPass ? '#2e7d32' : '#283593',
                  }}>
                    {String(r.value).charAt(0).toUpperCase() + String(r.value).slice(1)}
                  </span>
                ) : (
                  <span style={{ fontSize: 13, color: '#bbb' }}>Not answered</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: '1.5rem', display: 'flex', gap: 10 }}>
        <Link href='/dashboard/inspections/new'>
          <button style={{ padding: '8px 20px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>Start New Inspection</button>
        </Link>
        <Link href='/dashboard/work-orders'>
          <button style={{ padding: '8px 20px', background: 'white', color: '#1a1a2e', border: '1px solid #1a1a2e', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>View Work Orders</button>
        </Link>
      </div>
    </div>
  )
}