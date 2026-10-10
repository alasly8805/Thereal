import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: attemptId } = await params;
    const body = await req.json();
    const rawAnswers = body?.answers ?? [];

    const attempt = await prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      include: {
        quiz: {
          include: {
            questions: true,
          },
        },
      },
    });

    if (!attempt) {
      return NextResponse.json({ error: "المحاولة غير موجودة" }, { status: 404 });
    }

    const modelQuestions = attempt.quiz.questions.filter(
      (q) => q.modelNumber === attempt.modelNumber
    );

    const letterToIndex: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };

    let totalPoints = 0;
    let earnedPoints = 0;
    let hasEssay = false;

    // تحويل الإجابات إلى صيغة موحدة
    const answersList = Array.isArray(rawAnswers)
      ? rawAnswers
      : Object.entries(rawAnswers).map(([qId, val]) => {
          if (typeof val === "object" && val !== null) {
            return { questionId: qId, ...val };
          }
          if (typeof val === "number") {
            return { questionId: qId, selectedIndex: val };
          }
          if (["A", "B", "C", "D"].includes(String(val))) {
            return { questionId: qId, selectedIndex: letterToIndex[String(val)] };
          }
          return { questionId: qId, essayText: String(val) };
        });

    for (const q of modelQuestions) {
      const isEssay = q.type === "ESSAY" || q.questionType === "essay";
      const qDegree = q.degree > 0 ? q.degree : 1;
      totalPoints += qDegree;

      if (isEssay) {
        hasEssay = true;
      } else {
        const studentAns = answersList.find((a: any) => a.questionId === q.id);
        const correctIdx = typeof q.correctIndex === "number"
          ? q.correctIndex
          : (letterToIndex[q.correctAnswer] ?? 0);

        if (studentAns && studentAns.selectedIndex === correctIdx) {
          earnedPoints += qDegree;
        }
      }
    }

    const finalScore = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100 * 10) / 10 : 0;
    const essayGraded = !hasEssay;
    const status = hasEssay ? "PENDING_ESSAY_CORRECTION" : "GRADED";

    const updated = await prisma.quizAttempt.update({
      where: { id: attemptId },
      data: {
        answers: answersList,
        score: finalScore,
        totalScore: 100,
        totalQ: modelQuestions.length,
        essayGraded,
        status,
        completedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      attemptId: updated.id,
      score: finalScore,
      essayGraded,
      status,
      hideAnswers: Boolean(attempt.quiz.hideAnswersUntilEssayGraded && !essayGraded),
    });
  } catch (error: any) {
    console.error("Error in /api/quiz-attempt/[id]/submit:", error);
    return NextResponse.json(
      { error: "حدث خطأ أثناء تسليم الاختبار: " + (error?.message || "") },
      { status: 500 }
    );
  }
}
