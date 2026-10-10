import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: attemptId } = await params;

    const attempt = await prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      include: { quiz: true },
    });

    if (!attempt) {
      return NextResponse.json({ error: "المحاولة غير موجودة" }, { status: 404 });
    }

    const quiz = attempt.quiz;
    if (!quiz) {
      return NextResponse.json({ error: "الاختبار غير موجود" }, { status: 404 });
    }

    const hasEssay = await prisma.quizQuestion.count({
      where: {
        quizId: quiz.id,
        modelNumber: attempt.modelNumber,
        OR: [
          { type: "ESSAY" },
          { questionType: "essay" },
        ],
      },
    });

    const questions = await prisma.quizQuestion.findMany({
      where: { quizId: quiz.id, modelNumber: attempt.modelNumber },
      orderBy: { order: "asc" },
    });

    const letterToIndex: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };

    const formattedQuestions = questions.map((q) => {
      const rawOptions = (q as any).options;
      const options = Array.isArray(rawOptions) && rawOptions.length > 0
        ? rawOptions
        : [q.optionA, q.optionB, q.optionC, q.optionD].filter(Boolean);

      const type = q.type ?? (q.questionType?.toUpperCase() || "MCQ");
      const correctIndex = typeof q.correctIndex === "number"
        ? q.correctIndex
        : (letterToIndex[q.correctAnswer] ?? 0);

      return {
        id: q.id,
        question: q.question,
        type,
        options,
        order: q.order,
        modelNumber: q.modelNumber,
        imageUrl: q.imageUrl || null,
        correctIndex,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation || null,
      };
    });

    // الحجب: إذا كان المعلم قد فعّل خيار الحجب ويوجد أسئلة مقالية ولم يتم تصحيحها بعد
    if (quiz.hideAnswersUntilEssayGraded && hasEssay > 0 && !attempt.essayGraded) {
      return NextResponse.json({
        hideAnswers: true,
        essayGraded: false,
        score: null,
        totalScore: null,
        correctCount: null,
        quizTitle: quiz.title,
        modelNumber: attempt.modelNumber,
        message: "تم التسليم. الدرجات والإجابات الصحيحة (الاختياري والمقالي) محجوبة حتى يصحح المعلم المقالي.",
        questions: formattedQuestions.map((q) => ({
          id: q.id,
          question: q.question,
          type: q.type,
          options: q.options,
          order: q.order,
          modelNumber: q.modelNumber,
          imageUrl: q.imageUrl,
          // لا ترجع correctIndex ولا correctAnswer ولا explanation
        })),
        studentAnswers: attempt.answers ?? [],
      });
    }

    // بعد التصحيح أو في حال عدم وجود مقالي / عدم تفعيل الحجب - رجع كل حاجة
    return NextResponse.json({
      hideAnswers: false,
      essayGraded: true,
      score: attempt.score,
      totalScore: attempt.totalScore ?? attempt.score,
      quizTitle: quiz.title,
      modelNumber: attempt.modelNumber,
      questions: formattedQuestions, // هنا مع correctIndex
      studentAnswers: attempt.answers ?? [],
    });
  } catch (error: any) {
    console.error("Error in /api/quiz-attempt/[id]/result:", error);
    return NextResponse.json(
      { error: "حدث خطأ أثناء جلب نتيجة المحاولة: " + (error?.message || "") },
      { status: 500 }
    );
  }
}
