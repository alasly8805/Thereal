-- In-progress essay/MCQ drafts. Teacher result lists still require completedAt,
-- so a draft can never appear as a graded 0% attempt.
ALTER TABLE "QuizResult" ADD COLUMN IF NOT EXISTS "draftAnswers" TEXT;
