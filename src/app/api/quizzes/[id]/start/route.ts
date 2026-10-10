import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSession();
    const userId = session?.id;

    if (!userId) {
      return NextResponse.json({ error: "غير مصرح - يرجى تسجيل الدخول" }, { status: 401 });
    }

    const quiz = await prisma.quiz.findUnique({
      where: { id },
      select: { id: true, title: true, hideAnswersUntilEssayGraded: true },
    });

    if (!quiz) {
      return NextResponse.json({ error: "الاختبار غير موجود" }, { status: 404 });
    }

    let attempt = await prisma.quizAttempt.findFirst({
      where: {
        quizId: id,
        OR: [{ userId }, { studentId: userId }],
        status: "IN_PROGRESS",
      },
    });

    if (!attempt) {
      const models = await prisma.quizQuestion.groupBy({
        by: ["modelNumber"],
        where: { quizId: id },
      });
      const available = models.map((m) => m.modelNumber).filter(Boolean);
      if (available.length === 0) available.push(1);

      const oldAttempt = await prisma.quizAttempt.findFirst({
        where: {
          quizId: id,
          OR: [{ userId }, { studentId: userId }],
        },
        orderBy: { createdAt: "desc" },
      });

      const modelToUse = oldAttempt?.modelNumber || available[Math.floor(Math.random() * available.length)];

      attempt = await prisma.quizAttempt.create({
        data: {
          quizId: id,
          userId,
          studentId: userId,
          modelNumber: modelToUse,
          status: "IN_PROGRESS",
          essayGraded: false,
          answers: [],
          score: 0,
          totalQ: 0,
          attemptNumber: (oldAttempt?.attemptNumber ?? 0) + 1,
        },
      });
    }

    const questions = await prisma.quizQuestion.findMany({
      where: { quizId: id, modelNumber: attempt.modelNumber },
      orderBy: { order: "asc" },
    });

    const safeQuestions = questions.map((q) => {
      const rawOptions = (q as any).options;
      const computedOptions = Array.isArray(rawOptions) && rawOptions.length > 0
        ? rawOptions
        : [q.optionA, q.optionB, q.optionC, q.optionD].filter(Boolean);

      return {
        id: q.id,
        question: q.question,
        options: computedOptions,
        type: q.type ?? (q.questionType?.toUpperCase() || "MCQ"),
        order: q.order,
        modelNumber: q.modelNumber,
        imageUrl: q.imageUrl || null,
        // بدون إجابات صحيحة
      };
    });

    return NextResponse.json({
      attemptId: attempt.id,
      modelNumber: attempt.modelNumber,
      quizTitle: quiz.title,
      questions: safeQuestions,
    });
  } catch (error: any) {
    console.error("Error in /api/quizzes/[id]/start:", error);
    return NextResponse.json(
      { error: "حدث خطأ أثناء بدء الاختبار: " + (error?.message || "") },
      { status: 500 }
    );
  }
}
