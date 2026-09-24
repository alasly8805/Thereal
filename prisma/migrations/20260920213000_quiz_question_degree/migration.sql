-- Per-question point value ("درجة"). Default 1 preserves equal-weight scoring
-- for every quiz that already exists.
ALTER TABLE "QuizQuestion" ADD COLUMN IF NOT EXISTS "degree" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "QuizAnswer" ADD COLUMN IF NOT EXISTS "degree" INTEGER NOT NULL DEFAULT 1;
