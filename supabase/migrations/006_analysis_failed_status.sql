-- Add analysis_failed to review_status CHECK so failed items stop retrying
ALTER TABLE analysis_items DROP CONSTRAINT IF EXISTS analysis_items_review_status_check;
ALTER TABLE analysis_items ADD CONSTRAINT analysis_items_review_status_check
  CHECK (review_status IN ('pending_analysis', 'unreviewed', 'approved', 'dismissed', 'analysis_failed'));
