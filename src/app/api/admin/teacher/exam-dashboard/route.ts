import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/admin-auth";
import { ContentType, parseCloseSchedule, syncContentCloseSchedule } from "@/lib/content-access-engine";
import { FolderContentType } from "@/generated/prisma";
import { removeFolderContent } from "@/lib/folder-content-order";

/**
 * API route for the Teacher Exam Dashboard.
 *
 * GET    — Retrieves comprehensive list of teacher exams with completion metrics & question breakdown.
 * DELETE — Deletes an exam belonging to the teacher.
 * PATCH  — Allows batch action (e.g., allow retake for all students in an exam).
 */

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || (!isTeacherLike(session.role) && session.role !== "superadmin")) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const courseId = searchParams.get("courseId");

  const whereClause: any = session.role !== "superadmin"
    ? { folder: { course: { teacherId: actingTeacherId(session) } } }
    : {};

  if (courseId) {
    whereClause.folder = { ...whereClause.folder, courseId };
  }

  const quizzes = await prisma.quiz.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
    include: {
      folder: {
        select: {
          id: true,
          name: true,
          course: { select: { id: true, title: true } },
        },
      },
      questions: {
        select: {
          id: true,
          questionType: true,
          imageUrl: true,
        },
      },
      results: {
        where: isTeacherLike(session.role) ? { student: { accountMode: { not: "TESTER" } } } : undefined,
        select: {
          id: true,
          score: true,
          completedAt: true,
          student: { select: { id: true, name: true } },
          answers: {
            where: { status: "PENDING" },
            select: { id: true },
          },
        },
      },
    },
  });

  const formattedExams = quizzes.map((q) => {
    const totalQuestions = q.questions.length;
    const mcqCount = q.questions.filter((item) => item.questionType !== "essay").length;
    const essayCount = q.questions.filter((item) => item.questionType === "essay").length;
    const imagesCount = q.questions.filter((item) => item.imageUrl && item.imageUrl.trim().length > 0).length;

    const completedResults = q.results.filter((r) => r.completedAt !== null);
    const totalAttempts = completedResults.length;

    // A result with pending essay answers has no final grade yet, so it must
    // not drag the average down to 0% or be counted as failed.
    const gradedResults = completedResults.filter((r) => !r.answers || r.answers.length === 0);
    const pendingResultsCount = totalAttempts - gradedResults.length;
    const totalScoreSum = gradedResults.reduce((acc, r) => acc + r.score, 0);
    const avgScore = gradedResults.length > 0 ? Number((totalScoreSum / gradedResults.length).toFixed(1)) : 0;
    const passedCount = gradedResults.filter((r) => r.score >= 50).length;

    // Count pending essay answers in this quiz
    const pendingEssayCount = completedResults.reduce(
      (acc, r) => acc + (r.answers ? r.answers.length : 0),
      0
    );

    return {
      id: q.id,
      title: q.title,
      timeLimitMinutes: q.timeLimitMinutes,
      closeAt: q.closeAt,
      enableAutoClose: q.enableAutoClose,
      createdAt: q.createdAt,
      courseId: q.folder?.course?.id || "",
      courseTitle: q.folder?.course?.title || "كورس غير معرف",
      folderId: q.folder?.id || "",
      folderName: q.folder?.name || "",
      totalQuestions,
      mcqCount,
      essayCount,
      imagesCount,
      totalAttempts,
      gradedAttempts: gradedResults.length,
      pendingResultsCount,
      avgScore,
      passedCount,
      pendingEssayCount,
    };
  });

  const totalExams = formattedExams.length;
  const totalAttempts = formattedExams.reduce((acc, e) => acc + e.totalAttempts, 0);
  const totalGraded = formattedExams.reduce((acc, e) => acc + e.gradedAttempts, 0);
  const totalPendingEssays = formattedExams.reduce((acc, e) => acc + e.pendingEssayCount, 0);
  const overallAvgScore =
    totalGraded > 0
      ? Number(
          (
            formattedExams.reduce((acc, e) => acc + e.avgScore * e.gradedAttempts, 0) /
            totalGraded
          ).toFixed(1)
        )
      : 0;

  return NextResponse.json({
    stats: {
      totalExams,
      totalAttempts,
      overallAvgScore,
      totalPendingEssays,
    },
    exams: formattedExams,
  });
}

export async function DELETE(req: NextRequest) {
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

  const { searchParams } = req.nextUrl;
  const quizId = searchParams.get("quizId");

  if (!quizId) {
    return NextResponse.json({ error: "quizId مطلوب" }, { status: 400 });
  }

  const existingQuiz = await prisma.quiz.findFirst({
    where: {
      id: quizId,
      ...(session.role !== "superadmin"
        ? { folder: { course: { teacherId: actingTeacherId(session) } } }
        : {}),
    },
  });

  if (!existingQuiz) {
    return NextResponse.json({ error: "الاختبار غير موجود أو غير مصرح بحذفه" }, { status: 404 });
  }

  await prisma.quiz.delete({ where: { id: quizId } });
  await removeFolderContent(FolderContentType.EXAM, quizId);
  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || (!isTeacherLike(session.role) && session.role !== "superadmin")) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    quizId?: string;
    action?: string;
    closeAt?: string | null;
    enableAutoClose?: boolean;
  };
  const quizId = String(body.quizId || "").trim();
  if (!quizId) {
    return NextResponse.json({ error: "بيانات الإجراء غير صالحة" }, { status: 400 });
  }

  const existingQuiz = await prisma.quiz.findFirst({
    where: {
      id: quizId,
      ...(session.role !== "superadmin"
        ? { folder: { course: { teacherId: actingTeacherId(session) } } }
        : {}),
    },
  });

  if (!existingQuiz) {
    return NextResponse.json({ error: "الاختبار غير موجود" }, { status: 404 });
  }

  if (body.action === "allow_all_retakes") {
    // Flag only — students still see their old sheet until they press
    // "بدء محاولة جديدة" on the quiz page.
    const updated = await prisma.quizResult.updateMany({
      where: { quizId },
      data: { allowRetake: true },
    });
    return NextResponse.json({ success: true, updatedCount: updated.count });
  }

  if (body.closeAt !== undefined || body.enableAutoClose !== undefined) {
    const closeSchedule = parseCloseSchedule({
      closeAt: body.closeAt,
      enableAutoClose: body.enableAutoClose,
    });
    if (closeSchedule.error) {
      return NextResponse.json({ error: closeSchedule.error }, { status: 400 });
    }
    const updated = await prisma.quiz.update({
      where: { id: quizId },
      data: {
        closeAt: closeSchedule.closeAt,
        enableAutoClose: closeSchedule.enableAutoClose,
      },
    });
    await syncContentCloseSchedule({
      type: ContentType.QUIZ,
      sourceId: updated.id,
      title: updated.title,
      closeAt: updated.closeAt,
      enableAutoClose: updated.enableAutoClose,
    });
    return NextResponse.json({ success: true, quiz: updated });
  }

  return NextResponse.json({ error: "بيانات الإجراء غير صالحة" }, { status: 400 });
}
