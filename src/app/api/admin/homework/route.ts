import { logAdminAction } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** GET — teacher's own homeworks with submission counts & review queue size */
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "teacher")
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });

  const homeworks = await prisma.homework.findMany({
    where: { teacherId: session.id },
    orderBy: { createdAt: "desc" },
    include: {
      video: { select: { id: true, title: true } },
      _count: {
        select: {
          questions: true,
          submissions: {
            where: { student: { accountMode: { not: "TESTER" } } },
          },
        },
      },
      questions: {
        orderBy: { order: "asc" },
        select: {
          id: true, order: true, question: true, imageUrl: true,
          optionA: true, optionB: true, optionC: true, optionD: true, correctAnswer: true,
        },
      },
      submissions: {
        where: { status: "review_requested", student: { accountMode: { not: "TESTER" } } },
        select: { id: true },
      },
    },
  });

  // Attach review queue count per homework
  const result = homeworks.map((hw) => ({
    ...hw,
    reviewQueueCount: hw.submissions.length,
    submissions: undefined, // don't leak submission list here
  }));

  return NextResponse.json({ homeworks: result });
}

/** POST — create a homework (supports all 4 types) */
export async function POST(req: NextRequest) {
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
    } catch { /* ignore */ }
  }
  if (!session || session.role !== "teacher")
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });

  const body = await req.json() as {
    title: string;
    description?: string;
    type: "link" | "exam" | "terminal" | "upload";
    linkUrl?: string;
    courseId?: string;
    folderId?: string;           // link to specific folder/محاضرة
    videoId?: string;           // link to specific lesson
    dueAt?: string;
    timeLimitMinutes?: number;
    isPublished?: boolean;
    // Terminal fields
    expectedOutput?: string;
    codeTemplate?: string;
    codeLanguage?: string;
    // Upload fields
    allowedFileTypes?: string;
    // MCQ questions
    questions?: {
      question: string;
      imageUrl?: string;
      optionA: string;
      optionB: string;
      optionC: string;
      optionD: string;
      correctAnswer: string;
    }[];
  };

  if (!body.title?.trim())
    return NextResponse.json({ error: "العنوان مطلوب" }, { status: 400 });

  if (body.type === "link" && !body.linkUrl?.trim())
    return NextResponse.json({ error: "الرابط مطلوب" }, { status: 400 });

  if (body.type === "exam" && (!body.questions || body.questions.length === 0))
    return NextResponse.json({ error: "يجب إضافة سؤال واحد على الأقل" }, { status: 400 });

  if (body.type === "terminal" && !body.expectedOutput?.trim())
    return NextResponse.json({ error: "الناتج المتوقع مطلوب للنوع terminal" }, { status: 400 });

  // Validate image URLs — only allow http/https external URLs (no uploads)
  if (body.type === "exam" && body.questions) {
    for (const q of body.questions) {
      if (q.imageUrl && !/^https?:\/\//i.test(q.imageUrl)) {
        return NextResponse.json({ error: "رابط الصورة يجب أن يبدأ بـ https://" }, { status: 400 });
      }
    }
  }

  // If videoId provided, ensure it belongs to teacher's course
  if (body.videoId) {
    const video = await prisma.video.findUnique({
      where: { id: body.videoId },
      include: { folder: { include: { course: { select: { teacherId: true } } } } },
    });
    if (!video || video.folder.course.teacherId !== session.id)
      return NextResponse.json({ error: "الدرس غير موجود أو لا ينتمي إليك" }, { status: 403 });
  }

  const homework = await prisma.homework.create({
    data: {
      teacherId:        session.id,
      title:            body.title.trim(),
      description:      body.description?.trim() ?? null,
      type:             body.type,
      linkUrl:          body.linkUrl?.trim() ?? null,
      courseId:         body.courseId ?? (body.videoId ? video?.folder?.courseId : null) ?? null,
      folderId:         body.folderId || (body.videoId ? video?.folderId : null) || null,
      videoId:          body.videoId ?? null,
      dueAt:            body.dueAt ? new Date(body.dueAt) : null,
      timeLimitMinutes: body.timeLimitMinutes ?? 30,
      isPublished:      body.isPublished ?? false,
      // Terminal
      expectedOutput:   body.expectedOutput?.trim() ?? null,
      codeTemplate:     body.codeTemplate?.trim() ?? null,
      codeLanguage:     body.codeLanguage ?? "python",
      // Upload
      allowedFileTypes: body.allowedFileTypes?.trim() ?? null,
      questions: body.type === "exam" && body.questions ? {
        create: body.questions.map((q, i) => ({
          question:      q.question.trim(),
          imageUrl:      q.imageUrl?.trim() || null,
          optionA:       q.optionA.trim(),
          optionB:       q.optionB.trim(),
          optionC:       q.optionC.trim(),
          optionD:       q.optionD.trim(),
          correctAnswer: q.correctAnswer,
          order:         i,
        })),
      } : undefined,
    },
    include: { questions: true, video: { select: { id: true, title: true } } },
  });

  return NextResponse.json({ homework }, { status: 201 });
}

/** DELETE — remove a homework */
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "teacher")
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });

  const { homeworkId } = await req.json() as { homeworkId: string };
  if (!homeworkId)
    return NextResponse.json({ error: "homeworkId مطلوب" }, { status: 400 });

  const hw = await prisma.homework.findUnique({
    where: { id: homeworkId },
    select: { teacherId: true },
  });
  if (!hw || hw.teacherId !== session.id)
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });

  await prisma.homework.delete({ where: { id: homeworkId } });
  return NextResponse.json({ ok: true });
}

/** PATCH — publish/unpublish a homework */
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "teacher")
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });

  const { homeworkId, isPublished } = await req.json() as {
    homeworkId: string;
    isPublished: boolean;
  };

  const hw = await prisma.homework.findUnique({
    where: { id: homeworkId },
    select: { teacherId: true },
  });
  if (!hw || hw.teacherId !== session.id)
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });

  const updated = await prisma.homework.update({
    where: { id: homeworkId },
    data: { isPublished },
  });

  return NextResponse.json({ homework: updated });
}
