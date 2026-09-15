import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId, hasAssistantPermission } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import { logAdminAction } from "@/lib/admin-auth";
import { recomputeQuizResult, setEssayVerdict } from "@/lib/quiz-grading";

/**
 * Teacher / assistant API for reviewing and grading Quiz/Test essay questions.
 *
 * GET   — List student quiz essay answers for teacher's courses.
 * PATCH — Approve / Disapprove an essay answer, update quiz score, and send feedback note.
 *
 * Assistants act on behalf of their teacher (actingTeacherId) and need either
 * the "viewQuizResults" or "gradeHomework" permission.
 */

function canGradeEssays(session: NonNullable<Awaited<ReturnType<typeof getSession>>>): boolean {
  if (session.role === "superadmin" || session.role === "teacher") return true;
  if (session.role !== "assistant") return false;
  return (
    hasAssistantPermission(session, "viewQuizResults") ||
    hasAssistantPermission(session, "gradeHomework")
  );
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || (!isTeacherLike(session.role) && session.role !== "superadmin")) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
  if (!canGradeEssays(session)) {
    return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية تصحيح الاختبارات" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const statusParam = searchParams.get("status"); // "PENDING" | "APPROVED" | "DISAPPROVED" | "all"
  const quizId = searchParams.get("quizId");
  const courseId = searchParams.get("courseId");

  // Teacher scope and the optional course filter both live under
  // result.quiz.folder — build them together so one never overwrites the other.
  const folderFilter: Prisma.FolderWhereInput = {};
  if (session.role !== "superadmin") {
    folderFilter.course = { teacherId: actingTeacherId(session) };
  }
  if (courseId && !quizId) {
    folderFilter.courseId = courseId;
  }

  const whereClause: Prisma.QuizAnswerWhereInput = {
    OR: [
      { questionType: "essay" },
      { essayAnswer: { not: null } },
    ],
    // Only submitted attempts — an in-progress row has no answers anyway, but
    // be explicit so a half-saved retake can never show up for grading.
    result: {
      completedAt: { not: null },
      ...(Object.keys(folderFilter).length > 0 ? { quiz: { folder: folderFilter } } : {}),
      ...(isTeacherLike(session.role) ? { student: { accountMode: { not: "TESTER" } } } : {}),
    },
  };

  if (statusParam && statusParam !== "all") {
    whereClause.status = statusParam;
  }
  if (quizId) {
    whereClause.quizId = quizId;
  }

  const answers = await prisma.quizAnswer.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      result: {
        select: {
          id: true,
          score: true,
          totalQ: true,
          completedAt: true,
          quiz: {
            select: {
              id: true,
              title: true,
              folder: {
                select: {
                  course: {
                    select: { id: true, title: true },
                  },
                },
              },
            },
          },
          student: {
            select: { id: true, name: true, email: true, phone: true },
          },
        },
      },
    },
  });

  return NextResponse.json({ answers });
}

export async function PATCH(req: NextRequest) {
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
  if (!canGradeEssays(session)) {
    return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية تصحيح الاختبارات" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    answerId?: string;
    status?: "APPROVED" | "DISAPPROVED";
    teacherReply?: string;
  };

  const { answerId, status, teacherReply } = body;

  if (!answerId || !status || !["APPROVED", "DISAPPROVED"].includes(status)) {
    return NextResponse.json(
      { error: "بيانات غير صالحة: answerId و status مطلوبان" },
      { status: 400 }
    );
  }

  // Verify ownership
  const answer = await prisma.quizAnswer.findFirst({
    where: {
      id: answerId,
      ...(session.role !== "superadmin"
        ? {
            result: {
              quiz: {
                folder: { course: { teacherId: actingTeacherId(session) } },
              },
            },
          }
        : {}),
    },
    include: {
      result: {
        include: {
          quiz: {
            select: {
              id: true,
              title: true,
              folder: { select: { courseId: true } },
            },
          },
          student: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!answer) {
    return NextResponse.json({ error: "الإجابة غير موجودة" }, { status: 404 });
  }
  if (answer.questionType !== "essay" && answer.essayAnswer === null) {
    return NextResponse.json({ error: "هذا السؤال اختياري ويُصحَّح تلقائياً" }, { status: 400 });
  }

  const isApproved = status === "APPROVED";

  // Recorded under the per-result lock shared with the AI grader, so only the
  // write that actually finalises the result triggers the deferred points.
  // A teacher decision always wins: it overrides any AI verdict (and the new
  // reviewedAt marks the official grade as the teacher's).
  const { becameFinal } = await setEssayVerdict({
    answerId,
    resultId: answer.resultId,
    status,
    teacherReply: teacherReply?.trim() || null,
    reviewedAt: new Date(),
    onlyIfPending: false,
  });
  const updatedAnswer = await prisma.quizAnswer.findUnique({ where: { id: answerId } });

  // Recalculate the overall score; when this was the last pending essay the
  // grade becomes final and progress/points are applied.
  const recomputed = await recomputeQuizResult(answer.resultId, { wasPendingBefore: becameFinal });
  const summary = recomputed?.summary;
  const newScore = summary?.score ?? answer.result.score;
  const remainingPending = summary?.pendingCount ?? 0;

  // Notify student
  try {
    const quizTitle = answer.result.quiz.title;
    const note = teacherReply?.trim() ? ` ملاحظات المعلم: "${teacherReply.trim()}"` : "";
    const scoreLine =
      remainingPending > 0
        ? `ما زال هناك ${remainingPending} سؤال مقالي قيد التصحيح، وستظهر درجتك النهائية بعد الانتهاء.`
        : `الدرجة النهائية: ${newScore}%.`;

    await prisma.notification.create({
      data: {
        userId: answer.studentId,
        type: "grade_resolved",
        title: isApproved ? "✅ تم تصحيح وقبول إجابتك المقالية" : "❌ تم تصحيح إجابتك المقالية",
        body: `قام المعلم بمراجعة وتصحيح إجابتك المقالية في اختبار (${quizTitle}). ${scoreLine}${note}`,
        link: `/quizzes/${answer.quizId}`,
      },
    });
  } catch (err) {
    console.error("Failed to notify student for quiz essay grade:", err);
  }

  return NextResponse.json({
    updatedAnswer,
    newScore,
    pendingCount: remainingPending,
    gradingStatus: summary?.gradingStatus ?? "GRADED",
    passed: summary?.passed ?? null,
  });
}
