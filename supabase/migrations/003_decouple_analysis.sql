-- Batch B: decouple ingest from analysis + full article text extraction.
--
-- scan/route.ts now lands rows quickly with analysis_status = 'pending',
-- storing full_text extracted from the publisher when possible. A separate
-- worker (/api/analyse-pending) then calls Claude on the full text and
-- updates the row to 'complete' (or 'failed' after 3 attempts).
--
-- Idempotent: safe to re-run. Uses IF (NOT) EXISTS and DROP CONSTRAINT IF EXISTS
-- so a partial prior run can be completed without manual intervention.
-- Follows the pattern established in migration 002.

-- 1. New columns on analysis_items.
--    full_text / extraction_status populate during ingest.
--    analysis_status / analysis_attempts / analysis_last_error / analysis_completed_at
--    populate post-ingest via /api/analyse-pending.
ALTER TABLE analysis_items ADD COLUMN IF NOT EXISTS full_text text;
ALTER TABLE analysis_items ADD COLUMN IF NOT EXISTS extraction_status text;
ALTER TABLE analysis_items ADD COLUMN IF NOT EXISTS analysis_status text NOT NULL DEFAULT 'pending';
ALTER TABLE analysis_items ADD COLUMN IF NOT EXISTS analysis_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE analysis_items ADD COLUMN IF NOT EXISTS analysis_last_error text;
ALTER TABLE analysis_items ADD COLUMN IF NOT EXISTS analysis_completed_at timestamptz;

-- 2. CHECK constraints for the new status columns.
--    Drop-then-add so values are guaranteed correct even if an earlier
--    branch created constraints with different allowed values.
ALTER TABLE analysis_items DROP CONSTRAINT IF EXISTS analysis_items_extraction_status_check;
ALTER TABLE analysis_items ADD CONSTRAINT analysis_items_extraction_status_check
  CHECK (extraction_status IS NULL OR extraction_status IN ('pending', 'success', 'failed', 'paywalled'));

ALTER TABLE analysis_items DROP CONSTRAINT IF EXISTS analysis_items_analysis_status_check;
ALTER TABLE analysis_items ADD CONSTRAINT analysis_items_analysis_status_check
  CHECK (analysis_status IN ('pending', 'analysing', 'complete', 'failed'));

-- 3. Drop NOT NULL on analysis fields — they populate post-ingest now.
--    DROP NOT NULL is a no-op if already nullable, so this is idempotent.
ALTER TABLE analysis_items ALTER COLUMN summary DROP NOT NULL;
ALTER TABLE analysis_items ALTER COLUMN sentiment DROP NOT NULL;
ALTER TABLE analysis_items ALTER COLUMN alert_level DROP NOT NULL;
ALTER TABLE analysis_items ALTER COLUMN recommended_action DROP NOT NULL;

-- 4. Backfill existing rows — everything pre-Batch B was analysed inline,
--    so mark those rows complete and stamp analysis_completed_at from
--    updated_at (best guess of when analysis landed).
--
--    Safe to re-run:
--      * Pre-B rows become 'complete' on first run; on re-run they no longer
--        match analysis_status = 'pending'.
--      * New post-B pending rows have summary IS NULL, so the filter skips
--        them and leaves them pending for the worker.
--      * COALESCE preserves any analysis_completed_at we might have already
--        stamped in a prior partial run.
UPDATE analysis_items
  SET analysis_status = 'complete',
      analysis_completed_at = COALESCE(analysis_completed_at, updated_at)
  WHERE summary IS NOT NULL
    AND analysis_status = 'pending';

-- 5. Partial index for the worker's hot-path SELECT on pending rows.
CREATE INDEX IF NOT EXISTS idx_analysis_items_analysis_status
  ON analysis_items(analysis_status)
  WHERE analysis_status = 'pending';
