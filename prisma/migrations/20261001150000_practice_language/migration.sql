-- Daily practice: Arabic (عربي) and English (لغات) tracks.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "practiceTrack" TEXT;

ALTER TABLE "PracticeQuestion" ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'ar';
DROP INDEX IF EXISTS "PracticeQuestion_educationalStage_sourceHash_key";
DROP INDEX IF EXISTS "PracticeQuestion_educationalStage_questionType_isActive_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "PracticeQuestion_educationalStage_language_sourceHash_key" ON "PracticeQuestion"("educationalStage", "language", "sourceHash");
CREATE INDEX IF NOT EXISTS "PracticeQuestion_educationalStage_language_questionType_isActive_idx" ON "PracticeQuestion"("educationalStage", "language", "questionType", "isActive");

ALTER TABLE "PracticeSet" ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'ar';
DROP INDEX IF EXISTS "PracticeSet_educationalStage_day_key";
CREATE UNIQUE INDEX IF NOT EXISTS "PracticeSet_educationalStage_language_day_key" ON "PracticeSet"("educationalStage", "language", "day");
