-- Make planning_reference optional (nullable)
ALTER TABLE projects ALTER COLUMN planning_reference DROP NOT NULL;
