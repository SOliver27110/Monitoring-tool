-- Table: feeds
CREATE TABLE feeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  feed_type text NOT NULL CHECK (feed_type IN ('google_news', 'local_news', 'planning_press', 'council')),
  is_active boolean NOT NULL DEFAULT true,
  last_fetched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE feeds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read feeds" ON feeds FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert feeds" ON feeds FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update feeds" ON feeds FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete feeds" ON feeds FOR DELETE TO authenticated USING (true);

-- Table: fetched_articles
CREATE TABLE fetched_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id uuid REFERENCES feeds(id) ON DELETE SET NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  title text NOT NULL,
  excerpt text,
  url text,
  source_name text,
  published_at timestamptz,
  guid text NOT NULL UNIQUE,
  matched_by text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'matched', 'unmatched', 'analysed', 'dismissed')),
  analysis_item_id uuid REFERENCES analysis_items(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE fetched_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read fetched_articles" ON fetched_articles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert fetched_articles" ON fetched_articles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update fetched_articles" ON fetched_articles FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete fetched_articles" ON fetched_articles FOR DELETE TO authenticated USING (true);

-- Indexes
CREATE INDEX idx_fetched_articles_status ON fetched_articles(status);
CREATE INDEX idx_fetched_articles_project_id ON fetched_articles(project_id);
CREATE INDEX idx_feeds_project_id ON feeds(project_id);

-- Add confidence columns to analysis_items
ALTER TABLE analysis_items ADD COLUMN confidence_score numeric;
ALTER TABLE analysis_items ADD COLUMN needs_review boolean NOT NULL DEFAULT false;
CREATE INDEX idx_analysis_items_needs_review ON analysis_items(needs_review);
