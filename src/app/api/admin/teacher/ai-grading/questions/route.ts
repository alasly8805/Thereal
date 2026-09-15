import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/admin-auth";
import { hasUsableCriteria, parseRubric, validateGuideInput } from "@/lib/essay-ai-core";
import { isSafeId, readJson, teacherScope } from "@/lib/essay-ai-http";

/**
 * Grading criteria (reference answer + rubric) for a course's essay questions.
 * Teacher-only data: it is never included in any student-facing payload except
 * as the per-criterion feedback a student receives after submitting.
 *
 * GET ?courseId=  — essay questions of that course with their guide.
 * PUT             — { questionId, referenceAnswer?, rubric?, maxPoints? }.
 *                   Empty reference and rubric removes the guide.
 */

export async function GET(req: NextRequest) {
  const session = await getSession();
  const scope = teacherScope(session, "editCourses");
  if ("response" in scope) return scope.response;

  const courseId = req.nextUrl.searchParams.get("courseId");
  if (!isSafeId(courseId)) return NextResponse.json({ error: "courseId مطلوب" }, { status: 400 });

  const course = await prisma.course.findFirst({
    where: { id: courseId, ...(scope.teacherId !== null ? { teacherId: scope.teacherId } : {}) },
    select: {
      id: true,
      title: true,
      folders: {
        orderBy: { order: "asc" },
        select: {
          name: true,
          quizzes: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              title: true,
              questions: {
                where: { questionType: "essay" },
                orderBy: { order: "asc" },
                select: {
                  id: true,
                  question: true,
                  gradingGuide: { select: { referenceAnswer: true, rubric: true, maxPoints: true, updatedAt: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!course) return NextResponse.json({ error: "الكورس غير موجود" }, { status: 404 });

  const questions = course.folders.flatMap((f) =>
    f.quizzes.flatMap((q) =>
      q.questions.map((question) => ({
        id: question.id,
        question: question.question,
        quizId: q.id,
        quizTitle: q.title,
        folderName: f.name,
        guide: question.gradingGuide,
        ready: hasUsableCriteria(question.gradingGuide),
        criteriaCount: parseRubric(question.gradingGuide?.rubric).length,
      }))
    )
  );
  return NextResponse.json({ course: { id: course.id, title: course.title }, questions });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  const scope = teacherScope(session, "editCourses");
  if ("response" in scope) return scope.response;

  const body = await readJson(req);
  const questionId = body?.questionId;
  if (!isSafeId(questionId)) return NextResponse.json({ error: "questionId مطلوب" }, { status: 400 });
  const parsed = validateGuideInput(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // Ownership: the question must sit in a quiz inside a course the acting
  // teacher owns. Plan-lesson quizzes (no folder) are out of scope.
  const question = await prisma.quizQuestion.findFirst({
    where: {
      id: questionId,
      quiz: { folder: { course: scope.teacherId !== null ? { teacherId: scope.teacherId } : {} } },
    },
    select: { id: true, questionType: true, quiz: { select: { title: true } } },
  });
  if (!question) return NextResponse.json({ error: "السؤال غير موجود" }, { status: 404 });
  if (question.questionType !== "essay") {
    return NextResponse.json({ error: "معايير التصحيح متاحة للأسئلة المقالية فقط" }, { status: 400 });
  }

  const { referenceAnswer, rubric, maxPoints } = parsed.value;
  if (!referenceAnswer && !rubric) {
    await prisma.quizQuestionGradingGuide.deleteMany({ where: { questionId: question.id } });
  } else {
    const data = {
      referenceAnswer,
      rubric,
      maxPoints,
      updatedById: session!.id,
      // Any edit invalidates the cached student-facing example.
      exemplar: null,
      exemplarKey: null,
      exemplarClaimedAt: null,
    };
    await prisma.quizQuestionGradingGuide.upsert({
      where: { questionId: question.id },
      create: { questionId: question.id, ...data },
      update: data,
    });
  }

  await logAdminAction({
    adminId: session!.id,
    adminName: session!.name,
    action: "AI_ESSAY_GUIDE_UPDATE",
    targetType: "QUIZ_QUESTION",
    targetId: question.id,
    targetName: question.quiz.title,
    metadata: { hasReference: !!referenceAnswer, criteria: parseRubric(rubric).length, maxPoints, role: session!.role },
  });

  return NextResponse.json({ ok: true, ready: hasUsableCriteria({ referenceAnswer, rubric }) });
}
