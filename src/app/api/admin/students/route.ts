import { logAdminAction } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId, hasAssistantPermission, maskPhone } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !isTeacherLike(session.role)) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const courseId = searchParams.get("courseId");
    
    if (!courseId) {
      return NextResponse.json({ error: "معرف الكورس مطلوب" }, { status: 400 });
    }

    // Verify course belongs to teacher
    const course = await prisma.course.findFirst({
      where: { id: courseId, teacherId: actingTeacherId(session) },
    });

    if (!course) {
      return NextResponse.json({ error: "الكورس غير موجود" }, { status: 404 });
    }

    // Get all students enrolled in this course (strictly excluding testers)
    const { TeacherVisibilityService } = await import("@/services/teacher/TeacherVisibilityService");
    const students = await prisma.user.findMany({
      where: TeacherVisibilityService.getEnrolledStudentsWhere(courseId),
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        educationalStage: true,
        isActive: true,
        createdAt: true,
      },
    });

    const canSeePhones = hasAssistantPermission(session, "viewStudentPhones");
    const canViewStudents = hasAssistantPermission(session, "viewStudents");
    if (!canViewStudents) {
      return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية عرض الطلاب" }, { status: 403 });
    }

    return NextResponse.json({
      students: students.map((s) => ({
        ...s,
        phone: canSeePhones ? s.phone : maskPhone(s.phone),
      })),
    });
  } catch (error) {
    console.error("Failed to fetch students:", error);
    return NextResponse.json(
      { error: "تعذر جلب المتعلمين" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession();

    if (session && session.role === "superadmin") {
      try {
        await logAdminAction({
          adminId: session.id,
          adminName: session.name,
          action: "SUPERADMIN_ACTION",
          targetType: "API_ROUTE",
          targetId: req.nextUrl ? req.nextUrl.pathname : req.url,
          targetName: req.method,
        });
      } catch (e) {}
    }
    if (!session || !isTeacherLike(session.role)) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }
    if (!hasAssistantPermission(session, "manageCodes")) {
      return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية إدارة وصول الطلاب" }, { status: 403 });
    }

    const { studentId, courseId, action } = await req.json();

    if (!studentId || !courseId || !action) {
      return NextResponse.json(
        { error: "معرف المتعلم والكورس والإجراء مطلوبة" },
        { status: 400 }
      );
    }

    // Verify course belongs to teacher
    const course = await prisma.course.findFirst({
      where: { id: courseId, teacherId: actingTeacherId(session) },
    });

    if (!course) {
      return NextResponse.json({ error: "الكورس غير موجود" }, { status: 404 });
    }

    const { TeacherVisibilityService } = await import("@/services/teacher/TeacherVisibilityService");
    const visibleStudent = await TeacherVisibilityService.findStudentById(session.id, studentId);
    if (!visibleStudent) {
      return NextResponse.json({ error: "المتعلم غير موجود" }, { status: 404 });
    }

    if (action === "ban") {
      // Deactivate all access codes for this student in this course
      await prisma.accessCode.updateMany({
        where: {
          courseId,
          studentId,
        },
        data: {
          isActive: false,
        },
      });

      return NextResponse.json({ success: true, message: "تم حظر المتعلم بنجاح" });
    } else if (action === "unban") {
      // Reactivate access codes for this student in this course
      await prisma.accessCode.updateMany({
        where: {
          courseId,
          studentId,
        },
        data: {
          isActive: true,
        },
      });

      return NextResponse.json({ success: true, message: "تم إلغاء حظر المتعلم بنجاح" });
    } else if (action === "remove") {
      // Delete all access codes for this student in this course
      await prisma.accessCode.deleteMany({
        where: {
          courseId,
          studentId,
        },
      });

      return NextResponse.json({ success: true, message: "تم إزالة المتعلم بنجاح" });
    } else {
      return NextResponse.json({ error: "إجراء غير صحيح" }, { status: 400 });
    }
  } catch (error) {
    console.error("Failed to update student status:", error);
    return NextResponse.json(
      { error: "تعذر تحديث حالة المتعلم" },
      { status: 500 }
    );
  }
}
