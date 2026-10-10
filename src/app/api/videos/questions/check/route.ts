import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkVideoAccess } from "@/lib/authorization";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "غير مصرح، يرجى تسجيل الدخول" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    questionId?: string;
    selectedIndex?: number;
  };

  const { questionId, selectedIndex } = body;

  if (!questionId || typeof selectedIndex !== "number" || !Number.isInteger(selectedIndex)) {
    return NextResponse.json({ error: "بيانات السؤال أو الإجابة غير صالحة" }, { status: 400 });
  }

  // 1. Fetch Question
  const question = await prisma.videoQuestion.findUnique({
    where: { id: questionId },
    select: {
      id: true,
      videoId: true,
      timestamp: true,
      triggerSecond: true,
      question: true,
      questionText: true,
      options: true,
      correctIndex: true,
      explanation: true,
      isRequired: true,
      video: {
        select: {
          id: true,
          isFree: true,
        },
      },
    },
  });

  if (!question) {
    return NextResponse.json({ error: "السؤال غير موجود" }, { status: 404 });
  }

  // 2. Check video access (if student)
  const isTeacherOrAdmin =
    session.role === "teacher" || session.role === "admin" || session.role === "superadmin";

  if (!isTeacherOrAdmin && !question.video.isFree) {
    const hasAccess = await checkVideoAccess(session.id, session.role, question.videoId);
    if (!hasAccess) {
      return NextResponse.json({ error: "لا يوجد صلاحية للوصول لهذا الفيديو" }, { status: 403 });
    }
  }

  // 3. Fetch existing progress for this user
  const existingProgress = await prisma.videoQuestionProgress.findUnique({
    where: {
      userId_questionId: {
        userId: session.id,
        questionId: question.id,
      },
    },
  });

  const previousAttempts = existingProgress?.attempts ?? 0;
  const isAlreadyCorrect = existingProgress?.isCorrect ?? false;
  const MAX_ATTEMPTS = 2;

  // Rate limit: maximum 2 attempts for student if wrong
  if (!isTeacherOrAdmin && previousAttempts >= MAX_ATTEMPTS && !isAlreadyCorrect) {
    return NextResponse.json({
      isCorrect: false,
      attempts: previousAttempts,
      maxAttempts: MAX_ATTEMPTS,
      canRetry: false,
      canContinue: true,
      explanation: question.explanation || "يرجى مراجعة محتوى الشرح في هذا الجزء من الدرس.",
      message: "لقد استنفدت المحاولات المتاحة لهذا السؤال.",
    });
  }

  const currentAttempt = previousAttempts + 1;
  const isCorrect = selectedIndex === question.correctIndex;

  // Console log as requested: "log كل محاولة في console للتأكد"
  console.log(`[VideoQuestion] Check attempt by user ${session.id} (${session.name || session.email}):`, {
    questionId: question.id,
    videoId: question.videoId,
    selectedIndex,
    correctIndex: isTeacherOrAdmin ? question.correctIndex : "[PROTECTED]",
    isCorrect,
    attemptNumber: currentAttempt,
    isTeacherOrAdmin,
    timestamp: new Date().toISOString(),
  });

  // Record in VideoQuestionProgress
  await prisma.videoQuestionProgress.upsert({
    where: {
      userId_questionId: {
        userId: session.id,
        questionId: question.id,
      },
    },
    create: {
      userId: session.id,
      questionId: question.id,
      isCorrect,
      attempts: currentAttempt,
      answeredAt: new Date(),
    },
    update: {
      isCorrect: isCorrect || isAlreadyCorrect,
      attempts: currentAttempt,
      answeredAt: new Date(),
    },
  });

  // Also record in legacy VideoQuestionResponse for backward compatibility
  try {
    const optLetters = ["A", "B", "C", "D"];
    await prisma.videoQuestionResponse.create({
      data: {
        videoQuestionId: question.id,
        studentId: session.id,
        selectedOption: optLetters[selectedIndex] || `OPT_${selectedIndex}`,
        isCorrect,
        answeredAtSecond: question.timestamp || question.triggerSecond || 0,
      },
    }).catch(() => {});
  } catch {}

  if (isCorrect) {
    return NextResponse.json({
      isCorrect: true,
      attempts: currentAttempt,
      maxAttempts: MAX_ATTEMPTS,
      canRetry: false,
      canContinue: true,
      explanation: question.explanation || null,
      message: "برافو! إجابة صحيحة 🎉",
    });
  }

  // If wrong
  const canRetry = (currentAttempt < MAX_ATTEMPTS) || isTeacherOrAdmin;
  return NextResponse.json({
    isCorrect: false,
    attempts: currentAttempt,
    maxAttempts: MAX_ATTEMPTS,
    canRetry,
    canContinue: !canRetry || isTeacherOrAdmin,
    explanation: !canRetry || isTeacherOrAdmin ? (question.explanation || "يرجى مراجعة شرح الدرس لفهم هذه النقطة.") : null,
    message: canRetry ? "إجابة غير صحيحة، حاول مرة ثانية!" : "إجابة خاطئة. لقد استنفدت محاولاتك لهذا السؤال.",
  });
}
