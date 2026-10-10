import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkQuizAccess } from "@/lib/authorization";
import { blockSupportView } from "@/lib/support-auth";
import { canAccessContent, contentDeniedPayload, ContentType, hasActiveSupportReopen } from "@/lib/content-access-engine";
import { retakeCooldownRemainingMs } from "@/lib/quiz-attempt";

/**
 * Explicitly begin a teacher-granted retake. Opening the quiz never does this.
 * Teacher "allow retake" only sets allowRetake=true; this route is what clears
 * completedAt and starts a blank attempt.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  const supportBlocked = blockSupportView(session);
  if (supportBlocked) return supportBlocked;
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  if (session.role !== "student") {
    return NextResponse.json({ error: "إعادة الاختبار للطلاب فقط" }, { status: 403 });
  }

  const { id: quizId } = await params;
  const hasAccess = await checkQuizAccess(session.id, session.role, quizId);
  if (!hasAccess) return NextResponse.json({ error: "لا يوجد صلاحية للوصول" }, { status: 403 });

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: { id: true, title: true, retakeCooldownHours: true },
  });
  if (!quiz) return NextResponse.json({ error: "الاختبار غير موجود" }, { status: 404 });

  const access = await canAccessContent(session.id, {
    type: ContentType.QUIZ,
    sourceId: quizId,
    title: quiz.title,
  });
  const denied = contentDeniedPayload(access);
  if (denied) return NextResponse.json(denied.body, { status: denied.status });

  const existing = await prisma.quizResult.findUnique({
    where: { studentId_quizId: { studentId: session.id, quizId } },
  });

  if (!existing) {
    return NextResponse.json({ error: "لا توجد محاولة سابقة" }, { status: 400 });
  }

  // Already in a new attempt — opening the form is enough.
  if (!existing.completedAt) {
    return NextResponse.json({ started: true, alreadyInProgress: true });
  }

  // A support reopen opens the quiz this student already has, and skips the
  // teacher cooldown so the new attempt can start as soon as the window is open.
  const supportReopen = await hasActiveSupportReopen(session.id, quizId, [
    ContentType.QUIZ,
    ContentType.EXAM,
  ]);
  if (!existing.allowRetake && !supportReopen) {
    return NextResponse.json(
      { error: "لم يُسمح بإعادة هذا الاختبار", alreadySubmitted: true },
      { status: 409 }
    );
  }

  const cooldownRemainingMs = retakeCooldownRemainingMs(
    existing.completedAt,
    quiz.retakeCooldownHours ?? 0
  );
  if (!supportReopen && cooldownRemainingMs > 0) {
    return NextResponse.json(
      { error: "إعادة الاختبار غير متاحة بعد", cooldownRemainingMs },
      { status: 429 }
    );
  }

  // Keep the old QuizAnswer rows until the new submit replaces them. Clearing
  // completedAt is what opens a blank form; wiping answers here would destroy
  // the graded sheet if the student never submits the retake.
  await prisma.quizResult.update({
    where: { id: existing.id },
    data: {
      startedAt: null,
      pausedAt: null,
      elapsedMs: 0,
      completedAt: null,
      allowRetake: false,
      draftAnswers: null,
      presentation: null,
    },
  });

  return NextResponse.json({ started: true });
}
