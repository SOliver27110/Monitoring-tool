-- Add optional exclusion_terms column to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS exclusion_terms text;
