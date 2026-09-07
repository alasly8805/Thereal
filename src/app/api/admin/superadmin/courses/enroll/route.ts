import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/admin-auth";
import { randomBytes } from "crypto";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "superadmin") {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { studentId, courseId } = body as { studentId?: string; courseId?: string };

    if (!studentId || !courseId) {
      return NextResponse.json({ error: "studentId و courseId مطلوبان" }, { status: 400 });
    }

    const [student, course] = await Promise.all([
      prisma.user.findUnique({
        where: { id: studentId },
        select: { id: true, name: true, email: true, phone: true },
      }),
      prisma.course.findUnique({
        where: { id: courseId },
        select: { id: true, title: true, teacher: { select: { id: true, name: true } } },
      }),
    ]);

    if (!student) {
      return NextResponse.json({ error: "الطالب غير موجود" }, { status: 404 });
    }
    if (!course) {
      return NextResponse.json({ error: "الكورس غير موجود" }, { status: 404 });
    }

    // 1. Direct course enrollment record
    await prisma.courseEnrollment.upsert({
      where: {
        studentId_courseId: {
          studentId,
          courseId,
        },
      },
      create: {
        studentId,
        courseId,
        // Trusted manual grant via the superadmin panel (offline payment) —
        // never leave this to the schema default; mislabeled grants show up as fake purchases.
        fulfillmentSource: "ADMIN",
        amountPaid: 0,
      },
      update: {},
    });

    // 2. Active redeemed access code for unified authorization
    const existingCode = await prisma.accessCode.findFirst({
      where: {
        courseId,
        studentId,
        isActive: true,
        OR: [{ accessType: "TERM" }, { accessType: "COURSE" }, { folderId: null, videoId: null }],
      },
    });

    if (!existingCode) {
      const hex = randomBytes(4).toString("hex").toUpperCase();
      const code = `ADM-${hex}`;
      await prisma.accessCode.create({
        data: {
          code,
          courseId,
          studentId,
          isActive: true,
          usedAt: new Date(),
          accessType: "TERM",
        },
      });
    }

    // 3. Log superadmin action
    await logAdminAction({
      adminId: session.id,
      adminName: session.name,
      action: "SUPERADMIN_MANUAL_ENROLL",
      targetType: "COURSE",
      targetId: courseId,
      targetName: `تسجيل الطالب: ${student.name} في كورس: ${course.title}`,
    }).catch(() => {});

    // 4. Send in-app notification to the student
    await prisma.notification.create({
      data: {
        userId: studentId,
        type: "course_enrollment",
        title: "تم تسجيلك في كورس جديد 🎓",
        body: `قام المشرف بإضافتك وتفعيل كورس «${course.title}» في مكتبتك التعليمية بنجاح.`,
        link: `/courses/${courseId}`,
      },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      message: `تم تسجيل الطالب (${student.name}) في كورس (${course.title}) بنجاح!`,
      student: { id: student.id, name: student.name },
      course: { id: course.id, title: course.title },
    });
  } catch (error: any) {
    console.error("[superadmin/courses/enroll] error:", error);
    return NextResponse.json({ error: error?.message || "حدث خطأ أثناء تسجيل الطالب" }, { status: 500 });
  }
}
