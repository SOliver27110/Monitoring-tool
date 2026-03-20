-- Projects: exclusion terms for Google News query filtering
ALTER TABLE projects ADD COLUMN IF NOT EXISTS exclusion_terms text NOT NULL DEFAULT '';

-- Analysis items: enriched fields from Anthropic
ALTER TABLE analysis_items ADD COLUMN IF NOT EXISTS key_entities jsonb DEFAULT '{}';
ALTER TABLE analysis_items ADD COLUMN IF NOT EXISTS is_new_information boolean DEFAULT false;
ALTER TABLE analysis_items ADD COLUMN IF NOT EXISTS new_information_detail text;
ALTER TABLE analysis_items ADD COLUMN IF NOT EXISTS match_confidence text
  CHECK (match_confidence IS NULL OR match_confidence IN ('definite', 'likely', 'tangential'));
ALTER TABLE analysis_items ADD COLUMN IF NOT EXISTS planning_stage text;
ALTER TABLE analysis_items ADD COLUMN IF NOT EXISTS themes text[] DEFAULT '{}';

-- Analysis items: article extraction metadata
ALTER TABLE analysis_items ADD COLUMN IF NOT EXISTS has_full_text boolean DEFAULT false;
ALTER TABLE analysis_items ADD COLUMN IF NOT EXISTS author text;
ALTER TABLE analysis_items ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE analysis_items ADD COLUMN IF NOT EXISTS word_count integer;
