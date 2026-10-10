import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getConfigBool } from "@/lib/config";
import { checkQuizAccess } from "@/lib/authorization";
import { blockSupportView } from "@/lib/support-auth";
import {
  canAccessContent,
  contentDeniedPayload,
  ContentType,
  hasActiveSupportReopen,
  restartQuizClockForSupportReopen,
} from "@/lib/content-access-engine";
import { parseDraftAnswers, quizActiveElapsedMs, quizRemainingMs } from "@/lib/quiz-attempt";
import {
  buildPresentation,
  identityPresentation,
  newQuizSeed,
  parsePresentation,
  presentStudentView,
} from "@/lib/attempt-presentation";

/**
 * Starts the clock, or continues a paused attempt.
 * The client cannot send a remaining time. Questions omit the answer key.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  const supportBlocked = blockSupportView(session);
  if (supportBlocked) return supportBlocked;
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  if (session.role !== "student") {
    return NextResponse.json({ error: "دخول الاختبار للطلاب فقط" }, { status: 403 });
  }

  const { id: quizId } = await params;
  const hasAccess = await checkQuizAccess(session.id, session.role, quizId);
  if (!hasAccess) return NextResponse.json({ error: "لا يوجد صلاحية للوصول" }, { status: 403 });

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: {
      questions: { orderBy: { order: "asc" } },
      folder: { select: { courseId: true, course: { select: { title: true, subject: true } } } },
    },
  });
  if (!quiz) return NextResponse.json({ error: "الاختبار غير موجود" }, { status: 404 });

  const access = await canAccessContent(session.id, {
    type: ContentType.QUIZ,
    sourceId: quizId,
    title: quiz.title,
  });
  const denied = contentDeniedPayload(access);
  if (denied) return NextResponse.json(denied.body, { status: denied.status });

  const timeLimitEnforced = !(await getConfigBool("quiz_time_limit_disabled"));
  const supportReopen = await hasActiveSupportReopen(session.id, quizId, [
    ContentType.QUIZ,
    ContentType.EXAM,
  ]);
  if (supportReopen && timeLimitEnforced) {
    await restartQuizClockForSupportReopen(quizId, session.id);
  }

  const limitMinutes = quiz.timeLimitMinutes || 30;
  let attempt = await prisma.quizResult.findUnique({
    where: { studentId_quizId: { studentId: session.id, quizId } },
  });
  if (attempt?.completedAt) {
    return NextResponse.json(
      { error: "تم احتساب هذه المحاولة. ابدأ محاولة جديدة من صفحة الانتظار.", alreadySubmitted: true },
      { status: 409 }
    );
  }

  if (attempt?.startedAt && timeLimitEnforced) {
    const remaining = quizRemainingMs(
      limitMinutes,
      quizActiveElapsedMs({
        startedAt: attempt.startedAt,
        pausedAt: attempt.pausedAt,
        elapsedMs: attempt.elapsedMs,
      })
    );
    if (remaining <= 0) {
      return NextResponse.json({ error: "انتهى وقت الاختبار" }, { status: 400 });
    }
  }

  const now = new Date();
  const legacyAttempt = !!attempt?.startedAt && !attempt.presentation;
  if (!attempt) {
    attempt = await prisma.quizResult.create({
      data: {
        studentId: session.id,
        quizId,
        score: 0,
        totalQ: 0,
        startedAt: now,
        completedAt: null,
        allowRetake: false,
        pausedAt: null,
        elapsedMs: 0,
      },
    });
  } else if (attempt.pausedAt || !attempt.startedAt) {
    attempt = await prisma.quizResult.update({
      where: { id: attempt.id },
      data: { startedAt: now, pausedAt: null },
    });
  }

  let presentation = parsePresentation(attempt.presentation);
  if (!presentation) {
    presentation = legacyAttempt
      ? identityPresentation(quiz.questions)
      : buildPresentation(newQuizSeed(session.id, quizId), quiz.questions);
    attempt = await prisma.quizResult.update({
      where: { id: attempt.id },
      data: { presentation: JSON.stringify(presentation) },
    });
  }

  const questions = presentStudentView(
    quiz.questions.map((question) => {
      const { correctAnswer: _ca, ...safe } = question;
      return safe;
    }),
    presentation
  );
  const remainingSeconds = Math.floor(
    quizRemainingMs(
      limitMinutes,
      quizActiveElapsedMs({
        startedAt: attempt.startedAt,
        pausedAt: attempt.pausedAt,
        elapsedMs: attempt.elapsedMs,
      })
    ) / 1000
  );

  return NextResponse.json({
    quiz: {
      id: quiz.id,
      title: quiz.title,
      timeLimitMinutes: limitMinutes,
      questions,
      folderId: quiz.folderId,
      courseId: quiz.folder?.courseId ?? "plan",
      course: quiz.folder?.course ?? null,
    },
    timeLimitMinutes: limitMinutes,
    timeLimitEnforced,
    startedAt: attempt.startedAt,
    remainingSeconds,
    draftAnswers: parseDraftAnswers(attempt.draftAnswers),
  });
}
