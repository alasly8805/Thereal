import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== "superadmin" && !isTeacherLike(session.role))) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || undefined;
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const limit = Math.max(1, Math.min(100, Number(searchParams.get("limit")) || 20));

  try {
    const where: any = {};
    if (status) {
      where.status = status;
    }

    if (isTeacherLike(session.role)) {
      const teacherLessons = await prisma.planLessonSource.findMany({
        where: { teacherId: actingTeacherId(session) },
        select: { planLessonId: true }
      });
      where.planLessonId = { in: teacherLessons.map(t => t.planLessonId) };
      where.student = { accountMode: { not: "TESTER" } };
    }

    const submissions = await prisma.planProjectSubmission.findMany({
      where,
      include: {
        student: { select: { id: true, name: true, email: true } },
        enrollment: {
          select: {
            progress: {
              select: {
                planLessonId: true,
                chosenSourceId: true,
              }
            }
          }
        }
      },
      orderBy: { submittedAt: "desc" }
    });

    const planLessonIds = submissions.map(s => s.planLessonId);
    const lessons = await prisma.planLesson.findMany({
      where: { id: { in: planLessonIds } },
      select: {
        id: true,
        title: true,
        sources: {
          select: {
            id: true,
            teacherId: true,
          }
        }
      }
    });

    const lessonMap = new Map<string, any>(lessons.map(l => [l.id, l]));

    // Scoped filtering for teachers
    let filteredSubmissions = submissions.map(sub => {
      const lesson = lessonMap.get(sub.planLessonId);
      return {
        ...sub,
        planLesson: lesson ? {
          title: lesson.title,
          sources: lesson.sources
        } : null
      };
    });

    if (isTeacherLike(session.role)) {
      filteredSubmissions = filteredSubmissions.filter(sub => {
        if (!sub.planLesson) return false;
        const progress = sub.enrollment.progress.find((p: any) => p.planLessonId === sub.planLessonId);
        const teacherSources = sub.planLesson.sources.filter((s: any) => s.teacherId === actingTeacherId(session));
        const teacherSourceIds = new Set(teacherSources.map((s: any) => s.id));
        
        if (progress?.chosenSourceId) {
          return teacherSourceIds.has(progress.chosenSourceId);
        }
        return teacherSources.length > 0;
      });
    }

    // In-memory pagination
    const total = filteredSubmissions.length;
    const paginated = filteredSubmissions.slice((page - 1) * limit, page * limit);

    return NextResponse.json({
      submissions: paginated,
      total,
      page,
      limit
    });
  } catch (error) {
    console.error("Failed to fetch submissions:", error);
    return NextResponse.json({ error: "تعذر جلب التقييمات" }, { status: 500 });
  }
}
