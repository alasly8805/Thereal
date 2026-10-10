import { logAdminAction } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId, hasAssistantPermission } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";
import {
  ContentType,
  parseCloseSchedule,
  syncContentCloseSchedule,
} from "@/lib/content-access-engine";
import { parseDegree } from "@/lib/quiz-grading";
import { FolderContentType } from "@/generated/prisma";
import { appendFolderContent, removeFolderContent } from "@/lib/folder-content-order";
import { parseIntegritySettings } from "@/lib/homework-integrity";

/** GET — teacher's own homeworks with submission counts & review queue size */
export async function GET() {
  const session = await getSession();
  if (!session || !isTeacherLike(session.role))
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  if (!hasAssistantPermission(session, "manageHomework") && !hasAssistantPermission(session, "gradeHomework")) {
    return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية الواجبات" }, { status: 403 });
  }

  const homeworks = await prisma.homework.findMany({
    where: { teacherId: actingTeacherId(session) },
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
          optionA: true, optionB: true, optionC: true, optionD: true, correctAnswer: true, degree: true,
        },
      },
      submissions: {
        where: {
          status: { in: ["review_requested", "pending"] },
          student: { accountMode: { not: "TESTER" } },
        },
        select: { id: true },
      },
    },
  });

  // Attach review queue count per homework
  const failedGroups = homeworks.length
    ? await prisma.homeworkSubmission.groupBy({
        by: ["homeworkId"],
        where: {
          homeworkId: { in: homeworks.map((h) => h.id) },
          status: "failed",
          allowRetake: false,
          student: { accountMode: { not: "TESTER" } },
        },
        _count: { _all: true },
      })
    : [];
  const failedByHw = new Map(failedGroups.map((g) => [g.homeworkId, g._count._all]));

  // Average score and how many exam sheets carry integrity flags, per homework.
  const scoreGroups = homeworks.length
    ? await prisma.homeworkSubmission.groupBy({
        by: ["homeworkId"],
        where: {
          homeworkId: { in: homeworks.map((h) => h.id) },
          score: { not: null },
          student: { accountMode: { not: "TESTER" } },
        },
        _avg: { score: true },
      })
    : [];
  const avgByHw = new Map(scoreGroups.map((g) => [g.homeworkId, g._avg.score]));
  const flaggedGroups = homeworks.length
    ? await prisma.homeworkSubmission.groupBy({
        by: ["homeworkId"],
        where: {
          homeworkId: { in: homeworks.map((h) => h.id) },
          focusLosses: { gte: 3 },
          student: { accountMode: { not: "TESTER" } },
        },
        _count: { _all: true },
      })
    : [];
  const flaggedByHw = new Map(flaggedGroups.map((g) => [g.homeworkId, g._count._all]));

  const result = homeworks.map((hw) => ({
    ...hw,
    reviewQueueCount: hw.submissions.length,
    failedCount: failedByHw.get(hw.id) ?? 0,
    avgScore: avgByHw.get(hw.id) ?? null,
    focusFlagCount: flaggedByHw.get(hw.id) ?? 0,
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
  if (!session || !isTeacherLike(session.role))
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  if (!hasAssistantPermission(session, "manageHomework"))
    return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية إدارة الواجبات" }, { status: 403 });

  const body = await req.json() as {
    title: string;
    description?: string;
    type: "link" | "exam" | "terminal" | "upload";
    linkUrl?: string;
    courseId?: string;
    folderId?: string;           // link to specific folder/محاضرة
    videoId?: string;           // link to specific lesson
    dueAt?: string;
    closeAt?: string;
    enableAutoClose?: boolean;
    timeLimitMinutes?: number;
    isPublished?: boolean;
    // Terminal fields
    expectedOutput?: string;
    codeTemplate?: string;
    codeLanguage?: string;
    // Upload fields
    allowedFileTypes?: string;
    // Exam anti-cheating
    shuffleQuestions?: boolean;
    shuffleChoices?: boolean;
    questionsPerStudent?: number | null;
    revealAnswers?: boolean;
    // MCQ questions
    questions?: {
      question: string;
      imageUrl?: string;
      optionA: string;
      optionB: string;
      optionC?: string;
      optionD?: string;
      correctAnswer: string;
      degree?: number;
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

  const closeSchedule = parseCloseSchedule({
    closeAt: body.closeAt,
    enableAutoClose: body.enableAutoClose,
  });
  if (closeSchedule.error) {
    return NextResponse.json({ error: closeSchedule.error }, { status: 400 });
  }

  // Validate questions for exam type
  if (body.type === "exam" && body.questions) {
    for (let i = 0; i < body.questions.length; i++) {
      const q = body.questions[i];
      if (!q.question?.trim()) {
        return NextResponse.json({ error: `السؤال رقم ${i + 1} لا يحتوي على نص` }, { status: 400 });
      }
      if (!q.optionA?.trim() || !q.optionB?.trim()) {
        return NextResponse.json({ error: `السؤال رقم ${i + 1} يجب أن يحتوي على خيارين على الأقل (أ و ب)` }, { status: 400 });
      }
      if (q.imageUrl && !/^https?:\/\//i.test(q.imageUrl)) {
        return NextResponse.json({ error: "رابط الصورة يجب أن يبدأ بـ https://" }, { status: 400 });
      }
    }
  }

  const integrity = parseIntegritySettings(body, body.type === "exam" ? body.questions?.length ?? 0 : null);
  if (integrity.error) return NextResponse.json({ error: integrity.error }, { status: 400 });

  // Course and folder must be this teacher's: appendFolderContent below puts
  // the homework into that folder's learning chain.
  const teacherId = actingTeacherId(session);
  if (body.courseId) {
    const course = await prisma.course.findUnique({ where: { id: body.courseId }, select: { teacherId: true } });
    if (!course || course.teacherId !== teacherId)
      return NextResponse.json({ error: "الكورس غير موجود أو لا ينتمي إليك" }, { status: 403 });
  }
  if (body.folderId) {
    const folder = await prisma.folder.findUnique({
      where: { id: body.folderId },
      select: { courseId: true, course: { select: { teacherId: true } } },
    });
    if (!folder || folder.course.teacherId !== teacherId)
      return NextResponse.json({ error: "المحاضرة غير موجودة أو لا تنتمي إليك" }, { status: 403 });
  }

  // If videoId provided, ensure it belongs to teacher's course
  let video: any = null;
  if (body.videoId) {
    video = await prisma.video.findUnique({
      where: { id: body.videoId },
      include: { folder: { include: { course: { select: { teacherId: true } } } } },
    });
    if (!video || video.folder.course.teacherId !== actingTeacherId(session))
      return NextResponse.json({ error: "الدرس غير موجود أو لا ينتمي إليك" }, { status: 403 });
  }

  const homework = await prisma.homework.create({
    data: {
      teacherId: actingTeacherId(session),
      title:            body.title.trim(),
      description:      body.description?.trim() ?? null,
      type:             body.type,
      linkUrl:          body.linkUrl?.trim() ?? null,
      courseId:         body.courseId ?? (body.videoId ? video?.folder?.courseId : null) ?? null,
      folderId:         body.folderId || (body.videoId ? video?.folderId : null) || null,
      videoId:          body.videoId ?? null,
      dueAt:            body.dueAt ? new Date(body.dueAt) : null,
      closeAt:          closeSchedule.closeAt,
      enableAutoClose:  closeSchedule.enableAutoClose,
      timeLimitMinutes: body.timeLimitMinutes ?? 30,
      isPublished:      body.isPublished ?? false,
      // Terminal
      expectedOutput:   body.expectedOutput?.trim() ?? null,
      codeTemplate:     body.codeTemplate?.trim() ?? null,
      codeLanguage:     body.codeLanguage ?? "python",
      // Upload
      allowedFileTypes: body.allowedFileTypes?.trim() ?? null,
      ...integrity.settings,
      questions: body.type === "exam" && body.questions ? {
        create: body.questions.map((q, i) => {
          const optA = q.optionA?.trim() || "";
          const optB = q.optionB?.trim() || "";
          const optC = q.optionC?.trim() || "";
          const optD = q.optionD?.trim() || "";

          let correct = String(q.correctAnswer || "A").toUpperCase();
          if (correct === "D" && !optD) correct = "A";
          if (correct === "C" && !optC) correct = "A";
          if (correct === "B" && !optB) correct = "A";
          if (!["A", "B", "C", "D"].includes(correct)) correct = "A";

          return {
            question:      q.question.trim(),
            imageUrl:      q.imageUrl?.trim() || null,
            optionA:       optA,
            optionB:       optB,
            optionC:       optC,
            optionD:       optD,
            correctAnswer: correct,
            degree:        parseDegree((q as { degree?: unknown }).degree),
            order:         i,
          };
        }),
      } : undefined,
    },
    include: { questions: true, video: { select: { id: true, title: true } } },
  });

  await syncContentCloseSchedule({
    type: ContentType.HOMEWORK,
    sourceId: homework.id,
    title: homework.title,
    closeAt: homework.closeAt,
    enableAutoClose: homework.enableAutoClose,
  });

  await appendFolderContent(homework.folderId, FolderContentType.HOMEWORK, homework.id);

  return NextResponse.json({ homework }, { status: 201 });
}

/** DELETE — remove a homework */
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || !isTeacherLike(session.role))
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  if (!hasAssistantPermission(session, "manageHomework"))
    return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية إدارة الواجبات" }, { status: 403 });

  const { homeworkId } = await req.json() as { homeworkId: string };
  if (!homeworkId)
    return NextResponse.json({ error: "homeworkId مطلوب" }, { status: 400 });

  const hw = await prisma.homework.findUnique({
    where: { id: homeworkId },
    select: { teacherId: true },
  });
  if (!hw || hw.teacherId !== actingTeacherId(session))
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });

  await prisma.homework.delete({ where: { id: homeworkId } });
  await removeFolderContent(FolderContentType.HOMEWORK, homeworkId);
  return NextResponse.json({ ok: true });
}

/** PATCH — publish/unpublish a homework */
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || !isTeacherLike(session.role))
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  if (!hasAssistantPermission(session, "manageHomework"))
    return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية إدارة الواجبات" }, { status: 403 });

  const body = await req.json() as {
    homeworkId: string;
    isPublished?: boolean;
    closeAt?: string | null;
    enableAutoClose?: boolean;
    shuffleQuestions?: boolean;
    shuffleChoices?: boolean;
    questionsPerStudent?: number | null;
    revealAnswers?: boolean;
  };
  const { homeworkId, isPublished, closeAt, enableAutoClose } = body;

  const hw = await prisma.homework.findUnique({
    where: { id: homeworkId },
    select: { teacherId: true, title: true, _count: { select: { questions: true } } },
  });
  if (!hw || hw.teacherId !== actingTeacherId(session))
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });

  // Changing these affects the next attempt each student opens. Attempts
  // already on screen keep their saved order, so no answer is reinterpreted.
  const integrity = parseIntegritySettings(body, hw._count.questions);
  if (integrity.error) return NextResponse.json({ error: integrity.error }, { status: 400 });

  const data: {
    isPublished?: boolean;
    closeAt?: Date | null;
    enableAutoClose?: boolean;
    shuffleQuestions?: boolean;
    shuffleChoices?: boolean;
    questionsPerStudent?: number | null;
    revealAnswers?: boolean;
  } = { ...integrity.settings };
  if (typeof isPublished === "boolean") data.isPublished = isPublished;
  if (enableAutoClose !== undefined || closeAt !== undefined) {
    const closeSchedule = parseCloseSchedule({ closeAt, enableAutoClose });
    if (closeSchedule.error) {
      return NextResponse.json({ error: closeSchedule.error }, { status: 400 });
    }
    data.closeAt = closeSchedule.closeAt;
    data.enableAutoClose = closeSchedule.enableAutoClose;
  }

  const updated = await prisma.homework.update({
    where: { id: homeworkId },
    data,
  });

  if (data.closeAt !== undefined || data.enableAutoClose !== undefined) {
    await syncContentCloseSchedule({
      type: ContentType.HOMEWORK,
      sourceId: updated.id,
      title: updated.title,
      closeAt: updated.closeAt,
      enableAutoClose: updated.enableAutoClose,
    });
  }

  return NextResponse.json({ homework: updated });
}
