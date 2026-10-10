import { logAdminAction } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";

/**
 * Teacher CRUD for in-video timed questions.
 *
 * POST  — Create a question at a specific timestamp (supports 2, 3, or 4 options).
 * GET   — List all questions for a video (with analytics).
 * PATCH — Update question details (e.g. dragging timestamp on timeline).
 * DELETE— Delete a question.
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
    } catch {}
  }

  if (!session || (!isTeacherLike(session.role) && session.role !== "superadmin")) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const { id: videoId } = await params;

  const body = (await req.json().catch(() => ({}))) as {
    timestamp?: number;
    triggerSecond?: number;
    question?: string;
    questionText?: string;
    options?: string[];
    correctIndex?: number;
    isRequired?: boolean;
    explanation?: string;
    // Legacy support:
    mode?: string;
    questionType?: string;
    optionA?: string;
    optionB?: string;
    optionC?: string;
    optionD?: string;
    correctOption?: string;
    refireOnRewatch?: boolean;
  };

  const rawSeconds = body.timestamp ?? body.triggerSecond;
  if (typeof rawSeconds !== "number" || isNaN(rawSeconds) || rawSeconds < 0) {
    return NextResponse.json({ error: "توقيت عرض السؤال بالثواني مطلوب" }, { status: 400 });
  }
  const timestamp = Math.floor(rawSeconds);

  const questionText = (body.question || body.questionText || "").trim();
  if (!questionText) {
    return NextResponse.json({ error: "نص السؤال مطلوب" }, { status: 400 });
  }

  // Parse options: either provided as array `options` or as `optionA/B/C/D`
  let optionsArray: string[] = [];
  if (Array.isArray(body.options) && body.options.length >= 2) {
    optionsArray = body.options.map((o) => String(o).trim()).filter(Boolean);
  } else {
    optionsArray = [body.optionA, body.optionB, body.optionC, body.optionD]
      .filter((opt): opt is string => typeof opt === "string" && opt.trim().length > 0)
      .map((opt) => opt.trim());
  }

  if (optionsArray.length < 2 || optionsArray.length > 4) {
    return NextResponse.json(
      { error: "يجب توفير بين 2 إلى 4 اختيارات للسؤال" },
      { status: 400 }
    );
  }

  // Determine correctIndex
  let correctIndex = 0;
  if (typeof body.correctIndex === "number" && Number.isInteger(body.correctIndex)) {
    correctIndex = body.correctIndex;
  } else if (body.correctOption) {
    const map: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
    correctIndex = map[body.correctOption] ?? 0;
  }

  if (correctIndex < 0 || correctIndex >= optionsArray.length) {
    return NextResponse.json(
      { error: "يرجى تحديد الإجابة الصحيحة من بين الخيارات المتاحة" },
      { status: 400 }
    );
  }

  const isRequired = body.isRequired !== false;
  const explanation = body.explanation?.trim() || null;

  // Verify the video exists and belongs to the teacher
  const videoWhere = session.role === "superadmin"
    ? { id: videoId }
    : { id: videoId, folder: { course: { teacherId: actingTeacherId(session) } } };

  const video = await prisma.video.findFirst({
    where: videoWhere,
    select: { id: true, durationMinutes: true },
  });
  if (!video) {
    return NextResponse.json({ error: "الفيديو غير موجود" }, { status: 404 });
  }

  // Map to legacy letters
  const letters = ["A", "B", "C", "D"];
  const correctOption = letters[correctIndex] || "A";

  const question = await prisma.videoQuestion.create({
    data: {
      videoId,
      timestamp,
      question: questionText,
      options: optionsArray,
      correctIndex,
      explanation,
      isRequired,
      // Legacy fields:
      triggerSecond: timestamp,
      mode: body.mode || "pause",
      questionType: "mcq",
      questionText,
      optionA: optionsArray[0] || null,
      optionB: optionsArray[1] || null,
      optionC: optionsArray[2] || null,
      optionD: optionsArray[3] || null,
      correctOption,
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
    orderBy: [{ timestamp: "asc" }, { triggerSecond: "asc" }],
    include: {
      progress: {
        select: { isCorrect: true, attempts: true },
      },
      responses: {
        select: { isCorrect: true, answeredAtSecond: true },
      },
    },
  });

  const questionsWithAnalytics = questions.map((q) => {
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

    const totalStudents = q.progress.length || q.responses.length;
    const correctCount = q.progress.filter((p) => p.isCorrect).length || q.responses.filter((r) => r.isCorrect).length;

    return {
      id: q.id,
      timestamp: effectiveTime,
      triggerSecond: effectiveTime,
      question: q.question || q.questionText || "",
      questionText: q.question || q.questionText || "",
      options: parsedOptions,
      correctIndex: q.correctIndex,
      correctOption: q.correctOption,
      explanation: q.explanation,
      isRequired: q.isRequired ?? true,
      mode: q.mode || "pause",
      createdAt: q.createdAt,
      analytics: {
        totalResponses: totalStudents,
        correctPercent: totalStudents > 0 ? Math.round((correctCount / totalStudents) * 100) : 0,
      },
    };
  });

  return NextResponse.json({ questions: questionsWithAnalytics });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    } catch {}
  }

  if (!session || (!isTeacherLike(session.role) && session.role !== "superadmin")) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const { id: videoId } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    questionId: string;
    timestamp?: number;
    question?: string;
    options?: string[];
    correctIndex?: number;
    isRequired?: boolean;
    explanation?: string;
  };

  if (!body.questionId) {
    return NextResponse.json({ error: "معرف السؤال مطلوب" }, { status: 400 });
  }

  // Verify ownership
  const existing = await prisma.videoQuestion.findFirst({
    where: {
      id: body.questionId,
      videoId,
      ...(session.role !== "superadmin" ? { video: { folder: { course: { teacherId: actingTeacherId(session) } } } } : {}),
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "السؤال غير موجود أو ليس لديك صلاحية لتعديله" }, { status: 404 });
  }

  const updateData: Record<string, any> = {};

  if (typeof body.timestamp === "number" && !isNaN(body.timestamp) && body.timestamp >= 0) {
    const t = Math.floor(body.timestamp);
    updateData.timestamp = t;
    updateData.triggerSecond = t;
  }

  if (typeof body.question === "string" && body.question.trim().length > 0) {
    updateData.question = body.question.trim();
    updateData.questionText = body.question.trim();
  }

  if (Array.isArray(body.options) && body.options.length >= 2 && body.options.length <= 4) {
    const opts = body.options.map((o) => String(o).trim()).filter(Boolean);
    if (opts.length >= 2) {
      updateData.options = opts;
      updateData.optionA = opts[0] || null;
      updateData.optionB = opts[1] || null;
      updateData.optionC = opts[2] || null;
      updateData.optionD = opts[3] || null;
    }
  }

  if (typeof body.correctIndex === "number" && Number.isInteger(body.correctIndex)) {
    updateData.correctIndex = body.correctIndex;
    const letters = ["A", "B", "C", "D"];
    updateData.correctOption = letters[body.correctIndex] || "A";
  }

  if (typeof body.isRequired === "boolean") {
    updateData.isRequired = body.isRequired;
  }

  if (body.explanation !== undefined) {
    updateData.explanation = body.explanation?.trim() || null;
  }

  const updated = await prisma.videoQuestion.update({
    where: { id: body.questionId },
    data: updateData,
  });

  return NextResponse.json({ question: updated, ok: true });
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
    } catch {}
  }

  if (!session || (!isTeacherLike(session.role) && session.role !== "superadmin")) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const { id: videoId } = await params;
  const body = (await req.json().catch(() => ({}))) as { questionId?: string };

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
