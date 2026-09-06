import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  encryptAxinomSecret,
  getAxinomAccountWithComputedStats,
  parseCommunicationKeyBuffer,
} from "@/lib/axinom-pool";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "superadmin") {
      return NextResponse.json({ error: "غير مصرح لك بالوصول (المشرف العام فقط)" }, { status: 403 });
    }

    const envTenant = (process.env.AXINOM_TENANT_ID || "").trim();
    const envComKeyId = (process.env.AXINOM_COMMUNICATION_KEY_ID || "").trim();
    const envComKey = (process.env.AXINOM_COMMUNICATION_KEY || "").trim();

    if (!envTenant || !envComKeyId || !envComKey) {
      return NextResponse.json(
        { error: "بيانات Axinom غير مكتملة في ملف البيئة .env على السيرفر" },
        { status: 400 }
      );
    }

    // Validate key
    const keyBuf = parseCommunicationKeyBuffer(envComKey);
    if (keyBuf.length !== 32) {
      return NextResponse.json(
        { error: `مفتاح Communication Key في .env غير صالح (الطول الحالي: ${keyBuf.length} بايت)` },
        { status: 400 }
      );
    }

    // Check if an account with this tenant already exists
    const existing = await prisma.axinomAccount.findFirst({
      where: { tenantId: envTenant },
    });

    const communicationKeyEnc = encryptAxinomSecret(envComKey);
    let account;

    if (existing) {
      account = await prisma.axinomAccount.update({
        where: { id: existing.id },
        data: {
          communicationKeyId: envComKeyId,
          communicationKeyEnc,
          keySeedId: process.env.AXINOM_KEY_SEED_ID || null,
          widevineLicenseUrl: process.env.AXINOM_WIDEVINE_LICENSE_URL || null,
          playreadyLicenseUrl: process.env.AXINOM_PLAYREADY_LICENSE_URL || null,
          fairplayLicenseUrl: process.env.AXINOM_FAIRPLAY_LICENSE_URL || null,
          fairplayCertUrl: process.env.AXINOM_FAIRPLAY_CERT_URL || null,
          isActive: true,
        },
      });
    } else {
      account = await prisma.axinomAccount.create({
        data: {
          name: "حساب Axinom الأساسي (من ملف .env)",
          tenantId: envTenant,
          communicationKeyId: envComKeyId,
          communicationKeyEnc,
          keySeedId: process.env.AXINOM_KEY_SEED_ID || null,
          widevineLicenseUrl: process.env.AXINOM_WIDEVINE_LICENSE_URL || null,
          playreadyLicenseUrl: process.env.AXINOM_PLAYREADY_LICENSE_URL || null,
          fairplayLicenseUrl: process.env.AXINOM_FAIRPLAY_LICENSE_URL || null,
          fairplayCertUrl: process.env.AXINOM_FAIRPLAY_CERT_URL || null,
          licenseLimit: 10000,
          licensesUsed: 0,
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          isActive: true,
          isPrimary: true,
          priority: 1,
          notes: "تم استيراده من ملف .env - الحساب الأساسي لتشغيل التراخيص",
        },
      });
    }

    const publicAccount = await getAxinomAccountWithComputedStats(account);

    return NextResponse.json({
      success: true,
      account: publicAccount,
      message: `تم استيراد وتحديث حساب Axinom من ملف .env بنجاح! 🚀`,
    });
  } catch (error: any) {
    console.error("[Superadmin Import Axinom Env] Error:", error);
    return NextResponse.json(
      { error: error.message || "تعذر استيراد الحساب من .env" },
      { status: 500 }
    );
  }
}
