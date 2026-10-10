import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { normalizeEgyptPhone } from "@/lib/phone";
import {
  clearPhoneVerificationCookie,
  verifyPhoneVerificationCookie,
} from "@/lib/auth";
import { isPhoneVerificationBypassed } from "@/lib/aws-sms";
import { invalidateUserSessionCache } from "@/lib/cache";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { phone, verificationCode, newPassword } = body as {
      phone?: unknown;
      verificationCode?: unknown;
      newPassword?: unknown;
    };

    if (!phone || !newPassword) {
      return NextResponse.json(
        { error: "جميع الحقول مطلوبة" },
        { status: 400 }
      );
    }

    const passwordStr = String(newPassword);
    if (passwordStr.length < 6 || passwordStr.length > 128) {
      return NextResponse.json(
        { error: "كلمة المرور يجب أن تكون بين 6 و 128 حرفًا" },
        { status: 400 }
      );
    }

    const normalized = normalizeEgyptPhone(String(phone));

    if (!isPhoneVerificationBypassed()) {
      if (!verificationCode) {
        return NextResponse.json(
          { error: "رمز التحقق مطلوب" },
          { status: 400 }
        );
      }
      const isValid = await verifyPhoneVerificationCookie(
        normalized,
        String(verificationCode)
      );
      if (!isValid) {
        return NextResponse.json(
          { error: "الكود غير صحيح أو انتهت صلاحيته" },
          { status: 400 }
        );
      }
    }

    const user = await prisma.user.findFirst({
      where: { phone: normalized, role: "student" },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "لا يوجد حساب مرتبط بهذا الرقم" },
        { status: 404 }
      );
    }

    // Use bcrypt cost 12 (consistent with signup)
    const hashed = await bcrypt.hash(passwordStr, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashed,
        tokenVersion: { increment: 1 },
      } as Parameters<typeof prisma.user.update>[0]["data"],
    });
    invalidateUserSessionCache(user.id);

    await clearPhoneVerificationCookie();

    return NextResponse.json({ message: "تم تغيير كلمة المرور بنجاح" });
  } catch (err) {
    console.error("reset-password error:", err);
    return NextResponse.json(
      { error: "حدث خطأ أثناء تغيير كلمة المرور" },
      { status: 500 }
    );
  }
}
