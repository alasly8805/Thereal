import { NextResponse } from "next/server";
import { getStudentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getConfigBool } from "@/lib/config";
import { blockSupportView } from "@/lib/support-auth";
import { burstLimited, isSafeId, readJson, tooMany } from "@/lib/essay-ai-http";
import { finalizeAttempt, kickPracticeGrading } from "@/lib/practice-grading";
import { attemptQuestionIds } from "@/lib/practice";

/**
 * Locks the student's practice set: MCQs are marked now, written essays are
 * queued for AI grading, and points follow once everything is graded.
 */
export async function POST(req: Request) {
  try {
    const session = await getStudentSession();
    if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    const blocked = blockSupportView(session);
    if (blocked) return blocked;
    if (burstLimited(`practice-submit:${session.id}`, 5, 60_000)) return tooMany();
    if (!(await getConfigBool("practice_enabled"))) {
      return NextResponse.json({ error: "التدريبات متوقفة مؤقتاً" }, { status: 503 });
    }

    const body = await readJson(req);
    if (!body || !isSafeId(body.setId)) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });

    const attempt = await prisma.practiceAttempt.findUnique({
      where: { studentId_setId: { studentId: session.id, setId: body.setId } },
      select: { id: true, questionIds: true, set: { select: { questionIds: true, day: true } }, answers: true },
    });
    if (!attempt) return NextResponse.json({ error: "التدريب غير موجود" }, { status: 404 });

    // One submission per day across both tracks — switching عربي/لغات must not double the points.
    const otherToday = await prisma.practiceAttempt.findFirst({
      where: { studentId: session.id, id: { not: attempt.id }, submittedAt: { not: null }, set: { day: attempt.set.day } },
      select: { id: true },
    });
    if (otherToday) return NextResponse.json({ error: "سلّمت تدريب النهارده بالفعل — استنى تدريب بكرة" }, { status: 409 });

    // Atomic lock — a double click or a second tab cannot submit twice.
    const locked = await prisma.practiceAttempt.updateMany({
      where: { id: attempt.id, submittedAt: null },
      data: { submittedAt: new Date() },
    });
    if (locked.count === 0) return NextResponse.json({ error: "تم تسليم هذا التدريب بالفعل" }, { status: 409 });

    const ids = attemptQuestionIds(attempt, attempt.set);
    const questions = await prisma.practiceQuestion.findMany({
      where: { id: { in: ids } },
      select: { id: true, questionType: true, correctAnswer: true },
    });
    const saved = new Map(attempt.answers.map((a) => [a.questionId, a]));

    await prisma.$transaction(
      questions.map((q) => {
        const a = saved.get(q.id);
        const data =
          q.questionType === "essay"
            ? (a?.essayAnswer ?? "").trim()
              ? { essayAnswer: a!.essayAnswer!, status: "PENDING" }
              : { essayAnswer: "", status: "GRADED", isCorrect: false, verdict: "INCORRECT" }
            : { choice: a?.choice ?? null, status: "GRADED", isCorrect: !!a?.choice && a.choice === q.correctAnswer };
        return prisma.practiceAnswer.upsert({
          where: { attemptId_questionId: { attemptId: attempt.id, questionId: q.id } },
          create: { attemptId: attempt.id, questionId: q.id, ...data },
          update: data,
        });
      })
    );

    await finalizeAttempt(attempt.id);
    kickPracticeGrading(attempt.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[practice] submit error:", error);
    return NextResponse.json({ error: "حدث خطأ داخلي" }, { status: 500 });
  }
}
