import { logAdminAction } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId, hasAssistantPermission } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";
import { summarizeAnswers } from "@/lib/quiz-grading";

// GET — teacher gets quiz results for their quizzes
export async function GET(req: NextRequest) {

      try {
      const session = await getSession();
      if (!session || (!isTeacherLike(session.role) && session.role !== "superadmin")) {
        return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
      }
      if (isTeacherLike(session.role) && !hasAssistantPermission(session, "viewQuizResults")) {
        return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية نتائج الاختبارات" }, { status: 403 });
      }

      const quizId = req.nextUrl.searchParams.get("quizId");
      const courseId = req.nextUrl.searchParams.get("courseId");

      // Get teacher's courses
      const teacherCourses = await prisma.course.findMany({
        where: { teacherId: actingTeacherId(session) },
        select: { id: true },
      });
      const courseIds = teacherCourses.map((c) => c.id);

      if (courseIds.length === 0) {
        return NextResponse.json({ results: [] });
      }

      // Build filter (excluding testers for teacher queries)
      const where: Record<string, unknown> = {
        // Only submitted attempts. An opened-but-unsubmitted quiz has a
        // placeholder row (score 0, completedAt NULL) that must not be listed
        // as a 0% result.
        completedAt: { not: null },
        quiz: {
          folder: {
            courseId: courseId ? { equals: courseId, in: courseIds } : { in: courseIds },
          },
        },
      };
      if (isTeacherLike(session.role)) {
        where.student = { accountMode: { not: "TESTER" } };
      }
      if (quizId) where.quizId = quizId;

      const results = await prisma.quizResult.findMany({
        where,
        orderBy: { completedAt: "desc" },
        include: {
          student: { select: { id: true, name: true, email: true, phone: true } },
          answers: { select: { questionType: true, isCorrect: true, status: true, degree: true } },
          quiz: {
            select: {
              id: true,
              title: true,
              folder: {
                select: {
                  name: true,
                  courseId: true,
                  course: { select: { title: true } },
                },
              },
            },
          },
        },
      });

      return NextResponse.json({
        results: results.map((r) => {
          const summary = summarizeAnswers(r.answers, r.totalQ);
          return {
            id: r.id,
            studentId: r.studentId,
            student: r.student,
            quizId: r.quizId,
            quiz: {
              id: r.quiz.id,
              title: r.quiz.title,
              folderName: r.quiz.folder?.name ?? "اختبار خطة",
              courseId: r.quiz.folder?.courseId ?? "",
              courseTitle: r.quiz.folder?.course?.title ?? "خطة دراسية",
            },
            score: r.score,
            totalQ: r.totalQ,
            allowRetake: r.allowRetake,
            completedAt: r.completedAt,
            // Grading state so the UI never labels a pending essay exam as 0% / راسب.
            pendingCount: summary.pendingCount,
            essayCount: summary.essayCount,
            mcqCount: summary.mcqCount,
            mcqCorrect: summary.mcqCorrect,
            essayApproved: summary.essayApproved,
            gradingStatus: summary.gradingStatus,
            passed: summary.passed,
          };
        }),
      });
    } catch (error) {
        console.error("[admin/quiz-results] error:", error);
        return NextResponse.json(
          { error: "حدث خطأ داخلي" },
          { status: 500 }
        );
      }
}

// PATCH — teacher toggles allowRetake for a specific result
export async function PATCH(req: NextRequest) {

      try {
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
        return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
      }
      if (isTeacherLike(session.role) && !hasAssistantPermission(session, "viewQuizResults")) {
        return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية نتائج الاختبارات" }, { status: 403 });
      }

      const { resultId, allowRetake } = await req.json();
      if (!resultId || typeof allowRetake !== "boolean") {
        return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });
      }

      // Verify teacher owns the course and student is not a tester
      const result = await prisma.quizResult.findUnique({
        where: { id: resultId },
        include: {
          student: { select: { accountMode: true } },
          quiz: {
            include: {
              folder: {
                select: { course: { select: { teacherId: true } } },
              },
            },
          },
        },
      });

      if (!result || (isTeacherLike(session.role) && result.student.accountMode === "TESTER")) {
        return NextResponse.json({ error: "النتيجة غير موجودة" }, { status: 404 });
      }

      if (result.quiz.folder && isTeacherLike(session.role) && result.quiz.folder.course.teacherId !== actingTeacherId(session)) {
        return NextResponse.json({ error: "ليست لديك صلاحية" }, { status: 403 });
      }

      if (!result.quiz.folder && session.role !== "superadmin") {
        return NextResponse.json({ error: "لا يمكن تعديل اختبارات الخطط إلا للمشرف العام" }, { status: 403 });
      }

      // Flag only. Never clear completedAt here — the student starts a new
      // attempt from the review page with «بدء محاولة جديدة».
      const updated = await prisma.quizResult.update({
        where: { id: resultId },
        data: { allowRetake },
      });

      return NextResponse.json({
        result: updated,
        message: allowRetake
          ? "تم السماح بإعادة الاختبار. المحاولة القديمة تبقى ظاهرة للطالب حتى يضغط «بدء محاولة جديدة»."
          : "تم إلغاء إعادة الاختبار",
      });
    } catch (error) {
        console.error("[admin/quiz-results] error:", error);
        return NextResponse.json(
          { error: "حدث خطأ داخلي" },
          { status: 500 }
        );
      }
}
