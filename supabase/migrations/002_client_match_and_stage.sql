-- Heyford Park minimal build
-- Adds: optional planning reference, client-level search terms,
-- "Ongoing Media Monitoring" application stage, and match_type tag on analysis_items.

-- Before running, confirm the CHECK constraint name on projects.application_stage with:
--   SELECT conname FROM pg_constraint
--   WHERE conrelid = 'projects'::regclass AND contype = 'c';
-- If the name differs from projects_application_stage_check, update the DROP below.

-- Allow projects without a planning reference (ongoing media briefs)
ALTER TABLE projects ALTER COLUMN planning_reference DROP NOT NULL;

-- New: client-level search terms, alongside the existing project-level terms
ALTER TABLE projects ADD COLUMN client_search_terms text;

-- Extend application_stage to include ongoing monitoring briefs
ALTER TABLE projects DROP CONSTRAINT projects_application_stage_check;
ALTER TABLE projects ADD CONSTRAINT projects_application_stage_check
  CHECK (application_stage IN (
    'Pre-app', 'Submitted', 'Consultation', 'Committee',
    'Appeal', 'Approved', 'Refused', 'Ongoing Media Monitoring'
  ));

-- Tag each analysis item with which query produced it
ALTER TABLE analysis_items
  ADD COLUMN match_type text
    CHECK (match_type IS NULL OR match_type IN ('project', 'client'));

CREATE INDEX idx_analysis_items_match_type ON analysis_items(match_type);
