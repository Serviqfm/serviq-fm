'use client'

// Thin wrapper around the generic EntityFilesTab, kept so existing imports work.
import EntityFilesTab from '@/components/EntityFilesTab'

export default function WorkOrderFilesTab({ woId, orgId }: { woId: string; orgId: string }) {
  return <EntityFilesTab entityType="work_order" entityId={woId} orgId={orgId} bucket="work-order-media" />
}
