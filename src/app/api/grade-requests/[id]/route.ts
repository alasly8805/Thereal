import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId, hasAssistantPermission } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";

// PATCH — teacher approves/rejects grade adjustment
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || !isTeacherLike(session.role)) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }
    if (!hasAssistantPermission(session, "manageRequests")) {
      return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية الطلبات" }, { status: 403 });
    }

    const { id } = await params;
    const { action, teacherNotes, newScore } = await req.json();

    if (!["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "الإجراء غير صحيح (approve | reject)" },
        { status: 400 }
      );
    }

    const request_ = await prisma.gradeAdjustmentRequest.findUnique({
      where: { id },
      include: { course: { select: { teacherId: true } } },
    });

    if (!request_) {
      return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
    }

    // Verify the teacher owns the course or teaches the plan lesson
    if (request_.courseId) {
      if (!request_.course || request_.course.teacherId !== actingTeacherId(session)) {
        return NextResponse.json(
          { error: "لا تملك صلاحية مراجعة طلبات هذا الكورس" },
          { status: 403 }
        );
      }
    } else {
      // Plan-based quiz: verify teacher has a source on the quiz's planLesson
      const quiz = await prisma.quiz.findUnique({
        where: { id: request_.quizId },
        select: { planLessonId: true }
      });
      if (!quiz?.planLessonId) {
        return NextResponse.json(
          { error: "الطلب غير مرتبط بكورس أو درس خطة" },
          { status: 400 }
        );
      }
      const source = await prisma.planLessonSource.findFirst({
        where: { planLessonId: quiz.planLessonId, teacherId: actingTeacherId(session) }
      });
      if (!source) {
        return NextResponse.json(
          { error: "لا تملك صلاحية مراجعة طلبات هذا الدرس" },
          { status: 403 }
        );
      }
    }

    if (request_.status === "approved" || request_.status === "rejected") {
      return NextResponse.json(
        { error: "تم مراجعة هذا الطلب من قبل" },
        { status: 409 }
      );
    }

    // Apply the grade change if approved
    if (action === "approve" && newScore !== undefined && newScore !== null) {
      // QuizResult.score is a 0–100 percentage — reject anything outside that
      // range (or non-numeric) so a request cannot set an arbitrary score.
      if (typeof newScore !== "number" || !Number.isFinite(newScore) || newScore < 0 || newScore > 100) {
        return NextResponse.json(
          { error: "الدرجة الجديدة يجب أن تكون رقماً بين 0 و 100" },
          { status: 400 }
        );
      }
      const quizResult = await prisma.quizResult.findFirst({
        where: { quizId: request_.quizId, studentId: request_.studentId },
      });
      if (quizResult) {
        await prisma.quizResult.update({
          where: { id: quizResult.id },
          data: { score: newScore },
        });
      }
    }

    const updated = await prisma.gradeAdjustmentRequest.update({
      where: { id },
      data: {
        status: action === "approve" ? "approved" : "rejected",
        teacherId: actingTeacherId(session),
        teacherNotes: teacherNotes ?? null,
        reviewedAt: new Date(),
      },
      include: {
        quiz: { select: { title: true } },
        student: { select: { name: true } },
      },
    });

    return NextResponse.json({
      request: updated,
      message: action === "approve" ? "تم قبول الطلب وتعديل الدرجة" : "تم رفض الطلب",
    });
  } catch (err) {
    console.error("Grade request PATCH error:", err);
    return NextResponse.json({ error: "حدث خطأ" }, { status: 500 });
  }
}
