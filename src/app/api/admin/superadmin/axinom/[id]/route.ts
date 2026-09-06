import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  encryptAxinomSecret,
  getAxinomAccountWithComputedStats,
  parseCommunicationKeyBuffer,
} from "@/lib/axinom-pool";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "superadmin" && session.role !== "admin")) {
      return NextResponse.json({ error: "غير مصرح لك بالوصول" }, { status: 403 });
    }

    const { id } = await params;
    const account = await prisma.axinomAccount.findUnique({
      where: { id },
      include: {
        _count: { select: { licenseEvents: true } },
        licenseEvents: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });

    if (!account) {
      return NextResponse.json({ error: "حساب Axinom غير موجود" }, { status: 404 });
    }

    const publicAccount = await getAxinomAccountWithComputedStats(account);

    return NextResponse.json({
      success: true,
      account: {
        ...publicAccount,
        recentEvents: account.licenseEvents.map((evt) => ({
          id: evt.id,
          videoId: evt.videoId,
          studentId: evt.studentId,
          ipAddress: evt.ipAddress,
          userAgent: evt.userAgent,
          createdAt: evt.createdAt.toISOString(),
        })),
      },
    });
  } catch (error: any) {
    console.error("[Superadmin Get Axinom Account] Error:", error);
    return NextResponse.json(
      { error: error.message || "تعذر جلب بيانات الحساب" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "superadmin") {
      return NextResponse.json(
        { error: "غير مصرح لك بالوصول (المشرف العام فقط)" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      tenantId?: string;
      communicationKeyId?: string;
      communicationKey?: string;
      keySeedId?: string | null;
      widevineLicenseUrl?: string | null;
      playreadyLicenseUrl?: string | null;
      fairplayLicenseUrl?: string | null;
      fairplayCertUrl?: string | null;
      licenseLimit?: number;
      licensesUsed?: number;
      resetUsed?: boolean;
      expiresAt?: string;
      extendDays?: number;
      isActive?: boolean;
      isPrimary?: boolean;
      priority?: number;
      notes?: string;
    };

    const existing = await prisma.axinomAccount.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "حساب Axinom غير موجود" }, { status: 404 });
    }

    const updateData: any = {};

    if (body.name && typeof body.name === "string") {
      updateData.name = body.name.trim();
    }

    if (body.tenantId && typeof body.tenantId === "string") {
      updateData.tenantId = body.tenantId.trim();
    }

    if (body.communicationKeyId && typeof body.communicationKeyId === "string") {
      updateData.communicationKeyId = body.communicationKeyId.trim();
    }

    if (body.communicationKey && typeof body.communicationKey === "string" && body.communicationKey.trim()) {
      const trimmedKey = body.communicationKey.trim();
      const keyBuf = parseCommunicationKeyBuffer(trimmedKey);
      if (keyBuf.length !== 32) {
        return NextResponse.json(
          { error: "مفتاح Communication Key يجب أن يكون بطول 32 بايت (256-bit)" },
          { status: 400 }
        );
      }
      updateData.communicationKeyEnc = encryptAxinomSecret(trimmedKey);
    }

    if (body.keySeedId !== undefined) {
      updateData.keySeedId = body.keySeedId ? body.keySeedId.trim() : null;
    }

    if (body.widevineLicenseUrl !== undefined) {
      updateData.widevineLicenseUrl = body.widevineLicenseUrl ? body.widevineLicenseUrl.trim() : null;
    }

    if (body.playreadyLicenseUrl !== undefined) {
      updateData.playreadyLicenseUrl = body.playreadyLicenseUrl ? body.playreadyLicenseUrl.trim() : null;
    }

    if (body.fairplayLicenseUrl !== undefined) {
      updateData.fairplayLicenseUrl = body.fairplayLicenseUrl ? body.fairplayLicenseUrl.trim() : null;
    }

    if (body.fairplayCertUrl !== undefined) {
      updateData.fairplayCertUrl = body.fairplayCertUrl ? body.fairplayCertUrl.trim() : null;
    }

    if (typeof body.licenseLimit === "number" && body.licenseLimit > 0) {
      updateData.licenseLimit = Math.floor(body.licenseLimit);
    }

    if (body.resetUsed === true) {
      updateData.licensesUsed = 0;
    } else if (typeof body.licensesUsed === "number" && body.licensesUsed >= 0) {
      updateData.licensesUsed = Math.floor(body.licensesUsed);
    }

    if (typeof body.extendDays === "number" && body.extendDays > 0) {
      const currentExpiry = new Date(existing.expiresAt);
      const base = currentExpiry > new Date() ? currentExpiry : new Date();
      updateData.expiresAt = new Date(base.getTime() + body.extendDays * 24 * 60 * 60 * 1000);
    } else if (body.expiresAt) {
      updateData.expiresAt = new Date(body.expiresAt);
    }

    if (typeof body.isActive === "boolean") {
      updateData.isActive = body.isActive;
    }

    if (typeof body.priority === "number" && body.priority > 0) {
      updateData.priority = Math.floor(body.priority);
    }

    if (typeof body.isPrimary === "boolean") {
      updateData.isPrimary = body.isPrimary;
      if (body.isPrimary) {
        // Reset any other primary account
        await prisma.axinomAccount.updateMany({
          where: { id: { not: id }, isPrimary: true },
          data: { isPrimary: false },
        });
      }
    }

    if (body.notes !== undefined) {
      updateData.notes = body.notes ? body.notes.trim() : null;
    }

    const updated = await prisma.axinomAccount.update({
      where: { id },
      data: updateData,
    });

    const publicAccount = await getAxinomAccountWithComputedStats(updated);

    return NextResponse.json({
      success: true,
      account: publicAccount,
      message: "تم تحديث بيانات حساب Axinom DRM بنجاح! ✅",
    });
  } catch (error: any) {
    console.error("[Superadmin Update Axinom Account] Error:", error);
    return NextResponse.json(
      { error: error.message || "تعذر تحديث الحساب" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "superadmin") {
      return NextResponse.json(
        { error: "غير مصرح لك بالوصول (المشرف العام فقط)" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const existing = await prisma.axinomAccount.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "حساب Axinom غير موجود" }, { status: 404 });
    }

    await prisma.axinomAccount.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      message: `تم حذف حساب Axinom "${existing.name}" بنجاح`,
    });
  } catch (error: any) {
    console.error("[Superadmin Delete Axinom Account] Error:", error);
    return NextResponse.json(
      { error: error.message || "تعذر حذف حساب Axinom" },
      { status: 500 }
    );
  }
}
