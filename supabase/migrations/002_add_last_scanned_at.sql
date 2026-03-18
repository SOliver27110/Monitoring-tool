-- Add last_scanned_at to projects so scans only fetch articles since the previous scan
ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_scanned_at TIMESTAMPTZ DEFAULT NULL;
