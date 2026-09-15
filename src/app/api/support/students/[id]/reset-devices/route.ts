import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSupportSession, logSupportAction } from "@/lib/support-auth";
import { invalidateUserSessionCache } from "@/lib/cache";

/**
 * POST /api/support/students/[id]/reset-devices
 *
 * The single most common support ticket: "I changed my phone and can't log
 * in" / "it says this account is used on another device". Clears every
 * registered Device row and bumps tokenVersion, which revokes all outstanding
 * JWTs — the student signs in fresh on the new device.
 *
 * Mirrors /api/admin/students/[id]/reset-devices, but authed by the support
 * session and audited through logSupportAction.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const support = await getSupportSession();
  if (!support) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const { id: studentId } = await params;

  const student = await prisma.user.findFirst({
    where: { id: studentId, role: "student", isDeleted: false },
    select: { id: true, name: true, phone: true },
  });
  if (!student) return NextResponse.json({ error: "الطالب غير موجود" }, { status: 404 });

  try {
    const deviceCount = await prisma.device.count({ where: { userId: studentId } });

    await prisma.$transaction([
      prisma.device.deleteMany({ where: { userId: studentId } }),
      // tokenVersion increment invalidates every issued JWT for this student,
      // so the old phone loses access at the same moment the new one can register.
      prisma.user.update({
        where: { id: studentId },
        data: { tokenVersion: { increment: 1 } },
      }),
    ]);
    invalidateUserSessionCache(studentId);

    await logSupportAction({
      action: "SUPPORT_RESET_STUDENT_DEVICES",
      targetType: "student",
      targetId: studentId,
      targetName: `${student.name} (${student.phone || "بدون هاتف"})`,
      metadata: { agent: support.agent, devicesCleared: deviceCount },
    });

    return NextResponse.json({
      ok: true,
      devicesCleared: deviceCount,
      message: `تم مسح ${deviceCount} جهاز — يمكن للطالب تسجيل الدخول من جهاز جديد الآن`,
    });
  } catch (err) {
    console.error("support reset-devices failed:", err);
    return NextResponse.json({ error: "تعذر مسح الأجهزة" }, { status: 500 });
  }
}
