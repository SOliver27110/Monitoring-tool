-- Make planning_reference optional on projects
ALTER TABLE projects ALTER COLUMN planning_reference DROP NOT NULL;
