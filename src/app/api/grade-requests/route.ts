import { NextRequest, NextResponse } from "next/server";
import { getSession, getStudentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { analyzeQuizAnswer } from "@/lib/ai-assistant";
import { actingTeacherId, hasAssistantPermission, isTeacherLike, maskPhone } from "@/lib/teacher-scope";

// POST — student requests grade adjustment (with AI analysis)
export async function POST(req: NextRequest) {
  try {
    const session = await getStudentSession();
    if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

    const { quizId, reason, requestedScore, questionEvidence } = await req.json();
    if (!quizId || !reason) {
      return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });
    }

    if (reason.length < 20) {
      return NextResponse.json(
        { error: "السبب قصير جداً، اكتب وصفاً مفصلاً (20 حرف على الأقل)" },
        { status: 400 }
      );
    }

    // Get the quiz result for current score
    const result = await prisma.quizResult.findFirst({
      where: { quizId, studentId: session.id },
      include: {
        quiz: {
          include: {
            questions: true,
            folder: { select: { courseId: true } },
          },
        },
      },
    });

    if (!result) {
      return NextResponse.json(
        { error: "لم يتم حل هذا الكويز بعد" },
        { status: 404 }
      );
    }

    // Check for existing pending request to avoid spam
    const existing = await prisma.gradeAdjustmentRequest.findFirst({
      where: {
        studentId: session.id,
        quizId,
        status: { in: ["pending", "ai_reviewed"] },
      },
    });
    if (existing) {
      return NextResponse.json(
        { error: "لديك طلب تعديل لنفس الكويز قيد المراجعة بالفعل" },
        { status: 409 }
      );
    }

    // AI analysis if specific question evidence provided
    let aiAnalysis: string | null = null;
    let confidence = 0;
    if (questionEvidence?.questionId) {
      const q = result.quiz.questions.find((qq) => qq.id === questionEvidence.questionId);
      if (q) {
        const options = {
          A: q.optionA,
          B: q.optionB,
          C: q.optionC,
          D: q.optionD,
        };
        const analysis = await analyzeQuizAnswer(
          q.question,
          questionEvidence.studentAnswer ?? "",
          q.correctAnswer,
          options
        );
        aiAnalysis = `تحليل الذكاء الاصطناعي:\n${analysis.reasoning}\n(الثقة: ${Math.round(analysis.confidence * 100)}%)`;
        confidence = analysis.confidence;
      }
    }

    const status = confidence > 0.7 ? "ai_reviewed" : "pending";

    const request_ = await prisma.gradeAdjustmentRequest.create({
      data: {
        studentId: session.id,
        quizId,
        courseId: result.quiz.folder?.courseId ?? null,
        requestedBy: "student",
        currentScore: result.score,
        requestedScore: requestedScore ?? null,
        reason,
        aiAnalysis,
        evidence: questionEvidence ? JSON.stringify(questionEvidence) : null,
        status,
      },
    });

    return NextResponse.json({
      request: request_,
      message: "تم تقديم طلبك للمعلم، سيتم مراجعته قريباً",
    });
  } catch (err) {
    console.error("Grade request POST error:", err);
    return NextResponse.json({ error: "حدث خطأ" }, { status: 500 });
  }
}

// GET — list grade requests (for student: own; for teacher: their courses)
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

    const status = req.nextUrl.searchParams.get("status");

    if (session.role === "student") {
      const requests = await prisma.gradeAdjustmentRequest.findMany({
        where: {
          studentId: session.id,
          ...(status ? { status } : {}),
        },
        orderBy: { createdAt: "desc" },
        include: {
          quiz: { select: { title: true } },
          course: { select: { title: true } },
        },
      });
      return NextResponse.json({ requests });
    }

    if (isTeacherLike(session.role)) {
      if (!hasAssistantPermission(session, "manageRequests")) {
        return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية الطلبات" }, { status: 403 });
      }
      const canSeePhones = hasAssistantPermission(session, "viewStudentPhones");
      const courses = await prisma.course.findMany({
        where: { teacherId: actingTeacherId(session) },
        select: { id: true },
      });
      const courseIds = courses.map((c) => c.id);

      const requests = await prisma.gradeAdjustmentRequest.findMany({
        where: {
          courseId: { in: courseIds },
          ...(status ? { status } : {}),
        },
        orderBy: { createdAt: "desc" },
        include: {
          quiz: { select: { title: true } },
          course: { select: { title: true } },
          student: { select: { name: true, email: true, phone: true } },
        },
      });
      return NextResponse.json({
        requests: requests.map((r) => ({
          ...r,
          student: r.student
            ? { ...r.student, phone: canSeePhones ? r.student.phone : maskPhone(r.student.phone) }
            : r.student,
        })),
      });
    }

    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  } catch (err) {
    console.error("Grade requests GET error:", err);
    return NextResponse.json({ error: "حدث خطأ" }, { status: 500 });
  }
}
