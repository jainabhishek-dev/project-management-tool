-- =====================================================
-- Project Planning Schema v3 — Run in Supabase SQL Editor
-- =====================================================
-- Prerequisite: planning_schema_v2.sql must already be applied.

-- 1. New plan_books table (user-defined books)
CREATE TABLE IF NOT EXISTS plan_books (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id       UUID REFERENCES project_plans(id) ON DELETE CASCADE NOT NULL,
  name          TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE plan_books ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pb_select" ON plan_books
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "pb_insert" ON plan_books
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM project_plans WHERE id = plan_id AND created_by = auth.uid()
  ));

CREATE POLICY "pb_update" ON plan_books
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM project_plans WHERE id = plan_id AND created_by = auth.uid()
  ));

CREATE POLICY "pb_delete" ON plan_books
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM project_plans WHERE id = plan_id AND created_by = auth.uid()
  ));

-- 2. Add book_id and display_order to planning_deliverables
--    term and class_name made nullable (deprecated — book name now captures this)
ALTER TABLE planning_deliverables
  ADD COLUMN IF NOT EXISTS book_id UUID REFERENCES plan_books(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS display_order INT NOT NULL DEFAULT 0;

ALTER TABLE planning_deliverables
  ALTER COLUMN term      DROP NOT NULL,
  ALTER COLUMN class_name DROP NOT NULL;

-- 3. Add unit_of_calculation, norm_pages, and book_norm_in_mandays to planning_steps
--    unit_of_calculation: 'Chapter / Unit' | 'Book'
--    norm_pages: reference page count for scaling (0 = no scaling)
--    book_norm_in_mandays: effort for book-level steps (replaces per-cluster norm for book steps)
ALTER TABLE planning_steps
  ADD COLUMN IF NOT EXISTS unit_of_calculation  TEXT NOT NULL DEFAULT 'Chapter / Unit',
  ADD COLUMN IF NOT EXISTS norm_pages           INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS book_norm_in_mandays NUMERIC NOT NULL DEFAULT 0;

-- 4. Add book_id and plan_team_member_id to planning_tasks
--    deliverable_id made nullable (book-level tasks have no individual deliverable)
ALTER TABLE planning_tasks
  ALTER COLUMN deliverable_id DROP NOT NULL;

ALTER TABLE planning_tasks
  ADD COLUMN IF NOT EXISTS book_id              UUID REFERENCES plan_books(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS plan_team_member_id  UUID REFERENCES plan_team_members(id) ON DELETE SET NULL;

-- Drop the old unique constraint and replace with partial indexes
--   (chapter tasks: deliverable_id + step_id unique)
--   (book tasks:    book_id        + step_id unique)
ALTER TABLE planning_tasks
  DROP CONSTRAINT IF EXISTS planning_tasks_deliverable_id_step_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_chapter_step
  ON planning_tasks(deliverable_id, step_id)
  WHERE deliverable_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_book_step
  ON planning_tasks(book_id, step_id)
  WHERE book_id IS NOT NULL;
