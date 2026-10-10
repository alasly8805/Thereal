import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkVideoAccess } from "@/lib/authorization";

/**
 * Student and Teacher-facing questions for a video.
 *
 * GET — Returns questions for a video.
 * Security: NEVER returns correctIndex or correctOption to students.
 */

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const { id: videoId } = await params;

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { id: true, isFree: true },
  });

  if (!video) {
    return NextResponse.json({ error: "الفيديو غير موجود" }, { status: 404 });
  }

  const isTeacherOrAdmin = session.role === "teacher" || session.role === "admin" || session.role === "superadmin";

  if (!video.isFree && !isTeacherOrAdmin) {
    const hasAccess = await checkVideoAccess(session.id, session.role, videoId);
    if (!hasAccess) {
      return NextResponse.json({ error: "لا يوجد صلاحية للوصول لأسئلة هذا الدرس" }, { status: 403 });
    }
  }

  // Fetch all questions for this video
  const questions = await prisma.videoQuestion.findMany({
    where: { videoId },
    orderBy: [{ timestamp: "asc" }, { triggerSecond: "asc" }],
    select: {
      id: true,
      timestamp: true,
      triggerSecond: true,
      question: true,
      questionText: true,
      options: true,
      optionA: true,
      optionB: true,
      optionC: true,
      optionD: true,
      isRequired: true,
      mode: true,
      questionType: true,
      explanation: true,
      refireOnRewatch: true,
      progress: {
        where: { userId: session.id },
        select: {
          id: true,
          isCorrect: true,
          attempts: true,
          answeredAt: true,
        },
      },
      responses: {
        where: { studentId: session.id },
        select: {
          id: true,
          selectedOption: true,
          essayAnswer: true,
          status: true,
          teacherReply: true,
          isCorrect: true,
        },
      },
    },
  });

  const result = questions.map((q) => {
    // Standardize options array (supports 2, 3, or 4 options)
    let parsedOptions: string[] = [];
    if (Array.isArray(q.options) && q.options.length > 0) {
      parsedOptions = q.options.map(String);
    } else {
      parsedOptions = [q.optionA, q.optionB, q.optionC, q.optionD]
        .filter((opt): opt is string => typeof opt === "string" && opt.trim().length > 0);
    }

    const effectiveTime = typeof q.timestamp === "number" && q.timestamp > 0
      ? q.timestamp
      : (q.triggerSecond || 0);

    const effectiveQuestion = q.question?.trim() || q.questionText?.trim() || "";

    const userProg = q.progress[0];
    const hasProgress = Boolean(userProg && userProg.attempts > 0);
    const hasLegacyResponse = q.responses.length > 0;
    const answered = hasProgress || hasLegacyResponse;
    const isCorrect = userProg?.isCorrect || q.responses.some((r) => r.isCorrect);
    const attempts = userProg?.attempts ?? (hasLegacyResponse ? 1 : 0);

    return {
      id: q.id,
      timestamp: effectiveTime,
      triggerSecond: effectiveTime,
      question: effectiveQuestion,
      questionText: effectiveQuestion,
      options: parsedOptions,
      isRequired: q.isRequired ?? true,
      mode: q.mode || "pause",
      questionType: q.questionType || "mcq",
      refireOnRewatch: q.refireOnRewatch ?? false,
      answered,
      isCorrect,
      attempts,
      // SECURITY: NEVER return correctIndex or correctOption here!
      // Explanation is only provided if answered/exhausted or teacher
      explanation: (answered && (isCorrect || attempts >= 2)) || isTeacherOrAdmin
        ? q.explanation
        : undefined,
    };
  });

  return NextResponse.json({ questions: result });
}
