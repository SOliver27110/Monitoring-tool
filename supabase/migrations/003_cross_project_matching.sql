-- Cross-project matching support

-- Track how an article was matched to a project
ALTER TABLE analysis_items ADD COLUMN matched_by text;

-- Allow projects to define exclusion terms
ALTER TABLE projects ADD COLUMN exclusion_terms text;
