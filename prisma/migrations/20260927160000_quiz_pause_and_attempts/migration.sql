-- Pause/resume clock for an in-progress quiz, and a score-only history of submitted tries.
ALTER TABLE "QuizResult" ADD COLUMN IF NOT EXISTS "pausedAt" TIMESTAMP(3);
ALTER TABLE "QuizResult" ADD COLUMN IF NOT EXISTS "elapsedMs" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "QuizAttempt" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "quizId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  "totalQ" INTEGER NOT NULL,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuizAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "QuizAttempt_studentId_quizId_idx" ON "QuizAttempt"("studentId", "quizId");
CREATE INDEX IF NOT EXISTS "QuizAttempt_quizId_idx" ON "QuizAttempt"("quizId");

DO $$ BEGIN
  ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_quizId_fkey"
    FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
