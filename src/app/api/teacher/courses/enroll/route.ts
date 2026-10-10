import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (!isTeacherLike(session.role) && session.role !== "admin" && session.role !== "superadmin")) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const { studentEmailOrPhone, courseId } = await req.json().catch(() => ({}));
    if (!studentEmailOrPhone || !courseId) {
      return NextResponse.json({ error: "بيانات الطالب ومعرّف الكورس مطلوبان" }, { status: 400 });
    }

    const teacherId = actingTeacherId(session);
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, title: true, teacherId: true },
    });

    if (!course) {
      return NextResponse.json({ error: "الكورس غير موجود" }, { status: 404 });
    }

    if (course.teacherId !== teacherId && session.role !== "admin" && session.role !== "superadmin") {
      return NextResponse.json({ error: "غير مصرح لك بإضافة طلاب لهذا الكورس" }, { status: 403 });
    }

    const student = await prisma.user.findFirst({
      where: {
        OR: [
          { email: String(studentEmailOrPhone).trim().toLowerCase() },
          { phone: String(studentEmailOrPhone).trim() },
        ],
      },
      select: { id: true, name: true, phone: true, email: true },
    });

    if (!student) {
      return NextResponse.json({ error: "لم يتم العثور على طالب بهذا البريد أو الهاتف" }, { status: 404 });
    }

    const enrollment = await prisma.courseEnrollment.upsert({
      where: {
        studentId_courseId: {
          studentId: student.id,
          courseId: course.id,
        },
      },
      create: {
        studentId: student.id,
        courseId: course.id,
        fulfillmentSource: "ADMIN",
        amountPaid: 0,
      },
      update: {},
    });

    // Write audit log
    const { logAdminAction } = await import("@/lib/admin-auth");
    await logAdminAction({
      adminId: session.id,
      adminName: session.name,
      action: "MANUAL_COURSE_ENROLL",
      targetType: "STUDENT",
      targetId: student.id,
      targetName: `تسجيل يدوي للطالب: ${student.name} في كورس: ${course.title}`,
    }).catch(() => {});

    return NextResponse.json({ success: true, enrollment, message: `تم تسجيل ${student.name} في كورس ${course.title} بنجاح` });
  } catch (error) {
    console.error("[teacher/courses/enroll POST] error:", error);
    return NextResponse.json({ error: "حدث خطأ أثناء تسجيل الطالب في الكورس" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (!isTeacherLike(session.role) && session.role !== "admin" && session.role !== "superadmin")) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get("studentId");
    const courseId = searchParams.get("courseId");

    if (!studentId || !courseId) {
      return NextResponse.json({ error: "studentId و courseId مطلوبان للحذف" }, { status: 400 });
    }

    const teacherId = actingTeacherId(session);
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, title: true, teacherId: true },
    });

    if (!course) {
      return NextResponse.json({ error: "الكورس غير موجود" }, { status: 404 });
    }

    if (course.teacherId !== teacherId && session.role !== "admin" && session.role !== "superadmin") {
      return NextResponse.json({ error: "غير مصرح لك بحذف طلاب من هذا الكورس" }, { status: 403 });
    }

    await prisma.courseEnrollment.deleteMany({
      where: {
        studentId,
        courseId,
      },
    });

    return NextResponse.json({ success: true, message: "تم حذف تسجيل الطالب من الكورس بنجاح" });
  } catch (error) {
    console.error("[teacher/courses/enroll DELETE] error:", error);
    return NextResponse.json({ error: "حدث خطأ أثناء حذف تسجيل الطالب" }, { status: 500 });
  }
}
