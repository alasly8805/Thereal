import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { verifyVdoCipherSecurityPassword, logAdminAction } from "@/lib/admin-auth";

import { isDrmAuthorized } from "@/lib/drm-auth";

/**
 * Verifies the VdoCipher access password (vdocipher_security_password / VDOCIPHER_SECURITY_PASSWORD)
 * required before a teacher can upload or use VdoCipher DRM protection.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "teacher" && session.role !== "superadmin" && session.role !== "admin")) {
      return NextResponse.json({ error: "غير مصرح لك بالوصول" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { password?: string };
    const password = (body.password || "").trim();

    const isValid = password ? await verifyVdoCipherSecurityPassword(password) : false;
    const authorized = isDrmAuthorized(session) || isValid;

    if (!authorized) {
      return NextResponse.json({ ok: false, error: "كلمة مرور حماية VdoCipher غير صحيحة" }, { status: 401 });
    }

    if (session.role === "superadmin" || session.role === "admin") {
      try {
        await logAdminAction({
          adminId: session.id,
          adminName: session.name,
          action: "SUPERADMIN_ACTION",
          targetType: "VDOCIPHER_GATE",
          targetId: session.id,
          targetName: "UNLOCK_VDOCIPHER_SECURITY",
        });
      } catch {}
    }

    return NextResponse.json({
      success: true,
      ok: true,
      message: "تم التحقق من كلمة المرور وإلغاء قفل حماية VdoCipher بنجاح! 🔓",
    });
  } catch (error: any) {
    console.error("[Teacher VdoCipher Gate] Error:", error);
    return NextResponse.json(
      { ok: false, error: "حدث خطأ أثناء التحقق من كلمة المرور" },
      { status: 500 }
    );
  }
}
