import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getAllAxinomAccountsWithStats,
  encryptAxinomSecret,
  getAxinomAccountWithComputedStats,
  parseCommunicationKeyBuffer,
} from "@/lib/axinom-pool";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "superadmin" && session.role !== "admin")) {
      return NextResponse.json({ error: "غير مصرح لك بالوصول" }, { status: 403 });
    }

    const { accounts, kpis } = await getAllAxinomAccountsWithStats();

    return NextResponse.json({
      success: true,
      accounts,
      kpis,
    });
  } catch (error: any) {
    console.error("[Superadmin Axinom Accounts API] GET Error:", error);
    return NextResponse.json(
      { error: error.message || "تعذر جلب بيانات حسابات Axinom DRM" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "superadmin") {
      return NextResponse.json(
        { error: "غير مصرح لك بالوصول (المشرف العام فقط)" },
        { status: 403 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      tenantId?: string;
      communicationKeyId?: string;
      communicationKey?: string;
      keySeedId?: string;
      widevineLicenseUrl?: string;
      playreadyLicenseUrl?: string;
      fairplayLicenseUrl?: string;
      fairplayCertUrl?: string;
      licenseLimit?: number;
      validityDays?: number;
      isPrimary?: boolean;
      priority?: number;
      notes?: string;
    };

    const name = (body.name || "").trim();
    const tenantId = (body.tenantId || "").trim();
    const communicationKeyId = (body.communicationKeyId || "").trim();
    const communicationKey = (body.communicationKey || "").trim();

    if (!name) {
      return NextResponse.json(
        { error: "اسم الحساب مطلوب (مثال: سيرفر تراخيص Axinom الرئيسي)" },
        { status: 400 }
      );
    }

    if (!tenantId) {
      return NextResponse.json(
        { error: "Axinom Tenant ID مطلوب" },
        { status: 400 }
      );
    }

    if (!communicationKeyId) {
      return NextResponse.json(
        { error: "Axinom Communication Key ID مطلوب بصيغة GUID" },
        { status: 400 }
      );
    }

    if (!communicationKey) {
      return NextResponse.json(
        { error: "مفتاح Communication Key السري مطلوب (Hex 64 أو Base64)" },
        { status: 400 }
      );
    }

    // Validate communication key format
    try {
      const keyBuf = parseCommunicationKeyBuffer(communicationKey);
      if (keyBuf.length !== 32) {
        return NextResponse.json(
          { error: `طول المفتاح غير صالح. يجب أن يكون 32 بايت (256-bit). الطول الحالي: ${keyBuf.length} بايت.` },
          { status: 400 }
        );
      }
    } catch (err: any) {
      return NextResponse.json(
        { error: `صيغة المفتاح غير صالحة: ${err.message}` },
        { status: 400 }
      );
    }

    // Encrypt communication key with AES-256-GCM
    const communicationKeyEnc = encryptAxinomSecret(communicationKey);

    const licenseLimit =
      typeof body.licenseLimit === "number" && body.licenseLimit > 0
        ? Math.floor(body.licenseLimit)
        : 10000; // 10,000 certificates default

    const validityDays =
      typeof body.validityDays === "number" && body.validityDays > 0
        ? Math.floor(body.validityDays)
        : 365; // 365 days default

    const priority =
      typeof body.priority === "number" && body.priority > 0
        ? Math.floor(body.priority)
        : 1;

    const isPrimary = Boolean(body.isPrimary);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);

    // If marked as primary, reset other accounts
    if (isPrimary) {
      await prisma.axinomAccount.updateMany({
        where: { isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const created = await prisma.axinomAccount.create({
      data: {
        name,
        tenantId,
        communicationKeyId,
        communicationKeyEnc,
        keySeedId: body.keySeedId ? body.keySeedId.trim() : null,
        widevineLicenseUrl: body.widevineLicenseUrl ? body.widevineLicenseUrl.trim() : null,
        playreadyLicenseUrl: body.playreadyLicenseUrl ? body.playreadyLicenseUrl.trim() : null,
        fairplayLicenseUrl: body.fairplayLicenseUrl ? body.fairplayLicenseUrl.trim() : null,
        fairplayCertUrl: body.fairplayCertUrl ? body.fairplayCertUrl.trim() : null,
        licenseLimit,
        licensesUsed: 0,
        expiresAt,
        isActive: true,
        isPrimary,
        priority,
        notes: body.notes ? body.notes.trim() : null,
      },
    });

    const publicAccount = await getAxinomAccountWithComputedStats(created, 0);

    return NextResponse.json(
      {
        success: true,
        account: publicAccount,
        message: `تم إضافة حساب Axinom DRM (${name}) برصيد ${licenseLimit.toLocaleString()} شهادة وصلاحية ${validityDays} يوماً بنجاح! 🎉`,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("[Superadmin Create Axinom Account] Error:", error);
    return NextResponse.json(
      { error: error.message || "تعذر إضافة حساب Axinom" },
      { status: 500 }
    );
  }
}
