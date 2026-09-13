import { describe, it, expect, vi } from 'vitest'
import { NoopAdapter, dispatch, fireErpEvent, type LogRow, type ErpAdapter } from './index'

function recordingAdapter() {
  const rows: LogRow[] = []
  const adapter = new NoopAdapter('none', 'org-1', async row => { rows.push(row) })
  return { adapter, rows }
}

describe('NoopAdapter', () => {
  it('records a skipped push for each object type and sends nothing', async () => {
    const { adapter, rows } = recordingAdapter()
    await adapter.pushVendor('v-1', { name: 'Acme' })
    await adapter.pushPO('po-1', { po_number: 7 })
    await adapter.syncInvoice('inv-1', { amount: 100 })
    await adapter.pushPayment('pay-1', {})
    await adapter.pullBudgets({ period: '2026' })

    expect(rows.map(r => [r.object_type, r.object_id, r.direction, r.status])).toEqual([
      ['vendor', 'v-1', 'push', 'skipped'],
      ['purchase_order', 'po-1', 'push', 'skipped'],
      ['invoice', 'inv-1', 'push', 'skipped'],
      ['payment', 'pay-1', 'push', 'skipped'],
      ['budget', null, 'pull', 'skipped'],
    ])
  })

  it('never claims success — nothing was delivered', async () => {
    const { adapter } = recordingAdapter()
    expect(await adapter.pushPO('po-1', {})).toEqual({ status: 'skipped' })
  })

  it('stamps the org and provider on every row', async () => {
    const rows: LogRow[] = []
    const adapter = new NoopAdapter('odoo', 'org-9', async r => { rows.push(r) })
    await adapter.pushVendor('v-1', {})
    expect(rows[0]).toMatchObject({ organisation_id: 'org-9', provider: 'odoo', error: null })
  })
})

describe('dispatch', () => {
  it('routes each V1 event to its adapter method', async () => {
    const { adapter, rows } = recordingAdapter()
    await dispatch(adapter, 'vendor.created', 'v-1', {})
    await dispatch(adapter, 'po.sent', 'po-1', {})
    await dispatch(adapter, 'invoice.approved', 'inv-1', {})
    expect(rows.map(r => r.object_type)).toEqual(['vendor', 'purchase_order', 'invoice'])
  })
})

describe('fireErpEvent — must never break the flow that triggered it', () => {
  it('resolves quietly when the org has no connection', async () => {
    await expect(fireErpEvent('org-1', 'po.sent', 'po-1', {}, async () => null)).resolves.toBeUndefined()
  })

  it('swallows a resolver that throws (e.g. the migration was never run)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(fireErpEvent('org-1', 'po.sent', 'po-1', {}, async () => {
      throw new Error('relation "erp_connections" does not exist')
    })).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('swallows an adapter whose log write fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const broken = new NoopAdapter('none', 'org-1', async () => { throw new Error('insert refused') })
    await expect(fireErpEvent('org-1', 'vendor.created', 'v-1', {}, async () => broken))
      .resolves.toBeUndefined()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('still writes the row when everything is healthy', async () => {
    const { adapter, rows } = recordingAdapter()
    await fireErpEvent('org-1', 'invoice.approved', 'inv-1', { amount: 700 }, async () => adapter as ErpAdapter)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ object_type: 'invoice', object_id: 'inv-1', payload: { amount: 700 } })
  })
})
