import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/exams - قائمة الامتحانات
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const teacherId = searchParams.get("teacherId") || (session.role === "teacher" ? session.id : undefined);

    const where: any = {};
    if (teacherId) {
      where.teacherId = teacherId;
    }

    const exams = await prisma.exam.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        questions: {
          select: {
            id: true,
            modelNumber: true,
            type: true,
          },
        },
        _count: {
          select: { attempts: true },
        },
      },
    });

    const enrichedExams = exams.map((ex) => {
      const distinctModels = [...new Set(ex.questions.map((q) => q.modelNumber))];
      return {
        id: ex.id,
        title: ex.title,
        description: ex.description,
        hideAnswersUntilEssayGraded: ex.hideAnswersUntilEssayGraded,
        showResultImmediately: ex.showResultImmediately,
        createdAt: ex.createdAt,
        modelNumbers: distinctModels.sort((a, b) => a - b),
        totalQuestions: ex.questions.length,
        attemptsCount: ex._count.attempts,
      };
    });

    return NextResponse.json({ success: true, exams: enrichedExams });
  } catch (err: any) {
    console.error("Error fetching exams:", err);
    return NextResponse.json({ error: "حدث خطأ أثناء جلب الامتحانات" }, { status: 500 });
  }
}

// POST /api/exams - إنشاء امتحان مع أسئلته برقم النموذج modelNumber
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !["teacher", "admin", "superadmin"].includes(session.role)) {
      return NextResponse.json({ error: "غير مصرح بإنشاء الامتحانات" }, { status: 403 });
    }

    const body = await req.json();
    const {
      title,
      description,
      hideAnswersUntilEssayGraded = false,
      showResultImmediately = true,
      questions,
    } = body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "عنوان الامتحان مطلوب" }, { status: 400 });
    }

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ error: "يجب إضافة سؤال واحد على الأقل" }, { status: 400 });
    }

    const createdExam = await prisma.$transaction(async (tx) => {
      const exam = await tx.exam.create({
        data: {
          title: title.trim(),
          description: description?.trim() || null,
          hideAnswersUntilEssayGraded: Boolean(hideAnswersUntilEssayGraded),
          showResultImmediately: Boolean(showResultImmediately),
          teacherId: session.id,
        },
      });

      const questionsData = questions.map((q: any, idx: number) => {
        const isEssay = q.type === "ESSAY";
        return {
          examId: exam.id,
          modelNumber: Number(q.modelNumber) || 1,
          type: isEssay ? "ESSAY" : "MCQ",
          question: q.question?.trim() || `سؤال ${idx + 1}`,
          options: isEssay ? null : (Array.isArray(q.options) ? q.options : []),
          correctIndex: isEssay ? null : (typeof q.correctIndex === "number" ? q.correctIndex : 0),
          explanation: q.explanation?.trim() || null,
          order: idx,
        };
      });

      await tx.question.createMany({
        data: questionsData,
      });

      return exam;
    });

    const fullExam = await prisma.exam.findUnique({
      where: { id: createdExam.id },
      include: {
        questions: {
          orderBy: [{ modelNumber: "asc" }, { order: "asc" }],
        },
      },
    });

    return NextResponse.json({ success: true, exam: fullExam }, { status: 201 });
  } catch (err: any) {
    console.error("Error creating exam:", err);
    return NextResponse.json({ error: "فشل في حفظ الامتحان: " + (err.message || "") }, { status: 500 });
  }
}
