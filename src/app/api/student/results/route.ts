import { NextResponse } from "next/server";
import { getStudentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { quizResultPercent } from "@/lib/scoring";
import { summarizeAnswers } from "@/lib/quiz-grading";

export async function GET() {
  const { getSession } = await import("@/lib/auth");
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  // Non-students have no quiz results — return empty gracefully
  if (session.role !== "student") return NextResponse.json({ results: [], total: 0 });

  const results = await prisma.quizResult.findMany({
    // Only submitted attempts: an opened quiz has a placeholder row with
    // completedAt = NULL that must never be listed as a 0% result.
    where: { studentId: session.id, completedAt: { not: null } },
    orderBy: { completedAt: "desc" },
    select: {
      id: true,
      score: true,
      totalQ: true,
      startedAt: true,
      completedAt: true,
      allowRetake: true,
      quiz: {
        select: {
          id: true,
          title: true,
          timeLimitMinutes: true,
          folder: {
            select: {
              course: { select: { id: true, title: true, subject: true } },
            },
          },
        },
      },
      // Per-question counts for the detailed table columns
      answers: {
        select: { isCorrect: true, selectedAnswer: true, essayAnswer: true, questionType: true, status: true, degree: true },
      },
    },
  });

  // Shape the response to match the screenshot columns
  const shaped = results.map((r, idx) => {
    const attempted = r.answers.filter(
      a => a.selectedAnswer !== null || (a.questionType === "essay" && !!a.essayAnswer?.trim())
    ).length;
    const summary = summarizeAnswers(r.answers, r.totalQ);
    const correct = summary.correct;
    return {
      serial:      idx + 1,
      id:          r.id,
      quizId:      r.quiz.id,
      quizTitle:   r.quiz.title,
      courseTitle: r.quiz.folder?.course?.title ?? 'خطة دراسية',
      subject:     r.quiz.folder?.course?.subject ?? 'عام',
      courseId:    r.quiz.folder?.course?.id ?? 'plan',
      totalQ:      r.totalQ,
      score:       r.score,
      // QuizResult.score is already a percentage — dividing by totalQ (the
      // question count) reported e.g. 85/3 = 2833%. See src/lib/scoring.ts.
      pct:         Math.round(quizResultPercent(r)),
      attempted,
      correct,
      // Essay grading state: while pendingEssays > 0 the pct is not a final grade.
      pendingEssays: summary.pendingCount,
      essayCount:    summary.essayCount,
      gradingStatus: summary.gradingStatus,
      hasAnswers:  r.answers.length > 0,
      startedAt:   r.startedAt,
      completedAt: r.completedAt,
      allowRetake: r.allowRetake,
    };
  });

  return NextResponse.json(
    { results: shaped, total: shaped.length },
    { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" } }
  );
}
