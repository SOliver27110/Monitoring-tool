-- RSS Feeds table — manage feed sources per project
-- Supports Google News RSS, direct RSS feeds, and custom URLs

CREATE TABLE IF NOT EXISTS feeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  feed_type text NOT NULL DEFAULT 'google_news'
    CHECK (feed_type IN ('google_news', 'rss_direct')),
  -- For google_news: the search query. For rss_direct: the RSS feed URL.
  feed_url text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  last_fetched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_feeds_project_id ON feeds(project_id);
CREATE INDEX idx_feeds_enabled ON feeds(enabled);

CREATE TRIGGER update_feeds_updated_at
  BEFORE UPDATE ON feeds
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE feeds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Feeds are viewable by authenticated users" ON feeds
  FOR SELECT USING (true);

CREATE POLICY "Feeds can be created by authenticated users" ON feeds
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Feeds can be updated by authenticated users" ON feeds
  FOR UPDATE USING (true);

CREATE POLICY "Feeds can be deleted by authenticated users" ON feeds
  FOR DELETE USING (true);

-- Add confidence_score to analysis_items
ALTER TABLE analysis_items
  ADD COLUMN confidence_score integer
    CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 100));

ALTER TABLE analysis_items
  ADD COLUMN needs_review boolean NOT NULL DEFAULT false;

CREATE INDEX idx_analysis_items_needs_review ON analysis_items(needs_review);
CREATE INDEX idx_analysis_items_confidence ON analysis_items(confidence_score);
