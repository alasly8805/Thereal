-- CreateTable
CREATE TABLE IF NOT EXISTS "PracticeQuestion" (
    "id" TEXT NOT NULL,
    "educationalStage" TEXT NOT NULL,
    "questionType" TEXT NOT NULL,
    "lessonNumber" TEXT NOT NULL DEFAULT '',
    "lessonTitle" TEXT NOT NULL DEFAULT '',
    "lessonOrder" INTEGER NOT NULL DEFAULT 0,
    "question" TEXT NOT NULL DEFAULT '',
    "optionA" TEXT NOT NULL DEFAULT '',
    "optionB" TEXT NOT NULL DEFAULT '',
    "optionC" TEXT NOT NULL DEFAULT '',
    "optionD" TEXT NOT NULL DEFAULT '',
    "correctAnswer" TEXT NOT NULL DEFAULT '',
    "referenceAnswer" TEXT,
    "rubric" TEXT,
    "sourceKind" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rejectReason" TEXT,
    "timesUsed" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticeQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PracticeSet" (
    "id" TEXT NOT NULL,
    "educationalStage" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "questionIds" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticeSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PracticeAttempt" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "presentation" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "mcqCorrect" INTEGER NOT NULL DEFAULT 0,
    "mcqTotal" INTEGER NOT NULL DEFAULT 0,
    "essayCorrect" INTEGER NOT NULL DEFAULT 0,
    "essayTotal" INTEGER NOT NULL DEFAULT 0,
    "pointsAwarded" INTEGER NOT NULL DEFAULT 0,
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticeAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PracticeAnswer" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "choice" TEXT,
    "essayAnswer" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "isCorrect" BOOLEAN,
    "verdict" TEXT,
    "aiScore" DOUBLE PRECISION,
    "feedback" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "claimedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticeAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PracticeQuestion_educationalStage_sourceHash_key" ON "PracticeQuestion"("educationalStage", "sourceHash");
CREATE INDEX IF NOT EXISTS "PracticeQuestion_educationalStage_questionType_isActive_idx" ON "PracticeQuestion"("educationalStage", "questionType", "isActive");
CREATE INDEX IF NOT EXISTS "PracticeQuestion_sourceKind_sourceId_idx" ON "PracticeQuestion"("sourceKind", "sourceId");
CREATE UNIQUE INDEX IF NOT EXISTS "PracticeSet_educationalStage_day_key" ON "PracticeSet"("educationalStage", "day");
CREATE UNIQUE INDEX IF NOT EXISTS "PracticeAttempt_studentId_setId_key" ON "PracticeAttempt"("studentId", "setId");
CREATE INDEX IF NOT EXISTS "PracticeAttempt_setId_idx" ON "PracticeAttempt"("setId");
CREATE UNIQUE INDEX IF NOT EXISTS "PracticeAnswer_attemptId_questionId_key" ON "PracticeAnswer"("attemptId", "questionId");
CREATE INDEX IF NOT EXISTS "PracticeAnswer_status_idx" ON "PracticeAnswer"("status");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PracticeAttempt" ADD CONSTRAINT "PracticeAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PracticeAttempt" ADD CONSTRAINT "PracticeAttempt_setId_fkey" FOREIGN KEY ("setId") REFERENCES "PracticeSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PracticeAnswer" ADD CONSTRAINT "PracticeAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "PracticeAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
