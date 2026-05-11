import { Suspense } from 'react'
import InvoiceForm from './InvoiceForm'

export default function NewInvoicePage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', color: '#4A5568' }}>Loading...</div>}>
      <InvoiceForm />
    </Suspense>
  )
}
