export type Priority = 'low' | 'medium' | 'high' | 'critical'
export type WorkOrderStatus = 'new' | 'assigned' | 'in_progress' | 'on_hold' | 'completed' | 'closed'

export interface WorkOrder {
  id: string
  organisation_id: string
  site_id: string | null
  asset_id: string | null
  created_by: string
  assigned_to: string | null
  title: string
  title_ar: string | null
  description: string | null
  priority: Priority
  status: WorkOrderStatus
  sla_hours: number | null
  due_at: string | null
  started_at: string | null
  completed_at: string | null
  closed_at: string | null
  photo_urls: string[]
  media_expires_at: string
  completion_notes: string | null
  source: string
  created_at: string
  updated_at: string
  assignee?: { full_name: string } | null
  asset?: { name: string } | null
  site?: { name: string } | null
}