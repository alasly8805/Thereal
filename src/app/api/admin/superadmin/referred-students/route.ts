import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getSession();
    if (!session || (session.role !== "superadmin" && session.role !== "owner")) {
      return NextResponse.json({ error: "غير مصرح — للمشرفين فقط" }, { status: 403 });
    }

    const demoTour = session.demoTour === true;

    // Fetch all teachers who have promoProgramEnabled === true
    const teachers = await prisma.user.findMany({
      where: {
        role: "teacher",
        promoProgramEnabled: true,
        ...(demoTour ? { isDemo: true } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        promoProgramEnabled: true,
        promoCode: true,
        promoCodeCreatedAt: true,
        createdAt: true,
        _count: {
          select: {
            referredStudents: demoTour ? { where: { isDemo: true } } : true,
            teacherAttributions: demoTour ? { where: { student: { isDemo: true } } } : true,
          },
        },
        teacherAttributions: {
          ...(demoTour ? { where: { student: { isDemo: true } } } : {}),
          select: {
            amount: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const summary = teachers.map((t) => {
      const totalAmount = t.teacherAttributions.reduce((sum, a) => sum + (a.amount || 0), 0);
      return {
        teacherId: t.id,
        teacherName: t.name,
        teacherEmail: t.email,
        promoCode: t.promoCode || "لم يتم التحديد",
        promoCodeCreatedAt: t.promoCodeCreatedAt,
        referredStudentsCount: t._count.referredStudents,
        attributionsCount: t._count.teacherAttributions,
        totalAmount,
      };
    });

    const platformTotalAmount = summary.reduce((sum, s) => sum + s.totalAmount, 0);

    return NextResponse.json({
      teachers: summary,
      platformTotalAmount,
    });
  } catch (error) {
    console.error("Superadmin referred-students GET error:", error);
    return NextResponse.json({ error: "حدث خطأ أثناء جلب قائمة المعلمين المشاركين في البرنامج" }, { status: 500 });
  }
}
