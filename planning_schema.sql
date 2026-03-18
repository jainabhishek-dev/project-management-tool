-- =====================================================
-- Project Management Tool — Project Planning Schema
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. CLUSTERS (Complexity Levels)
CREATE TABLE IF NOT EXISTS planning_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE, -- Cluster 1, Cluster 2, Cluster 3
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO planning_clusters (name, description) VALUES 
('Cluster 1', 'Low complexity'),
('Cluster 2', 'Medium complexity'),
('Cluster 3', 'High complexity')
ON CONFLICT (name) DO NOTHING;

-- 2. PROJECT PLANS (Each plan is a specific stream like 'Print Coursebook')
CREATE TABLE IF NOT EXISTS project_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL, -- e.g., 'Print Coursebook FY26'
  type TEXT NOT NULL CHECK (type IN ('Print', 'Digital')),
  start_date DATE NOT NULL,
  target_end_date DATE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. PLAN STEPS (The template steps for a work stream)
CREATE TABLE IF NOT EXISTS planning_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES project_plans(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL, -- Step A, Step B, etc.
  role_required TEXT NOT NULL, -- Creator, Reviewer 1, etc.
  parallel_dependency_id UUID REFERENCES planning_steps(id) ON DELETE SET NULL,
  buffer_days NUMERIC NOT NULL DEFAULT 0,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. PLAN NORMS (Effort per cluster per step)
CREATE TABLE IF NOT EXISTS planning_norms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id UUID REFERENCES planning_steps(id) ON DELETE CASCADE NOT NULL,
  cluster_id UUID REFERENCES planning_clusters(id) ON DELETE CASCADE NOT NULL,
  norm_in_mandays NUMERIC NOT NULL DEFAULT 0,
  UNIQUE(step_id, cluster_id)
);

-- 5. DELIVERABLES (The individual units of work)
CREATE TABLE IF NOT EXISTS planning_deliverables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES project_plans(id) ON DELETE CASCADE NOT NULL,
  term TEXT NOT NULL,
  class_name TEXT NOT NULL,
  unit_no TEXT NOT NULL,
  unit_name TEXT NOT NULL,
  cluster_id UUID REFERENCES planning_clusters(id) ON DELETE SET NULL,
  pages INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. TEAM MEMBERS (Assigned to projects/plans)
CREATE TABLE IF NOT EXISTS project_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL, -- The specific role for THIS project
  bandwidth_percentage NUMERIC DEFAULT 100, -- Allocation (0-100)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, profile_id)
);

-- 7. AVAILABILITY OVERRIDES (Master Holidays and Leaves)
CREATE TABLE IF NOT EXISTS availability_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE, -- NULL means global holiday
  date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('Holiday', 'Leave')),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. EXECUTION TASKS (The master schedule)
CREATE TABLE IF NOT EXISTS planning_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES project_plans(id) ON DELETE CASCADE NOT NULL,
  deliverable_id UUID REFERENCES planning_deliverables(id) ON DELETE CASCADE NOT NULL,
  step_id UUID REFERENCES planning_steps(id) ON DELETE CASCADE NOT NULL,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  planned_start_date DATE,
  planned_end_date DATE,
  actual_start_date DATE,
  actual_end_date DATE,
  status TEXT NOT NULL DEFAULT 'Yet to start' CHECK (status IN ('Yet to start', 'In Progress', 'Done', 'Blocked')),
  comments TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(deliverable_id, step_id)
);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE planning_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_norms ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_tasks ENABLE ROW LEVEL SECURITY;

-- Using a simpler policy: Authenticated users can read; creators can write (following the pattern of the budgets table)
CREATE POLICY "planning_select" ON project_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "planning_insert" ON project_plans FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "planning_update" ON project_plans FOR UPDATE TO authenticated USING (auth.uid() = created_by);
CREATE POLICY "planning_delete" ON project_plans FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- Similar for others...
CREATE POLICY "planning_read_all" ON planning_clusters FOR SELECT TO authenticated USING (true);
CREATE POLICY "planning_steps_select" ON planning_steps FOR SELECT TO authenticated USING (true);
CREATE POLICY "planning_norms_select" ON planning_norms FOR SELECT TO authenticated USING (true);
CREATE POLICY "planning_deliverables_select" ON planning_deliverables FOR SELECT TO authenticated USING (true);
CREATE POLICY "project_team_members_select" ON project_team_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "availability_overrides_select" ON availability_overrides FOR SELECT TO authenticated USING (true);
CREATE POLICY "planning_tasks_select" ON planning_tasks FOR SELECT TO authenticated USING (true);
