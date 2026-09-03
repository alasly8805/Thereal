import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reissueParentToken, resetParentVerificationLimits } from "@/lib/whatsapp/parentToken";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !session.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      parentPhone?: string;
      studentId?: string;
      resetCount?: boolean;
    };
    const { parentPhone, studentId, resetCount } = body;

    let targetStudentId = session.id;
    let isAdmin = false;

    if (studentId && typeof studentId === "string") {
      if (session.role !== "admin" && session.role !== "superadmin" && session.role !== "staff") {
        return NextResponse.json({ error: "غير مصرح لك بإدارة هذا الطالب" }, { status: 403 });
      }
      targetStudentId = studentId;
      isAdmin = true;
    }

    // Self-service path: only a student may change their own parent contact, and
    // only before parent verification has been completed. Once a parent link is
    // verified, re-pointing it (e.g. to the student's own number) would defeat
    // parent monitoring, so that requires an admin.
    if (!isAdmin) {
      if (session.role !== "student") {
        return NextResponse.json({ error: "هذا الإجراء مخصص للطلاب فقط" }, { status: 403 });
      }
      const self = await prisma.user.findUnique({
        where: { id: session.id },
        select: { parentVerified: true, parentVerificationStatus: true },
      });
      if (self?.parentVerified || self?.parentVerificationStatus === "CONFIRMED") {
        return NextResponse.json(
          { error: "تم توثيق رقم ولي الأمر بالفعل. لتغييره تواصل مع إدارة المنصة." },
          { status: 403 }
        );
      }
    }

    if (resetCount) {
      if (!isAdmin) {
        return NextResponse.json({ error: "غير مصرح بتصفير المحاولات" }, { status: 403 });
      }
      await resetParentVerificationLimits(targetStudentId);
      return NextResponse.json({
        success: true,
        message: "تم تصفير عداد المحاولات وفك الحظر عن الطالب بنجاح",
      });
    }

    if (!parentPhone || typeof parentPhone !== "string") {
      return NextResponse.json({ error: "رقم هاتف ولي الأمر مطلوب" }, { status: 400 });
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") || "127.0.0.1";
    const userAgent = req.headers.get("user-agent") || undefined;

    const result = await reissueParentToken(targetStudentId, parentPhone, ip, userAgent, {
      // `allowSamePhone` (parent phone == student phone) is an admin-only override;
      // never honour it from a student's request body.
      allowSamePhone: isAdmin,
      bypassRateLimit: isAdmin,
      resetLimits: isAdmin,
    });

    const dispatchSuccess = result.dispatchResult?.success ?? false;
    const dispatchError = result.dispatchResult?.error;

    let msg = "تم إرسال رابط متابعة جديد لولي الأمر عبر الواتساب بنجاح";
    if (!dispatchSuccess) {
      msg = `تم توليد وتحديث الرابط بنجاح. تنبيه: تعذر الإرسال عبر الواتساب (${dispatchError || "محرك الواتساب غير متصل"})`;
    }

    return NextResponse.json({
      success: true,
      message: msg,
      dispatchSuccess,
      dispatchError,
    });
  } catch (error) {
    console.error("[student/parent-phone] error:", error);
    return NextResponse.json({ error: "تعذر إرسال رابط ولي الأمر — يرجى المحاولة مرة أخرى" }, { status: 400 });
  }
}
