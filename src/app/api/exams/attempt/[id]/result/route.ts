import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/exams/attempt/[id]/result - عرض نتيجة محاولة الامتحان
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const { id: attemptId } = await params;

    const attempt = await prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: {
        exam: {
          include: {
            questions: {
              orderBy: { order: "asc" },
            },
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    if (!attempt) {
      return NextResponse.json({ error: "محاولة الامتحان غير موجودة" }, { status: 404 });
    }

    const isTeacher = ["teacher", "admin", "superadmin"].includes(session.role);
    const isOwnerStudent = attempt.userId === session.id;

    if (!isOwnerStudent && !isTeacher) {
      return NextResponse.json({ error: "غير مصرح لك بالاطلاع على هذه النتيجة" }, { status: 403 });
    }

    const { exam } = attempt;
    const rawAnswers = Array.isArray(attempt.answers) ? (attempt.answers as any[]) : [];

    // جلب أسئلة النموذج المخصص للطالب فقط
    const modelQuestions = exam.questions.filter((q) => q.modelNumber === attempt.modelNumber);

    // 4. if hideAnswersUntilEssayGraded && !essayGraded return بدون اجابات صحيحة
    if (exam.hideAnswersUntilEssayGraded && !attempt.essayGraded && !isTeacher) {
      const hiddenQuestions = modelQuestions.map((q) => {
        const studentAns = rawAnswers.find((a) => a.questionId === q.id);
        return {
          id: q.id,
          type: q.type,
          question: q.question,
          options: q.options,
          order: q.order,
          studentAnswer: {
            selectedIndex: studentAns?.selectedIndex ?? null,
            essayText: studentAns?.essayText ?? "",
          },
          // بدون إجابات صحيحة
          correctIndex: null,
          explanation: null,
          isCorrect: null,
        };
      });

      return NextResponse.json({
        success: true,
        status: attempt.status,
        essayGraded: false,
        hideAnswersUntilEssayGraded: true,
        examTitle: exam.title,
        modelNumber: attempt.modelNumber,
        modelName: `نموذج ${attempt.modelNumber}`,
        score: null,
        totalScore: null,
        message: "تم تسليم إجاباتك بنجاح. الإجابات الصحيحة والدرجات محجوبة مؤقتاً حتى يتم تصحيح الأسئلة المقالية من قبل المعلم.",
        questions: hiddenQuestions,
        createdAt: attempt.createdAt,
      });
    }

    // else return زي النظام القديم (مع الإجابات الصحيحة والدرجات)
    const detailedQuestions = modelQuestions.map((q) => {
      const studentAns = rawAnswers.find((a) => a.questionId === q.id);
      return {
        id: q.id,
        type: q.type,
        question: q.question,
        options: q.options,
        order: q.order,
        correctIndex: q.correctIndex,
        explanation: q.explanation,
        studentAnswer: {
          selectedIndex: studentAns?.selectedIndex ?? null,
          essayText: studentAns?.essayText ?? "",
          isCorrect: studentAns?.isCorrect ?? (q.type === "MCQ" && studentAns?.selectedIndex === q.correctIndex),
          score: studentAns?.score ?? null,
          feedback: studentAns?.feedback ?? null,
        },
      };
    });

    return NextResponse.json({
      success: true,
      status: attempt.status,
      essayGraded: attempt.essayGraded,
      hideAnswersUntilEssayGraded: exam.hideAnswersUntilEssayGraded,
      examTitle: exam.title,
      modelNumber: attempt.modelNumber,
      modelName: `نموذج ${attempt.modelNumber}`,
      score: attempt.score,
      totalScore: attempt.totalScore,
      student: isTeacher ? attempt.user : undefined,
      questions: detailedQuestions,
      createdAt: attempt.createdAt,
    });
  } catch (err: any) {
    console.error("Error fetching exam attempt result:", err);
    return NextResponse.json({ error: "فشل في جلب نتيجة الامتحان: " + (err.message || "") }, { status: 500 });
  }
}
