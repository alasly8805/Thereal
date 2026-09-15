-- Support-granted prerequisite bypass, scoped to one student + one content item.
-- Written as a row rather than by faking a HomeworkSubmission so the student's
-- grades and the teacher's completion stats stay truthful.

CREATE TABLE IF NOT EXISTS "ContentAccessOverride" (
    "id"            TEXT NOT NULL,
    "studentId"     TEXT NOT NULL,
    "contentType"   "ContentType" NOT NULL,
    "sourceId"      TEXT NOT NULL,
    "reason"        TEXT,
    "grantedById"   TEXT NOT NULL,
    "grantedByName" TEXT NOT NULL,
    "expiresAt"     TIMESTAMP(3),
    "revokedAt"     TIMESTAMP(3),
    "revokedByName" TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentAccessOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ContentAccessOverride_studentId_contentType_sourceId_key"
    ON "ContentAccessOverride"("studentId", "contentType", "sourceId");

CREATE INDEX IF NOT EXISTS "ContentAccessOverride_studentId_idx"  ON "ContentAccessOverride"("studentId");
CREATE INDEX IF NOT EXISTS "ContentAccessOverride_sourceId_idx"   ON "ContentAccessOverride"("sourceId");
CREATE INDEX IF NOT EXISTS "ContentAccessOverride_revokedAt_idx"  ON "ContentAccessOverride"("revokedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ContentAccessOverride_studentId_fkey'
  ) THEN
    ALTER TABLE "ContentAccessOverride"
      ADD CONSTRAINT "ContentAccessOverride_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
