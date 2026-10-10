import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { applyCopilotAction } from "@/lib/superadmin-copilot/actions";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== "superadmin" && !session.isOwner)) {
    return NextResponse.json({ error: "غير مصرح — هذا التأكيد للمشرف العام فقط" }, { status: 403 });
  }
  if (session.demoTour) {
    return NextResponse.json({ error: "الجولة التجريبية لا تعدّل بيانات المقر الحقيقية" }, { status: 403 });
  }

  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token || token.length > 4000) {
    return NextResponse.json({ error: "لا يوجد تأكيد صالح" }, { status: 400 });
  }

  const result = await applyCopilotAction({
    token,
    adminId: session.id,
    adminName: session.name || "مشرف عام",
  });
  if (!result.ok) {
    return NextResponse.json({ error: "error" in result ? result.error : "تعذر الحفظ" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, summary: result.summary });
}
