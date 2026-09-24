-- Timed close windows for quizzes/homework, mirrored on ContentItem,
-- plus support reopen rows (content_extensions).

ALTER TABLE "Quiz" ADD COLUMN IF NOT EXISTS "closeAt" TIMESTAMP(3);
ALTER TABLE "Quiz" ADD COLUMN IF NOT EXISTS "enableAutoClose" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Homework" ADD COLUMN IF NOT EXISTS "closeAt" TIMESTAMP(3);
ALTER TABLE "Homework" ADD COLUMN IF NOT EXISTS "enableAutoClose" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ContentItem" ADD COLUMN IF NOT EXISTS "closeAt" TIMESTAMP(3);
ALTER TABLE "ContentItem" ADD COLUMN IF NOT EXISTS "enableAutoClose" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "content_extensions" (
    "id" TEXT NOT NULL,
    "content_id" TEXT NOT NULL,
    "student_id" TEXT,
    "extended_until" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "support_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "content_extensions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "content_extensions_content_id_idx" ON "content_extensions"("content_id");
CREATE INDEX IF NOT EXISTS "content_extensions_student_id_idx" ON "content_extensions"("student_id");
CREATE INDEX IF NOT EXISTS "content_extensions_extended_until_idx" ON "content_extensions"("extended_until");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_extensions_content_id_fkey'
  ) THEN
    ALTER TABLE "content_extensions"
      ADD CONSTRAINT "content_extensions_content_id_fkey"
      FOREIGN KEY ("content_id") REFERENCES "ContentItem"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_extensions_student_id_fkey'
  ) THEN
    ALTER TABLE "content_extensions"
      ADD CONSTRAINT "content_extensions_student_id_fkey"
      FOREIGN KEY ("student_id") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
