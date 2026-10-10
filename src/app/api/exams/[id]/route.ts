import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/exams/[id] - تفاصيل امتحان معين
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const { id } = await params;
    const isTeacher = ["teacher", "admin", "superadmin"].includes(session.role);

    const exam = await prisma.exam.findUnique({
      where: { id },
      include: {
        questions: {
          orderBy: [{ modelNumber: "asc" }, { order: "asc" }],
        },
      },
    });

    if (!exam) {
      return NextResponse.json({ error: "الامتحان غير موجود" }, { status: 404 });
    }

    if (!isTeacher) {
      const sanitizedQuestions = exam.questions.map((q) => ({
        id: q.id,
        modelNumber: q.modelNumber,
        type: q.type,
        question: q.question,
        options: q.options,
        order: q.order,
      }));

      return NextResponse.json({
        success: true,
        exam: {
          id: exam.id,
          title: exam.title,
          description: exam.description,
          hideAnswersUntilEssayGraded: exam.hideAnswersUntilEssayGraded,
          showResultImmediately: exam.showResultImmediately,
          questions: sanitizedQuestions,
        },
      });
    }

    return NextResponse.json({ success: true, exam });
  } catch (err: any) {
    console.error("Error fetching exam:", err);
    return NextResponse.json({ error: "حدث خطأ أثناء جلب الامتحان" }, { status: 500 });
  }
}

// PUT /api/exams/[id] - تعديل امتحان وأسئلته
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session || !["teacher", "admin", "superadmin"].includes(session.role)) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const {
      title,
      description,
      hideAnswersUntilEssayGraded,
      showResultImmediately,
      questions,
    } = body;

    const existingExam = await prisma.exam.findUnique({ where: { id } });
    if (!existingExam) {
      return NextResponse.json({ error: "الامتحان غير موجود" }, { status: 404 });
    }

    if (session.role === "teacher" && existingExam.teacherId && existingExam.teacherId !== session.id) {
      return NextResponse.json({ error: "ليس لديك صلاحية لتعديل هذا الامتحان" }, { status: 403 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.exam.update({
        where: { id },
        data: {
          ...(title !== undefined && { title: title.trim() }),
          ...(description !== undefined && { description: description?.trim() || null }),
          ...(hideAnswersUntilEssayGraded !== undefined && { hideAnswersUntilEssayGraded: Boolean(hideAnswersUntilEssayGraded) }),
          ...(showResultImmediately !== undefined && { showResultImmediately: Boolean(showResultImmediately) }),
        },
      });

      if (Array.isArray(questions)) {
        await tx.question.deleteMany({ where: { examId: id } });

        const questionsData = questions.map((q: any, idx: number) => {
          const isEssay = q.type === "ESSAY";
          return {
            examId: id,
            modelNumber: Number(q.modelNumber) || 1,
            type: isEssay ? "ESSAY" : "MCQ",
            question: q.question?.trim() || `سؤال ${idx + 1}`,
            options: isEssay ? null : (Array.isArray(q.options) ? q.options : []),
            correctIndex: isEssay ? null : (typeof q.correctIndex === "number" ? q.correctIndex : 0),
            explanation: q.explanation?.trim() || null,
            order: idx,
          };
        });

        await tx.question.createMany({ data: questionsData });
      }
    });

    const updatedExam = await prisma.exam.findUnique({
      where: { id },
      include: {
        questions: {
          orderBy: [{ modelNumber: "asc" }, { order: "asc" }],
        },
      },
    });

    return NextResponse.json({ success: true, exam: updatedExam });
  } catch (err: any) {
    console.error("Error updating exam:", err);
    return NextResponse.json({ error: "فشل في تحديث الامتحان: " + (err.message || "") }, { status: 500 });
  }
}

// DELETE /api/exams/[id] - حذف الامتحان
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session || !["teacher", "admin", "superadmin"].includes(session.role)) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const { id } = await params;
    const existing = await prisma.exam.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "الامتحان غير موجود" }, { status: 404 });
    }

    if (session.role === "teacher" && existing.teacherId && existing.teacherId !== session.id) {
      return NextResponse.json({ error: "غير مصرح لك بحذف هذا الامتحان" }, { status: 403 });
    }

    await prisma.exam.delete({ where: { id } });

    return NextResponse.json({ success: true, message: "تم حذف الامتحان بنجاح" });
  } catch (err: any) {
    console.error("Error deleting exam:", err);
    return NextResponse.json({ error: "فشل في حذف الامتحان" }, { status: 500 });
  }
}
