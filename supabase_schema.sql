-- =====================================================
-- Project Management Tool — Database Schema
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. PROFILES (extends Supabase Auth users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. PROJECTS (top-level container for work)
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'on_hold', 'cancelled')),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. BUDGETS (one project can have multiple budget versions)
CREATE TABLE IF NOT EXISTS budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  currency TEXT NOT NULL DEFAULT 'INR',
  working_days_per_month NUMERIC NOT NULL DEFAULT 20,
  total_estimated_budget NUMERIC NOT NULL DEFAULT 0,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. BUDGET ROLES (customizable per budget)
CREATE TABLE IF NOT EXISTS budget_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID REFERENCES budgets(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  cost_per_month NUMERIC NOT NULL DEFAULT 0,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. BUDGET SECTIONS  (group line items; supports nesting via parent_section_id)
CREATE TABLE IF NOT EXISTS budget_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID REFERENCES budgets(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  parent_section_id UUID REFERENCES budget_sections(id) ON DELETE CASCADE,
  display_order INT NOT NULL DEFAULT 0,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. BUDGET LINE ITEMS (one row = one work step)
CREATE TABLE IF NOT EXISTS budget_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID REFERENCES budget_sections(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  unit_of_calculation TEXT DEFAULT '',
  number_of_units NUMERIC NOT NULL DEFAULT 0,
  line_total NUMERIC NOT NULL DEFAULT 0,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. BUDGET NORMS (effort per role per line item — the core calculation cell)
CREATE TABLE IF NOT EXISTS budget_norms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_item_id UUID REFERENCES budget_line_items(id) ON DELETE CASCADE NOT NULL,
  role_id UUID REFERENCES budget_roles(id) ON DELETE CASCADE NOT NULL,
  norms_per_unit NUMERIC NOT NULL DEFAULT 0,
  total_mandays NUMERIC NOT NULL DEFAULT 0,
  total_cost NUMERIC NOT NULL DEFAULT 0,
  UNIQUE(line_item_id, role_id)
);

-- =====================================================
-- TRIGGERS: auto-update updated_at timestamps
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_budgets_updated_at
  BEFORE UPDATE ON budgets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- TRIGGER: auto-create profile on new user signup
-- =====================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.email, '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_norms ENABLE ROW LEVEL SECURITY;

-- PROFILES: all authenticated users can read; only own profile writable
CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- PROJECTS: all authenticated users can read & create; only creator can update/delete
CREATE POLICY "projects_select" ON projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "projects_insert" ON projects FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "projects_update" ON projects FOR UPDATE TO authenticated USING (auth.uid() = created_by);
CREATE POLICY "projects_delete" ON projects FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- BUDGETS: all authenticated users can read; only creator can write
CREATE POLICY "budgets_select" ON budgets FOR SELECT TO authenticated USING (true);
CREATE POLICY "budgets_insert" ON budgets FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "budgets_update" ON budgets FOR UPDATE TO authenticated USING (auth.uid() = created_by);
CREATE POLICY "budgets_delete" ON budgets FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- BUDGET ROLES: all can read; only budget owner can write
CREATE POLICY "budget_roles_select" ON budget_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "budget_roles_insert" ON budget_roles FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM budgets WHERE id = budget_id AND created_by = auth.uid()));
CREATE POLICY "budget_roles_update" ON budget_roles FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM budgets WHERE id = budget_id AND created_by = auth.uid()));
CREATE POLICY "budget_roles_delete" ON budget_roles FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM budgets WHERE id = budget_id AND created_by = auth.uid()));

-- BUDGET SECTIONS: all can read; only budget owner can write
CREATE POLICY "budget_sections_select" ON budget_sections FOR SELECT TO authenticated USING (true);
CREATE POLICY "budget_sections_insert" ON budget_sections FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM budgets WHERE id = budget_id AND created_by = auth.uid()));
CREATE POLICY "budget_sections_update" ON budget_sections FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM budgets WHERE id = budget_id AND created_by = auth.uid()));
CREATE POLICY "budget_sections_delete" ON budget_sections FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM budgets WHERE id = budget_id AND created_by = auth.uid()));

-- BUDGET LINE ITEMS: all can read; only budget owner can write (via section → budget)
CREATE POLICY "line_items_select" ON budget_line_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "line_items_insert" ON budget_line_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM budget_sections bs
    JOIN budgets b ON b.id = bs.budget_id
    WHERE bs.id = section_id AND b.created_by = auth.uid()
  ));
CREATE POLICY "line_items_update" ON budget_line_items FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM budget_sections bs
    JOIN budgets b ON b.id = bs.budget_id
    WHERE bs.id = section_id AND b.created_by = auth.uid()
  ));
CREATE POLICY "line_items_delete" ON budget_line_items FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM budget_sections bs
    JOIN budgets b ON b.id = bs.budget_id
    WHERE bs.id = section_id AND b.created_by = auth.uid()
  ));

-- BUDGET NORMS: all can read; only budget owner can write (via line item → section → budget)
CREATE POLICY "norms_select" ON budget_norms FOR SELECT TO authenticated USING (true);
CREATE POLICY "norms_insert" ON budget_norms FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM budget_line_items li
    JOIN budget_sections bs ON bs.id = li.section_id
    JOIN budgets b ON b.id = bs.budget_id
    WHERE li.id = line_item_id AND b.created_by = auth.uid()
  ));
CREATE POLICY "norms_update" ON budget_norms FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM budget_line_items li
    JOIN budget_sections bs ON bs.id = li.section_id
    JOIN budgets b ON b.id = bs.budget_id
    WHERE li.id = line_item_id AND b.created_by = auth.uid()
  ));
CREATE POLICY "norms_delete" ON budget_norms FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM budget_line_items li
    JOIN budget_sections bs ON bs.id = li.section_id
    JOIN budgets b ON b.id = bs.budget_id
    WHERE li.id = line_item_id AND b.created_by = auth.uid()
  ));
