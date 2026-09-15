import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getSession();
    if (!session || !isTeacherLike(session.role)) {
      return NextResponse.json({ error: "غير مصرح — للمعلمين فقط" }, { status: 403 });
    }

    const teacher = await prisma.user.findUnique({
      where: { id: session.id },
      select: {
        id: true,
        promoProgramEnabled: true,
        promoCode: true,
      },
    });

    if (!teacher) {
      return NextResponse.json({ error: "المعلم غير موجود" }, { status: 404 });
    }

    if (!teacher.promoProgramEnabled) {
      return NextResponse.json({
        enabled: false,
        message: "برنامج المحالين غير مفعّل لحسابك",
      });
    }

    const studentScope = session.demoTour ? { isDemo: true as const } : {};

    // Get all attributions for this teacher
    const attributions = await prisma.teacherReferralAttribution.findMany({
      where: {
        teacherId: actingTeacherId(session),
        ...(session.demoTour ? { student: { isDemo: true } } : {}),
      },
      include: {
        student: { select: { id: true, name: true, email: true, createdAt: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Also get all students directly referred by signup (in case they haven't bought anything yet)
    const directReferredStudents = await prisma.user.findMany({
      where: { referredByTeacherId: session.id, ...studentScope },
      select: { id: true, name: true, email: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    // Combine & compute totals
    const totalAmount = attributions.reduce((sum, a) => sum + (a.amount || 0), 0);

    const items = attributions.map((a) => ({
      id: a.id,
      studentId: a.studentId,
      studentName: a.student?.name || "طالب",
      studentEmail: a.student?.email,
      purchaseType: a.purchaseType,
      amount: a.amount,
      promoCodeUsed: a.promoCodeUsed,
      createdAt: a.createdAt,
    }));

    return NextResponse.json({
      enabled: true,
      promoCode: teacher.promoCode,
      totalAmount,
      totalReferredStudentsCount: directReferredStudents.length,
      attributions: items,
      referredStudents: directReferredStudents,
    });
  } catch (error) {
    console.error("Teacher referred-students GET error:", error);
    return NextResponse.json({ error: "حدث خطأ أثناء جلب قائمة الطلاب المحالين" }, { status: 500 });
  }
}
