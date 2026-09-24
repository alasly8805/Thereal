import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/admin-auth";

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
    const body = await req.json().catch(() => ({}));
    const targetPlanId = body.targetPlanId || planId;

    const sourceLesson = await prisma.planLesson.findUnique({
      where: { id: lessonId },
      include: {
        sources: true,
        quizzes: {
          include: { questions: true }
        },
        homeworks: true
      }
    });

    if (!sourceLesson) {
      return NextResponse.json({ error: "الدرس الأصلي غير موجود" }, { status: 404 });
    }

    const targetPlan = await prisma.plan.findUnique({ where: { id: targetPlanId } });
    if (!targetPlan) {
      return NextResponse.json({ error: "الخطة المستهدفة غير موجودة" }, { status: 404 });
    }

    const count = await prisma.planLesson.count({ where: { planId: targetPlanId } });

    const newLesson = await prisma.planLesson.create({
      data: {
        planId: targetPlanId,
        title: `${sourceLesson.title} (نسخة)`,
        order: count,
        gatesNextLesson: sourceLesson.gatesNextLesson,
        requiresQuiz: sourceLesson.requiresQuiz,
        requiresHomework: sourceLesson.requiresHomework,
        hasProject: sourceLesson.hasProject,
        sources: {
          create: sourceLesson.sources.map(src => ({
            videoId: src.videoId,
            teacherId: src.teacherId,
            isDefault: src.isDefault,
            isManual: src.isManual,
          }))
        }
      }
    });

    // Deep-clone Quizzes (Gap 35)
    for (const quiz of sourceLesson.quizzes) {
      await prisma.quiz.create({
        data: {
          title: quiz.title,
          timeLimitMinutes: quiz.timeLimitMinutes,
          retakeCooldownHours: quiz.retakeCooldownHours,
          planLessonId: newLesson.id,
          questions: {
            create: quiz.questions.map(q => ({
              question: q.question,
              optionA: q.optionA,
              optionB: q.optionB,
              optionC: q.optionC,
              optionD: q.optionD,
              correctAnswer: q.correctAnswer,
              degree: q.degree,
              order: q.order
            }))
          }
        }
      });
    }

    // Deep-clone Homeworks (Gap 35)
    for (const hw of sourceLesson.homeworks) {
      await prisma.planHomework.create({
        data: {
          planLessonId: newLesson.id,
          title: hw.title,
          content: hw.content
        }
      });
    }

    await logAdminAction({
      adminId: session.id,
      adminName: session.name,
      action: "DUPLICATE_PLAN_LESSON",
      targetType: "Plan", targetId: "sys", targetName: "action", metadata: { details: `Duplicated lesson '${sourceLesson.title}' into plan ${targetPlanId}` },
    });

    return NextResponse.json({ lesson: newLesson }, { status: 201 });
  } catch (error) {
    console.error("Failed to duplicate plan lesson:", error);
    return NextResponse.json({ error: "تعذر تكرار الدرس" }, { status: 500 });
  }
}
