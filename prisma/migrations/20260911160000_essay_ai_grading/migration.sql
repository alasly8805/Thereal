-- AI-assisted essay grading. Purely additive: one defaulted column and two new
-- tables. Every existing course gets aiEssayGradingMode = 'off', so nothing is
-- sent to an AI provider until a teacher explicitly opts a course in.
--
-- Grading criteria live in their own table (not on QuizQuestion) so the many
-- `include: { questions: true }` reads can never ship them to students.

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "aiEssayGradingMode" TEXT NOT NULL DEFAULT 'off';

-- CreateTable
CREATE TABLE "QuizQuestionGradingGuide" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "referenceAnswer" TEXT,
    "rubric" TEXT,
    "maxPoints" INTEGER NOT NULL DEFAULT 10,
    "updatedById" TEXT NOT NULL,
    "exemplar" TEXT,
    "exemplarKey" TEXT,
    "exemplarClaimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuizQuestionGradingGuide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EssayAIGrade" (
    "id" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "skipReason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "claimedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "score" DOUBLE PRECISION,
    "maxPoints" INTEGER,
    "verdict" TEXT,
    "confidence" TEXT,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "feedback" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "tokensUsed" INTEGER,
    "mode" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "explanation" TEXT,
    "explanationKey" TEXT,
    "explanationAt" TIMESTAMP(3),
    "explanationClaimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EssayAIGrade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuizQuestionGradingGuide_questionId_key" ON "QuizQuestionGradingGuide"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "EssayAIGrade_answerId_key" ON "EssayAIGrade"("answerId");

-- CreateIndex
CREATE INDEX "EssayAIGrade_status_idx" ON "EssayAIGrade"("status");

-- CreateIndex
CREATE INDEX "EssayAIGrade_explanationAt_idx" ON "EssayAIGrade"("explanationAt");

-- AddForeignKey
ALTER TABLE "QuizQuestionGradingGuide" ADD CONSTRAINT "QuizQuestionGradingGuide_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "QuizQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EssayAIGrade" ADD CONSTRAINT "EssayAIGrade_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "QuizAnswer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

