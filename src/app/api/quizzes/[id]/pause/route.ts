import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkQuizAccess } from "@/lib/authorization";
import { blockSupportView } from "@/lib/support-auth";
import { quizActiveElapsedMs, quizRemainingMs } from "@/lib/quiz-attempt";
import { pauseQuizAttempt } from "@/lib/quiz-session";

/** Freeze this student's clock. Does not accept a time from the browser. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  const supportBlocked = blockSupportView(session);
  if (supportBlocked) return supportBlocked;
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  if (session.role !== "student") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const { id: quizId } = await params;
  const hasAccess = await checkQuizAccess(session.id, session.role, quizId);
  if (!hasAccess) return NextResponse.json({ error: "لا يوجد صلاحية للوصول" }, { status: 403 });

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: { id: true, timeLimitMinutes: true },
  });
  if (!quiz) return NextResponse.json({ error: "الاختبار غير موجود" }, { status: 404 });

  const attempt = await prisma.quizResult.findUnique({
    where: { studentId_quizId: { studentId: session.id, quizId } },
    select: { id: true, completedAt: true, startedAt: true, pausedAt: true, elapsedMs: true },
  });
  if (!attempt || attempt.completedAt || !attempt.startedAt) {
    return NextResponse.json({ paused: false });
  }

  await pauseQuizAttempt(attempt.id, quiz.timeLimitMinutes || 30);
  const fresh = await prisma.quizResult.findUnique({
    where: { id: attempt.id },
    select: { startedAt: true, pausedAt: true, elapsedMs: true },
  });
  const remainingSeconds = Math.floor(
    quizRemainingMs(
      quiz.timeLimitMinutes || 30,
      quizActiveElapsedMs({
        startedAt: fresh?.startedAt,
        pausedAt: fresh?.pausedAt,
        elapsedMs: fresh?.elapsedMs,
      })
    ) / 1000
  );
  return NextResponse.json({ paused: true, remainingSeconds });
}
