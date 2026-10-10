import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId, hasAssistantPermission } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";
import { parseHomeworkAnswers } from "@/lib/homework-regrade";
import { parsePresentation } from "@/lib/attempt-presentation";
import { attemptMinutes, findSimilarSheets } from "@/lib/homework-integrity";

/**
 * GET /api/admin/homework/[id]/integrity — exam homework only.
 * Per-student timing, page exits and score, plus pairs of answer sheets that
 * share unusually many identical wrong answers. Hints for the teacher; nothing
 * here changes a grade.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !isTeacherLike(session.role))
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  if (!hasAssistantPermission(session, "gradeHomework") && !hasAssistantPermission(session, "manageHomework"))
    return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية الواجبات" }, { status: 403 });

  const { id: homeworkId } = await params;
  const hw = await prisma.homework.findUnique({
    where: { id: homeworkId },
    select: {
      teacherId: true,
      title: true,
      type: true,
      shuffleQuestions: true,
      shuffleChoices: true,
      questionsPerStudent: true,
      revealAnswers: true,
      questions: { select: { id: true, correctAnswer: true } },
    },
  });
  if (!hw || hw.teacherId !== actingTeacherId(session))
    return NextResponse.json({ error: "غير موجود" }, { status: 404 });
  if (hw.type !== "exam")
    return NextResponse.json({ error: "تقرير النزاهة متاح لواجبات الاختيار من متعدد فقط" }, { status: 400 });

  const submissions = await prisma.homeworkSubmission.findMany({
    where: { homeworkId, answers: { not: null }, student: { accountMode: { not: "TESTER" } } },
    select: {
      studentId: true,
      answers: true,
      presentation: true,
      score: true,
      totalQ: true,
      focusLosses: true,
      startedAt: true,
      completedAt: true,
      student: { select: { name: true } },
    },
    orderBy: { completedAt: "desc" },
  });

  const correct = Object.fromEntries(hw.questions.map((q) => [q.id, q.correctAnswer]));
  const sheets = submissions.map((s) => ({
    studentId: s.studentId,
    name: s.student.name,
    answers: parseHomeworkAnswers(s.answers),
  }));
  const pairs = findSimilarSheets(sheets, correct);
  const inPair = new Map<string, number>();
  for (const p of pairs) {
    inPair.set(p.a.studentId, (inPair.get(p.a.studentId) ?? 0) + 1);
    inPair.set(p.b.studentId, (inPair.get(p.b.studentId) ?? 0) + 1);
  }

  const minutes = submissions
    .map((s) => attemptMinutes(s.startedAt, s.completedAt))
    .filter((m): m is number => m != null)
    .sort((a, b) => a - b);
  const medianMinutes = minutes.length ? minutes[Math.floor(minutes.length / 2)] : null;

  const students = submissions.map((s) => {
    const mins = attemptMinutes(s.startedAt, s.completedAt);
    const presentation = parsePresentation(s.presentation);
    // "Very fast": under a quarter of the class median, with a real median.
    const fast = mins != null && medianMinutes != null && medianMinutes >= 2 && mins < medianMinutes / 4;
    return {
      studentId: s.studentId,
      name: s.student.name,
      score: s.score,
      totalQ: s.totalQ,
      focusLosses: s.focusLosses,
      minutes: mins,
      shuffled: !!presentation,
      drawn: presentation?.pool ? presentation.questionIds.length : null,
      completedAt: s.completedAt,
      flags: {
        leftPage: (s.focusLosses ?? 0) >= 3,
        veryFast: fast,
        similar: inPair.get(s.studentId) ?? 0,
      },
    };
  });

  return NextResponse.json({
    homework: {
      title: hw.title,
      questionCount: hw.questions.length,
      shuffleQuestions: hw.shuffleQuestions,
      shuffleChoices: hw.shuffleChoices,
      questionsPerStudent: hw.questionsPerStudent,
      revealAnswers: hw.revealAnswers,
    },
    medianMinutes,
    students,
    pairs,
  });
}
