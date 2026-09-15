-- Snapshot of homework content at the moment the teacher approved/rejected it.
ALTER TABLE "HomeworkReview" ADD COLUMN IF NOT EXISTS "snapshotJson" TEXT;
