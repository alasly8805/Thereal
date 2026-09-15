import { NextResponse } from "next/server";
import { getStudentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Returns all wrong answers grouped by subject/quiz,
 * with full question details so the UI can build a personal practice exam.
 */
export async function GET() {
  const { getSession } = await import("@/lib/auth");
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  if (session.role !== "student") return NextResponse.json({ total: 0, bySubject: {}, questions: [] });

  const wrongAnswers = await prisma.quizAnswer.findMany({
    // MCQ only: essay answers are teacher-graded (and pending ones are stored as
    // isCorrect=false), so they must not be turned into practice questions.
    where: { studentId: session.id, isCorrect: false, questionType: { not: "essay" } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      questionId: true,
      question: true,
      optionA: true,
      optionB: true,
      optionC: true,
      optionD: true,
      correctAnswer: true,
      selectedAnswer: true,
      createdAt: true,
      result: {
        select: {
          quiz: {
            select: {
              id: true,
              title: true,
              folder: {
                select: {
                  course: { select: { id: true, title: true, subject: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  // Deduplicate: keep only the LATEST wrong answer per questionId
  const seen = new Set<string>();
  const unique = wrongAnswers.filter(a => {
    if (seen.has(a.questionId)) return false;
    seen.add(a.questionId);
    return true;
  });

  // Group by subject for the filter UI
  const bySubject: Record<string, typeof unique> = {};
  for (const a of unique) {
    const subj = a.result.quiz.folder?.course?.subject ?? "عام";
    if (!bySubject[subj]) bySubject[subj] = [];
    bySubject[subj].push(a);
  }

  return NextResponse.json(
    { total: unique.length, bySubject, questions: unique },
    { headers: { "Cache-Control": "private, max-age=60" } }
  );
}
