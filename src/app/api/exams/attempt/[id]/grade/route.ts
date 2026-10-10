import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/exams/attempt/[id]/grade - تصحيح المعلم للأسئلة المقالية
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session || !["teacher", "admin", "superadmin"].includes(session.role)) {
      return NextResponse.json({ error: "غير مصرح بتصحيح الامتحانات" }, { status: 403 });
    }

    const { id: attemptId } = await params;
    const body = await req.json();
    const { grades } = body;

    const attempt = await prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: {
        exam: {
          include: {
            questions: true,
          },
        },
      },
    });

    if (!attempt) {
      return NextResponse.json({ error: "محاولة الامتحان غير موجودة" }, { status: 404 });
    }

    const questions = attempt.exam.questions.filter((q) => q.modelNumber === attempt.modelNumber);
    const currentAnswers = Array.isArray(attempt.answers) ? (attempt.answers as any[]) : [];
    const gradeMap = new Map<string, { score: number; feedback?: string }>();

    if (Array.isArray(grades)) {
      for (const g of grades) {
        if (g.questionId && typeof g.score === "number") {
          gradeMap.set(g.questionId, {
            score: g.score,
            feedback: g.feedback?.trim() || undefined,
          });
        }
      }
    }

    let totalPointsEarned = 0;
    let totalPossiblePoints = 0;

    const updatedAnswers = questions.map((q) => {
      const existingAns = currentAnswers.find((a) => a.questionId === q.id) || { questionId: q.id };

      if (q.type === "MCQ") {
        totalPossiblePoints += 10;
        const isCorrect = existingAns.selectedIndex !== null && existingAns.selectedIndex === q.correctIndex;
        if (isCorrect) {
          totalPointsEarned += 10;
        }
        return {
          ...existingAns,
          isCorrect,
        };
      } else {
        totalPossiblePoints += 10;
        const essayGrade = gradeMap.get(q.id);
        const essayScore = essayGrade ? Math.max(0, Math.min(10, essayGrade.score)) : (existingAns.score ?? 0);
        totalPointsEarned += essayScore;

        return {
          ...existingAns,
          score: essayScore,
          feedback: essayGrade?.feedback ?? existingAns.feedback ?? null,
        };
      }
    });

    const calculatedScore = totalPossiblePoints > 0
      ? Math.round((totalPointsEarned / totalPossiblePoints) * 100)
      : 100;

    const updated = await prisma.examAttempt.update({
      where: { id: attemptId },
      data: {
        answers: updatedAnswers,
        status: "GRADED",
        essayGraded: true,
        score: calculatedScore,
        totalScore: 100,
      },
    });

    return NextResponse.json({
      success: true,
      message: "تم حفظ تصحيح المقالي وتحديث النتيجة بنجاح",
      attempt: updated,
    });
  } catch (err: any) {
    console.error("Error grading essay questions:", err);
    return NextResponse.json({ error: "فشل في حفظ التصحيح: " + (err.message || "") }, { status: 500 });
  }
}
