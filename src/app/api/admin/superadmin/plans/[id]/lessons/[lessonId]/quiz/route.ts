import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/admin-auth";
import { parseDegree } from "@/lib/quiz-grading";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; lessonId: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "superadmin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const { id: planId, lessonId } = await params;

  try {
    const body = await req.json();
    const { existingQuizId, title, timeLimitMinutes, questions } = body;

    // ── Link an existing quiz to this lesson ──
    if (existingQuizId) {
      const quiz = await prisma.quiz.findUnique({ where: { id: existingQuizId } });
      if (!quiz) return NextResponse.json({ error: "الاختبار غير موجود" }, { status: 404 });

      const updated = await prisma.quiz.update({
        where: { id: existingQuizId },
        data: { planLessonId: lessonId },
        include: { questions: { orderBy: { order: "asc" } } },
      });

      await logAdminAction({
        adminId: session.id,
        adminName: session.name,
        action: "LINK_PLAN_LESSON_QUIZ",
        targetType: "Plan", targetId: "sys", targetName: "action",
        metadata: { details: `Linked quiz ${existingQuizId} to lesson ${lessonId} in plan ${planId}` },
      });

      return NextResponse.json({ quiz: updated });
    }

    // ── Create a new quiz with questions ──
    if (!title) {
      return NextResponse.json({ error: "عنوان الاختبار مطلوب" }, { status: 400 });
    }

    // Validate questions if provided
    if (questions && Array.isArray(questions) && questions.length > 0) {
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (!q.question?.trim()) {
          return NextResponse.json({ error: `السؤال ${i + 1} فارغ` }, { status: 400 });
        }
        const filledOpts = ["optionA", "optionB", "optionC", "optionD"].filter(k => q[k]?.trim());
        if (filledOpts.length < 2) {
          return NextResponse.json({ error: `السؤال ${i + 1} يجب أن يحتوي على خيارين على الأقل` }, { status: 400 });
        }
        if (!q.correctAnswer || !q[`option${q.correctAnswer}`]?.trim()) {
          return NextResponse.json({ error: `السؤال ${i + 1} يحتاج إجابة صحيحة` }, { status: 400 });
        }
      }
    }

    const normalizedLimit = Math.min(Math.max(1, Number(timeLimitMinutes) || 30), 240);

    const quiz = await prisma.quiz.create({
      data: {
        title: title.trim(),
        timeLimitMinutes: normalizedLimit,
        planLessonId: lessonId,
        ...(questions && questions.length > 0 ? {
          questions: {
            create: questions.map((q: any, i: number) => ({
              question: q.question.trim(),
              optionA: q.optionA?.trim() || "",
              optionB: q.optionB?.trim() || "",
              optionC: q.optionC?.trim() || "",
              optionD: q.optionD?.trim() || "",
              correctAnswer: q.correctAnswer,
              degree: parseDegree(q.degree),
              order: i,
            }))
          }
        } : {})
      },
      include: { questions: { orderBy: { order: "asc" } } },
    });

    await logAdminAction({
      adminId: session.id,
      adminName: session.name,
      action: "CREATE_PLAN_LESSON_QUIZ",
      targetType: "Plan", targetId: "sys", targetName: "action",
      metadata: { details: `Created quiz "${title}" with ${questions?.length ?? 0} questions for lesson ${lessonId} in plan ${planId}` },
    });

    return NextResponse.json({ quiz }, { status: 201 });
  } catch (error) {
    console.error("Failed to set plan lesson quiz:", error);
    return NextResponse.json({ error: "تعذر تعيين الاختبار" }, { status: 500 });
  }
}

// DELETE: remove a quiz from a plan lesson
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; lessonId: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "superadmin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const { id: planId, lessonId } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const { quizId } = body;
    if (!quizId) return NextResponse.json({ error: "معرف الاختبار مطلوب" }, { status: 400 });

    const quiz = await prisma.quiz.findFirst({ where: { id: quizId, planLessonId: lessonId } });
    if (!quiz) return NextResponse.json({ error: "الاختبار غير موجود" }, { status: 404 });

    await prisma.quiz.delete({ where: { id: quizId } });

    await logAdminAction({
      adminId: session.id,
      adminName: session.name,
      action: "DELETE_PLAN_LESSON_QUIZ",
      targetType: "Plan", targetId: "sys", targetName: "action",
      metadata: { details: `Deleted quiz ${quizId} from lesson ${lessonId} in plan ${planId}` },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete plan lesson quiz:", error);
    return NextResponse.json({ error: "تعذر حذف الاختبار" }, { status: 500 });
  }
}
