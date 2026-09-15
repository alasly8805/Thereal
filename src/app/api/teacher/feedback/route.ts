import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId, hasAssistantPermission, maskPhone } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";

// GET — list feedback for teacher's courses
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !isTeacherLike(session.role)) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }
    if (!hasAssistantPermission(session, "manageTickets")) {
      return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية الملاحظات" }, { status: 403 });
    }

    const unresolvedOnly = req.nextUrl.searchParams.get("unresolved") === "true";

    const feedback = await prisma.studentFeedback.findMany({
      where: {
        teacherId: actingTeacherId(session),
        ...(unresolvedOnly ? { isResolved: false } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        student: { select: { name: true, phone: true, educationalStage: true } },
        course: { select: { title: true } },
      },
    });

    const canSeePhones = hasAssistantPermission(session, "viewStudentPhones");
    return NextResponse.json({
      feedback: feedback.map((f) => ({
        ...f,
        student: f.student
          ? { ...f.student, phone: canSeePhones ? f.student.phone : maskPhone(f.student.phone) }
          : f.student,
      })),
    });
  } catch (err) {
    console.error("Teacher feedback GET error:", err);
    return NextResponse.json({ error: "حدث خطأ" }, { status: 500 });
  }
}

// PATCH — mark feedback as resolved
export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !isTeacherLike(session.role)) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const { id, resolution, isResolved } = await req.json();
    if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });

    const fb = await prisma.studentFeedback.findUnique({ where: { id } });
    if (!fb || fb.teacherId !== actingTeacherId(session)) {
      return NextResponse.json({ error: "غير موجود" }, { status: 404 });
    }

    const updated = await prisma.studentFeedback.update({
      where: { id },
      data: {
        ...(resolution ? { resolution } : {}),
        ...(typeof isResolved === "boolean" ? { isResolved } : {}),
      },
    });

    return NextResponse.json({ feedback: updated });
  } catch (err) {
    console.error("Teacher feedback PATCH error:", err);
    return NextResponse.json({ error: "حدث خطأ" }, { status: 500 });
  }
}
