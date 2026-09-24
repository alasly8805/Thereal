-- Dedicated assistant flag: view students, dossiers, and reports.
-- Default is off for new assistants. Existing ones keep current access.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "canViewStudents" BOOLEAN NOT NULL DEFAULT false;

UPDATE "User"
SET "canViewStudents" = true
WHERE role = 'assistant'
  AND "isDeleted" = false
  AND COALESCE("assistantPermissions", '') NOT LIKE '%"viewStudents":false%'
  AND COALESCE("assistantPermissions", '') NOT LIKE '%"canViewStudents":false%';
