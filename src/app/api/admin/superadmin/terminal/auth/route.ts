import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { verifyTerminalPassword, logAdminAction } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "superadmin") {
    return NextResponse.json({ ok: false, error: "غير مصرح لك بالوصول (المشرف العام فقط)" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { password?: string };
  const password = body.password ?? "";

  if (!verifyTerminalPassword(password)) {
    return NextResponse.json({ ok: false, error: "كلمة المرور غير صحيحة" }, { status: 401 });
  }

  try {
    await logAdminAction({
      adminId: session.id,
      adminName: session.name,
      action: "SUPERADMIN_ACTION",
      targetType: "TERMINAL_ACCESS",
      targetId: "terminal-unlocked",
      targetName: "AI & Claude Terminal Unlocked",
    });
  } catch {
    /* ignore logging failure */
  }

  return NextResponse.json({ ok: true, message: "تم التحقق بنجاح" });
}
