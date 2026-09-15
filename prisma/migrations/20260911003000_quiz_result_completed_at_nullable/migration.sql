-- QuizResult.completedAt was NOT NULL DEFAULT now(). The quiz GET route creates
-- a placeholder row when a student *opens* a quiz (score 0, totalQ 0), and the
-- default stamped it as completed immediately. Every real submission was then
-- rejected as a duplicate (409) and the student was stuck at 0%.
--
-- completedAt now means "submitted at" and is NULL while an attempt is open.

ALTER TABLE "QuizResult" ALTER COLUMN "completedAt" DROP DEFAULT;
ALTER TABLE "QuizResult" ALTER COLUMN "completedAt" DROP NOT NULL;

-- Repair: rows that were only ever "opened" — never graded (totalQ = 0, no
-- per-question answers saved). Reopen them so the student can actually sit
-- the quiz. Genuinely submitted results (totalQ > 0) are untouched.
UPDATE "QuizResult" r
SET "completedAt" = NULL
WHERE r."totalQ" = 0
  AND r."completedAt" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "QuizAnswer" a WHERE a."resultId" = r.id);
