-- Heyford Park minimal build
-- Adds: optional planning reference, client-level search terms,
-- "Ongoing Media Monitoring" application stage, and match_type tag on analysis_items.
--
-- Idempotent: safe to re-run. Uses IF (NOT) EXISTS and catalog checks so a partial
-- prior run can be completed without manual intervention.

-- 1. Allow projects without a planning reference (idempotent)
ALTER TABLE projects ALTER COLUMN planning_reference DROP NOT NULL;

-- 2. Add client_search_terms column (idempotent)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_search_terms text;

-- 3. Swap the application_stage CHECK constraint (idempotent)
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_application_stage_check;
ALTER TABLE projects ADD CONSTRAINT projects_application_stage_check
  CHECK (application_stage IN (
    'Pre-app', 'Submitted', 'Consultation', 'Committee',
    'Appeal', 'Approved', 'Refused', 'Ongoing Media Monitoring'
  ));

-- 4. Add match_type column on analysis_items (idempotent)
ALTER TABLE analysis_items ADD COLUMN IF NOT EXISTS match_type text;

-- 5. Add the match_type CHECK constraint if it isn't there yet
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'analysis_items'::regclass
      AND conname = 'analysis_items_match_type_check'
  ) THEN
    ALTER TABLE analysis_items
      ADD CONSTRAINT analysis_items_match_type_check
        CHECK (match_type IS NULL OR match_type IN ('project', 'client'));
  END IF;
END $$;

-- 6. Index on match_type (idempotent)
CREATE INDEX IF NOT EXISTS idx_analysis_items_match_type ON analysis_items(match_type);
