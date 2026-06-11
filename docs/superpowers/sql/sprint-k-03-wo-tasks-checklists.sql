-- Sprint K — Work order tasks (sub-task checklists) + checklist templates
-- Run in Supabase SQL editor. Idempotent.
--
-- UpKeep-parity feature: work orders carry a list of check-off tasks. Templates
-- let managers pre-build common checklists (e.g. "AC quarterly PM") and apply
-- them when creating a WO. Also adds estimated_duration_minutes to work_orders.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Per-work-order tasks
CREATE TABLE IF NOT EXISTS work_order_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  work_order_id UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  title_ar TEXT,
  is_done BOOLEAN DEFAULT false,
  done_by UUID REFERENCES users(id) ON DELETE SET NULL,
  done_at TIMESTAMPTZ,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wo_tasks_wo ON work_order_tasks(work_order_id);

ALTER TABLE work_order_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wo_tasks_org_select ON work_order_tasks;
CREATE POLICY wo_tasks_org_select ON work_order_tasks
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS wo_tasks_org_insert ON work_order_tasks;
CREATE POLICY wo_tasks_org_insert ON work_order_tasks
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS wo_tasks_org_update ON work_order_tasks;
CREATE POLICY wo_tasks_org_update ON work_order_tasks
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS wo_tasks_org_delete ON work_order_tasks;
CREATE POLICY wo_tasks_org_delete ON work_order_tasks
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid())
  );

-- 2. Reusable checklist templates (items = jsonb array of {title, title_ar})
CREATE TABLE IF NOT EXISTS checklist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_ar TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checklist_templates_org ON checklist_templates(organisation_id);

ALTER TABLE checklist_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS checklist_templates_org_select ON checklist_templates;
CREATE POLICY checklist_templates_org_select ON checklist_templates
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS checklist_templates_org_insert ON checklist_templates;
CREATE POLICY checklist_templates_org_insert ON checklist_templates
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS checklist_templates_org_update ON checklist_templates;
CREATE POLICY checklist_templates_org_update ON checklist_templates
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS checklist_templates_org_delete ON checklist_templates;
CREATE POLICY checklist_templates_org_delete ON checklist_templates
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid())
  );

-- 3. Estimated duration on work orders (minutes)
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS estimated_duration_minutes INTEGER;
