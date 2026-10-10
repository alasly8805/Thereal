import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { verifyTerminalPassword } from "@/lib/admin-auth";
import { killTerminalProcess } from "@/lib/terminal-runner";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "superadmin") {
    return NextResponse.json({ ok: false, error: "غير مصرح" }, { status: 403 });
  }

  const passHeader = req.headers.get("x-terminal-password") || "";
  const body = (await req.json().catch(() => ({}))) as { execId?: string; password?: string };
  const password = passHeader || body.password || "";

  if (!verifyTerminalPassword(password)) {
    return NextResponse.json({ ok: false, error: "كلمة المرور غير صالحة" }, { status: 401 });
  }

  const execId = body.execId;
  if (!execId) {
    return NextResponse.json({ ok: false, error: "execId مطلوب" }, { status: 400 });
  }

  const killed = killTerminalProcess(execId);
  return NextResponse.json({ ok: true, killed });
}
