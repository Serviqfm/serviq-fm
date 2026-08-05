export type Priority = 'low' | 'medium' | 'high' | 'critical'
export type WorkOrderStatus = 'new' | 'assigned' | 'in_progress' | 'on_hold' | 'completed' | 'closed'

export interface WorkOrder {
  id: string
  organisation_id: string
  site_id: string | null
  asset_id: string | null
  created_by: string
  assigned_to: string | null
  assigned_vendor_id: string | null
  signed_off_by: string | null
  title: string
  title_ar: string | null
  description: string | null
  category: string | null
  priority: Priority
  status: WorkOrderStatus
  custom_status_id: string | null
  wo_number: number | null
  request_id: string | null
  space_id: string | null
  sla_hours: number | null
  due_at: string | null
  started_at: string | null
  completed_at: string | null
  closed_at: string | null
  archived_at?: string | null
  photo_urls: string[]
  media_expires_at: string
  completion_notes: string | null
  actual_cost: number | null
  estimated_duration_minutes: number | null
  team_id: string | null
  additional_workers: string[]
  source: string
  created_at: string
  updated_at: string
  assignee?: { full_name: string; email?: string } | null
  vendor?: { company_name: string } | null
  asset?: { name: string } | null
  site?: { name: string; invoicing_enabled?: boolean } | null
  team?: { name: string; name_ar?: string | null } | null
}

export interface Team {
  id: string
  organisation_id: string
  name: string
  name_ar: string | null
  description: string | null
  created_at: string
}

export interface TeamMember {
  team_id: string
  user_id: string
  organisation_id: string
}

export interface WorkOrderTask {
  id: string
  organisation_id: string
  work_order_id: string
  title: string
  title_ar: string | null
  is_done: boolean
  done_by: string | null
  done_at: string | null
  sort_order: number
  created_at: string
  // WO-20: per-task note, attached image, pass/flag/fail result, required flag.
  note: string | null
  image_url: string | null
  result: 'pass' | 'flag' | 'fail' | null
  is_required: boolean
  done_by_user?: { full_name: string } | null
}

export interface ChecklistTemplateItem {
  title: string
  title_ar?: string
}

export interface ChecklistTemplate {
  id: string
  organisation_id: string
  name: string
  name_ar: string | null
  items: ChecklistTemplateItem[]
  created_at: string
}

export interface WorkOrderTemplate {
  id: string
  organisation_id: string
  name: string
  name_ar: string | null
  title: string | null
  description: string | null
  priority: string | null
  category: string | null
  asset_id: string | null
  assigned_to: string | null
  estimated_duration_minutes: number | null
  tasks: ChecklistTemplateItem[]
  created_by: string | null
  created_at: string
}