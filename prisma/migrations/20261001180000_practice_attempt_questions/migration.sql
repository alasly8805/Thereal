-- Daily practice: each student gets their own questions (wrong answers repeat, right ones never do).
ALTER TABLE "PracticeAttempt" ADD COLUMN IF NOT EXISTS "questionIds" TEXT;
