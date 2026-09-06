import { logAdminAction, verifyRoleActionPassword } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomInt } from "node:crypto";

function generateCode(prefix = "CODEUP"): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const random = Array.from({ length: 8 }, () => chars[randomInt(chars.length)]).join("");
  return `${prefix}-${random}`;
}

/** GET — list all money codes (superadmin only) */
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "superadmin") return NextResponse.json({ error: "غير مصرح" }, { status: 403 });

  const codes = await prisma.moneyCode.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, code: true, amount: true, isUsed: true, usedById: true, usedAt: true, expiresAt: true, createdAt: true },
  });

  return NextResponse.json({ codes });
}

/** POST — generate money codes (superadmin only) */
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
  if (!session || session.role !== "superadmin") return NextResponse.json({ error: "غير مصرح" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    amount: number;
    count?: number;
    expiresAt?: string;
    prefix?: string;
    actionPassword?: string;
  };
  const { amount, count = 1, expiresAt, prefix = "CODEUP", actionPassword = "" } = body;

  if (!verifyRoleActionPassword(session.role, actionPassword)) {
    return NextResponse.json({ error: "كلمة مرور إجراءات المشرف غير صحيحة" }, { status: 401 });
  }

  if (!amount || amount <= 0) return NextResponse.json({ error: "المبلغ يجب أن يكون أكبر من صفر" }, { status: 400 });
  if (count < 1 || count > 100) return NextResponse.json({ error: "العدد يجب بين 1 و 100" }, { status: 400 });

  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    let code: string;
    // Ensure uniqueness
    do { code = generateCode(prefix); } while (await prisma.moneyCode.findUnique({ where: { code }, select: { id: true } }));
    codes.push(code);
  }

  const created = await prisma.moneyCode.createMany({
    data: codes.map(code => ({
      code,
      amount,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    })),
  });

  return NextResponse.json({ success: true, count: created.count, codes });
}
