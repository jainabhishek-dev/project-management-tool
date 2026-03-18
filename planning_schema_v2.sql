-- =====================================================
-- Project Planning Schema v2 — Run in Supabase SQL Editor
-- =====================================================

-- 1. Add cluster_labels column to project_plans
--    Stores user-defined labels per cluster, scoped to this plan.
--    e.g. { "<cluster_uuid>": "Minor Modification", ... }
ALTER TABLE project_plans
  ADD COLUMN IF NOT EXISTS cluster_labels JSONB DEFAULT '{}';

-- 2. Create plan_team_members table
--    Stores team members for a specific plan (free-text name).
CREATE TABLE IF NOT EXISTS plan_team_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id       UUID REFERENCES project_plans(id) ON DELETE CASCADE NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL,
  bandwidth     NUMERIC NOT NULL DEFAULT 1
                  CHECK (bandwidth IN (0.25, 0.5, 0.75, 1)),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create plan_leaves table
--    Stores individual leave dates per team member.
CREATE TABLE IF NOT EXISTS plan_leaves (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id          UUID REFERENCES project_plans(id) ON DELETE CASCADE NOT NULL,
  team_member_id   UUID REFERENCES plan_team_members(id) ON DELETE CASCADE NOT NULL,
  leave_date       DATE NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_member_id, leave_date)
);

-- 4. Create plan_holidays table
--    Stores manually-entered public holidays scoped to a specific plan.
--    These dates are blocked for ALL team members on this plan.
CREATE TABLE IF NOT EXISTS plan_holidays (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id       UUID REFERENCES project_plans(id) ON DELETE CASCADE NOT NULL,
  holiday_date  DATE NOT NULL,
  description   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(plan_id, holiday_date)
);

-- 5. Update planning_tasks status check constraint
--    Replace 'Blocked' with 'Skipped'
ALTER TABLE planning_tasks
  DROP CONSTRAINT IF EXISTS planning_tasks_status_check;

ALTER TABLE planning_tasks
  ADD CONSTRAINT planning_tasks_status_check
  CHECK (status IN ('Yet to start', 'In Progress', 'Done', 'Skipped'));

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

-- plan_team_members
ALTER TABLE plan_team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ptm_select" ON plan_team_members
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "ptm_insert" ON plan_team_members
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM project_plans WHERE id = plan_id AND created_by = auth.uid()
  ));

CREATE POLICY "ptm_update" ON plan_team_members
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM project_plans WHERE id = plan_id AND created_by = auth.uid()
  ));

CREATE POLICY "ptm_delete" ON plan_team_members
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM project_plans WHERE id = plan_id AND created_by = auth.uid()
  ));

-- plan_leaves
ALTER TABLE plan_leaves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pl_select" ON plan_leaves
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "pl_insert" ON plan_leaves
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM plan_team_members tm
    JOIN project_plans pp ON pp.id = tm.plan_id
    WHERE tm.id = team_member_id AND pp.created_by = auth.uid()
  ));

CREATE POLICY "pl_update" ON plan_leaves
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM plan_team_members tm
    JOIN project_plans pp ON pp.id = tm.plan_id
    WHERE tm.id = team_member_id AND pp.created_by = auth.uid()
  ));

CREATE POLICY "pl_delete" ON plan_leaves
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM plan_team_members tm
    JOIN project_plans pp ON pp.id = tm.plan_id
    WHERE tm.id = team_member_id AND pp.created_by = auth.uid()
  ));

-- plan_holidays
ALTER TABLE plan_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ph_select" ON plan_holidays
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "ph_insert" ON plan_holidays
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM project_plans WHERE id = plan_id AND created_by = auth.uid()
  ));

CREATE POLICY "ph_update" ON plan_holidays
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM project_plans WHERE id = plan_id AND created_by = auth.uid()
  ));

CREATE POLICY "ph_delete" ON plan_holidays
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM project_plans WHERE id = plan_id AND created_by = auth.uid()
  ));
