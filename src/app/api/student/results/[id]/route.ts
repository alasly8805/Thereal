import { NextRequest, NextResponse } from "next/server";
import { getStudentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { summarizeAnswers } from "@/lib/quiz-grading";

/** GET /api/student/results/[id] — per-question breakdown for answer review modal */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStudentSession();
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const { id } = await params;

  const result = await prisma.quizResult.findUnique({
    where: { id },
    select: {
      studentId: true,
      score: true,
      totalQ: true,
      startedAt: true,
      completedAt: true,
      quiz: { select: { title: true, folder: { select: { course: { select: { title: true } } } } } },
      answers: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          questionType: true,
          question: true,
          imageUrl: true,
          optionA: true,
          optionB: true,
          optionC: true,
          optionD: true,
          selectedAnswer: true,
          essayAnswer: true,
          correctAnswer: true,
          isCorrect: true,
          // Essay grading — the student sees the verdict and the teacher's
          // note only once the answer has been reviewed.
          status: true,
          teacherReply: true,
          reviewedAt: true,
          degree: true,
        },
      },
    },
  });

  if (!result) return NextResponse.json({ error: "النتيجة غير موجودة" }, { status: 404 });
  if (result.studentId !== session.id) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });

  const summary = summarizeAnswers(result.answers, result.totalQ);

  return NextResponse.json({
    result: {
      ...result,
      pendingEssays: summary.pendingCount,
      gradingStatus: summary.gradingStatus,
      correct: summary.correct,
    },
  });
}
