-- Run this query in Supabase SQL editor to add the academic_year column
ALTER TABLE projects ADD COLUMN IF NOT EXISTS academic_year TEXT;