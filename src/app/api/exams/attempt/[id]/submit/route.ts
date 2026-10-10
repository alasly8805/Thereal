import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/exams/attempt/[id]/submit - تسليم إجابات الامتحان
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "يجب تسجيل الدخول لتسليم الامتحان" }, { status: 401 });
    }

    const { id: attemptId } = await params;
    const body = await req.json();
    const { answers } = body; // Array<{ questionId: string; selectedIndex?: number; essayText?: string }>

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
      },
    });

    if (!attempt) {
      return NextResponse.json({ error: "محاولة الامتحان غير موجودة" }, { status: 404 });
    }

    if (attempt.userId !== session.id && !["teacher", "admin", "superadmin"].includes(session.role)) {
      return NextResponse.json({ error: "غير مصرح بتسليم هذه المحاولة" }, { status: 403 });
    }

    // أسئلة النموذج المخصص للطالب
    const questions = attempt.exam.questions.filter((q) => q.modelNumber === attempt.modelNumber);
    const studentAnswers = Array.isArray(answers) ? answers : [];

    // التحقق هل يحتوي الامتحان على سؤال مقالي واحد على الأقل
    const hasEssay = questions.some((q) => q.type === "ESSAY");

    let mcqCorrect = 0;
    let mcqTotal = 0;

    const enrichedAnswers = questions.map((q) => {
      const studentAns = studentAnswers.find((a: any) => a.questionId === q.id);

      if (q.type === "MCQ") {
        mcqTotal++;
        const selectedIndex = typeof studentAns?.selectedIndex === "number" ? studentAns.selectedIndex : null;
        const isCorrect = selectedIndex !== null && selectedIndex === q.correctIndex;
        if (isCorrect) mcqCorrect++;

        return {
          questionId: q.id,
          selectedIndex,
          isCorrect,
        };
      } else {
        return {
          questionId: q.id,
          essayText: studentAns?.essayText?.trim() || "",
          score: null, // سيتم تصحيحه لاحقاً من قبل المدرس
          feedback: null,
        };
      }
    });

    let newStatus: string;
    let essayGraded: boolean;
    let finalScore: number | null = null;
    let totalScore: number | null = null;

    if (hasEssay) {
      newStatus = "PENDING_ESSAY_CORRECTION";
      essayGraded = false;
      finalScore = null;
      totalScore = 100;
    } else {
      newStatus = "GRADED";
      essayGraded = true;
      finalScore = mcqTotal > 0 ? Math.round((mcqCorrect / mcqTotal) * 100) : 100;
      totalScore = 100;
    }

    const updated = await prisma.examAttempt.update({
      where: { id: attemptId },
      data: {
        answers: enrichedAnswers,
        status: newStatus,
        essayGraded,
        score: finalScore,
        totalScore,
      },
    });

    return NextResponse.json({
      success: true,
      attemptId: updated.id,
      status: updated.status,
      essayGraded: updated.essayGraded,
      score: updated.score,
      totalScore: updated.totalScore,
      message: hasEssay
        ? "تم تسليم الامتحان بنجاح، وهو قيد انتظار تصحيح الأسئلة المقالية"
        : "تم تسليم وتصحيح الامتحان بنجاح",
    });
  } catch (err: any) {
    console.error("Error submitting exam attempt:", err);
    return NextResponse.json({ error: "فشل في تسليم الامتحان: " + (err.message || "") }, { status: 500 });
  }
}
