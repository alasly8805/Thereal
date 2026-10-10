import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/exams/[id]/start - بدء الامتحان للطالب
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "يجب تسجيل الدخول لبدء الامتحان" }, { status: 401 });
    }

    const { id: examId } = await params;

    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        questions: {
          orderBy: { order: "asc" },
        },
      },
    });

    if (!exam) {
      return NextResponse.json({ error: "الامتحان غير موجود" }, { status: 404 });
    }

    if (!exam.questions || exam.questions.length === 0) {
      return NextResponse.json({ error: "هذا الامتحان لا يحتوي على أسئلة متاحة حالياً" }, { status: 400 });
    }

    // 1. التحقق هل للطالب محاولة سابقة لنفس الامتحان
    const existingAttempt = await prisma.examAttempt.findFirst({
      where: {
        examId,
        userId: session.id,
      },
      orderBy: { createdAt: "desc" },
    });

    let assignedModel: number;
    let attempt: any;

    if (existingAttempt) {
      // لو ليه محاولة قديمة: استخدم نفس modelNumber لمنع الغش
      assignedModel = existingAttempt.modelNumber;

      if (existingAttempt.status === "IN_PROGRESS") {
        attempt = existingAttempt;
      } else {
        attempt = await prisma.examAttempt.create({
          data: {
            userId: session.id,
            examId,
            modelNumber: assignedModel,
            answers: [],
            status: "IN_PROGRESS",
            essayGraded: false,
          },
        });
      }
    } else {
      // لو الطالب أول مرة:
      const models = [...new Set(exam.questions.map((q) => q.modelNumber))];
      const randomModel = models[Math.floor(Math.random() * models.length)] || 1;
      assignedModel = randomModel;

      attempt = await prisma.examAttempt.create({
        data: {
          userId: session.id,
          examId,
          modelNumber: assignedModel,
          answers: [],
          status: "IN_PROGRESS",
          essayGraded: false,
        },
      });
    }

    // 2. رجع اسئلة where modelNumber == randomModel فقط وبدون correctIndex
    const modelQuestions = exam.questions.filter((q) => q.modelNumber === assignedModel);

    const safeQuestions = modelQuestions.map((q) => ({
      id: q.id,
      type: q.type, // "MCQ" | "ESSAY"
      question: q.question,
      options: q.options,
      order: q.order,
      // حجب correctIndex و explanation تماماً
    }));

    return NextResponse.json({
      success: true,
      attemptId: attempt.id,
      examId: exam.id,
      examTitle: exam.title,
      modelNumber: assignedModel,
      modelName: `نموذج ${assignedModel}`,
      questions: safeQuestions,
      savedAnswers: Array.isArray(attempt.answers) ? attempt.answers : [],
      status: attempt.status,
    });
  } catch (err: any) {
    console.error("Error starting exam attempt:", err);
    return NextResponse.json({ error: "حدث خطأ أثناء بدء الامتحان: " + (err.message || "") }, { status: 500 });
  }
}
