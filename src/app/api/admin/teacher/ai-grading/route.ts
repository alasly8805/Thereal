import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/admin-auth";
import { effectiveMode, hasUsableCriteria, parseGradingMode } from "@/lib/essay-ai-core";
import { platformEssayAIEnabled } from "@/lib/essay-ai-grading";
import { isSafeId, readJson, teacherScope } from "@/lib/essay-ai-http";

/**
 * Teacher control of AI essay grading, per course.
 *
 * GET   — the acting teacher's courses with their mode and how many essay
 *         questions already have grading criteria.
 * PATCH — { courseId, mode: "off" | "assist" | "auto" }. Only for a course the
 *         acting teacher owns (assistants need "editCourses"); the ownership
 *         check is part of the update query itself, never trusted from input.
 */

export async function GET() {
  const session = await getSession();
  const scope = teacherScope(session, "viewQuizResults");
  if ("response" in scope) return scope.response;
  if (scope.teacherId === null) {
    return NextResponse.json({ error: "هذه الصفحة خاصة بحساب المدرّس" }, { status: 400 });
  }

  const courses = await prisma.course.findMany({
    where: { teacherId: scope.teacherId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      aiEssayGradingMode: true,
      folders: {
        select: {
          quizzes: {
            select: {
              questions: {
                where: { questionType: "essay" },
                select: { id: true, gradingGuide: { select: { referenceAnswer: true, rubric: true } } },
              },
            },
          },
        },
      },
    },
  });

  return NextResponse.json({
    platformEnabled: await platformEssayAIEnabled(),
    courses: courses.map((c) => {
      const essays = c.folders.flatMap((f) => f.quizzes.flatMap((q) => q.questions));
      return {
        id: c.id,
        title: c.title,
        mode: effectiveMode(c.aiEssayGradingMode),
        essayQuestions: essays.length,
        withCriteria: essays.filter((q) => hasUsableCriteria(q.gradingGuide)).length,
      };
    }),
  });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  const scope = teacherScope(session, "editCourses");
  if ("response" in scope) return scope.response;

  const body = await readJson(req);
  const courseId = body?.courseId;
  const mode = parseGradingMode(body?.mode);
  if (!isSafeId(courseId) || !mode) {
    return NextResponse.json({ error: "بيانات غير صالحة: courseId و mode (off | assist | auto) مطلوبان" }, { status: 400 });
  }

  const course = await prisma.course.findFirst({
    where: { id: courseId, ...(scope.teacherId !== null ? { teacherId: scope.teacherId } : {}) },
    select: { id: true, title: true, aiEssayGradingMode: true },
  });
  // Same response for "missing" and "not yours" — no probing other teachers' ids.
  if (!course) return NextResponse.json({ error: "الكورس غير موجود" }, { status: 404 });

  const updated = await prisma.course.updateMany({
    where: { id: course.id, ...(scope.teacherId !== null ? { teacherId: scope.teacherId } : {}) },
    data: { aiEssayGradingMode: mode },
  });
  if (updated.count !== 1) return NextResponse.json({ error: "الكورس غير موجود" }, { status: 404 });

  await logAdminAction({
    adminId: session!.id,
    adminName: session!.name,
    action: "AI_ESSAY_GRADING_MODE",
    targetType: "COURSE",
    targetId: course.id,
    targetName: course.title,
    metadata: { from: effectiveMode(course.aiEssayGradingMode), to: mode, role: session!.role },
  });

  return NextResponse.json({ ok: true, courseId: course.id, mode });
}
