-- Update RLS Policies to allow explicit Admins to bypass standard Owner restrictions

-- 1. Projects
DROP POLICY IF EXISTS "projects_update" ON projects;
CREATE POLICY "projects_update" ON projects FOR UPDATE TO authenticated 
USING (auth.uid() = created_by OR auth.jwt()->>'email' IN ('abhishek.jain@leadschool.in', 'disha.jain@leadschool.in', 'visalam.narayanan@leadschool.in'));

DROP POLICY IF EXISTS "projects_delete" ON projects;
CREATE POLICY "projects_delete" ON projects FOR DELETE TO authenticated 
USING (auth.uid() = created_by OR auth.jwt()->>'email' IN ('abhishek.jain@leadschool.in', 'disha.jain@leadschool.in', 'visalam.narayanan@leadschool.in'));


-- 2. Budgets
DROP POLICY IF EXISTS "budgets_update" ON budgets;
CREATE POLICY "budgets_update" ON budgets FOR UPDATE TO authenticated 
USING (auth.uid() = created_by OR auth.jwt()->>'email' IN ('abhishek.jain@leadschool.in', 'disha.jain@leadschool.in', 'visalam.narayanan@leadschool.in'));

DROP POLICY IF EXISTS "budgets_delete" ON budgets;
CREATE POLICY "budgets_delete" ON budgets FOR DELETE TO authenticated 
USING (auth.uid() = created_by OR auth.jwt()->>'email' IN ('abhishek.jain@leadschool.in', 'disha.jain@leadschool.in', 'visalam.narayanan@leadschool.in'));


-- 3. Budget Roles
DROP POLICY IF EXISTS "budget_roles_insert" ON budget_roles;
CREATE POLICY "budget_roles_insert" ON budget_roles FOR INSERT TO authenticated
  WITH CHECK (
    auth.jwt()->>'email' IN ('abhishek.jain@leadschool.in', 'disha.jain@leadschool.in', 'visalam.narayanan@leadschool.in') 
    OR EXISTS (SELECT 1 FROM budgets WHERE id = budget_id AND created_by = auth.uid())
  );

DROP POLICY IF EXISTS "budget_roles_update" ON budget_roles;
CREATE POLICY "budget_roles_update" ON budget_roles FOR UPDATE TO authenticated
  USING (
    auth.jwt()->>'email' IN ('abhishek.jain@leadschool.in', 'disha.jain@leadschool.in', 'visalam.narayanan@leadschool.in') 
    OR EXISTS (SELECT 1 FROM budgets WHERE id = budget_id AND created_by = auth.uid())
  );

DROP POLICY IF EXISTS "budget_roles_delete" ON budget_roles;
CREATE POLICY "budget_roles_delete" ON budget_roles FOR DELETE TO authenticated
  USING (
    auth.jwt()->>'email' IN ('abhishek.jain@leadschool.in', 'disha.jain@leadschool.in', 'visalam.narayanan@leadschool.in') 
    OR EXISTS (SELECT 1 FROM budgets WHERE id = budget_id AND created_by = auth.uid())
  );


-- 4. Budget Sections
DROP POLICY IF EXISTS "budget_sections_insert" ON budget_sections;
CREATE POLICY "budget_sections_insert" ON budget_sections FOR INSERT TO authenticated
  WITH CHECK (
    auth.jwt()->>'email' IN ('abhishek.jain@leadschool.in', 'disha.jain@leadschool.in', 'visalam.narayanan@leadschool.in') 
    OR EXISTS (SELECT 1 FROM budgets WHERE id = budget_id AND created_by = auth.uid())
  );

DROP POLICY IF EXISTS "budget_sections_update" ON budget_sections;
CREATE POLICY "budget_sections_update" ON budget_sections FOR UPDATE TO authenticated
  USING (
    auth.jwt()->>'email' IN ('abhishek.jain@leadschool.in', 'disha.jain@leadschool.in', 'visalam.narayanan@leadschool.in') 
    OR EXISTS (SELECT 1 FROM budgets WHERE id = budget_id AND created_by = auth.uid())
  );

DROP POLICY IF EXISTS "budget_sections_delete" ON budget_sections;
CREATE POLICY "budget_sections_delete" ON budget_sections FOR DELETE TO authenticated
  USING (
    auth.jwt()->>'email' IN ('abhishek.jain@leadschool.in', 'disha.jain@leadschool.in', 'visalam.narayanan@leadschool.in') 
    OR EXISTS (SELECT 1 FROM budgets WHERE id = budget_id AND created_by = auth.uid())
  );


-- 5. Budget Line Items
DROP POLICY IF EXISTS "line_items_insert" ON budget_line_items;
CREATE POLICY "line_items_insert" ON budget_line_items FOR INSERT TO authenticated
  WITH CHECK (
    auth.jwt()->>'email' IN ('abhishek.jain@leadschool.in', 'disha.jain@leadschool.in', 'visalam.narayanan@leadschool.in') 
    OR EXISTS (
      SELECT 1 FROM budget_sections bs
      JOIN budgets b ON b.id = bs.budget_id
      WHERE bs.id = section_id AND b.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "line_items_update" ON budget_line_items;
CREATE POLICY "line_items_update" ON budget_line_items FOR UPDATE TO authenticated
  USING (
    auth.jwt()->>'email' IN ('abhishek.jain@leadschool.in', 'disha.jain@leadschool.in', 'visalam.narayanan@leadschool.in') 
    OR EXISTS (
      SELECT 1 FROM budget_sections bs
      JOIN budgets b ON b.id = bs.budget_id
      WHERE bs.id = section_id AND b.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "line_items_delete" ON budget_line_items;
CREATE POLICY "line_items_delete" ON budget_line_items FOR DELETE TO authenticated
  USING (
    auth.jwt()->>'email' IN ('abhishek.jain@leadschool.in', 'disha.jain@leadschool.in', 'visalam.narayanan@leadschool.in') 
    OR EXISTS (
      SELECT 1 FROM budget_sections bs
      JOIN budgets b ON b.id = bs.budget_id
      WHERE bs.id = section_id AND b.created_by = auth.uid()
    )
  );


-- 6. Budget Norms
DROP POLICY IF EXISTS "norms_insert" ON budget_norms;
CREATE POLICY "norms_insert" ON budget_norms FOR INSERT TO authenticated
  WITH CHECK (
    auth.jwt()->>'email' IN ('abhishek.jain@leadschool.in', 'disha.jain@leadschool.in', 'visalam.narayanan@leadschool.in') 
    OR EXISTS (
      SELECT 1 FROM budget_line_items li
      JOIN budget_sections bs ON bs.id = li.section_id
      JOIN budgets b ON b.id = bs.budget_id
      WHERE li.id = line_item_id AND b.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "norms_update" ON budget_norms;
CREATE POLICY "norms_update" ON budget_norms FOR UPDATE TO authenticated
  USING (
    auth.jwt()->>'email' IN ('abhishek.jain@leadschool.in', 'disha.jain@leadschool.in', 'visalam.narayanan@leadschool.in') 
    OR EXISTS (
      SELECT 1 FROM budget_line_items li
      JOIN budget_sections bs ON bs.id = li.section_id
      JOIN budgets b ON b.id = bs.budget_id
      WHERE li.id = line_item_id AND b.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "norms_delete" ON budget_norms;
CREATE POLICY "norms_delete" ON budget_norms FOR DELETE TO authenticated
  USING (
    auth.jwt()->>'email' IN ('abhishek.jain@leadschool.in', 'disha.jain@leadschool.in', 'visalam.narayanan@leadschool.in') 
    OR EXISTS (
      SELECT 1 FROM budget_line_items li
      JOIN budget_sections bs ON bs.id = li.section_id
      JOIN budgets b ON b.id = bs.budget_id
      WHERE li.id = line_item_id AND b.created_by = auth.uid()
    )
  );
