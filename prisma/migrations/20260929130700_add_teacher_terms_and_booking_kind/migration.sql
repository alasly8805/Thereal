-- AlterTable
ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "bookingKind" TEXT,
ADD COLUMN IF NOT EXISTS "bookingTerm" INTEGER;

-- AlterTable
ALTER TABLE "TeacherSubscription" ADD COLUMN IF NOT EXISTS "termNumbers" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- CreateTable
CREATE TABLE IF NOT EXISTS "TeacherTerm" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "educationalStage" TEXT NOT NULL,
    "termNumber" INTEGER NOT NULL,
    "endsAt" TIMESTAMP(3),
    "onSale" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherTerm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TeacherTerm_teacherId_idx" ON "TeacherTerm"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TeacherTerm_teacherId_educationalStage_termNumber_key" ON "TeacherTerm"("teacherId", "educationalStage", "termNumber");
