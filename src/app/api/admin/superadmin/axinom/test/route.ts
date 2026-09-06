import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  decryptAxinomSecret,
  testAxinomAccountCredentials,
} from "@/lib/axinom-pool";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "superadmin" && session.role !== "admin")) {
      return NextResponse.json({ error: "غير مصرح لك بالوصول" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      accountId?: string;
      tenantId?: string;
      communicationKeyId?: string;
      communicationKey?: string;
    };

    let tenantId = (body.tenantId || "").trim();
    let communicationKeyId = (body.communicationKeyId || "").trim();
    let communicationKey = (body.communicationKey || "").trim();

    if (body.accountId) {
      const account = await prisma.axinomAccount.findUnique({
        where: { id: body.accountId },
      });
      if (!account) {
        return NextResponse.json({ error: "الحساب غير موجود للفحص" }, { status: 404 });
      }
      tenantId = account.tenantId;
      communicationKeyId = account.communicationKeyId;
      communicationKey = decryptAxinomSecret(account.communicationKeyEnc);
    }

    const result = await testAxinomAccountCredentials({
      tenantId,
      communicationKeyId,
      communicationKey,
    });

    return NextResponse.json({
      success: result.ok,
      ok: result.ok,
      message: result.message,
    });
  } catch (error: any) {
    console.error("[Superadmin Test Axinom Account] Error:", error);
    return NextResponse.json(
      { ok: false, message: error.message || "فشل فحص الحساب" },
      { status: 500 }
    );
  }
}
