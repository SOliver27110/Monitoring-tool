-- Allow analysis_items to be inserted without analysis results (pending_analysis)
ALTER TABLE analysis_items
  ALTER COLUMN summary DROP NOT NULL,
  ALTER COLUMN sentiment DROP NOT NULL,
  ALTER COLUMN alert_level DROP NOT NULL,
  ALTER COLUMN recommended_action DROP NOT NULL;

-- Add pending_analysis to review_status CHECK
ALTER TABLE analysis_items DROP CONSTRAINT IF EXISTS analysis_items_review_status_check;
ALTER TABLE analysis_items ADD CONSTRAINT analysis_items_review_status_check
  CHECK (review_status IN ('pending_analysis', 'unreviewed', 'approved', 'dismissed'));
