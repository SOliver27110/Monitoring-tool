-- Add match_type and match_reason columns to analysis_items
-- for two-track article categorisation (project_specific vs area_intelligence)

ALTER TABLE analysis_items
  ADD COLUMN match_type text
    CHECK (match_type IS NULL OR match_type IN ('project_specific', 'area_intelligence'));

ALTER TABLE analysis_items
  ADD COLUMN match_reason text;

CREATE INDEX idx_analysis_items_match_type ON analysis_items(match_type);
