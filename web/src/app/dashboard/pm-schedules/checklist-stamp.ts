// FM-05: expand a checklist template's items into work_order_tasks rows for a
// freshly generated PM work order. No-op when templateId is empty.
//
// Shared by the PM new-form "create first WO now" block, the PM list "Generate WO"
// action, and the pm-generate cron. Keep in sync with the SQL fn
// generate_due_pm_work_orders() (SQL Files/b6-01-pm-checklists.sql),
// which does the same stamping for cron/pg_cron-driven generation.
//
// Accepts either the browser or the service-role supabase client (same API), so
// the parameter is loosely typed.

type ChecklistItem = { title?: string | null; title_ar?: string | null }

export async function stampChecklistTasks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  args: { organisationId: string; workOrderId: string; templateId: string | null | undefined },
): Promise<void> {
  if (!args.templateId) return
  const { data: tpl } = await db
    .from('checklist_templates')
    .select('items')
    .eq('id', args.templateId)
    .single()
  const items: ChecklistItem[] = Array.isArray(tpl?.items) ? tpl.items : []
  const rows = items
    .map((it, i) => ({
      organisation_id: args.organisationId,
      work_order_id: args.workOrderId,
      title: (it.title || it.title_ar || '').trim(),
      title_ar: it.title_ar?.trim() || null,
      sort_order: i,
    }))
    .filter(r => r.title)
  if (rows.length > 0) await db.from('work_order_tasks').insert(rows)
}
