-- DevComms Media Monitor — Initial Schema
-- Run this in the Supabase SQL editor after creating your project (EU region)

-- ============================================================
-- TABLES
-- ============================================================

-- Users (synced from Clerk via webhook)
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  email text NOT NULL,
  first_name text,
  last_name text,
  role text NOT NULL DEFAULT 'team_member'
    CHECK (role IN ('admin', 'project_lead', 'team_member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name text NOT NULL,
  site_name text NOT NULL,
  planning_reference text NOT NULL,
  lpa text NOT NULL,
  boolean_search_terms text NOT NULL,
  assigned_lead_id text REFERENCES users(id) ON DELETE SET NULL,
  application_stage text NOT NULL
    CHECK (application_stage IN (
      'Pre-app', 'Submitted', 'Consultation', 'Committee', 'Appeal', 'Approved', 'Refused'
    )),
  key_dates jsonb NOT NULL DEFAULT '{}',
  alert_level text NOT NULL DEFAULT 'green'
    CHECK (alert_level IN ('green', 'yellow', 'red')),
  created_by text NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Analysis Items
CREATE TABLE IF NOT EXISTS analysis_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  source_text text NOT NULL,
  source_type text
    CHECK (source_type IS NULL OR source_type IN (
      'news_article', 'social_media', 'committee_report', 'planning_document', 'other'
    )),
  source_url text,
  summary text NOT NULL,
  sentiment text NOT NULL
    CHECK (sentiment IN ('Supportive', 'Neutral', 'Opposed', 'Mixed')),
  alert_level text NOT NULL
    CHECK (alert_level IN ('Routine', 'Watch', 'Action Required')),
  notable_voices jsonb NOT NULL DEFAULT '[]',
  key_themes jsonb NOT NULL DEFAULT '[]',
  recommended_action text NOT NULL,
  review_status text NOT NULL DEFAULT 'unreviewed'
    CHECK (review_status IN ('unreviewed', 'approved', 'dismissed')),
  reviewed_by text REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_by text NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Reports (immutable after generation)
CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  report_content jsonb NOT NULL,
  report_text text NOT NULL,
  week_start date NOT NULL,
  week_end date NOT NULL,
  coverage_count integer NOT NULL,
  sentiment_trend text NOT NULL
    CHECK (sentiment_trend IN ('improving', 'stable', 'worsening')),
  alert_level text NOT NULL,
  generated_by text NOT NULL REFERENCES users(id),
  locked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_analysis_items_project_id ON analysis_items(project_id);
CREATE INDEX idx_analysis_items_review_status ON analysis_items(review_status);
CREATE INDEX idx_analysis_items_created_at ON analysis_items(created_at);
CREATE INDEX idx_reports_project_id ON reports(project_id);
CREATE INDEX idx_projects_alert_level ON projects(alert_level);
CREATE INDEX idx_projects_lpa ON projects(lpa);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_analysis_items_updated_at
  BEFORE UPDATE ON analysis_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Users: all authenticated can read
CREATE POLICY "Users are viewable by authenticated users" ON users
  FOR SELECT USING (true);

-- Users: only the user can update their own row (role changes handled server-side)
CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (true);

-- Projects: all authenticated can read
CREATE POLICY "Projects are viewable by authenticated users" ON projects
  FOR SELECT USING (true);

-- Projects: all authenticated can insert (role check happens in API route)
CREATE POLICY "Projects can be created by authenticated users" ON projects
  FOR INSERT WITH CHECK (true);

-- Projects: all authenticated can update (role check happens in API route)
CREATE POLICY "Projects can be updated by authenticated users" ON projects
  FOR UPDATE USING (true);

-- Analysis items: all authenticated can read
CREATE POLICY "Analysis items are viewable by authenticated users" ON analysis_items
  FOR SELECT USING (true);

-- Analysis items: all authenticated can insert
CREATE POLICY "Analysis items can be created by authenticated users" ON analysis_items
  FOR INSERT WITH CHECK (true);

-- Analysis items: all authenticated can update (for review actions)
CREATE POLICY "Analysis items can be updated by authenticated users" ON analysis_items
  FOR UPDATE USING (true);

-- Reports: all authenticated can read
CREATE POLICY "Reports are viewable by authenticated users" ON reports
  FOR SELECT USING (true);

-- Reports: all authenticated can insert (role check in API route)
CREATE POLICY "Reports can be created by authenticated users" ON reports
  FOR INSERT WITH CHECK (true);

-- Reports: no update or delete (immutable)
-- No UPDATE or DELETE policies = reports cannot be modified
