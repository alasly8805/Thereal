import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId } from "@/lib/teacher-scope";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request | NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "معرف الحجز مطلوب" }, { status: 400 });
    }

    let session: any = null;
    try {
      session = await getSession();
    } catch {
      // In case called outside request context (e.g. testing)
    }

    const teacherId =
      session && isTeacherLike(session.role)
        ? actingTeacherId(session)
        : null;

    // 1. Try finding by TeacherSubscription id
    let sub = await prisma.teacherSubscription.findUnique({
      where: { id },
      select: { id: true, teacherId: true, studentId: true, studentName: true, planLabel: true },
    });

    // 2. If not found by subscription id, check if id is studentId
    if (!sub) {
      sub = await prisma.teacherSubscription.findFirst({
        where: {
          studentId: id,
          ...(teacherId ? { teacherId } : {}),
        },
        select: { id: true, teacherId: true, studentId: true, studentName: true, planLabel: true },
      });
    }

    if (sub) {
      // Security check: teacher can only delete their own subscriptions
      if (session && isTeacherLike(session.role) && session.role !== "admin" && session.role !== "superadmin") {
        if (sub.teacherId !== actingTeacherId(session)) {
          return NextResponse.json({ error: "غير مصرح لك بحذف هذا الحجز" }, { status: 403 });
        }
      }

      await prisma.teacherSubscription.delete({
        where: { id: sub.id },
      });

      if (session) {
        try {
          const { logAdminAction } = await import("@/lib/admin-auth");
          await logAdminAction({
            adminId: session.id,
            adminName: session.name || "معلم",
            action: "DELETE_TEACHER_SUBSCRIPTION",
            targetType: "STUDENT",
            targetId: sub.studentId,
            targetName: `حذف حجز: ${sub.studentName || ""} (${sub.planLabel || ""})`,
          });
        } catch {}
      }

      return NextResponse.json({ success: true, message: "تم حذف الحجز بنجاح" });
    }

    // 3. Fallback: if no subscription was found, look for CourseEnrollment for this student/course
    const enrollment = await prisma.courseEnrollment.findFirst({
      where: {
        OR: [
          { id },
          {
            studentId: id,
            ...(teacherId ? { course: { teacherId } } : {}),
          },
        ],
      },
      include: {
        course: { select: { teacherId: true, title: true } },
      },
    });

    if (enrollment) {
      if (session && isTeacherLike(session.role) && session.role !== "admin" && session.role !== "superadmin") {
        if (enrollment.course?.teacherId !== actingTeacherId(session)) {
          return NextResponse.json({ error: "غير مصرح لك بحذف هذا التسجيل" }, { status: 403 });
        }
      }

      await prisma.courseEnrollment.delete({
        where: { id: enrollment.id },
      });

      // Also clean up any accessCode for that student on that course so they don't linger in roster
      await prisma.accessCode.deleteMany({
        where: {
          studentId: enrollment.studentId,
          courseId: enrollment.courseId,
        },
      }).catch(() => {});

      if (session) {
        try {
          const { logAdminAction } = await import("@/lib/admin-auth");
          await logAdminAction({
            adminId: session.id,
            adminName: session.name || "معلم",
            action: "DELETE_COURSE_ENROLLMENT",
            targetType: "STUDENT",
            targetId: enrollment.studentId,
            targetName: `حذف تسجيل كورس: ${enrollment.course?.title || ""}`,
          });
        } catch {}
      }

      return NextResponse.json({ success: true, message: "تم حذف تسجيل الكورس بنجاح" });
    }

    // Direct deletion fallback if sub was not pre-found
    try {
      await prisma.teacherSubscription.delete({ where: { id } });
      return NextResponse.json({ success: true, message: "تم حذف الحجز بنجاح" });
    } catch {
      return NextResponse.json({ error: "لم يتم العثور على الحجز أو التسجيل" }, { status: 404 });
    }
  } catch (e: any) {
    console.error("[DELETE /api/teacher/subscriptions/[id]] error:", e);
    return NextResponse.json({ error: e?.message || "فشل الحذف" }, { status: 500 });
  }
}
