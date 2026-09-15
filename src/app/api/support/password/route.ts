import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSupportSession, logSupportAction } from "@/lib/support-auth";
import { invalidateUserSessionCache } from "@/lib/cache";
import { getConfigNumberClamped } from "@/lib/config";

/**
 * POST /api/support/password
 * Body: { studentId, newPassword }
 *
 * Sets a student's password. tokenVersion is incremented in the same update:
 * without it, every device already signed in as that student keeps working with
 * the old session, so a password changed because the account was compromised
 * would not actually evict the attacker.
 *
 * The new password is never written to the log — only the fact of the change.
 */
export async function POST(req: NextRequest) {
  const support = await getSupportSession();
  if (!support) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    studentId?: string;
    newPassword?: string;
    reason?: string;
  };

  const studentId = String(body.studentId || "").trim();
  const newPassword = String(body.newPassword || "");
  const reason = String(body.reason || "").trim().slice(0, 500);

  if (!studentId) return NextResponse.json({ error: "معرّف الطالب مطلوب" }, { status: 400 });

  const minLength = await getConfigNumberClamped("password_min_length", 4, 64);
  if (newPassword.length < minLength) {
    return NextResponse.json(
      { error: `كلمة المرور يجب ألا تقل عن ${minLength} أحرف` },
      { status: 400 }
    );
  }

  const student = await prisma.user.findFirst({
    where: { id: studentId, role: "student", isDeleted: false },
    select: { id: true, name: true, phone: true },
  });
  if (!student) return NextResponse.json({ error: "الطالب غير موجود" }, { status: 404 });

  try {
    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: studentId },
      data: { password: hashed, tokenVersion: { increment: 1 } },
    });
    invalidateUserSessionCache(studentId);

    await logSupportAction({
      action: "SUPPORT_RESET_STUDENT_PASSWORD",
      targetType: "student",
      targetId: studentId,
      targetName: `${student.name} (${student.phone ?? ""})`,
      metadata: { agent: support.agent, reason: reason || null, sessionsRevoked: true },
    });

    return NextResponse.json({
      ok: true,
      message: "تم تغيير كلمة المرور وتسجيل الخروج من كل الأجهزة",
    });
  } catch (err) {
    console.error("support password change failed:", err);
    return NextResponse.json({ error: "تعذر تغيير كلمة المرور" }, { status: 500 });
  }
}
