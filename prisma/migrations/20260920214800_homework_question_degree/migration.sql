-- Per-question point value for exam homework. Default 1 keeps existing scores.
ALTER TABLE "HomeworkQuestion" ADD COLUMN IF NOT EXISTS "degree" INTEGER NOT NULL DEFAULT 1;
