import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import {
  type AttemptPresentation,
  type PresentationOptions,
  buildPresentation,
  homeworkSeed,
  parsePresentation,
} from "@/lib/attempt-presentation";

type ExamQuestions = Parameters<typeof buildPresentation>[1];

/**
 * How a homework is shown to a student. Homeworks are never shuffled: every
 * student sees the questions and choices in the order the teacher wrote them
 * (quizzes shuffle through their own path). A question bank still draws a
 * subset per student, kept in the teacher's order.
 */
export function homeworkPresentationOptions(hw: {
  questionsPerStudent?: number | null;
}): PresentationOptions {
  return {
    shuffleQuestions: false,
    shuffleChoices: false,
    pick: hw.questionsPerStudent ?? null,
  };
}

/**
 * The order this student was shown. Created once per open attempt and never
 * replaced: a later shuffle must not reinterpret letters already on screen.
 */
export async function ensureHomeworkExamView(
  studentId: string,
  homeworkId: string,
  questions: ExamQuestions,
  retake: boolean,
  options: PresentationOptions = homeworkPresentationOptions({})
): Promise<AttemptPresentation> {
  const existing = await loadHomeworkExamView(studentId, homeworkId);
  if (existing) return existing;

  const presentation = buildPresentation(homeworkSeed(studentId, homeworkId, retake), questions, options);
  try {
    await prisma.homeworkExamView.create({
      data: {
        homeworkId,
        studentId,
        presentation: JSON.stringify(presentation),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await loadHomeworkExamView(studentId, homeworkId);
      if (raced) return raced;
    }
    throw error;
  }
  return presentation;
}

/** The order from the last open, or null if this attempt started before snapshots. */
export async function loadHomeworkExamView(
  studentId: string,
  homeworkId: string
): Promise<AttemptPresentation | null> {
  const row = await prisma.homeworkExamView.findUnique({
    where: { homeworkId_studentId: { homeworkId, studentId } },
    select: { presentation: true },
  });
  return parsePresentation(row?.presentation);
}

/** When the open attempt was first shown to the student. */
export async function homeworkExamOpenedAt(studentId: string, homeworkId: string): Promise<Date | null> {
  const row = await prisma.homeworkExamView.findUnique({
    where: { homeworkId_studentId: { homeworkId, studentId } },
    select: { createdAt: true },
  });
  return row?.createdAt ?? null;
}

/**
 * Drop the saved order so the next open draws a new one. Called when a retake
 * is granted: the student has already seen the key in the old order.
 */
export async function resetHomeworkExamView(
  studentId: string,
  homeworkId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma
): Promise<void> {
  await tx.homeworkExamView.deleteMany({ where: { homeworkId, studentId } });
}
