import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSupportSession, logSupportAction } from "@/lib/support-auth";
import { invalidateUserSessionCache } from "@/lib/cache";

/**
 * POST /api/support/students/[id]/status
 * Body: { action: "suspend" | "reactivate" | "unlock-login" }
 *
 *   suspend      — isActive=false + tokenVersion bump: the student is cut off
 *                  immediately, not whenever their JWT happens to expire.
 *   reactivate   — isActive=true again.
 *   unlock-login — clears failedLoginAttempts / lockedUntil, the fix for
 *                  "I keep typing the right password and it still says try
 *                  later" tickets. Does not touch devices or sessions.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const support = await getSupportSession();
  if (!support) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const { id: studentId } = await params;
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  const action = String(body.action || "");

  if (!["suspend", "reactivate", "unlock-login"].includes(action)) {
    return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 });
  }

  const student = await prisma.user.findFirst({
    where: { id: studentId, role: "student", isDeleted: false },
    select: { id: true, name: true, isActive: true, lockedUntil: true },
  });
  if (!student) return NextResponse.json({ error: "الطالب غير موجود" }, { status: 404 });

  try {
    if (action === "unlock-login") {
      await prisma.user.update({
        where: { id: studentId },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
      await logSupportAction({
        action: "SUPPORT_UNLOCK_LOGIN",
        targetType: "student",
        targetId: studentId,
        targetName: student.name,
        metadata: { agent: support.agent, wasLockedUntil: student.lockedUntil },
      });
      return NextResponse.json({ ok: true, message: "تم فك حظر تسجيل الدخول — جرّب الطالب الدخول الآن" });
    }

    const suspending = action === "suspend";
    if (student.isActive === !suspending) {
      return NextResponse.json({
        ok: true,
        already: true,
        isActive: student.isActive,
        message: suspending ? "الحساب موقوف بالفعل" : "الحساب مفعّل بالفعل",
      });
    }

    await prisma.user.update({
      where: { id: studentId },
      data: {
        isActive: !suspending,
        // Suspending must kick the student out now — bumping tokenVersion
        // invalidates every issued JWT, same trick as reset-devices.
        ...(suspending ? { tokenVersion: { increment: 1 } } : {}),
      },
    });
    invalidateUserSessionCache(studentId);

    await logSupportAction({
      action: suspending ? "SUPPORT_SUSPEND_STUDENT" : "SUPPORT_REACTIVATE_STUDENT",
      targetType: "student",
      targetId: studentId,
      targetName: student.name,
      metadata: { agent: support.agent },
    });

    return NextResponse.json({
      ok: true,
      isActive: !suspending,
      message: suspending
        ? "تم إيقاف الحساب وتسجيل خروجه من كل الأجهزة"
        : "تم إعادة تفعيل الحساب",
    });
  } catch (err) {
    console.error("support status change failed:", err);
    return NextResponse.json({ error: "تعذر تغيير حالة الحساب" }, { status: 500 });
  }
}
