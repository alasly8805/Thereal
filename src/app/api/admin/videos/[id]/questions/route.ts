import { logAdminAction } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";

/**
 * Teacher CRUD for in-video timed questions.
 *
 * POST — Create a question at a specific timestamp.
 * GET  — List all questions for a video (with analytics).
 */

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();

    if (session && session.role === "superadmin") {
      try {
        await logAdminAction({
          adminId: session.id,
          adminName: session.name,
          action: "SUPERADMIN_ACTION",
          targetType: "API_ROUTE",
          targetId: req.nextUrl ? req.nextUrl.pathname : req.url,
          targetName: req.method,
        });
      } catch (e) {}
    }
  if (!session || (!isTeacherLike(session.role) && session.role !== "superadmin")) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const { id: videoId } = await params;

  const body = await req.json().catch(() => ({})) as {
    triggerSecond?: number;
    mode?: string;
    questionType?: string;
    questionText?: string;
    optionA?: string;
    optionB?: string;
    optionC?: string;
    optionD?: string;
    correctOption?: string;
    explanation?: string;
    refireOnRewatch?: boolean;
  };

  const questionType = body.questionType === "essay" ? "essay" : "mcq";

  // Validate required fields
  if (typeof body.triggerSecond !== "number" || !body.questionText?.trim()) {
    return NextResponse.json(
      { error: "نص السؤال وتوقيت العرض مطلوبان" },
      { status: 400 }
    );
  }

  if (questionType === "mcq") {
    if (
      !body.optionA?.trim() ||
      !body.optionB?.trim() ||
      !body.optionC?.trim() ||
      !body.optionD?.trim() ||
      !["A", "B", "C", "D"].includes(body.correctOption ?? "")
    ) {
      return NextResponse.json(
        { error: "الخيارات الأربعة والإجابة الصحيحة مطلوبة لأسئلة الاختيار من متعدد" },
        { status: 400 }
      );
    }
  }

  // Validate mode
  const mode = body.mode === "overlay" ? "overlay" : "pause";

  // Verify the video exists and belongs to the teacher's course
  const videoWhere = session.role === "superadmin"
    ? { id: videoId }
    : { id: videoId, folder: { course: { teacherId: actingTeacherId(session) } } };
  const video = await prisma.video.findFirst({
    where: videoWhere,
    select: { id: true, durationMinutes: true, videoProvider: true },
  });
  if (!video) {
    return NextResponse.json({ error: "الفيديو غير موجود" }, { status: 404 });
  }

  if (video.videoProvider !== "youtube") {
    return NextResponse.json(
      { error: "الأسئلة التفاعلية متاحة حالياً فقط لفيديوهات يوتيوب" },
      { status: 400 }
    );
  }

  // Validate triggerSecond doesn't exceed video duration
  const triggerSecond = Math.max(0, Math.floor(body.triggerSecond));
  if (video.durationMinutes > 0 && triggerSecond > video.durationMinutes * 60) {
    return NextResponse.json(
      { error: `التوقيت (${triggerSecond}ث) يتجاوز مدة الفيديو (${video.durationMinutes} دقيقة)` },
      { status: 400 }
    );
  }

  const question = await prisma.videoQuestion.create({
    data: {
      videoId,
      triggerSecond,
      mode,
      questionType,
      questionText: body.questionText.trim(),
      optionA: questionType === "mcq" ? body.optionA!.trim() : null,
      optionB: questionType === "mcq" ? body.optionB!.trim() : null,
      optionC: questionType === "mcq" ? body.optionC!.trim() : null,
      optionD: questionType === "mcq" ? body.optionD!.trim() : null,
      correctOption: questionType === "mcq" ? body.correctOption! : null,
      explanation: body.explanation?.trim() || null,
      refireOnRewatch: body.refireOnRewatch ?? false,
    },
  });

  return NextResponse.json({ question }, { status: 201 });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || (!isTeacherLike(session.role) && session.role !== "superadmin")) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const { id: videoId } = await params;

  // Verify the video belongs to the teacher
  const videoWhere = session.role === "superadmin"
    ? { id: videoId }
    : { id: videoId, folder: { course: { teacherId: actingTeacherId(session) } } };
  const video = await prisma.video.findFirst({
    where: videoWhere,
    select: { id: true },
  });
  if (!video) {
    return NextResponse.json({ error: "الفيديو غير موجود" }, { status: 404 });
  }

  const questions = await prisma.videoQuestion.findMany({
    where: { videoId },
    orderBy: { triggerSecond: "asc" },
    include: {
      responses: {
        select: { isCorrect: true, answeredAtSecond: true },
      },
    },
  });

  // Compute per-question analytics
  const questionsWithAnalytics = questions.map((q) => {
    const total = q.responses.length;
    const correct = q.responses.filter((r) => r.isCorrect).length;
    const avgDelay = total > 0
      ? q.responses.reduce((sum, r) => sum + Math.abs(r.answeredAtSecond - q.triggerSecond), 0) / total
      : 0;

    return {
      id: q.id,
      triggerSecond: q.triggerSecond,
      mode: q.mode,
      questionType: q.questionType || "mcq",
      questionText: q.questionText,
      optionA: q.optionA,
      optionB: q.optionB,
      optionC: q.optionC,
      optionD: q.optionD,
      correctOption: q.correctOption,
      explanation: q.explanation,
      refireOnRewatch: q.refireOnRewatch,
      createdAt: q.createdAt,
      analytics: {
        totalResponses: total,
        correctPercent: total > 0 ? Math.round((correct / total) * 100) : 0,
        avgResponseDelay: Math.round(avgDelay),
      },
    };
  });

  return NextResponse.json({ questions: questionsWithAnalytics });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();

    if (session && session.role === "superadmin") {
      try {
        await logAdminAction({
          adminId: session.id,
          adminName: session.name,
          action: "SUPERADMIN_ACTION",
          targetType: "API_ROUTE",
          targetId: req.nextUrl ? req.nextUrl.pathname : req.url,
          targetName: req.method,
        });
      } catch (e) {}
    }
  if (!session || (!isTeacherLike(session.role) && session.role !== "superadmin")) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const { id: videoId } = await params;
  const body = await req.json().catch(() => ({})) as { questionId?: string };

  if (!body.questionId) {
    return NextResponse.json({ error: "questionId مطلوب" }, { status: 400 });
  }

  // Verify ownership
  const question = await prisma.videoQuestion.findFirst({
    where: {
      id: body.questionId,
      videoId,
      ...(session.role !== "superadmin" ? { video: { folder: { course: { teacherId: actingTeacherId(session) } } } } : {}),
    },
  });
  if (!question) {
    return NextResponse.json({ error: "السؤال غير موجود" }, { status: 404 });
  }

  await prisma.videoQuestion.delete({ where: { id: body.questionId } });
  return NextResponse.json({ ok: true });
}
