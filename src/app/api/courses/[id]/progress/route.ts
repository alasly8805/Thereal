import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkCourseEnrollment } from "@/lib/authorization";
import { summarizeAnswers } from "@/lib/quiz-grading";
import { activeCourseMode } from "@/lib/essay-ai-grading";

/**
 * GET — "متابعة": the signed-in student's own progress in ONE course.
 *
 * Scope is the course in the URL and the student in the session — nothing
 * else. Access uses the same source of truth as the rest of the platform
 * (checkCourseEnrollment: enrollment, access code, matching teacher
 * subscription, plan link, exclusions), and every progress query filters by
 * this student AND this course's own content ids, so data from another course,
 * teacher or student cannot appear.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    if (session.role !== "student") {
      return NextResponse.json({ error: "صفحة المتابعة مخصّصة للطلاب", code: "STUDENTS_ONLY" }, { status: 403 });
    }

    const { id } = await params;
    if (typeof id !== "string" || id.length > 200) return NextResponse.json({ error: "الكورس غير موجود" }, { status: 404 });

    const course = await prisma.course.findFirst({
      where: { OR: [{ id }, { slug: id }], teacher: { isDeleted: false } },
      select: {
        id: true,
        title: true,
        subject: true,
        teacherId: true,
        teacher: { select: { name: true, teacherProfile: { select: { displayName: true, slug: true } } } },
      },
    });
    if (!course) return NextResponse.json({ error: "الكورس غير موجود" }, { status: 404 });

    const enrolled = await checkCourseEnrollment(session.id, course.id, session.role);
    if (!enrolled) {
      return NextResponse.json(
        { error: "المتابعة متاحة للطلاب المشتركين في هذا الكورس فقط", code: "NOT_ENROLLED" },
        { status: 403 }
      );
    }

    const now = new Date();
    const published = { OR: [{ publishAt: null }, { publishAt: { lte: now } }] };
    const folders = await prisma.folder.findMany({
      where: { courseId: course.id, ...published },
      orderBy: { order: "asc" },
      select: {
        id: true,
        name: true,
        videos: { where: published, orderBy: { order: "asc" }, select: { id: true } },
        quizzes: { orderBy: { createdAt: "asc" }, select: { id: true, title: true } },
        homeworks: { where: { isPublished: true }, orderBy: { createdAt: "asc" }, select: { id: true, title: true } },
      },
    });

    const videoIds = folders.flatMap((f) => f.videos.map((v) => v.id));
    const quizIds = folders.flatMap((f) => f.quizzes.map((q) => q.id));
    const homeworkIds = folders.flatMap((f) => f.homeworks.map((h) => h.id));

    const [watchedRows, results, submissions, subscription] = await Promise.all([
      videoIds.length
        ? prisma.progress.findMany({
            where: { studentId: session.id, videoId: { in: videoIds }, watched: true },
            select: { videoId: true },
          })
        : Promise.resolve([]),
      quizIds.length
        ? prisma.quizResult.findMany({
            where: { studentId: session.id, quizId: { in: quizIds } },
            select: {
              quizId: true,
              score: true,
              totalQ: true,
              completedAt: true,
              answers: { select: { questionType: true, isCorrect: true, status: true, aiGrade: { select: { status: true } } } },
            },
          })
        : Promise.resolve([]),
      homeworkIds.length
        ? prisma.homeworkSubmission.findMany({
            where: { studentId: session.id, homeworkId: { in: homeworkIds } },
            select: { homeworkId: true, status: true, score: true },
          })
        : Promise.resolve([]),
      prisma.teacherSubscription.findFirst({
        where: { studentId: session.id, teacherId: course.teacherId, status: "active", expiresAt: { gt: now } },
        orderBy: { expiresAt: "desc" },
        select: { planLabel: true, expiresAt: true },
      }),
    ]);

    const watched = new Set(watchedRows.map((r) => r.videoId));
    const resultByQuiz = new Map(results.map((r) => [r.quizId, r]));
    const submissionByHw = new Map(submissions.map((s) => [s.homeworkId, s]));

    let gradedScoreSum = 0;
    let gradedCount = 0;
    let pendingEssays = 0;
    let aiEvaluated = 0;

    const folderViews = folders.map((f) => {
      const quizzes = f.quizzes.map((q) => {
        const r = resultByQuiz.get(q.id);
        if (!r || !r.completedAt) return { id: q.id, title: q.title, state: r ? "IN_PROGRESS" : "NOT_STARTED", score: null, pendingEssays: 0 };
        const summary = summarizeAnswers(r.answers, r.totalQ);
        pendingEssays += summary.pendingCount;
        aiEvaluated += r.answers.filter((a) => a.aiGrade?.status === "COMPLETED").length;
        if (summary.gradingStatus === "GRADED") {
          gradedScoreSum += r.score;
          gradedCount += 1;
        }
        return {
          id: q.id,
          title: q.title,
          state: summary.gradingStatus === "PENDING" ? "PENDING_GRADING" : "GRADED",
          score: summary.gradingStatus === "GRADED" ? Math.round(r.score) : null,
          passed: summary.passed,
          pendingEssays: summary.pendingCount,
        };
      });
      const homeworks = f.homeworks.map((h) => {
        const s = submissionByHw.get(h.id);
        return { id: h.id, title: h.title, status: s?.status ?? "NOT_SUBMITTED", score: s?.score ?? null };
      });
      return {
        id: f.id,
        name: f.name,
        videos: { total: f.videos.length, watched: f.videos.filter((v) => watched.has(v.id)).length },
        quizzes,
        homeworks,
      };
    });

    const totalQuizzes = quizIds.length;
    const completedQuizzes = results.filter((r) => r.completedAt).length;

    return NextResponse.json(
      {
        course: {
          id: course.id,
          title: course.title,
          subject: course.subject,
          teacherName: course.teacher.teacherProfile?.displayName || course.teacher.name,
          teacherSlug: course.teacher.teacherProfile?.slug ?? null,
        },
        subscription: subscription
          ? { planLabel: subscription.planLabel, expiresAt: subscription.expiresAt }
          : null,
        aiEssayFeedback: (await activeCourseMode(course.id)) !== "off",
        totals: {
          videos: { total: videoIds.length, watched: watched.size },
          quizzes: { total: totalQuizzes, completed: completedQuizzes },
          homeworks: { total: homeworkIds.length, submitted: submissions.length },
          averageScore: gradedCount ? Math.round(gradedScoreSum / gradedCount) : null,
          pendingEssays,
          aiEvaluated,
        },
        folders: folderViews,
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    console.error("[courses/[id]/progress] error:", error);
    return NextResponse.json({ error: "حدث خطأ داخلي" }, { status: 500 });
  }
}
