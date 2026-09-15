import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId } from "@/lib/teacher-scope";
import { verifyDrmPassword, logAdminAction } from "@/lib/admin-auth";

import { isDrmAuthorized } from "@/lib/drm-auth";

/**
 * Verifies the DRM access password (DRM_UPLOAD_PASSWORD / SUPERADMIN_ACTION_PASSWORD)
 * that gates the restricted Axinom Hardware DRM packaging and video options in the teacher panel.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "teacher" && session.role !== "superadmin" && session.role !== "admin")) {
      return NextResponse.json({ error: "غير مصرح لك بالوصول" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { password?: string };
    const password = (body.password || "").trim();

    const authorized = isDrmAuthorized(session) || (password && verifyDrmPassword(password));
    if (!authorized) {
      return NextResponse.json({ ok: false, error: "كلمة مرور حماية DRM غير صحيحة" }, { status: 401 });
    }

    if (session.role === "superadmin" || session.role === "admin") {
      try {
        await logAdminAction({
          adminId: session.id,
          adminName: session.name,
          action: "SUPERADMIN_ACTION",
          targetType: "DRM_GATE",
          targetId: session.id,
          targetName: "UNLOCK_AXINOM_DRM",
        });
      } catch {
        // non-blocking
      }
    }

    return NextResponse.json({ ok: true, success: true, message: "تم إلغاء قفل خيارات DRM بنجاح" });
  } catch (error) {
    console.error("[teacher/drm-gate] verification error:", error);
    return NextResponse.json({ ok: false, error: "حدث خطأ أثناء التحقق" }, { status: 500 });
  }
}
