-- Sprint K — Teams + additional workers on work orders
-- Run in Supabase SQL editor. Idempotent.
--
-- UpKeep-parity feature: group users into teams, then assign a team and/or
-- additional workers (beyond the main assignee) to a work order.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Teams
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_ar TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_teams_org ON teams(organisation_id);

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS teams_org_select ON teams;
CREATE POLICY teams_org_select ON teams
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS teams_org_insert ON teams;
CREATE POLICY teams_org_insert ON teams
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS teams_org_update ON teams;
CREATE POLICY teams_org_update ON teams
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS teams_org_delete ON teams;
CREATE POLICY teams_org_delete ON teams
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid())
  );

-- 2. Team members (join table)
CREATE TABLE IF NOT EXISTS team_members (
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organisation_id UUID NOT NULL,
  PRIMARY KEY (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS team_members_org_select ON team_members;
CREATE POLICY team_members_org_select ON team_members
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS team_members_org_insert ON team_members;
CREATE POLICY team_members_org_insert ON team_members
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS team_members_org_update ON team_members;
CREATE POLICY team_members_org_update ON team_members
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS team_members_org_delete ON team_members;
CREATE POLICY team_members_org_delete ON team_members
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid())
  );

-- 3. Team + additional workers on work orders
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS additional_workers UUID[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_work_orders_team ON work_orders(team_id);
