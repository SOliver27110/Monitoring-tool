ALTER TABLE projects ALTER COLUMN planning_reference DROP NOT NULL;
ALTER TABLE projects ALTER COLUMN planning_reference SET DEFAULT '';
