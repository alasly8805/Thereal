/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getConfigBool } from "@/lib/config";
import { checkQuizAccess } from "@/lib/authorization";
import { acquireAdvisoryLock } from "@/lib/distributed-lock";
import { blockSupportView } from "@/lib/support-auth";
import {
  canAccessContent,
  contentDeniedPayload,
  ContentType,
  recordContentCompleted,
} from "@/lib/content-access-engine";
import { PASS_MARK, summarizeAnswers, parseDegree } from "@/lib/quiz-grading";
import { enqueueEssayGrading, kickEssayGrading } from "@/lib/essay-ai-grading";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  // Defence in depth behind the proxy guard: never let a support agent act as
  // the student on grades, progress or money.
  const supportBlocked = blockSupportView(session);
  if (supportBlocked) return supportBlocked;
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const { id: quizId } = await params;
  const body = await req.json();
  const answers = (body?.answers ?? {}) as Record<string, string>;

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: {
      questions: { orderBy: { order: "asc" } },
      folder: { select: { courseId: true, course: { select: { teacherId: true } } } },
      planLesson: { select: { id: true, planId: true } },
    },
  });

  if (!quiz) return NextResponse.json({ error: "الاختبار غير موجود" }, { status: 404 });

  const hasAccess = await checkQuizAccess(session.id, session.role, quizId);
  if (!hasAccess) {
    return NextResponse.json({ error: "لا يوجد صلاحية للوصول" }, { status: 403 });
  }

  if (session.role === "student") {
    const access = await canAccessContent(session.id, {
      type: ContentType.QUIZ,
      sourceId: quizId,
      title: quiz.title,
    });
    const denied = contentDeniedPayload(access);
    if (denied) return NextResponse.json(denied.body, { status: denied.status });
  }

  let planEnrollmentId: string | null = null;
  if (quiz.planLessonId && quiz.planLesson) {
    const enrollment = await prisma.planEnrollment.findFirst({
      where: {
        planId: quiz.planLesson.planId,
        studentId: session.id,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (enrollment) {
      planEnrollmentId = enrollment.id;
    }
  }

  const totalQ = quiz.questions.length;
  if (!totalQ) return NextResponse.json({ error: "الاختبار بدون أسئلة" }, { status: 400 });

  // Block retake unless teacher allowed it
  const existingResult = await prisma.quizResult.findUnique({
    where: { studentId_quizId: { studentId: session.id, quizId } },
  });

  if (!existingResult || !existingResult.startedAt) {
    return NextResponse.json(
      { error: "لم يتم بدء الاختبار بشكل صحيح. يرجى بدء الاختبار من الصفحة المخصصة أولاً." },
      { status: 400 }
    );
  }

  // A completed sheet stays frozen until the student explicitly starts a
  // retake (POST /start-retake). allowRetake alone must not accept a submit
  // that would delete the old answers behind a review page.
  if (existingResult.completedAt) {
    return NextResponse.json(
      {
        error: existingResult.allowRetake
          ? "ابدأ المحاولة الجديدة من زر «بدء محاولة جديدة» أولاً."
          : "تم احتساب درجتك مرة واحدة. لا يمكن إعادة الاختبار.",
        alreadySubmitted: true,
        allowRetake: !!existingResult.allowRetake,
        result: existingResult,
      },
      { status: 409 }
    );
  }

  // Preserved across the whole handler: the original start time is written back
  // on upsert so a retake cannot quietly reset it.
  const dbStartedAt = existingResult.startedAt;

  // Quizzes stay open by default (quiz_time_limit_disabled). A student whose
  // connection dropped mid-attempt should not lose the attempt, so the timer is
  // display-only unless a superadmin re-enables enforcement.
  if (!(await getConfigBool("quiz_time_limit_disabled"))) {
    const limitMinutes = (quiz as any).timeLimitMinutes ?? 30;
    const elapsedSeconds = Math.floor((Date.now() - dbStartedAt.getTime()) / 1000);
    if (elapsedSeconds > limitMinutes * 60) {
      return NextResponse.json({ error: "انتهى وقت الاختبار" }, { status: 400 });
    }
  }

  const breakdown = quiz.questions.map((question: any) => {
    // Only strings are answers. A malformed body (e.g. an object) must not reach
    // the DB write below, which runs after the attempt is already marked complete.
    const rawAnswer = answers[question.id];
    const yourAnswer = typeof rawAnswer === "string" ? rawAnswer : null;
    const isEssay = question.questionType === "essay";
    const isCorrect = isEssay ? false : yourAnswer === question.correctAnswer;
    return {
      questionId: question.id,
      questionType: question.questionType || (isEssay ? "essay" : "mcq"),
      question: question.question,
      imageUrl: question.imageUrl || null,
      optionA: question.optionA || "",
      optionB: question.optionB || "",
      optionC: question.optionC || "",
      optionD: question.optionD || "",
      yourAnswer: isEssay ? null : yourAnswer,
      essayAnswer: isEssay ? (yourAnswer || "") : null,
      correctAnswer: isEssay ? "" : (question.correctAnswer || "A"),
      isCorrect,
      status: isEssay ? "PENDING" : "APPROVED",
      degree: parseDegree(question.degree),
    };
  });

  // Essay answers are PENDING until a teacher/assistant grades them. The stored
  // score is earnedDegree / totalDegree (equal-weight when every question is 1),
  // so while essays are pending it is a partial (MCQ-only) score — never a final
  // grade. `passed` is therefore unknown (null) until every essay has been
  // decided; grading finalises it (see recomputeQuizResult in lib/quiz-grading).
  const summary = summarizeAnswers(breakdown);
  const { correct, score, pendingCount } = summary;
  const hasPendingEssays = pendingCount > 0;
  const passed = hasPendingEssays ? false : score >= PASS_MARK;

  let result;
  try {
    result = await prisma.$transaction(async (tx: any) => {
      await acquireAdvisoryLock(`quiz-submit:${session.id}:${quizId}`, tx);
      const locked = await tx.quizResult.findUnique({ where: { studentId_quizId: { studentId: session.id, quizId } } });
      if (locked?.completedAt) {
        throw new Error("QUIZ_ALREADY_SUBMITTED");
      }
      const completedAt = new Date();
      const savedResult = await tx.quizResult.upsert({
        where: { studentId_quizId: { studentId: session.id, quizId } },
        update: { score, totalQ, completedAt, allowRetake: false, startedAt: dbStartedAt, draftAnswers: null },
        create: { studentId: session.id, quizId, score, totalQ, startedAt: dbStartedAt },
      });
      if (session.role === "student") {
        await recordContentCompleted(
          session.id,
          { type: ContentType.QUIZ, sourceId: quizId, title: quiz.title },
          { score, completedAt },
          tx
        );
      }
      return savedResult;
    });
  } catch (error: any) {
    if (error?.message === "QUIZ_ALREADY_SUBMITTED") {
      return NextResponse.json({ error: "لقد أجبت على هذا الاختبار بالفعل" }, { status: 409 });
    }
    throw error;
  }

  // Save per-question answers (enables "view answers" + "wrong questions exam")
  // Delete old answers for this result first (retake scenario)
  await prisma.quizAnswer.deleteMany({ where: { resultId: result.id } });
  if (breakdown.length > 0) {
    await prisma.quizAnswer.createMany({
      data: (breakdown as any[]).map((b) => ({
        studentId:      session.id,
        quizId,
        questionId:     b.questionId,
        resultId:       result.id,
        questionType:   b.questionType,
        selectedAnswer: b.yourAnswer,
        essayAnswer:    b.essayAnswer,
        imageUrl:       b.imageUrl,
        correctAnswer:  b.correctAnswer,
        isCorrect:      b.isCorrect,
        status:         b.status,
        question:       b.question,
        optionA:        b.optionA,
        optionB:        b.optionB,
        optionC:        b.optionC,
        optionD:        b.optionD,
        degree:         b.degree,
      })),
    });
  }

  // AI essay grading (only when the course owner opted in). Runs strictly after
  // the answers are saved and in the background, so a provider outage can never
  // lose or delay the student's submission.
  let aiGradingQueued = 0;
  if (hasPendingEssays) {
    try {
      aiGradingQueued = await enqueueEssayGrading(result.id);
      if (aiGradingQueued > 0) kickEssayGrading(result.id);
    } catch (err) {
      console.error("[quiz-submit] essay AI enqueue failed:", err instanceof Error ? err.message : err);
    }
  }

  // Points Logic: Award points only once per achievement milestone (Idempotent).
  // Deferred while essays are pending — recomputeQuizResult awards them when the
  // teacher's last decision makes the grade final.
  if (session.role === "student" && !hasPendingEssays) {
    const { addPoints, POINTS } = await import("@/lib/points");
    let pointsEarned = 0;
    
    // First try bonus: awarded only on the very first completion if passed
    const isFirstAttempt = !existingResult?.completedAt;
    if (isFirstAttempt && passed) {
      pointsEarned += POINTS.FIRST_TRY_BONUS;
    }
    
    // Perfect score bonus: awarded only if they achieve 100% and hadn't scored 100% previously
    const previousScore = existingResult?.completedAt ? existingResult.score : 0;
    if (score === 100 && previousScore < 100) {
      pointsEarned += POINTS.EXAM_FULL_SCORE;
    }
    
    if (pointsEarned > 0) {
      await addPoints(session.id, pointsEarned);
    }
  }

  // Update Plan Lesson Progress
  if (planEnrollmentId && quiz.planLessonId) {
    await prisma.planLessonProgress.upsert({
      where: {
        enrollmentId_planLessonId: {
          enrollmentId: planEnrollmentId,
          planLessonId: quiz.planLessonId
        }
      },
      create: {
        enrollmentId: planEnrollmentId,
        planLessonId: quiz.planLessonId,
        quizPassed: passed,
        quizScore: score
      },
      update: {
        quizPassed: passed,
        quizScore: score
      }
    });
  }

  return NextResponse.json({
    result,
    correct,
    totalQ,
    score,
    passed,
    pendingEssays: pendingCount,
    aiGradingQueued,
    gradingStatus: summary.gradingStatus,
    mcqCount: summary.mcqCount,
    mcqCorrect: summary.mcqCorrect,
    essayCount: summary.essayCount,
    breakdown,
    quizTitle: quiz.title,
    courseId: quiz.folder?.courseId ?? 'plan',
  });
}
