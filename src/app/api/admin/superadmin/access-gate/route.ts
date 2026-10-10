import { logAdminAction } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { verifyBulkPassword, verifyWalletPassword, verifyTerminalPassword } from "@/lib/admin-auth";

/**
 * Verifies the access password (BULK_DELETE_PASSWORD) that gates the Danger Zone
 * and Instance sections. Superadmin-only; returns only { ok } — never the value.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();

    if (session && session.role === "superadmin") {
      try {
        await logAdminAction({
          adminId: session.id,
          adminName: session.name,
          action: "SUPERADMIN_ACTION",
          targetType: "API_ROUTE",
          targetId: req.nextUrl ? req.nextUrl.pathname : req.url,
          targetName: req.method,
        });
      } catch (e) {}
    }
  if (!session || session.role !== "superadmin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { password?: string; type?: string };
  
  if (body.type === "wallet") {
    if (!verifyWalletPassword(body.password ?? "")) {
      return NextResponse.json({ ok: false, error: "كلمة المرور غير صحيحة" }, { status: 401 });
    }
  } else if (body.type === "ai-terminal" || body.type === "terminal") {
    if (!verifyTerminalPassword(body.password ?? "")) {
      return NextResponse.json({ ok: false, error: "كلمة المرور غير صحيحة" }, { status: 401 });
    }
  } else {
    if (!verifyBulkPassword(body.password ?? "")) {
      return NextResponse.json({ ok: false, error: "كلمة المرور غير صحيحة" }, { status: 401 });
    }
  }
  
  return NextResponse.json({ ok: true });
}
