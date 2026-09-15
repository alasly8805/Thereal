-- Teacher/assistant can reopen a locked homework attempt so the student can resubmit.
ALTER TABLE "HomeworkSubmission" ADD COLUMN IF NOT EXISTS "allowRetake" BOOLEAN NOT NULL DEFAULT false;
