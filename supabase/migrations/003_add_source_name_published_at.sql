-- Add source_name and published_at to analysis_items for article metadata display
ALTER TABLE analysis_items ADD COLUMN IF NOT EXISTS source_name TEXT DEFAULT NULL;
ALTER TABLE analysis_items ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ DEFAULT NULL;
